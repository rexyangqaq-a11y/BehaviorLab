import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createRuntimeAdapters } from '../src/runtime-assembly.mjs';
import { normalizeConfig } from '../src/contracts.mjs';
import { Store, openExisting } from '../src/store.mjs';
import { initialize, prepareNextDay, runSimulation } from '../src/runner.mjs';
import { exportRun, checkRun } from '../src/output.mjs';
import { describeSaved } from '../src/descriptions.mjs';
import { reviewExecution, resolveExecution } from '../src/execution-review.mjs';
import { acquireDeviceLease } from '../src/device-lease.mjs';
import { PhoneLab } from '../src/phone-lab.mjs';
import { createDebugServer } from '../src/web-server.mjs';
const example = JSON.parse(await readFile(new URL('../examples/offline-single-activity.json', import.meta.url), 'utf8'));
async function setup(t, change = c => c, hooks = {}) {
  const config = normalizeConfig(change(structuredClone(example)));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'behavior-v05-'));
  let store = new Store(directory);
  t.after(async () => { store.close(); const relative = path.relative(os.tmpdir(), directory); assert.ok(relative.startsWith('behavior-v05-') && !relative.includes(path.sep)); await rm(directory, { recursive: true, force: true }); });
  const adapters = createRuntimeAdapters(config, hooks);
  await initialize(store, config, adapters);
  return { config, directory, adapters, get store() { return store; }, reopen() { store.close(); store = openExisting(directory); } };
}

test('schema v2 migration preserves saved config and users while adding empty execution tables', async t => {
  const f = await setup(t);
  const config = f.store.config(), users = f.store.users();
  f.store.tx(() => {
    f.store.db.exec('DROP TABLE execution_events; DROP TABLE activity_work_state; DROP TABLE execution_snapshots;');
    f.store.run('UPDATE runs SET schema_version=2');
    f.store.db.exec('PRAGMA user_version=2');
  });
  f.reopen();
  assert.equal(f.store.get('PRAGMA user_version').user_version, 3);
  assert.equal(f.store.get('SELECT schema_version FROM runs').schema_version, 3);
  assert.deepEqual(f.store.config(), config); assert.deepEqual(f.store.users(), users);
  for (const table of ['execution_snapshots', 'activity_work_state', 'execution_events']) assert.equal(f.store.get(`SELECT COUNT(*) AS n FROM ${table}`).n, 0);
});

for (const framework of ['midscene', 'mobiagent', 'autoglm']) test(`offline main assembly selects ${framework}, preserves evidence and actual count (not native-loop proof)`, async t => {
  const dispatches = [];
  const f = await setup(t, c => { c.runtime.executor.framework_id = framework; return c; }, { onFrameworkDispatch: spec => dispatches.push(spec.id) });
  const output = await runSimulation(f.store, f.adapters, { maxActivities: 1 });
  assert.equal(output.results, 1); assert.equal(output.decisions, 1);
  const actual = f.store.result('browse_products');
  assert.equal(actual.completed_count, 1); assert.equal(actual.status, 'partial');
  assert.equal(actual.workload_unit, 'product'); assert.equal(actual.usage.real_requests, 0);
  assert.equal(f.store.executionSnapshot('browse_products').framework.id, framework);
  assert.equal(actual.provenance.native_loop_executed, false);
  assert.deepEqual(dispatches, [framework]);
  assert.ok(actual.evidence.objects.some(o => o.status === 'duplicate'));
  assert.ok(actual.evidence.objects.some(o => o.status === 'rejected'));
  assert.ok(actual.evidence.objects.some(o => o.status === 'unverified'));
  assert.ok(f.store.executionEvents('browse_products').some(e => e.raw_response?.includes('FIXED REPLY')));
  await exportRun(f.store, path.join(f.directory, 'export'));
  assert.equal((await checkRun(f.store, path.join(f.directory, 'export'))).integrity_passed, true);
});

