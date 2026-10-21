import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeConfig, parse, now } from '../src/contracts.mjs';
import { Store, openExisting } from '../src/store.mjs';
import { createMockAdapters } from '../src/adapters/mock.mjs';
import { initialize, runSimulation } from '../src/runner.mjs';
import { describeSaved } from '../src/descriptions.mjs';
import { buildEvents, exportRun, checkRun } from '../src/output.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const example = JSON.parse(await readFile(new URL('../examples/mock-run.json', import.meta.url), 'utf8'));
async function setup(t, changes = {}, hooks = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'behavior-sim-test-'));
  const config = normalizeConfig({ ...example, ...changes, mock: { ...example.mock, description_fail_once: false, execution_delay_ms: 0, description_delay_ms: 0, ...changes.mock } });
  const fixture = { directory, config, store: new Store(directory), adapters: createMockAdapters(config, hooks) };
  t.after(async () => {
    fixture.store.close();
    const target = path.resolve(directory);
    const relative = path.relative(path.resolve(os.tmpdir()), target);
    assert.ok(relative.startsWith('behavior-sim-test-') && !relative.includes(path.sep) && !path.isAbsolute(relative), 'Cleanup must stay in the generated test directory');
    await rm(target, { recursive: true, force: true });
  });
  await initialize(fixture.store, config, fixture.adapters);
  return fixture;
}
const total = (store, table) => store.get(`SELECT COUNT(*) AS n FROM ${table}`).n;
function crashWorker(fixture, point) {
  fixture.store.close();
  const result = spawnSync(process.execPath, ['scripts/fault-worker.mjs', fixture.directory, point], { cwd: root, encoding: 'utf8', timeout: 15000 });
  fixture.store = openExisting(fixture.directory);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 73, result.stderr);
}

test('Mock closed loop: plans, actuals, local versions, bounded isolated contexts and stable order', async t => {
  const contexts = [];
  const f = await setup(t, { settings: { recent_activity_limit: 2, description_max_attempts: 3 } }, {
    onPlan: c => contexts.push(structuredClone(c)), onAdjust: c => contexts.push(structuredClone(c)),
  });
  const status = await runSimulation(f.store, f.adapters);
  assert.equal(status.dataset_complete, true);
  assert.deepEqual(status.workers, []);
  assert.equal(status.results, 8);
  assert.equal(status.decisions, 8);
  assert.equal(status.screenshot_count, 24);
  assert.equal(total(f.store, 'plans'), 8);
  assert.equal(f.store.get("SELECT COUNT(*) AS n FROM activities WHERE status='superseded'").n, 4);
  for (const c of contexts) {
    assert.ok(c.recent_actual.length <= 2);
    assert.ok(c.recent_actual.every(r => r.task.user_id === c.user_id));
    assert.ok(c.plan?.tasks.every(task => task.user_id === c.user_id) ?? true);
    assert.equal(c.persona.original_requirements.interests[0], c.user_id === 'user_a' ? '徒步' : '烹饪');
  }
  const first = f.store.result('user_a_2026-01-01_first');
  assert.equal(first.status, 'partial');
  assert.equal(first.completed_count, 2);
  assert.equal(f.store.activity('user_a_2026-01-01_first').task.workload.object_count, 3);
  const audit = f.store.all('SELECT * FROM audit ORDER BY id');
  for (const decision of audit.filter(r => r.event === 'adjustment_saved')) assert.ok(audit.some(r => r.event === 'execution_result_saved' && r.activity_id === decision.activity_id && r.id < decision.id));
  const starts = audit.filter(r => r.event === 'execution_started');
  assert.deepEqual(starts.map(r => r.user_id), [...Array(4).fill('user_a'), ...Array(4).fill('user_b')]);
  const events = buildEvents(f.store).events;
  assert.equal(events.length, 24);
  assert.ok(events.every(e => e.mode === 'mock' && e.synthetic && e.complete));
  assert.ok(events.every(e => e.virtual_time.startsWith('2026-01') && e.screenshot.real_captured_at.startsWith('20') && !e.virtual_time.endsWith('Z')));
  assert.deepEqual(events, buildEvents(f.store).events);
  const before = total(f.store, 'steps');
  await runSimulation(f.store, f.adapters);
  assert.equal(total(f.store, 'steps'), before);
  const result = await exportRun(f.store, path.join(f.directory, 'export'));
  assert.equal(result.dataset_complete, true);
  const report = await checkRun(f.store, path.join(f.directory, 'export'));
  assert.equal(report.integrity_passed, true);
  assert.equal(report.behavior_assessment.status, 'not_evaluated');
});

