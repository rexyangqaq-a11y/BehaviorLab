import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { SCHEMA_VERSION, ensure, json, parse, now, safeId, validateTasks, validateResult } from './contracts.mjs';

const schema = `
CREATE TABLE runs(id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, config_json TEXT NOT NULL, provenance_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE users(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), ordinal INTEGER NOT NULL UNIQUE, requirements_json TEXT NOT NULL, persona_json TEXT NOT NULL);
CREATE TABLE plans(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), virtual_date TEXT NOT NULL, version INTEGER NOT NULL, previous_id TEXT REFERENCES plans(id), tasks_json TEXT NOT NULL, context_json TEXT NOT NULL, basis_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,virtual_date,version), UNIQUE(id,user_id));
CREATE TABLE activities(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), plan_id TEXT NOT NULL, virtual_date TEXT NOT NULL, virtual_start TEXT NOT NULL, ordinal INTEGER NOT NULL, task_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', UNIQUE(id,user_id), FOREIGN KEY(plan_id,user_id) REFERENCES plans(id,user_id));
CREATE TABLE attempts(id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, provenance_json TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, UNIQUE(activity_id), UNIQUE(id,activity_id,user_id), FOREIGN KEY(activity_id,user_id) REFERENCES activities(id,user_id));
CREATE TABLE steps(id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, attempt_id TEXT NOT NULL, user_id TEXT NOT NULL, step_index INTEGER NOT NULL CHECK(step_index>=0), app_id TEXT NOT NULL, action_json TEXT NOT NULL, status TEXT NOT NULL, outcome_json TEXT, real_started_at TEXT NOT NULL, real_finished_at TEXT, UNIQUE(attempt_id,step_index), UNIQUE(id,activity_id,attempt_id,user_id), FOREIGN KEY(attempt_id,activity_id,user_id) REFERENCES attempts(id,activity_id,user_id));
CREATE TABLE screenshots(id TEXT PRIMARY KEY, step_id TEXT NOT NULL, activity_id TEXT NOT NULL, attempt_id TEXT NOT NULL, user_id TEXT NOT NULL, capture_index INTEGER NOT NULL CHECK(capture_index>=0), phase TEXT NOT NULL CHECK(phase IN ('before','after','observation')), asset_path TEXT NOT NULL, sha256 TEXT NOT NULL, media_type TEXT NOT NULL, captured_at TEXT NOT NULL, provenance_json TEXT NOT NULL, metadata_json TEXT NOT NULL, UNIQUE(step_id,capture_index), UNIQUE(id,user_id), FOREIGN KEY(step_id,activity_id,attempt_id,user_id) REFERENCES steps(id,activity_id,attempt_id,user_id));
CREATE TABLE results(activity_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, attempt_id TEXT NOT NULL, result_json TEXT NOT NULL, saved_at TEXT NOT NULL, UNIQUE(activity_id,user_id), FOREIGN KEY(attempt_id,activity_id,user_id) REFERENCES attempts(id,activity_id,user_id));
CREATE TABLE decisions(id TEXT PRIMARY KEY, activity_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, decision_json TEXT NOT NULL, context_json TEXT NOT NULL, provenance_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(id,user_id), FOREIGN KEY(activity_id,user_id) REFERENCES results(activity_id,user_id));
CREATE TABLE descriptions(screenshot_id TEXT PRIMARY KEY REFERENCES screenshots(id), status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, raw_text TEXT, model TEXT, prompt_version TEXT, provenance_json TEXT, started_at TEXT, processed_at TEXT, error TEXT);
CREATE TABLE description_history(id INTEGER PRIMARY KEY, screenshot_id TEXT NOT NULL REFERENCES screenshots(id), attempt_number INTEGER NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL, error TEXT, UNIQUE(screenshot_id,attempt_number));
CREATE TABLE processed_texts(id TEXT PRIMARY KEY, screenshot_id TEXT NOT NULL, user_id TEXT NOT NULL, decision_id TEXT NOT NULL, processed_text TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(screenshot_id,user_id) REFERENCES screenshots(id,user_id), FOREIGN KEY(decision_id,user_id) REFERENCES decisions(id,user_id));
CREATE TABLE audit(id INTEGER PRIMARY KEY, event TEXT NOT NULL, user_id TEXT, activity_id TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE leases(name TEXT PRIMARY KEY, owner TEXT NOT NULL, pid INTEGER NOT NULL, host TEXT NOT NULL, acquired_at TEXT NOT NULL);
CREATE INDEX activity_progress ON activities(user_id,virtual_date,status);
CREATE INDEX description_progress ON descriptions(status);
CREATE INDEX screenshot_order ON screenshots(activity_id,step_id,capture_index);
`;