test('activity parameters and non-product completion do not select a fixed shopping script', async t => {
  const f = await setup(t, c => {
    c.apps = [{ app_id: 'information_app', capabilities: ['fixture_information'] }];
    c.activities = [{ ...c.activities[0], app_id: 'information_app', goal: '核对指定信息，不搜索商品', workload: undefined,
      completion: { kind: 'conditions', conditions: [{ field: 'information', op: 'eq', value: 'expected' }] },
      fixture: { events: [{ type: 'observe', page: 'information', fields: { information: 'expected' } }] } }]; return c;
  });
  await runSimulation(f.store, f.adapters);
  const actual = f.store.result('browse_products');
  assert.equal(actual.status, 'completed'); assert.equal(actual.workload_unit, 'condition');
  assert.equal(f.store.steps('attempt_browse_products_1').some(s => s.action.name === 'search'), false);
});

test('cross-shop same product counts separately, variants do not, and target changes are honored', async t => {
  const f = await setup(t, c => { const a = c.activities[0]; a.workload.object_count = 2;
    a.fixture.events = [a.fixture.events[3], a.fixture.events[4], { ...a.fixture.events[3], identity: { shop_id: 'other_shop', product_id: 'product_a' } }]; return c;
  });
  await runSimulation(f.store, f.adapters);
  assert.equal(f.store.result('browse_products').completed_count, 2); assert.equal(f.store.result('browse_products').status, 'completed');
});

test('snapshot and adapter/source changes are rejected before further execution', async t => {
  const f = await setup(t);
  await runSimulation(f.store, f.adapters, { afterResult: () => { throw new Error('feedback interruption'); } }).catch(() => {});
  const before = f.store.executionSnapshot('browse_products');
  assert.throws(() => f.store.freezeExecution(f.config.activities[0], { ...before, fingerprint: 'different' }), /mismatch/);
  f.adapters.executor.provenance.framework.id = 'autoglm';
  await assert.rejects(runSimulation(f.store, f.adapters), /source mismatch/);
  assert.equal(f.store.status().screenshot_count, 5);
});

test('automatic recovery observes a known effect and never repeats the dispatched action', async t => {
  let dispatches = 0;
  const f = await setup(t, c => { const a = c.activities[0]; a.workload.object_count = 1;
    a.fixture.events = [{ type: 'action', name: 'open', effect: 'unknown' }];
    a.fixture.recovery = [{ type: 'observe', page: 'detail', identity: { shop_id: 's', product_id: 'p' }, fields: { price: 100 }, resolution: { action_index: 0, effect: 'occurred' } }]; return c;
  }, { offlineTool: () => { dispatches++; } });
  await runSimulation(f.store, f.adapters);
  assert.equal(dispatches, 1); assert.equal(f.store.result('browse_products').status, 'completed');
  assert.equal(f.store.executionWork('browse_products').data.recovery_rounds, 1);
  assert.ok(f.store.executionEvents('browse_products').some(e => e.type === 'action_effect_resolved'));
});

test('unresolvable effects retain known progress and do not submit feedback or execute the next activity', async t => {
  const f = await setup(t, c => { c.activities[0].fixture.events = [c.activities[0].fixture.events[3], { type: 'action', name: 'open_next', effect: 'unknown' }];
    c.activities.push({ ...structuredClone(c.activities[0]), activity_id: 'later', virtual_start: '2026-01-01T14:00' }); return c;
  });
  const output = await runSimulation(f.store, f.adapters);
  assert.equal(output.advancement.reason, 'needs_attention');
  assert.equal(f.store.executionWork('browse_products').data.completed_count, 1);
  assert.equal(f.store.result('browse_products'), null); assert.equal(f.store.status().decisions, 0);
  assert.equal(f.store.activity('later').status, 'pending');
  assert.ok(f.store.status().descriptions.every(d => d.status === 'complete'), 'Existing offline images remain independently describable while attention blocks execution');
});

test('restart after dispatch resumes via observation, not action replay', async t => {
  let fail = true, dispatches = 0;
  const f = await setup(t, c => { const a = c.activities[0]; a.workload.object_count = 1;
    a.fixture.events = [{ type: 'action', name: 'open' }]; a.fixture.recovery = [{ page: 'detail', identity: { shop_id: 's', product_id: 'p' }, fields: { price: 100 }, resolution: { action_index: 0, effect: 'occurred' } }]; return c;
  }, { offlineTool: () => { dispatches++; }, afterOfflineDispatch: () => { if (fail) throw new Error('crash window'); } });
  await assert.rejects(runSimulation(f.store, f.adapters), /crash window/);
  fail = false; f.reopen();
  await runSimulation(f.store, f.adapters);
  assert.equal(dispatches, 1); assert.equal(f.store.result('browse_products').completed_count, 1);
});