test('Actual process loss with unfinished intent resumes only after executor recovery, without duplicates or user mixing', async t => {
  let recoveries = 0;
  const f = await setup(t, {}, { onRecover: () => recoveries++ });
  crashWorker(f, 'capture');
  assert.equal(total(f.store, 'results'), 0);
  assert.equal(total(f.store, 'screenshots'), 2);
  assert.equal(f.store.get('SELECT status FROM steps').status, 'intended');
  await runSimulation(f.store, f.adapters);
  assert.equal(recoveries, 1);
  assert.equal(total(f.store, 'attempts'), 8);
  assert.equal(total(f.store, 'steps'), 12);
  assert.equal(total(f.store, 'screenshots'), 24);
  assert.equal(f.store.status().dataset_complete, true);
  assert.equal(f.store.all('PRAGMA foreign_key_check').length, 0);
  assert.ok(f.store.all("SELECT * FROM audit WHERE event='stale_lease_recovered'").length > 0);
});

test('Process loss after durable result resumes missing feedback instead of recollecting', async t => {
  let recoveries = 0;
  const f = await setup(t, {}, { onRecover: () => recoveries++ });
  crashWorker(f, 'result');
  assert.equal(total(f.store, 'results'), 1);
  assert.equal(total(f.store, 'decisions'), 0);
  const result = f.store.result('user_a_2026-01-01_first');
  await runSimulation(f.store, f.adapters);
  assert.equal(recoveries, 0);
  assert.deepEqual(f.store.result('user_a_2026-01-01_first'), result);
  assert.equal(total(f.store, 'screenshots'), 24);
  assert.equal(f.store.status().dataset_complete, true);
});

test('Failed description blocks only its activity; explicit retry preserves successful raw text and order', async t => {
  const f = await setup(t, { mock: { description_fail_once: true } });
  await runSimulation(f.store, f.adapters);
  const status = f.store.status();
  assert.equal(status.results, 8);
  assert.equal(status.dataset_complete, false);
  assert.equal(f.store.get("SELECT COUNT(*) AS n FROM descriptions WHERE status='failed'").n, 2);
  const complete = f.store.all("SELECT * FROM descriptions WHERE status='complete'");
  const early = buildEvents(f.store).events;
  assert.ok(early.some(e => !e.complete && e.description.raw_text === null));
  assert.equal((await exportRun(f.store, path.join(f.directory, 'early'))).dataset_complete, false);
  const plans = total(f.store, 'plans');
  assert.equal((await checkRun(f.store, path.join(f.directory, 'early'))).integrity_passed, false);
  assert.equal(total(f.store, 'plans'), plans, 'offline report cannot replan');
  assert.equal(await describeSaved(f.store, f.adapters.describer), 0);
  await describeSaved(f.store, f.adapters.describer, { retryFailed: true });
  assert.equal(f.store.status().dataset_complete, true);
  for (const row of complete) assert.deepEqual(f.store.get('SELECT * FROM descriptions WHERE screenshot_id=?', row.screenshot_id), row);
  assert.deepEqual(buildEvents(f.store).events.map(e => e.event_id), early.map(e => e.event_id));
  assert.equal(f.store.get("SELECT COUNT(*) AS n FROM description_history WHERE status='failed'").n, 2);
  assert.equal(total(f.store, 'screenshots'), 24);
});