const schedulingSchema = `
CREATE TABLE IF NOT EXISTS schedule_days(user_id TEXT NOT NULL REFERENCES users(id), virtual_date TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,virtual_date));
CREATE TABLE IF NOT EXISTS virtual_clocks(user_id TEXT PRIMARY KEY REFERENCES users(id), virtual_date TEXT NOT NULL, virtual_time TEXT NOT NULL, phase TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS run_controls(id INTEGER PRIMARY KEY CHECK(id=1), pause_requested INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO run_controls(id) VALUES(1);
CREATE TABLE IF NOT EXISTS call_spans(id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, parent_id TEXT REFERENCES call_spans(id), module TEXT NOT NULL, operation TEXT NOT NULL, mode TEXT NOT NULL, adapter TEXT, user_id TEXT, activity_id TEXT, virtual_date TEXT, status TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT, error TEXT, started_at TEXT NOT NULL, finished_at TEXT, owner_pid INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS call_trace_order ON call_spans(trace_id,started_at);
`;

export class Store {
  constructor(directory) {
    this.directory = path.resolve(directory);
    mkdirSync(this.directory, { recursive: true });
    this.db = new DatabaseSync(path.join(this.directory, 'state.sqlite'));
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    ensure([0, 1, SCHEMA_VERSION].includes(version), `Unsupported schema version ${version}; migration required`);
    if (version < SCHEMA_VERSION) this.tx(() => {
      if (version === 0) this.db.exec(schema);
      this.db.exec(schedulingSchema);
      this.run('UPDATE runs SET schema_version=?', SCHEMA_VERSION);
      this.db.exec(`PRAGMA user_version=${SCHEMA_VERSION}`);
    });
    if (this.get('SELECT id FROM runs') && this.get('SELECT COUNT(*) AS n FROM plans').n > 0 && this.get('SELECT COUNT(*) AS n FROM virtual_clocks').n === 0) this.reconcileLegacyProgress();
  }
  close() { this.db.close(); }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  tx(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  audit(event, userId, activityId, payload = {}) {
    this.run('INSERT INTO audit(event,user_id,activity_id,payload_json,created_at) VALUES(?,?,?,?,?)', event, userId, activityId, json(payload), now());
  }
  initialize(config, personas, provenance) {
    this.tx(() => {
      ensure(!this.get('SELECT id FROM runs'), 'Data directory already initialized; choose a new directory or resume it');
      this.run('INSERT INTO runs VALUES(?,?,?,?,?)', config.run_id, SCHEMA_VERSION, json(config), json(provenance), now());
      config.users.forEach((user, ordinal) => {
        ensure(personas[ordinal] != null, 'Missing generated persona');
        this.run('INSERT INTO users VALUES(?,?,?,?,?)', user.user_id, config.run_id, ordinal, json(user.requirements), json(personas[ordinal]));
      });
      this.audit('run_initialized', null, null, { mode: config.mode });
    });
  }
  config() {
    const row = this.get('SELECT config_json FROM runs');
    ensure(row, 'Run not initialized; use init first');
    return parse(row.config_json);
  }
  users() { return this.all('SELECT * FROM users ORDER BY ordinal').map(u => ({ user_id: u.id, ordinal: u.ordinal, requirements: parse(u.requirements_json), persona: parse(u.persona_json) })); }
  latestPlan(userId, date) {
    const row = this.get('SELECT * FROM plans WHERE user_id=? AND virtual_date=? ORDER BY version DESC LIMIT 1', userId, date);
    return row ? { plan_id: row.id, user_id: row.user_id, virtual_date: row.virtual_date, version: row.version, tasks: parse(row.tasks_json), basis: parse(row.basis_json) } : null;
  }
  activity(id) {
    const row = this.get('SELECT * FROM activities WHERE id=?', id);
    ensure(row, `Unknown activity ${id}`);
    return { ...row, task: parse(row.task_json) };
  }
  insertPlan(userId, date, tasks, context, basis, previous = null) {
    validateTasks(tasks, { user_id: userId, virtual_date: date, apps: this.config().apps });
    const version = previous ? previous.version + 1 : 1;
    const planId = `plan_${userId}_${date}_${version}`;
    this.run('INSERT INTO plans VALUES(?,?,?,?,?,?,?,?,?)', planId, userId, date, version, previous?.plan_id ?? null, json(tasks), json(context), json(basis), now());
    let ordinal = this.get('SELECT COALESCE(MAX(ordinal),-1) AS n FROM activities WHERE user_id=?', userId).n + 1;
    for (const task of tasks) {
      const existing = this.get('SELECT task_json,status FROM activities WHERE id=?', task.activity_id);
      if (existing) ensure(existing.task_json === json(task), 'Activity tasks are immutable; changed tasks need new IDs');
      else this.run('INSERT INTO activities VALUES(?,?,?,?,?,?,?,?)', task.activity_id, userId, planId, date, task.virtual_start, ordinal++, json(task), 'pending');
    }
    return planId;
  }
  saveInitialPlan(userId, date, output, context, provenance) {
    this.tx(() => {
      ensure(!this.latestPlan(userId, date), 'Daily plan already exists');
      const id = this.insertPlan(userId, date, output.tasks, context, { output: output.basis ?? null, provenance });
      this.audit('plan_saved', userId, null, { plan_id: id, version: 1 });
    });
  }
  recentResults(userId, limit) {
    return this.all(`SELECT a.task_json,r.result_json FROM results r JOIN activities a ON a.id=r.activity_id WHERE r.user_id=? ORDER BY a.virtual_start DESC,a.ordinal DESC LIMIT ?`, userId, limit)
      .reverse().map(r => ({ task: parse(r.task_json), actual: parse(r.result_json) }));
  }
  pendingTasks(plan) { return plan.tasks.filter(t => this.activity(t.activity_id).status === 'pending'); }
  missingFeedback(plan) {
    return plan.tasks.find(t => this.get('SELECT activity_id FROM results WHERE activity_id=?', t.activity_id) && !this.get('SELECT id FROM decisions WHERE activity_id=?', t.activity_id));
  }
  result(activityId) { return parse(this.get('SELECT result_json FROM results WHERE activity_id=?', activityId)?.result_json); }
  setClock(userId, date, virtualTime, phase) {
    const prior = this.get('SELECT * FROM virtual_clocks WHERE user_id=?', userId);
    ensure(!prior || prior.virtual_time <= virtualTime, 'Virtual clock cannot move backwards');
    this.run(`INSERT INTO virtual_clocks VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET virtual_date=excluded.virtual_date,virtual_time=excluded.virtual_time,phase=excluded.phase,updated_at=excluded.updated_at`, userId, date, virtualTime, phase, now());
  }
  setDay(userId, date, status) {
    this.run('INSERT INTO schedule_days VALUES(?,?,?,?) ON CONFLICT(user_id,virtual_date) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at', userId, date, status, now());
  }
  requestPause(value) { this.run('UPDATE run_controls SET pause_requested=? WHERE id=1', value ? 1 : 0); }
  pauseRequested() { return Boolean(this.get('SELECT pause_requested FROM run_controls WHERE id=1').pause_requested); }
  beginCall(call) {
    this.run('INSERT INTO call_spans VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', call.id, call.trace_id, call.parent_id ?? null, call.module, call.operation, call.mode ?? 'system', call.adapter ?? null, call.user_id ?? null, call.activity_id ?? null, call.virtual_date ?? null, 'running', json(call.input ?? {}), null, null, now(), null, process.pid);
  }
  endCall(id, output, error) {
    this.run('UPDATE call_spans SET status=?,output_json=?,error=?,finished_at=? WHERE id=?', error ? 'failed' : 'completed', output === undefined ? null : json(output), error?.message ?? null, now(), id);
  }
  recoverCalls() {
    for (const call of this.all("SELECT id,owner_pid FROM call_spans WHERE status='running'")) {
      let alive = true;
      try { process.kill(call.owner_pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
      if (!alive) this.run("UPDATE call_spans SET status='interrupted',error='Owner process exited before durable response',finished_at=? WHERE id=?", now(), call.id);
    }
  }
  calls() { return this.all('SELECT * FROM call_spans ORDER BY started_at,id').map(row => ({ ...row, input: parse(row.input_json), output: parse(row.output_json), input_json: undefined, output_json: undefined })); }
  reconcileLegacyProgress() {
    // Derive management checkpoints solely from saved plans/results/feedback.
    this.tx(() => {
      for (const user of this.users()) for (const { virtual_date: date } of this.all('SELECT DISTINCT virtual_date FROM plans WHERE user_id=? ORDER BY virtual_date', user.user_id)) {
        const plan = this.latestPlan(user.user_id, date);
        const complete = !this.missingFeedback(plan) && plan.tasks.every(task => ['completed', 'partial', 'blocked'].includes(this.activity(task.activity_id).status));
        this.setDay(user.user_id, date, complete ? 'complete' : 'planned');
        if (complete) this.setClock(user.user_id, date, `${date}T23:59`, date === this.config().virtual_end_date ? 'finished' : 'day_complete');
        else {
          const last = this.get("SELECT virtual_start,status FROM activities WHERE user_id=? AND virtual_date=? AND status NOT IN ('pending','superseded') ORDER BY virtual_start DESC,ordinal DESC LIMIT 1", user.user_id, date);
          this.setClock(user.user_id, date, last?.virtual_start ?? `${date}T00:00`, last?.status === 'executing' ? 'executing' : this.missingFeedback(plan) ? 'awaiting_feedback' : last ? 'ready' : 'planned');
        }
      }
      this.audit('legacy_progress_reconciled', null, null, { source: 'saved plans, actual results and feedback', synthetic_events_added: false });
    });
  }
  saveDecision(task, decision, context, provenance) {
    ensure(['continue', 'replace_remaining'].includes(decision.kind), 'Unsupported adjustment kind');
    ensure(typeof decision.reason === 'string' && decision.reason.length > 0, 'Adjustment reason required');
    this.tx(() => {
      ensure(this.result(task.activity_id), 'Actual result must be durable before adjustment');
      ensure(!this.get('SELECT id FROM decisions WHERE activity_id=?', task.activity_id), 'Adjustment already saved');
      const plan = this.latestPlan(task.user_id, task.virtual_date);
      let newPlanId = null;
      if (decision.kind === 'replace_remaining') {
        const pending = this.pendingTasks(plan);
        const fixed = plan.tasks.filter(t => this.activity(t.activity_id).status !== 'pending');
        const replacements = decision.remaining_tasks;
        validateTasks(replacements, { user_id: task.user_id, virtual_date: task.virtual_date, apps: this.config().apps });
        ensure(replacements.every(t => !fixed.some(f => f.activity_id === t.activity_id)), 'Cannot replace or duplicate executed activities');
        ensure(replacements.every(t => t.virtual_start >= task.virtual_start), 'Adjustment cannot schedule before current activity');
        for (const replacement of replacements) {
          const existing = this.get('SELECT user_id,status,task_json FROM activities WHERE id=?', replacement.activity_id);
          if (existing) ensure(pending.some(p => p.activity_id === replacement.activity_id) && existing.task_json === json(replacement), 'Cannot revive or mutate historical activity');
        }
        const tasks = [...fixed, ...replacements].sort((a, b) => a.virtual_start.localeCompare(b.virtual_start));
        newPlanId = this.insertPlan(task.user_id, task.virtual_date, tasks, context, { decision, provenance }, plan);
        for (const old of pending) if (!replacements.some(t => t.activity_id === old.activity_id)) this.run("UPDATE activities SET status='superseded' WHERE id=?", old.activity_id);
      }
      const id = `decision_${task.activity_id}`;
      this.run('INSERT INTO decisions VALUES(?,?,?,?,?,?,?)', id, task.activity_id, task.user_id, json(decision), json(context), json(provenance), now());
      this.audit('adjustment_saved', task.user_id, task.activity_id, { decision_id: id, kind: decision.kind, new_plan_id: newPlanId });
    });
  }
  beginAttempt(task, provenance) {
    return this.tx(() => {
      const existing = this.get('SELECT * FROM attempts WHERE activity_id=?', task.activity_id);
      if (existing) return { ...existing, recovering: true };
      ensure(this.activity(task.activity_id).status === 'pending', 'Activity not executable');
      const id = `attempt_${task.activity_id}_1`;
      const startedAt = now();
      this.run('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)', id, task.activity_id, task.user_id, 'executing', json(provenance), startedAt, null);
      this.run("UPDATE activities SET status='executing' WHERE id=?", task.activity_id);
      this.audit('execution_started', task.user_id, task.activity_id, { attempt_id: id, provenance });
      return { id, started_at: startedAt, recovering: false };
    });
  }
  steps(attemptId) { return this.all('SELECT * FROM steps WHERE attempt_id=? ORDER BY step_index', attemptId).map(s => ({ ...s, action: parse(s.action_json), outcome: parse(s.outcome_json) })); }
  beginStep(task, attemptId, intent) {
    ensure(Number.isSafeInteger(intent.step_index) && intent.step_index >= 0, 'Invalid step index');
    ensure(intent.app_id === task.app_id, 'Step app outside activity');
    ensure(intent.action && typeof intent.action.type === 'string', 'Action intent required');
    const id = `step_${attemptId}_${intent.step_index}`;
    this.tx(() => {
      ensure(this.activity(task.activity_id).status === 'executing', 'Cannot add steps after result');
      const existing = this.get('SELECT * FROM steps WHERE id=?', id);
      if (existing) {
        ensure(existing.action_json === json(intent.action) && existing.app_id === intent.app_id, 'Conflicting replayed intent');
        return;
      }
      const expected = this.steps(attemptId).length;
      ensure(intent.step_index === expected, 'Step indices must be contiguous');
      this.run('INSERT INTO steps VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, task.activity_id, attemptId, task.user_id, intent.step_index, intent.app_id, json(intent.action), 'intended', null, intent.real_started_at ?? now(), null);
      this.audit('action_intent_saved', task.user_id, task.activity_id, { step_id: id });
    });
    return id;
  }
  async capture(task, attemptId, stepId, capture, provenance) {
    const step = this.get('SELECT * FROM steps WHERE id=? AND activity_id=? AND attempt_id=? AND user_id=?', stepId, task.activity_id, attemptId, task.user_id);
    ensure(step, 'Screenshot step/user association mismatch');
    ensure(this.activity(task.activity_id).status === 'executing', 'Cannot capture after result');
    ensure(['before', 'after', 'observation'].includes(capture.phase), 'Explicit screenshot phase required');
    ensure(Number.isSafeInteger(capture.capture_index) && capture.capture_index >= 0, 'Invalid capture index');
    ensure(capture.bytes instanceof Uint8Array && capture.bytes.length > 0, 'Screenshot bytes required');
    ensure(['image/png', 'image/jpeg', 'image/svg+xml'].includes(capture.media_type), 'Unsupported screenshot media type');
    const id = `screen_${stepId}_${capture.capture_index}`;
    const hash = createHash('sha256').update(capture.bytes).digest('hex');
    const existing = this.get('SELECT * FROM screenshots WHERE id=?', id);
    if (existing) {
      ensure(existing.sha256 === hash && existing.phase === capture.phase, 'Conflicting screenshot retry');
      return id;
    }
    ensure(capture.capture_index === this.get('SELECT COUNT(*) AS n FROM screenshots WHERE step_id=?', stepId).n, 'Capture indices must be contiguous');
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }[capture.media_type];
    safeId(task.user_id);
    const relative = `assets/${task.user_id}/${id}.${extension}`;
    const target = this.assetPath(relative);
    mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, capture.bytes, { flush: true });
    await rename(temporary, target);
    this.tx(() => {
      this.run('INSERT INTO screenshots VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', id, stepId, task.activity_id, attemptId, task.user_id, capture.capture_index, capture.phase, relative, hash, capture.media_type, capture.captured_at ?? now(), json(provenance), json(capture.metadata ?? {}));
      this.run('INSERT INTO descriptions(screenshot_id) VALUES(?)', id);
      this.audit('screenshot_saved', task.user_id, task.activity_id, { screenshot_id: id, phase: capture.phase, provenance });
    });
    return id;
  }
  finishStep(task, stepId, outcome) {
    this.tx(() => {
      const step = this.get('SELECT * FROM steps WHERE id=? AND activity_id=? AND user_id=?', stepId, task.activity_id, task.user_id);
      ensure(step, 'Step/user association mismatch');
      ensure(this.activity(task.activity_id).status === 'executing', 'Cannot change completed execution');
      if (step.status === 'completed') { ensure(step.outcome_json === json(outcome), 'Conflicting step outcome'); return; }
      this.run("UPDATE steps SET status='completed',outcome_json=?,real_finished_at=? WHERE id=?", json(outcome), now(), stepId);
    });
  }
  saveResult(task, attemptId, result, provenance) {
    validateResult(result, task);
    this.tx(() => {
      ensure(this.activity(task.activity_id).status === 'executing', 'Execution is not active');
      ensure(this.steps(attemptId).every(s => s.status === 'completed'), 'Unresolved action intent; executor recovery required');
      this.run('INSERT INTO results VALUES(?,?,?,?,?)', task.activity_id, task.user_id, attemptId, json({ ...result, provenance }), now());
      this.run('UPDATE activities SET status=? WHERE id=?', result.status, task.activity_id);
      this.run('UPDATE attempts SET status=?,finished_at=? WHERE id=?', result.status, result.real_finished_at, attemptId);
      this.audit('execution_result_saved', task.user_id, task.activity_id, { status: result.status, completed_count: result.completed_count, provenance });
    });
  }
  markNeedsAttention(task, reason) {
    this.tx(() => {
      this.run("UPDATE activities SET status='needs_attention' WHERE id=?", task.activity_id);
      this.audit('recovery_needs_attention', task.user_id, task.activity_id, { reason });
    });
  }
  recoverDescriptions() {
    this.tx(() => {
      for (const row of this.all("SELECT * FROM descriptions WHERE status='working'")) {
        this.run('INSERT INTO description_history(screenshot_id,attempt_number,status,started_at,finished_at,error) VALUES(?,?,?,?,?,?)', row.screenshot_id, row.attempts, 'interrupted', row.started_at, now(), 'Worker interrupted before durable response');
      }
      this.run("UPDATE descriptions SET status=CASE WHEN attempts>=? THEN 'failed' ELSE 'pending' END,error='Recovered interrupted description' WHERE status='working'", this.config().settings.description_max_attempts);
    });
  }
  retryFailedDescriptions() {
    const max = this.config().settings.description_max_attempts;
    return this.run("UPDATE descriptions SET status='pending' WHERE status='failed' AND attempts<?", max).changes;
  }
  nextDescription() {
    // A failed/incomplete predecessor blocks this activity only, never other activities.
    const row = this.get(`SELECT s.*,st.step_index,a.task_json,d.attempts FROM screenshots s
      JOIN descriptions d ON d.screenshot_id=s.id JOIN steps st ON st.id=s.step_id
      JOIN activities a ON a.id=s.activity_id JOIN users u ON u.id=s.user_id
      WHERE d.status='pending' AND a.status IN ('completed','partial','blocked')
      AND NOT EXISTS(SELECT 1 FROM screenshots p JOIN steps ps ON ps.id=p.step_id JOIN descriptions pd ON pd.screenshot_id=p.id
        WHERE p.activity_id=s.activity_id AND (ps.step_index<st.step_index OR (ps.step_index=st.step_index AND p.capture_index<s.capture_index)) AND pd.status<>'complete')
      ORDER BY u.ordinal,a.virtual_start,a.ordinal,st.step_index,s.capture_index LIMIT 1`);
    return row ? { ...row, metadata: parse(row.metadata_json), provenance: parse(row.provenance_json), task: parse(row.task_json) } : null;
  }
  startDescription(screenshot) {
    const attempt = screenshot.attempts + 1;
    this.run("UPDATE descriptions SET status='working',attempts=?,started_at=?,error=NULL WHERE screenshot_id=? AND status='pending'", attempt, now(), screenshot.id);
    this.audit('description_started', screenshot.user_id, screenshot.activity_id, { screenshot_id: screenshot.id, attempt });
    return attempt;
  }
  finishDescription(screenshot, output, error, provenance) {
    if (!error) ensure(typeof output?.raw_text === 'string' && output.raw_text.length > 0 && typeof output.model === 'string' && typeof output.prompt_version === 'string', 'Description requires raw text and model/prompt versions');
    this.tx(() => {
      const row = this.get('SELECT * FROM descriptions WHERE screenshot_id=?', screenshot.id);
      ensure(row.status === 'working', 'Description not claimed');
      const finished = now();
      const errorText = error ? String(error.message ?? error) : null;
      this.run('UPDATE descriptions SET status=?,raw_text=?,model=?,prompt_version=?,provenance_json=?,processed_at=?,error=? WHERE screenshot_id=?', error ? 'failed' : 'complete', output?.raw_text ?? null, output?.model ?? null, output?.prompt_version ?? null, json(provenance), finished, errorText, screenshot.id);
      this.run('INSERT INTO description_history(screenshot_id,attempt_number,status,started_at,finished_at,error) VALUES(?,?,?,?,?,?)', screenshot.id, row.attempts, error ? 'failed' : 'complete', row.started_at, finished, errorText);
      this.audit(error ? 'description_failed' : 'description_complete', screenshot.user_id, screenshot.activity_id, { screenshot_id: screenshot.id, attempt: row.attempts, provenance });
    });
  }
  recordProcessedText({ id, screenshot_id, user_id, decision_id, processed_text, reason }) {
    ensure(typeof processed_text === 'string' && reason, 'Processing text and reason required');
    const decision = this.get('SELECT decision_json FROM decisions WHERE id=? AND user_id=?', decision_id, user_id);
    ensure(decision, 'Processing requires an upper-level decision for this user');
    const authorization = parse(decision.decision_json).text_processing_authorizations?.find(a => a.screenshot_id === screenshot_id && a.processed_text === processed_text && a.reason === reason);
    ensure(authorization, 'Processed text not authorized by upper-level decision');
    this.run('INSERT INTO processed_texts VALUES(?,?,?,?,?,?,?)', safeId(id), screenshot_id, user_id, decision_id, processed_text, reason, now());
  }
  assetPath(relative) {
    const target = path.resolve(this.directory, relative);
    const inside = path.relative(this.directory, target);
    ensure(inside !== '' && !inside.startsWith('..') && !path.isAbsolute(inside), 'Asset path escapes run directory');
    return target;
  }
  async readAsset(screenshot) {
    const bytes = await readFile(this.assetPath(screenshot.asset_path));
    ensure(createHash('sha256').update(bytes).digest('hex') === screenshot.sha256, 'Screenshot checksum mismatch');
    return bytes;
  }
  acquireLease(name) {
    const owner = randomUUID();
    this.tx(() => {
      const existing = this.get('SELECT * FROM leases WHERE name=?', name);
      if (existing) {
        ensure(existing.host === hostname(), `Worker ${name} owned by another host; manual inspection required`);
        let alive = true;
        try { process.kill(existing.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
        ensure(!alive, `Worker ${name} already running (PID ${existing.pid})`);
        this.run('DELETE FROM leases WHERE name=?', name);
        this.audit('stale_lease_recovered', null, null, { name, previous_pid: existing.pid });
      }
      this.run('INSERT INTO leases VALUES(?,?,?,?,?)', name, owner, process.pid, hostname(), now());
    });
    return () => this.run('DELETE FROM leases WHERE name=? AND owner=?', name, owner);
  }
  status() {
    const config = this.config();
    const counts = table => this.all(`SELECT status,COUNT(*) AS count FROM ${table} GROUP BY status`);
    return {
      run_id: config.run_id, mode: config.mode, synthetic: config.mode === 'mock',
      activities: counts('activities'), descriptions: counts('descriptions'),
      results: this.get('SELECT COUNT(*) AS n FROM results').n,
      decisions: this.get('SELECT COUNT(*) AS n FROM decisions').n,
      users: this.users().map(u => ({ user_id: u.user_id, activities: this.all('SELECT virtual_date,status,COUNT(*) AS count FROM activities WHERE user_id=? GROUP BY virtual_date,status ORDER BY virtual_date,status', u.user_id), latest_result: this.recentResults(u.user_id, 1)[0] ?? null })),
      workers: this.all('SELECT name,pid,host,acquired_at FROM leases'),
      screenshot_count: this.get('SELECT COUNT(*) AS n FROM screenshots').n,
      interrupted_activities: this.all("SELECT id,user_id,status FROM activities WHERE status IN ('executing','needs_attention')"),
      exhausted_descriptions: this.get("SELECT COUNT(*) AS n FROM descriptions WHERE status='failed' AND attempts>=?", config.settings.description_max_attempts).n,
      dataset_complete: this.isComplete(),
      virtual_clocks: this.all('SELECT * FROM virtual_clocks ORDER BY user_id'),
      schedule_days: this.all('SELECT * FROM schedule_days ORDER BY user_id,virtual_date'),
      pause_requested: this.pauseRequested(),
    };
  }
  isComplete() {
    const config = this.config();
    const dayCount = (Date.parse(config.virtual_end_date) - Date.parse(config.virtual_start_date)) / 86400000 + 1;
    return this.get('SELECT COUNT(*) AS n FROM (SELECT user_id,virtual_date FROM plans GROUP BY user_id,virtual_date)').n === dayCount * config.users.length
      && this.get("SELECT COUNT(*) AS n FROM activities WHERE status NOT IN ('completed','partial','blocked','superseded')").n === 0
      && this.get('SELECT COUNT(*) AS n FROM results r LEFT JOIN decisions d ON d.activity_id=r.activity_id WHERE d.id IS NULL').n === 0
      && this.get("SELECT COUNT(*) AS n FROM descriptions WHERE status<>'complete'").n === 0;
  }
}

export function openExisting(directory) {
  ensure(existsSync(path.join(path.resolve(directory), 'state.sqlite')), 'No saved run in data directory');
  const store = new Store(directory);
  try { store.config(); return store; } catch (error) { store.close(); throw error; }
}