test('limits stop with actual progress and unknown service/fixture inputs fail closed', async t => {
  const f = await setup(t, c => { c.runtime.limits = { max_no_progress: 1 }; return c; });
  await runSimulation(f.store, f.adapters);
  assert.equal(f.store.result('browse_products').status, 'blocked');
  assert.equal(f.store.result('browse_products').end_reason, 'offline_limit_reached');
  for (const mutate of [c => c.runtime.executor.framework_id = 'arbitrary', c => c.runtime.executor.source = 'phone_framework', c => c.runtime.executor.api_key = 'not-accepted', c => c.runtime.limits = { max_actions: 0 }]) {
    const c = structuredClone(example); mutate(c); assert.throws(() => createRuntimeAdapters(c));
  }
});

test('old mock runs, current activity guard and description-only retries preserve execution facts', async t => {
  const f = await setup(t);
  await prepareNextDay(f.store, f.adapters);
  await assert.rejects(runSimulation(f.store, f.adapters, { expectedActivityId: 'wrong' }), /Current activity changed/);
  await runSimulation(f.store, f.adapters, { describe: false, maxActivities: 1 });
  const before = f.store.executionEvents('browse_products');
  await describeSaved(f.store, createRuntimeAdapters(f.store.config()).describer, { retryFailed: true });
  assert.deepEqual(f.store.executionEvents('browse_products'), before);
  const legacy = JSON.parse(await readFile(new URL('../examples/mock-run.json', import.meta.url), 'utf8'));
  assert.equal(createRuntimeAdapters(legacy).executor.provenance.mode, 'mock');
});

test('CLI uses the same offline assembly and exports explicit synthetic provenance', async t => {
  const f = await setup(t);
  const cli = spawnSync(process.execPath, ['src/cli.mjs', 'run', '--data', f.directory], { encoding: 'utf8', timeout: 15000 });
  assert.equal(cli.status, 0, cli.stderr); assert.equal(JSON.parse(cli.stdout).results, 1);
  f.reopen(); await exportRun(f.store, path.join(f.directory, 'export'));
  const exported = JSON.parse(await readFile(path.join(f.directory, 'export/run.json'), 'utf8'));
  assert.equal(exported.synthetic, true); assert.match(exported.data_warning, /native framework loop not executed/);
  assert.equal(exported.executions.length, 1);
});

test('review is revisioned and zero-action; unknown effects can end the debug session without false terminal results', async t => {
  let actions = 0;
  const f = await setup(t, c => { c.activities[0].fixture.events = [{ type: 'action', name: 'uncertain', effect: 'unknown' }]; return c; }, { offlineTool: () => { actions++; } });
  await runSimulation(f.store, f.adapters);
  const work = f.store.executionWork('browse_products');
  const reviewed = reviewExecution(f.store, 'browse_products', { expected_revision: work.revision, verdict: 'unknown', reason: '当前证据不足' });
  assert.equal(actions, 1); assert.equal(f.store.activity('browse_products').status, 'needs_attention');
  assert.throws(() => reviewExecution(f.store, 'browse_products', { expected_revision: work.revision, verdict: 'occurred', reason: 'stale' }), /revision conflict/);
  assert.throws(() => resolveExecution(f.store, 'browse_products', { expected_revision: reviewed.revision, command: 'continue' }), /cannot continue/);
  resolveExecution(f.store, 'browse_products', { expected_revision: reviewed.revision, command: 'end' });
  assert.equal(f.store.result('browse_products'), null); assert.equal(actions, 1);
});