test('Actual description process loss retries the missing image, not execution, with interruption history', async t => {
  const f = await setup(t);
  await runSimulation(f.store, f.adapters, { describe: false });
  crashWorker(f, 'description');
  assert.equal(f.store.get("SELECT COUNT(*) AS n FROM descriptions WHERE status='working'").n, 1);
  await describeSaved(f.store, f.adapters.describer);
  assert.equal(f.store.status().dataset_complete, true);
  assert.equal(total(f.store, 'attempts'), 8);
  assert.equal(f.store.get("SELECT COUNT(*) AS n FROM description_history WHERE status='interrupted'").n, 1);
  assert.equal(f.store.get('SELECT MAX(attempts) AS n FROM descriptions').n, 2);
});

test('Descriptions start after result, preserve per-activity order, and overlap next execution', async t => {
  let releaseDescription;
  const gate = new Promise(resolve => { releaseDescription = resolve; });
  const f = await setup(t, { users: [example.users[0]], virtual_end_date: example.virtual_start_date }, {
    onDescribe: async c => { if (c.task.activity_id.endsWith('_first')) await gate; },
    afterStep: c => { if (c.task.activity_id.endsWith('_revised')) releaseDescription(); },
  });
  await runSimulation(f.store, f.adapters);
  const audit = f.store.all('SELECT * FROM audit ORDER BY id');
  const result = audit.find(r => r.event === 'execution_result_saved');
  const next = audit.filter(r => r.event === 'execution_started')[1];
  const desc = audit.find(r => r.event === 'description_complete');
  assert.ok(result.id < desc.id && next.id < desc.id);
  for (const activity of f.store.all("SELECT id FROM activities WHERE status IN ('partial','completed')")) {
    const rows = audit.filter(r => r.activity_id === activity.id && r.event === 'description_complete');
    const expected = buildEvents(f.store).events.filter(e => e.activity_id === activity.id).map(e => e.screenshot.id);
    assert.deepEqual(rows.map(r => parse(r.payload_json).screenshot_id), expected);
    const saved = audit.find(r => r.activity_id === activity.id && r.event === 'execution_result_saved');
    assert.ok(audit.filter(r => r.activity_id === activity.id && r.event === 'description_started').every(r => r.id > saved.id));
  }
});

test('Unsafe interrupted action requires attention and is never blindly replayed', async t => {
  let crashed = false;
  const f = await setup(t, {}, { afterCapture: () => { if (!crashed) { crashed = true; throw new Error('simulated interruption'); } } });
  await assert.rejects(runSimulation(f.store, f.adapters, { describe: false }), /simulated interruption/);
  const screenshots = total(f.store, 'screenshots');
  f.adapters.executor.recover = async () => ({ kind: 'needs_attention', reason: 'Cannot infer whether external action happened' });
  await assert.rejects(runSimulation(f.store, f.adapters), /needs attention/);
  assert.equal(total(f.store, 'screenshots'), screenshots);
  await assert.rejects(runSimulation(f.store, f.adapters), /awaits operator/);
  assert.equal(f.store.get('SELECT status FROM steps').status, 'intended');
});

test('Storage constraints reject cross-user source links and wrong app actions', async t => {
  const f = await setup(t);
  await runSimulation(f.store, f.adapters);
  const screenshot = f.store.get('SELECT * FROM screenshots LIMIT 1');
  assert.throws(() => f.store.run('UPDATE screenshots SET user_id=? WHERE id=?', 'user_b', screenshot.id), /FOREIGN KEY/);
  const wrongTask = f.store.activity('user_b_2026-01-01_first').task;
  await assert.rejects(f.store.capture(wrongTask, screenshot.attempt_id, screenshot.step_id, { phase: 'before' }, f.adapters.executor.provenance), /association mismatch/);
  assert.throws(() => f.store.beginStep(wrongTask, screenshot.attempt_id, { step_index: 0, app_id: 'wrong_app', action: { type: 'tap' } }), /outside activity/);
  assert.throws(() => f.store.assetPath('../outside.png'), /escapes/);
  assert.throws(() => f.store.recordProcessedText({ id: 'x', screenshot_id: screenshot.id, user_id: screenshot.user_id, decision_id: `decision_${screenshot.activity_id}`, processed_text: 'invented content', reason: 'unapproved' }), /not authorized/);
});

