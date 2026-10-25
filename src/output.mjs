import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { now, parse, SCHEMA_VERSION } from './contracts.mjs';
import { expectedAdapterMode } from './runtime-config.mjs';

function snapshot(store) {
  return store.tx(() => ({
    config: store.config(), users: store.users(), complete: store.isComplete(),
    plans: store.all('SELECT * FROM plans ORDER BY user_id,virtual_date,version'),
    results: store.all('SELECT * FROM results ORDER BY user_id,activity_id'),
    decisions: store.all('SELECT * FROM decisions ORDER BY user_id,activity_id'),
    processed: store.all('SELECT * FROM processed_texts ORDER BY id'),
    history: store.all('SELECT * FROM description_history ORDER BY id'),
    executions: store.all('SELECT activity_id FROM execution_snapshots ORDER BY activity_id').map(r => ({ activity_id: r.activity_id, snapshot: store.executionSnapshot(r.activity_id), work: store.executionWork(r.activity_id), events: store.executionEvents(r.activity_id) })),
    rows: store.all(`SELECT s.*,st.step_index,st.action_json,st.outcome_json,st.status AS step_status,
      st.real_started_at AS action_started_at,st.real_finished_at AS action_finished_at,
      a.virtual_start,a.ordinal AS activity_ordinal,a.task_json,u.ordinal AS user_ordinal,
      d.status AS description_status,d.raw_text,d.model,d.prompt_version,d.processed_at,d.error,d.attempts AS description_attempts,
      d.provenance_json AS description_provenance_json,r.result_json
      FROM screenshots s JOIN steps st ON st.id=s.step_id JOIN activities a ON a.id=s.activity_id
      JOIN users u ON u.id=s.user_id JOIN descriptions d ON d.screenshot_id=s.id
      LEFT JOIN results r ON r.activity_id=s.activity_id
      ORDER BY u.ordinal,a.virtual_start,a.ordinal,st.step_index,s.capture_index`),
  }));
}

export function buildEvents(store) {
  const data = snapshot(store);
  const events = data.rows.map(row => ({
    schema_version: SCHEMA_VERSION, event_id: `event_${row.id}`, run_id: data.config.run_id,
    user_id: row.user_id, mode: data.config.mode, synthetic: ['mock', 'offline'].includes(data.config.mode),
    virtual_time: row.virtual_start, virtual_timezone: data.config.virtual_timezone,
    virtual_time_precision: 'activity_anchor_with_order_only',
    order: [row.user_ordinal, row.virtual_start, row.activity_ordinal, row.step_index, row.capture_index],
    activity_id: row.activity_id, attempt_id: row.attempt_id, step_id: row.step_id,
    screenshot: { id: row.id, phase: row.phase, capture_index: row.capture_index, asset_path: row.asset_path, sha256: row.sha256, media_type: row.media_type, real_captured_at: row.captured_at, provenance: parse(row.provenance_json) },
    action: { intent: parse(row.action_json), outcome: parse(row.outcome_json), status: row.step_status, real_started_at: row.action_started_at, real_finished_at: row.action_finished_at },
    planned_task: parse(row.task_json), actual_result: parse(row.result_json),
    description: { status: row.description_status, raw_text: row.raw_text, model: row.model, prompt_version: row.prompt_version, real_processed_at: row.processed_at, error: row.error, attempts: row.description_attempts, provenance: parse(row.description_provenance_json) },
    processed_texts: data.processed.filter(p => p.screenshot_id === row.id).map(p => ({ text: p.processed_text, reason: p.reason, decision_id: p.decision_id, created_at: p.created_at })),
    complete: row.description_status === 'complete' && row.result_json != null,
  }));
  return { data, events };
}

