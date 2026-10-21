import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { GUI_CANDIDATES, GUI_CASES, GUI_LAB_VERSION } from './gui-lab-catalog.mjs';
import { guiComparisonPlan } from './gui-comparison-cases.mjs';

const exec = promisify(execFile);
const project = fileURLToPath(new URL('../', import.meta.url));
const now = () => new Date().toISOString();
const id = prefix => `${prefix}_${randomUUID()}`;
const fail = (status, message) => Object.assign(new Error(message), { status });
const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const xml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function line(value, label, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw fail(400, `${label}无效`);
  return value.trim();
}

export class GuiLab {
  constructor(root, { tickMs = 220 } = {}) {
    this.root = root; this.tickMs = tickMs; this.running = new Map(); this.closing = false;
    this.db = new DatabaseSync(path.join(root, '.gui-lab.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS experiments(id TEXT PRIMARY KEY,input_json TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT,owner_pid INTEGER,result_json TEXT);
      CREATE TABLE IF NOT EXISTS lab_events(run_id TEXT NOT NULL REFERENCES experiments(id),seq INTEGER NOT NULL,type TEXT NOT NULL,at TEXT NOT NULL,detail_json TEXT NOT NULL,PRIMARY KEY(run_id,seq));
      CREATE TABLE IF NOT EXISTS lab_steps(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES experiments(id),ordinal INTEGER NOT NULL,status TEXT NOT NULL,action_json TEXT NOT NULL,UNIQUE(run_id,ordinal));
      CREATE TABLE IF NOT EXISTS lab_assets(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES experiments(id),step_id TEXT NOT NULL,phase TEXT NOT NULL,file TEXT NOT NULL,sha256 TEXT NOT NULL,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lab_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
    this.reconcile();
  }
  reconcile() {
    for (const row of this.db.prepare("SELECT id,owner_pid FROM experiments WHERE status IN ('running','stopping')").all()) {
      if (alive(row.owner_pid)) continue;
      this.db.prepare("UPDATE experiments SET status='interrupted',owner_pid=NULL,finished_at=? WHERE id=?").run(now(), row.id);
      const events = this.db.prepare('SELECT type,detail_json FROM lab_events WHERE run_id=? ORDER BY seq').all(row.id).map(e => ({ type: e.type, detail: JSON.parse(e.detail_json) }));
      const finished = new Set(events.filter(e => e.type === 'call_finish').map(e => e.detail.call_id));
      for (const { detail } of events.filter(e => e.type === 'call_start' && !finished.has(e.detail.call_id))) {
        this.emit(row.id, 'call_finish', { call_id: detail.call_id, parent_id: detail.parent_id, trace_id: detail.trace_id, status: 'interrupted', error: '检测到原进程退出，未获得调用返回；这是恢复诊断，不是成功返回。' });
      }
      this.emit(row.id, 'interrupted', { mode: 'mock', reason: '上次进程已退出；记录保留，仅 Mock 可显式续跑。' });
    }
  }
  emit(runId, type, detail) {
    const seq = this.db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM lab_events WHERE run_id=?').get(runId).n;
    this.db.prepare('INSERT INTO lab_events VALUES(?,?,?,?,?)').run(runId, seq, type, now(), JSON.stringify({ source: 'mock_fixture', ...detail }));
  }
  catalog() {
    this.reconcile();
    const row = this.db.prepare("SELECT value FROM lab_meta WHERE key='diagnostics'").get();
    return { version: GUI_LAB_VERSION, final_framework: null, candidates: GUI_CANDIDATES, cases: GUI_CASES, comparison: guiComparisonPlan(),
      runtime: { mode: 'mock', framework_loop_executed: false, real_execution_available: false },
      diagnostics: row ? JSON.parse(row.value) : null,
      experiments: this.db.prepare('SELECT * FROM experiments ORDER BY created_at DESC LIMIT 50').all().map(r => this.summary(r)) };
  }
  summary(row) { return { id: row.id, input: JSON.parse(row.input_json), status: row.status, created_at: row.created_at, finished_at: row.finished_at, result: row.result_json ? JSON.parse(row.result_json) : null, mode: 'mock', framework_loop_executed: false }; }
  snapshot(runId) {
    this.reconcile();
    const row = this.db.prepare('SELECT * FROM experiments WHERE id=?').get(runId);
    if (!row) throw fail(404, '未找到验证记录');
    return { ...this.summary(row),
      events: this.db.prepare('SELECT * FROM lab_events WHERE run_id=? ORDER BY seq').all(runId).map(e => ({ ...e, detail: JSON.parse(e.detail_json), detail_json: undefined })),
      steps: this.db.prepare('SELECT * FROM lab_steps WHERE run_id=? ORDER BY ordinal').all(runId).map(s => ({ ...s, action: JSON.parse(s.action_json), action_json: undefined })),
      assets: this.db.prepare('SELECT id,step_id,phase,sha256,at FROM lab_assets WHERE run_id=? ORDER BY rowid').all(runId),
      descriptions_status: 'not_run',
    };
  }
  asset(runId, assetId) {
    const row = this.db.prepare('SELECT * FROM lab_assets WHERE run_id=? AND id=?').get(runId, assetId);
    if (!row) throw fail(404, '未找到图像');
    const file = path.resolve(this.root, row.file), base = path.resolve(this.root, '.gui-lab-assets');
    if (!file.startsWith(base + path.sep)) throw fail(400, '图像路径无效');
    const bytes = readFileSync(file);
    if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw fail(409, '图像完整性检查未通过');
    return bytes;
  }
  capture(runId, stepId, phase, text) {
    const assetId = id('image'), file = path.join('.gui-lab-assets', runId, `${assetId}.svg`);
    const bytes = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="580"><rect width="360" height="580" fill="#f2f5fb"/><rect width="360" height="68" fill="#526da1"/><text x="22" y="42" fill="white" font-size="19">MOCK · 工程夹具画面</text><text x="22" y="112" fill="#4b6389" font-size="15">${xml(phase === 'before' ? '动作前' : '动作后')} · 非手机截图</text><foreignObject x="22" y="145" width="316" height="370"><div xmlns="http://www.w3.org/1999/xhtml" style="font:16px sans-serif;line-height:1.9;color:#4b6389;overflow-wrap:anywhere">${xml(text)}</div></foreignObject><text x="22" y="550" fill="#8b97ad" font-size="12">无真实模型 / 无设备操作 / 未做图转文</text></svg>`);
    mkdirSync(path.dirname(path.join(this.root, file)), { recursive: true });
    writeFileSync(path.join(this.root, file), bytes, { flag: 'wx', flush: true });
    this.db.prepare('INSERT INTO lab_assets VALUES(?,?,?,?,?,?,?)').run(assetId, runId, stepId, phase, file, createHash('sha256').update(bytes).digest('hex'), now());
    this.emit(runId, 'capture', { step_id: stepId, phase, asset_id: assetId });
    return assetId;
  }
  start(input, modelPreset = null) {
    if (this.closing) throw fail(503, '验证台正在关闭');
    const candidate = GUI_CANDIDATES.find(c => c.id === input?.candidate_id), task = GUI_CASES.find(c => c.id === input?.case_id);
    if (!candidate || !task || input.mode !== 'mock') throw fail(400, '请选择候选和用例；当前仅开放明确标注的 Mock 工程验证');
    const maxSteps = input.max_steps ?? 12, timeout = input.timeout_seconds ?? 30;
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 30 || !Number.isSafeInteger(timeout) || timeout < 5 || timeout > 120) throw fail(400, '步数应为 1–30，时间上限应为 5–120 秒');
    const saved = { candidate_id: candidate.id, candidate_name: candidate.name, candidate_version: candidate.version ?? null,
      case_id: task.id, case_name: task.name, scenario: task.scenario, target: task.target,
      app: line(input.app ?? task.app, 'APP', 100), goal: line(input.goal ?? task.goal, '活动目标'),
      initial_state: line(input.initial_state ?? task.initial_state, '起始条件'), acceptance: line(input.acceptance ?? task.acceptance, '完成依据'),
      max_steps: maxSteps, timeout_seconds: timeout, no_progress_limit: 3, model_preset: modelPreset,
      mode: 'mock', framework_loop_executed: false, virtual_time: null };
    const runId = id('gui');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.ensureIdle();
      this.db.prepare("INSERT INTO experiments VALUES(?,?,'running',?,NULL,?,NULL)").run(runId, JSON.stringify(saved), now(), process.pid);
      this.emit(runId, 'created', { input: saved }); this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.launch(runId);
    return this.snapshot(runId);
  }
  ensureIdle() { if (this.db.prepare("SELECT 1 FROM experiments WHERE status IN ('running','stopping')").get()) throw fail(409, '验证台已有运行，请等待或停止后再试'); }
  resume(runId) {
    const run = this.snapshot(runId);
    if (!['stopped', 'interrupted'].includes(run.status)) throw fail(409, '只有已停止或进程中断的 Mock 验证可以续跑；效果未知不自动重试');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.ensureIdle();
      this.db.prepare("UPDATE experiments SET status='running',finished_at=NULL,owner_pid=?,result_json=NULL WHERE id=?").run(process.pid, runId);
      this.emit(runId, 'resume', { reason: '显式恢复无外部副作用的 Mock；跳过已完成步骤，重新记录尚未完成步骤。' }); this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.launch(runId); return this.snapshot(runId);
  }
  stop(runId) {
    const entry = this.running.get(runId);
    if (!entry) throw fail(409, '此进程没有正在执行的验证');
    this.db.prepare("UPDATE experiments SET status='stopping' WHERE id=?").run(runId);
    this.emit(runId, 'stop_requested', {}); entry.controller.abort(); return { status: 'stopping' };
  }
  launch(runId) {
    const controller = new AbortController();
    const entry = { controller, completion: null }; this.running.set(runId, entry);
    entry.completion = this.execute(runId, controller.signal).catch(() => {
      // A failed journal write must not become an unhandled rejection that kills
      // the web service. Preserve the earlier evidence and do not replay actions.
      try {
        this.emit(runId, 'error', { reason: 'journal_failure', message: '验证记录写入失败；早先记录保留，请检查存储后人工核对。' });
        this.db.prepare("UPDATE experiments SET status='failed',finished_at=?,owner_pid=NULL,result_json=NULL WHERE id=?").run(now(), runId);
      } catch { console.error('GUI lab journal unavailable; reopen after storage recovery to inspect the interrupted experiment.'); }
    }).finally(() => this.running.delete(runId));
  }
  async execute(runId, signal) {
    const input = this.snapshot(runId).input, started = Date.now(), traceId = id('trace'), rootCall = id('call');
    const verified = new Map();
    // Restore only explicit evidence, not the count of clicks or steps.
    let noProgress = 0;
    for (const event of this.snapshot(runId).events.filter(e => e.type === 'verified')) {
      verified.set(event.detail.object_id, event.detail.asset_id);
      noProgress = event.detail.is_new ? 0 : noProgress + 1;
    }
    this.emit(runId, 'call_start', { call_id: rootCall, parent_id: null, trace_id: traceId, module: 'fixture_executor', input });
    const wait = () => delay(this.tickMs, undefined, { signal });
    const check = () => {
      signal.throwIfAborted();
      if (Date.now() - started >= input.timeout_seconds * 1000) throw Object.assign(new Error('达到本次执行时间上限'), { end_status: 'partial', reason: 'time_limit' });
    };
    let status = 'blocked', reason = 'no_results', pendingCall = null;
    try {
      const total = input.scenario === 'loop' ? 30 : input.scenario === 'duplicate' ? 2 : input.target;
      for (let index = 0; index < total; index++) {
        check();
        const prior = this.db.prepare('SELECT status FROM lab_steps WHERE run_id=? AND ordinal=?').get(runId, index);
        if (prior?.status === 'completed') continue;
        const attempted = this.db.prepare('SELECT COUNT(*) AS n FROM lab_steps WHERE run_id=?').get(runId).n;
        if (!prior && attempted >= input.max_steps) { status = 'partial'; reason = 'step_limit'; break; }
        const callId = id('call'), stepId = `${runId}_s${index}`, objectId = ['duplicate', 'loop'].includes(input.scenario) ? 'fixture_object_1' : `fixture_object_${index + 1}`;
        this.emit(runId, 'call_start', { call_id: callId, parent_id: rootCall, trace_id: traceId, module: 'fixture_decision', input: { goal: input.goal, step: index + 1 } });
        pendingCall = callId;
        await wait(); check();
        if (input.scenario === 'model_error') {
          this.emit(runId, 'call_finish', { call_id: callId, parent_id: rootCall, status: 'failed', error: 'Mock 模型响应错误；未发送工具动作' });
          pendingCall = null;
          throw Object.assign(new Error('Mock 模型响应错误'), { end_status: 'failed', reason: 'model_error' });
        }
        const action = { type: 'mock_open', object_id: objectId, target: input.app };
        this.emit(runId, 'call_finish', { call_id: callId, parent_id: rootCall, status: 'completed', output: { action } });
        pendingCall = null;
        this.db.prepare("INSERT INTO lab_steps VALUES(?,?,?,'intent',?) ON CONFLICT(id) DO UPDATE SET status='intent'").run(stepId, runId, index, JSON.stringify(action));
        this.emit(runId, 'action_intent', { step_id: stepId, action, parent_id: rootCall });
        this.capture(runId, stepId, 'before', `${input.app} · ${input.goal}`);
        await wait(); check();
        this.db.prepare("UPDATE lab_steps SET status='sent' WHERE id=?").run(stepId);
        this.emit(runId, 'tool_dispatch', { step_id: stepId, action, parent_id: rootCall });
        if (input.scenario === 'tool_unknown') {
          this.db.prepare("UPDATE lab_steps SET status='unknown' WHERE id=?").run(stepId);
          this.emit(runId, 'tool_unknown', { step_id: stepId, error: 'Mock 工具超时，效果未知，不重发' });
          throw Object.assign(new Error('Mock 工具效果未知，需要人工核对'), { end_status: 'needs_attention', reason: 'tool_effect_unknown' });
        }
        const assetId = this.capture(runId, stepId, 'after', input.scenario === 'empty' ? 'Mock 搜索结果为空' : `Mock 对象：${objectId}。这是夹具证据，不是真机页面事实。`);
        this.emit(runId, 'tool_return', { step_id: stepId, status: 'returned', parent_id: rootCall });
        if (input.scenario !== 'empty') {
          const isNew = !verified.has(objectId); verified.set(objectId, assetId);
          this.emit(runId, 'verified', { object_id: objectId, asset_id: assetId, is_new: isNew, verifier: 'mock_fixture', parent_id: rootCall });
          noProgress = isNew ? 0 : noProgress + 1;
        }
        this.db.prepare("UPDATE lab_steps SET status='completed' WHERE id=?").run(stepId);
        if (input.scenario === 'empty') { status = 'blocked'; reason = 'no_results'; break; }
        if (verified.size >= input.target) { status = 'completed'; reason = 'target_verified'; break; }
        if (noProgress >= input.no_progress_limit) { status = 'partial'; reason = 'no_progress'; break; }
        status = 'partial'; reason = 'insufficient_distinct_objects';
        await wait();
      }
    } catch (error) {
      status = signal.aborted ? 'stopped' : error.end_status ?? 'failed'; reason = signal.aborted ? 'user_stopped' : error.reason ?? 'runner_error';
      if (pendingCall) this.emit(runId, 'call_finish', { call_id: pendingCall, parent_id: rootCall, trace_id: traceId, status, error: '调用未获得返回；未据此补发动作。' });
      this.emit(runId, 'error', { status, reason, message: signal.aborted ? '已停止 Mock，已保存记录可查看' : error.message });
    }
    const result = { status, reason, expected_objects: input.target, actual_objects: verified.size,
      evidence: [...verified].map(([object_id, asset_id]) => ({ object_id, asset_id })),
      duration_ms: Date.now() - started, mode: 'mock', framework_loop_executed: false, model_calls: 0, real_device_actions: 0,
      descriptions_status: 'not_run', behavioral_quality: 'not_evaluated' };
    this.emit(runId, 'call_finish', { call_id: rootCall, parent_id: null, trace_id: traceId, status, output: result });
    this.db.prepare('UPDATE experiments SET status=?,finished_at=?,owner_pid=NULL,result_json=? WHERE id=?').run(status, now(), JSON.stringify(result), runId);
  }
  async diagnostics(modelSettings) {
    let sdk = { status: 'not_installed', version: null, detail: '未安装候选依赖；主系统仍可离线运行。' };
    if (existsSync(path.join(project, 'integrations/midscene/node_modules/@midscene/harmony/package.json'))) {
      try { const { stdout } = await exec(process.execPath, [path.join(project, 'integrations/midscene/probe.mjs')], { cwd: project, windowsHide: true, timeout: 15000, maxBuffer: 64000 }); sdk = JSON.parse(stdout.trim()); }
      catch { sdk = { status: 'probe_failed', detail: 'SDK 离线契约检查失败，参见候选安装/验证说明。' }; }
    }
    const paths = [process.env.HDC_HOME, ...(process.env.PATH ?? '').split(path.delimiter)].filter(Boolean);
    const hdcPath = paths.map(p => path.join(p.replace(/^"|"$/g, ''), process.platform === 'win32' ? 'hdc.exe' : 'hdc')).find(p => existsSync(p));
    let hdc = { status: 'not_found', targets: [], detail: 'PATH 与 HDC_HOME 未找到 HDC。安装 SDK 后可重新检测；不据此断言磁盘上没有工具。' };
    if (hdcPath) {
      try {
        const { stdout } = await exec(hdcPath, ['list', 'targets'], { windowsHide: true, timeout: 8000, maxBuffer: 32000 });
        const targets = stdout.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('[') && !s.includes('Empty'));
        hdc = { status: targets.length ? 'targets_listed' : 'no_targets', targets, detail: targets.length ? '仅列出设备；尚未验证截图、系统构建或操作权限。' : '未列出设备，请连接并允许调试。' };
      } catch { hdc = { status: 'probe_failed', targets: [], detail: 'HDC 列设备失败或超时；未发送手机操作。' }; }
    }
    const settings = modelSettings.read(), service = settings.services.find(s => s.id === settings.bindings.gui);
    const result = { checked_at: now(), node: { version: process.version, platform: process.platform, arch: process.arch }, sdk, hdc,
      gui_model: { status: service ? service.configuration_status : 'unassigned', name: service?.name ?? null, model: service?.model ?? null, connection_status: 'not_tested', missing: service?.missing ?? [] },
      real_execution_available: false, final_framework: null, note: '只检测环境和已存配置，不调用模型。SDK 契约使用工具替身，不能作为真机效果或框架成功率。' };
    this.db.prepare("INSERT INTO lab_meta VALUES('diagnostics',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(result));
    return result;
  }
  async close() {
    this.closing = true;
    for (const run of this.running.values()) run.controller.abort();
    await Promise.allSettled([...this.running.values()].map(run => run.completion)); this.db.close();
  }
}