test('Manager never invents activities when upper planner returns an empty day', async t => {
  const f = await setup(t);
  f.adapters.planner.plan = async () => ({ tasks: [], basis: 'Upper planner chose no phone activities' });
  f.adapters.executor.execute = async () => assert.fail('Unexpected execution');
  await runSimulation(f.store, f.adapters);
  assert.equal(total(f.store, 'plans'), 4);
  assert.equal(total(f.store, 'activities'), 0);
  assert.equal(f.store.status().dataset_complete, true);
});

test('Blocked activity has an actual zero count and still gets upper feedback', async t => {
  const f = await setup(t, { users: [example.users[0]], virtual_end_date: example.virtual_start_date });
  f.adapters.executor.execute = async c => ({ status: 'blocked', completed_count: 0, summary: 'MOCK blocked before browsing', end_reason: 'mock_access_blocked', failure: { code: 'MOCK_BLOCKED' }, real_started_at: c.real_started_at, real_finished_at: now() });
  await runSimulation(f.store, f.adapters);
  assert.equal(total(f.store, 'results'), 2);
  assert.equal(total(f.store, 'decisions'), 2);
  assert.ok(f.store.all('SELECT result_json FROM results').every(r => parse(r.result_json).completed_count === 0));
  assert.equal(total(f.store, 'screenshots'), 0);
});

test('Description retry limit is enforced; corruption is reported and cannot export as complete', async t => {
  const f = await setup(t, { settings: { recent_activity_limit: 2, description_max_attempts: 2 } });
  await runSimulation(f.store, f.adapters, { describe: false });
  f.adapters.describer.describe = async () => { throw new Error('always fails'); };
  await describeSaved(f.store, f.adapters.describer);
  await describeSaved(f.store, f.adapters.describer, { retryFailed: true });
  assert.equal(await describeSaved(f.store, f.adapters.describer, { retryFailed: true }), 0);
  assert.equal(f.store.get('SELECT MAX(attempts) AS n FROM descriptions').n, 2);
  assert.ok(f.store.status().exhausted_descriptions > 0);
  const screenshot = f.store.get('SELECT * FROM screenshots LIMIT 1');
  await writeFile(f.store.assetPath(screenshot.asset_path), 'corrupt');
  const report = await checkRun(f.store, path.join(f.directory, 'report'));
  assert.ok(report.issues.some(i => i.type === 'asset_missing_or_corrupt' && i.evidence[0] === screenshot.id));
  assert.equal((await exportRun(f.store, path.join(f.directory, 'export'))).dataset_complete, false);
});

test('Worker lease rejects a second live execution worker', async t => {
  const f = await setup(t);
  const release = f.store.acquireLease('execution');
  await assert.rejects(runSimulation(f.store, f.adapters), /already running/);
  release();
  await runSimulation(f.store, f.adapters);
  assert.equal(f.store.status().dataset_complete, true);
});

test('Invalid upper outputs fail before commit; real mode and mixed adapter provenance are rejected', async t => {
  const f = await setup(t);
  f.adapters.planner.plan = async context => ({ tasks: [{ activity_id: 'wrong', user_id: 'user_b', virtual_date: context.virtual_date }] });
  await assert.rejects(runSimulation(f.store, f.adapters), /user isolation/);
  assert.equal(total(f.store, 'plans'), 0);
  assert.throws(() => normalizeConfig({ ...example, mode: 'real' }), /mode=mock only/);
  f.adapters.executor.provenance.mode = 'real';
  await assert.rejects(runSimulation(f.store, f.adapters), /provenance mismatch/);
});