export async function exportRun(store, directory) {
  const { data, events } = buildEvents(store);
  for (const event of events) {
    try { await store.readAsset(event.screenshot); }
    catch (error) { event.complete = false; event.source_error = error.message; }
  }
  const output = path.resolve(directory);
  await mkdir(output, { recursive: true });
  const contents = events.map(event => JSON.stringify(event)).join('\n') + (events.length ? '\n' : '');
  await writeFile(path.join(output, 'events.jsonl'), contents);
  const metadata = {
    schema_version: SCHEMA_VERSION, generated_at: now(), mode: data.config.mode, synthetic: ['mock', 'offline'].includes(data.config.mode),
    data_warning: data.config.mode === 'offline' ? 'OFFLINE FIXTURE: synthetic observations, fixed replies and injected tools; native framework loop not executed; no real phone/model calls.' : data.config.mode === 'mock' ? 'MOCK ONLY: synthetic screen fixtures and template descriptions; no phone or model service called.' : null,
    dataset_complete: data.complete && events.every(e => e.complete), completeness_meaning: 'All configured user-days planned, all active executions and feedback terminal, all captured images described, referenced image bytes verified. Does not imply every activity met its goal.',
    asset_root: store.directory, asset_policy: 'References only; preserve the run assets/ directory alongside state.sqlite.',
    event_count: events.length, events_sha256: createHash('sha256').update(contents).digest('hex'),
    config: data.config, users: data.users,
    plans: data.plans.map(p => ({ plan_id: p.id, user_id: p.user_id, virtual_date: p.virtual_date, version: p.version, previous_id: p.previous_id, tasks: parse(p.tasks_json), generation_context: parse(p.context_json), basis: parse(p.basis_json), created_at: p.created_at })),
    results: data.results.map(r => ({ activity_id: r.activity_id, user_id: r.user_id, actual: parse(r.result_json), saved_at: r.saved_at })),
    decisions: data.decisions.map(d => ({ decision_id: d.id, user_id: d.user_id, activity_id: d.activity_id, decision: parse(d.decision_json), context: parse(d.context_json), provenance: parse(d.provenance_json), created_at: d.created_at })),
    description_attempt_history: data.history,
    executions: data.executions,
    virtual_clocks: store.all('SELECT * FROM virtual_clocks ORDER BY user_id'),
    schedule_days: store.all('SELECT * FROM schedule_days ORDER BY user_id,virtual_date'),
    call_spans: store.calls(),
  };
  await writeFile(path.join(output, 'run.json'), JSON.stringify(metadata, null, 2) + '\n');
  return { output, events: events.length, dataset_complete: metadata.dataset_complete, synthetic: metadata.synthetic };
}

/** Offline evidence report only. Never invokes planner, executor or retry code. */
export async function checkRun(store, directory) {
  const { data, events } = buildEvents(store);
  const issues = [];
  const add = (type, evidence, judgment) => issues.push({ type, evidence, judgment });
  if (!data.complete) add('pipeline_incomplete', [data.config.run_id], 'Some user-days, executions, feedback or descriptions remain incomplete');
  for (const row of store.all('PRAGMA foreign_key_check')) add('foreign_key_violation', [row.table, row.rowid], 'Broken source association');
  const integrity = store.all('PRAGMA integrity_check');
  if (integrity.some(r => r.integrity_check !== 'ok')) add('sqlite_integrity', [], integrity);
  for (const row of data.rows) {
    try { await store.readAsset(row); }
    catch (error) { add('asset_missing_or_corrupt', [row.id, row.asset_path], error.message); }
    if (row.description_status !== 'complete') add('description_incomplete', [row.id], { status: row.description_status, error: row.error });
    if (parse(row.provenance_json).mode !== expectedAdapterMode(data.config, 'executor')) add('provenance_mismatch', [row.id], 'Adapter mode differs from configured executor');
  }
  for (const result of data.results) if (!data.decisions.some(d => d.activity_id === result.activity_id)) add('feedback_missing', [result.activity_id], 'No upper adjustment decision saved');
  const report = {
    schema_version: SCHEMA_VERSION, rule_version: 'phase-a-integrity-v1', generated_at: now(),
    run_id: data.config.run_id, mode: data.config.mode, synthetic: ['mock', 'offline'].includes(data.config.mode),
    integrity_passed: issues.length === 0, issues, event_count: events.length,
    behavior_assessment: {
      status: 'not_evaluated',
      reason: data.config.mode === 'mock' ? 'Deterministic Mock fixtures cannot validate autonomous behavior or long-term naturalness.' : 'Behavior evaluation requires a separately agreed experiment.',
      future_dimensions: ['user differences', 'stable tendencies across days', 'occasional behavior', 'mechanical repetition', 'overstated persona'],
      uncertainty: 'No behavior model or scoring model is called by this report.',
    },
    auto_replanning: false,
  };
  const output = path.resolve(directory);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'check-report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