test('explicit continued or ended reviews retain progress and do not replay old actions or execute later activities', async t => {
  for (const command of ['continue', 'end']) {
    let actions = 0;
    const f = await setup(t, c => { const a = c.activities[0];
      a.fixture.events = [a.fixture.events[3], { type: 'action', name: 'uncertain', effect: 'unknown' }, { type: 'observe', page: 'detail', identity: { shop_id: 's', product_id: 'p' }, fields: { price: 100 } }];
      c.activities.push({ ...structuredClone(a), activity_id: 'later', virtual_start: '2026-01-01T14:00' }); return c;
    }, { offlineTool: () => { actions++; } });
    await runSimulation(f.store, f.adapters);
    const work = f.store.executionWork('browse_products');
    const reviewed = reviewExecution(f.store, 'browse_products', { expected_revision: work.revision, verdict: command === 'continue' ? 'not_occurred' : 'occurred', reason: '合成证据已核对' });
    resolveExecution(f.store, 'browse_products', { expected_revision: reviewed.revision, command });
    await runSimulation(f.store, f.adapters, command === 'continue' ? { maxActivities: 1 } : { feedbackOnly: true, describe: false });
    assert.equal(actions, 1); assert.equal(f.store.status().decisions, 1);
    assert.equal(f.store.result('browse_products').completed_count, command === 'continue' ? 2 : 1);
    assert.equal(f.store.activity('later').status, 'pending');
  }
});

test('shared device arbitration blocks phone-lab and offline contenders before tools run', async t => {
  const f = await setup(t);
  const file = path.join(f.directory, 'device.lock');
  const release = acquireDeviceLease(file, 'main-run');
  try {
    const lab = new PhoneLab(f.directory, { lockPath: file, pausePath: path.join(f.directory, 'pause.json') });
    assert.throws(() => lab.acquire('phone-lab'), /占用/);
    assert.throws(() => acquireDeviceLease(file, 'other-run'), /占用/);
    await lab.close();
  } finally { release(); }
  const next = acquireDeviceLease(file, 'next-owner'); assert.equal(next(), true);
});

test('web worker exposes the same offline plan, execution evidence, static entry and current-activity guard', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'behavior-v05-http-'));
  const server = await createDebugServer({ dataRoot: root, port: 0, phoneLabOptions: { lockPath: path.join(root, 'device.lock'), pausePath: path.join(root, 'pause.json'), deviceFactory: async () => { throw Error('hardware forbidden'); } } });
  t.after(async () => { await server.close(); const rel = path.relative(os.tmpdir(), root); assert.ok(rel.startsWith('behavior-v05-http-') && !rel.includes(path.sep)); await rm(root, { recursive: true, force: true }); });
  const request = async (route, input, status = 200) => { const response = await fetch(server.url + route, input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Simulator-UI': '1' }, body: JSON.stringify(input) }); const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body; };
  const config = await request('/api/v05/template'); config.run_id = 'http_offline';
  await request('/api/runs', { config }, 201);
  const job = await request('/api/runs/http_offline/jobs', { action: 'next_activity' }, 202);
  let snapshot;
  for (let attempt = 0; attempt < 100; attempt++) { snapshot = await request('/api/runs/http_offline'); if (snapshot.job.id === job.job?.id || !['queued', 'running'].includes(snapshot.job.status)) { if (!['queued', 'running'].includes(snapshot.job.status)) break; } await new Promise(resolve => setTimeout(resolve, 30)); }
  assert.equal(snapshot.status.results, 1); assert.equal(snapshot.executions[0].work.data.completed_count, 1);
  assert.equal((await fetch(server.url + '/v05-runtime.mjs')).status, 200);
  const uncertain = await request('/api/v05/template?scenario=needs_attention'); uncertain.run_id = 'http_attention';
  await request('/api/runs', { config: uncertain }, 201);
  await request('/api/runs/http_attention/jobs', { action: 'next_activity' }, 202);
  for (let attempt = 0; attempt < 100; attempt++) { snapshot = await request('/api/runs/http_attention'); if (!['queued', 'running'].includes(snapshot.job.status)) break; await new Promise(resolve => setTimeout(resolve, 30)); }
  const revision = snapshot.executions[0].work.revision;
  const review = await request('/api/runs/http_attention/activities/browse_products/review', { expected_revision: revision, verdict: 'occurred', reason: 'Synthetic HTTP review fixture only' });
  await request('/api/runs/http_attention/activities/browse_products/resolution', { expected_revision: review.revision, command: 'end' });
  snapshot = await request('/api/runs/http_attention');
  assert.equal(snapshot.status.decisions, 1); assert.equal(snapshot.status.schedule_days[0].status, 'complete');
  assert.equal(snapshot.status.dataset_complete, true); assert.equal(snapshot.job.status, 'completed');
});

