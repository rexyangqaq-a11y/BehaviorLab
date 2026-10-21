import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { GuiLab } from '../src/gui-lab.mjs';
import { instrumentGuiDevice } from '../src/gui-device-journal.mjs';
import { createDebugServer } from '../src/web-server.mjs';

const exec = promisify(execFile);
const startInput = (case_id, extra = {}) => ({ candidate_id: 'midscene', case_id, mode: 'mock', ...extra });
async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'behavior-gui-lab-'));
  t.after(async () => {
    const relative = path.relative(os.tmpdir(), root);
    assert.ok(relative.startsWith('behavior-gui-lab-') && !relative.includes(path.sep));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
async function waitFor(lab, id, predicate = s => !['running', 'stopping'].includes(s.status)) {
  for (let i = 0; i < 400; i++) { const s = lab.snapshot(id); if (predicate(s)) return s; await delay(5); }
  throw new Error('Lab did not reach expected state');
}

test('v0.4 fixture separates target and evidence, keeps call hierarchy, image hashes, order and Mock provenance', async t => {
  const root = await temporary(t), lab = new GuiLab(root, { tickMs: 1 });
  try {
    const run = lab.start(startInput('news_two'));
    const s = await waitFor(lab, run.id);
    assert.equal(s.status, 'completed');
    assert.equal(s.result.actual_objects, 2);
    assert.equal(s.assets.length, 4);
    assert.equal(s.result.model_calls, 0);
    assert.equal(s.framework_loop_executed, false);
    assert.equal(s.input.virtual_time, null);
    assert.equal(s.descriptions_status, 'not_run');
    const rootCall = s.events.find(e => e.type === 'call_start' && e.detail.parent_id === null).detail.call_id;
    const children = s.events.filter(e => e.type === 'call_start' && e.detail.parent_id);
    assert.equal(children.length, 2);
    assert.ok(children.every(e => e.detail.parent_id === rootCall));
    for (const step of s.steps) {
      const events = s.events.filter(e => e.detail.step_id === step.id);
      assert.ok(events.find(e => e.type === 'action_intent').seq < events.find(e => e.type === 'tool_dispatch').seq);
      assert.ok(events.find(e => e.type === 'tool_dispatch').seq < events.find(e => e.type === 'capture' && e.detail.phase === 'after').seq);
    }
    assert.ok(s.events.every(e => e.detail.source === 'mock_fixture'));
    assert.match(lab.asset(s.id, s.assets[0].id).toString(), /MOCK/);
    const raw = new DatabaseSync(path.join(root, '.gui-lab.sqlite'));
    const asset = raw.prepare('SELECT * FROM lab_assets WHERE id=?').get(s.assets[0].id); raw.close();
    await writeFile(path.join(root, asset.file), 'corrupt');
    assert.throws(() => lab.asset(s.id, asset.id), /完整性/);
  } finally { await lab.close(); }
});

test('v0.4 duplicate, no-result, step-budget and stagnant fixtures never claim the requested amount', async t => {
  const lab = new GuiLab(await temporary(t), { tickMs: 1 });
  try {
    const duplicate = await waitFor(lab, lab.start(startInput('food_duplicate')).id);
    assert.equal(duplicate.status, 'partial'); assert.equal(duplicate.result.actual_objects, 1);
    assert.equal(duplicate.events.filter(e => e.type === 'verified' && !e.detail.is_new).length, 1);
    const empty = await waitFor(lab, lab.start(startInput('no_results')).id);
    assert.equal(empty.status, 'blocked'); assert.equal(empty.result.actual_objects, 0);
    const limited = await waitFor(lab, lab.start(startInput('news_two', { max_steps: 1 })).id);
    assert.equal(limited.result.reason, 'step_limit'); assert.equal(limited.result.actual_objects, 1);
    const loop = await waitFor(lab, lab.start(startInput('loop')).id);
    assert.equal(loop.result.reason, 'no_progress'); assert.equal(loop.steps.length, 4);
    assert.equal(loop.result.actual_objects, 1);
  } finally { await lab.close(); }
});

test('v0.4 model failure sends no action; unknown tool effect sends once and cannot be automatically resumed', async t => {
  const lab = new GuiLab(await temporary(t), { tickMs: 1 });
  try {
    const model = await waitFor(lab, lab.start(startInput('model_error')).id);
    assert.equal(model.status, 'failed'); assert.equal(model.steps.length, 0);
    assert.equal(model.events.filter(e => e.type === 'tool_dispatch').length, 0);
    const tool = await waitFor(lab, lab.start(startInput('tool_unknown')).id);
    assert.equal(tool.status, 'needs_attention');
    assert.equal(tool.events.filter(e => e.type === 'tool_dispatch').length, 1);
    assert.equal(tool.assets.length, 1); assert.equal(tool.result.actual_objects, 0);
    assert.throws(() => lab.resume(tool.id), /不自动重试/);
  } finally { await lab.close(); }
});

test('v0.4 stop and reopen preserve evidence; explicit Mock resume skips completed actions', async t => {
  const root = await temporary(t); let lab = new GuiLab(root, { tickMs: 15 });
  try {
    const run = lab.start(startInput('news_two'));
    assert.throws(() => lab.start(startInput('system_read')), /已有运行/);
    await waitFor(lab, run.id, s => s.steps.some(step => step.status === 'completed'));
    lab.stop(run.id);
    const stopped = await waitFor(lab, run.id);
    assert.equal(stopped.status, 'stopped');
    assert.ok(stopped.events.filter(e => e.type === 'call_start').every(start => stopped.events.some(finish => finish.type === 'call_finish' && finish.detail.call_id === start.detail.call_id)));
    const firstDispatch = stopped.events.filter(e => e.type === 'tool_dispatch' && e.detail.step_id.endsWith('_s0')).length;
    await lab.close(); lab = new GuiLab(root, { tickMs: 1 });
    assert.equal(lab.snapshot(run.id).result.actual_objects, 1);
    lab.resume(run.id);
    const final = await waitFor(lab, run.id);
    assert.equal(final.status, 'completed'); assert.equal(final.result.actual_objects, 2);
    assert.equal(final.events.filter(e => e.type === 'tool_dispatch' && e.detail.step_id.endsWith('_s0')).length, firstDispatch);
    assert.deepEqual(final.events.map(e => e.seq), Array.from({ length: final.events.length }, (_, i) => i + 1));
  } finally { await lab.close(); }
});

test('v0.4 real process crash is diagnosed after reopen and Mock unfinished steps can be resumed', async t => {
  const root = await temporary(t);
  const moduleUrl = pathToFileURL(fileURLToPath(new URL('../src/gui-lab.mjs', import.meta.url))).href;
  const code = `import { GuiLab } from ${JSON.stringify(moduleUrl)};
    const lab=new GuiLab(${JSON.stringify(root)},{tickMs:5});
    const emit=lab.emit.bind(lab);
    lab.emit=(...args)=>{emit(...args);if(args[1]==='tool_dispatch')process.exit(73);};
    lab.start(${JSON.stringify(startInput('system_read'))});`;
  await assert.rejects(exec(process.execPath, ['--input-type=module', '-e', code], { windowsHide: true }), e => e.code === 73);
  const lab = new GuiLab(root, { tickMs: 1 });
  try {
    const [run] = lab.catalog().experiments;
    assert.equal(run.status, 'interrupted');
    const interrupted = lab.snapshot(run.id);
    assert.ok(interrupted.events.some(e => e.type === 'action_intent'));
    assert.ok(interrupted.events.some(e => e.type === 'call_finish' && e.detail.status === 'interrupted'));
    lab.resume(run.id);
    const final = await waitFor(lab, run.id);
    assert.equal(final.status, 'completed'); assert.equal(final.result.actual_objects, 1);
  } finally { await lab.close(); }
});

test('SDK instrumentation blocks dispatch without a durable intent, retains every observation and marks unknown effects', async () => {
  const events = [];
  const device = instrumentGuiDevice({
    screenshotBase64: async () => 'data:image/png;base64,fixture',
    actionSpace: () => [{ name: 'Tap', call: async () => { events.push('device'); return 1; } }],
  }, { intent: async () => { events.push('intent'); return 's'; }, outcome: async () => events.push('outcome'), capture: async data => events.push(data) });
  assert.equal(await (await device.actionSpace())[0].call({ x: 1 }), 1);
  await device.screenshotBase64(); await device.screenshotBase64();
  assert.deepEqual(events.slice(0, 3), ['intent', 'device', 'outcome']); assert.equal(events.length, 5);
  const noIntent = instrumentGuiDevice({ screenshotBase64() {}, actionSpace: () => [{ name: 'Tap', call: () => assert.fail('must not dispatch') }] }, { intent: async () => { throw new Error('disk error'); } });
  await assert.rejects((await noIntent.actionSpace())[0].call(), /disk error/);
  const unknown = instrumentGuiDevice({ screenshotBase64() {}, actionSpace: () => [{ name: 'Tap', call: async () => { throw new Error('timeout'); } }] }, { intent: async () => 's', outcome: async () => { throw new Error('second disk error'); } });
  await assert.rejects((await unknown.actionSpace())[0].call(), e => e.effect_unknown === true);
});

test('v0.4 failed image retention prevents dispatch; final journal failure preserves earlier evidence and settles the runner', async t => {
  const lab = new GuiLab(await temporary(t), { tickMs: 1 });
  try {
    const capture = lab.capture.bind(lab);
    lab.capture = () => { throw new Error('injected storage failure'); };
    const first = await waitFor(lab, lab.start(startInput('system_read')).id);
    assert.equal(first.status, 'failed');
    assert.equal(first.events.filter(e => e.type === 'tool_dispatch').length, 0);
    lab.capture = capture;
    const emit = lab.emit.bind(lab);
    lab.emit = (runId, type, detail) => {
      if (type === 'call_finish' && detail.parent_id === null) throw new Error('injected terminal write failure');
      return emit(runId, type, detail);
    };
    const second = await waitFor(lab, lab.start(startInput('system_read')).id);
    assert.equal(second.status, 'failed');
    assert.equal(second.events.filter(e => e.type === 'tool_dispatch').length, 1);
    assert.ok(second.events.some(e => e.type === 'verified'));
    assert.ok(second.events.some(e => e.detail.reason === 'journal_failure'));
  } finally { await lab.close(); }
});

test('v0.4 API rejects real mode and external writes, exports Mock records without changing simulator data', async t => {
  const app = await createDebugServer({ dataRoot: await temporary(t), port: 0 });
  const post = (route, value, headers = { 'X-Simulator-UI': '1' }) => fetch(app.url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
  try {
    assert.equal((await post('/api/gui-lab/experiments', startInput('system_read'), {})).status, 403);
    assert.equal((await post('/api/gui-lab/experiments', startInput('system_read', { mode: 'real' }))).status, 400);
    assert.equal((await post('/api/gui-lab/experiments', startInput('system_read', { max_steps: -1 }))).status, 400);
    const comparisonResponse = await fetch(app.url + '/api/gui-lab/comparison');
    const comparison = await comparisonResponse.json();
    assert.match(comparisonResponse.headers.get('content-disposition'), /attachment/);
    assert.equal(comparison.run_policy.automatic_model_calls, false);
    assert.equal(comparison.run_policy.automatic_batch_runs, false);
    assert.deepEqual(comparison.actual_framework_results, []);
    const longCase = comparison.dimensions.find(d => d.id === 'long_activity').cases.find(c => c.id === 'LONG-01');
    assert.equal(longCase.execution_status, 'not_run');
    assert.ok(longCase.pending.length > 0);
    // Acceptance definitions cannot accidentally dispatch a Mock algorithm or
    // invoke a framework just because a user selects a planned comparison case.
    assert.equal((await post('/api/gui-lab/experiments', startInput(longCase.id))).status, 400);
    assert.deepEqual((await (await fetch(app.url + '/api/gui-lab')).json()).experiments, []);
    const created = await post('/api/gui-lab/experiments', startInput('system_read'));
    assert.equal(created.status, 201); const run = await created.json();
    assert.equal((await post(`/api/gui-lab/experiments/${run.id}/stop`, {})).status, 200);
    const response = await fetch(app.url + `/api/gui-lab/experiments/${run.id}/export`), exported = await response.json();
    assert.equal(exported.mode, 'mock'); assert.equal(exported.framework_loop_executed, false);
    assert.match(response.headers.get('content-disposition'), /attachment/);
    assert.equal((await fetch(app.url + '/gui-lab.mjs')).status, 200);
    assert.equal((await fetch(app.url + '/gui-lab.css')).status, 200);
    assert.deepEqual((await (await fetch(app.url + '/api/runs')).json()).runs, []);
    assert.deepEqual((await (await fetch(app.url + '/api/users')).json()).users, []);
    const other = await createDebugServer({ dataRoot: await temporary(t), port: 0 });
    try { assert.equal((await fetch(other.url + `/api/gui-lab/experiments/${run.id}`)).status, 404); }
    finally { await other.close(); }
  } finally { await app.close(); }
});