test('dead recorded parent does not free a lease with a live worker; proven-dead pair can be reclaimed', async t => {
  const f = await setup(t), file = path.join(f.directory, 'orphan-device.lock');
  const parent = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8', timeout: 10000 });
  assert.equal(parent.status, 0, parent.stderr);
  const worker = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  t.after(() => { try { worker.kill(); } catch {} });
  const lease = acquireDeviceLease(file, 'recorded-parent'); lease.registerWorker(worker.pid);
  const record = JSON.parse(await readFile(file, 'utf8'));
  // A dead-parent record with a real live worker isolates the arbitration branch.
  // This does not claim Windows permits an actual orphan to survive its parent's job.
  await writeFile(file, JSON.stringify({ ...record, pid: parent.pid }));
  assert.throws(() => acquireDeviceLease(file, 'contender'), /占用/);
  assert.equal(lease(), false);
  const exited = new Promise(resolve => worker.once('exit', resolve)); worker.kill(); await exited;
  const next = acquireDeviceLease(file, 'after-worker-exit'); assert.equal(next(), true);
});

test('before-dispatch interruption, evidence corruption and failed storage never authorize replay', async t => {
  let dispatches = 0, crash = true;
  const f = await setup(t, c => { c.activities[0].fixture.events = [{ type: 'action', name: 'open' }]; return c; }, { offlineTool: () => { dispatches++; }, afterOfflineIntent: () => { if (crash) throw Error('intent interruption'); } });
  await assert.rejects(runSimulation(f.store, f.adapters), /intent interruption/);
  crash = false; await runSimulation(f.store, f.adapters);
  assert.equal(dispatches, 0); assert.equal(f.store.activity('browse_products').status, 'needs_attention');
  const damaged = await setup(t, c => c, { afterOfflineObservation: () => { throw Error('observation interruption'); } });
  await assert.rejects(runSimulation(damaged.store, damaged.adapters), /observation interruption/);
  const shot = damaged.store.get('SELECT * FROM screenshots LIMIT 1');
  await writeFile(damaged.store.assetPath(shot.asset_path), 'tampered synthetic evidence');
  await runSimulation(damaged.store, damaged.adapters);
  assert.equal(damaged.store.activity('browse_products').status, 'needs_attention');
  const disk = await setup(t);
  disk.store.capture = async () => { throw Error('injected disk failure'); };
  await assert.rejects(runSimulation(disk.store, disk.adapters), /disk failure/);
  assert.equal(disk.store.status().results, 0); assert.equal(disk.store.status().decisions, 0);
});

test('result-before-feedback interruption commits feedback once; model errors preserve raw replies and tool rejection sends nothing', async t => {
  const f = await setup(t);
  await assert.rejects(runSimulation(f.store, f.adapters, { afterResult: () => { throw Error('feedback window'); } }), /feedback window/);
  const screens = f.store.status().screenshot_count;
  await runSimulation(f.store, f.adapters);
  assert.equal(f.store.status().decisions, 1); assert.equal(f.store.status().screenshot_count, screens);
  let tools = 0;
  const rejected = await setup(t, c => { c.activities[0].fixture.events = [{ type: 'tool_rejected', name: 'tap' }, { type: 'model_error', raw_response: 'FIXED INVALID MODEL RESPONSE' }]; return c; }, { offlineTool: () => { tools++; } });
  await runSimulation(rejected.store, rejected.adapters);
  assert.equal(tools, 0); assert.equal(rejected.store.result('browse_products').status, 'blocked');
  assert.ok(rejected.store.executionEvents('browse_products').some(e => e.raw_response === 'FIXED INVALID MODEL RESPONSE'));
});

test('legacy or damaged device locks remain blocked when child ownership cannot be proven', async t => {
  const f = await setup(t), file = path.join(f.directory, 'legacy-device.lock');
  const exited = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  const content = JSON.stringify({ token: 'old-token', pid: exited.pid, owner: 'legacy' });
  await writeFile(file, content);
  assert.throws(() => acquireDeviceLease(file, 'new-owner'), /需要检查/);
  assert.equal(await readFile(file, 'utf8'), content);
});
