import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Store, openExisting } from '../src/store.mjs';
import { UserLibrary } from '../src/user-library.mjs';
import { APP_CATALOG } from '../src/app-catalog.mjs';
import { createMockAdapters } from '../src/adapters/mock.mjs';
import { initialize, prepareNextDay, runSimulation } from '../src/runner.mjs';
import { createDebugServer } from '../src/web-server.mjs';
import { buildEvents } from '../src/output.mjs';

async function directory(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'behavior-product-'));
  t.productClosers = [];
  t.after(async () => { for (const close of t.productClosers.reverse()) await close(); const resolved = path.resolve(dir); const rel = path.relative(path.resolve(os.tmpdir()), resolved); assert.ok(rel.startsWith('behavior-product-') && !rel.includes(path.sep)); await rm(resolved, { recursive: true, force: true }); });
  return dir;
}
async function engine(t, overrides = {}) {
  const dir = await directory(t);
  const config = { run_id: 'product', mode: 'mock', virtual_start_date: '2026-01-01', virtual_end_date: '2026-01-03', virtual_timezone: 'Asia/Hong_Kong', apps: APP_CATALOG,
    users: [{ user_id: 'alice', requirements: { interests: ['徒步'] } }, { user_id: 'bob', requirements: { interests: ['科技'] } }],
    settings: { recent_activity_limit: 2, description_max_attempts: 3 }, mock: { scenario: 'daily_apps_v1', partial_first_activity: false, description_fail_once: false, execution_delay_ms: 0, description_delay_ms: 0 }, ...overrides };
  const store = new Store(dir); const adapters = createMockAdapters(config);
  t.productClosers.push(() => store.close()); await initialize(store, config, adapters);
  return { store, adapters, dir, config };
}
test('Planning is an actual upper-adapter invocation without execution; activity budgets commit feedback and clock', async t => {
  const f = await engine(t);
  const plan = await prepareNextDay(f.store, f.adapters);
  assert.equal(plan.user_id, 'alice'); assert.equal(plan.plan.tasks.length, 3);
  assert.equal(f.store.status().results, 0);
  assert.equal(f.store.calls().filter(c => c.operation === 'daily.plan').length, 1);
  assert.equal(f.store.calls().filter(c => c.operation === 'activity.execute').length, 0);
  await prepareNextDay(f.store, f.adapters);
  assert.equal(f.store.calls().filter(c => c.operation === 'daily.plan').length, 1);
  await runSimulation(f.store, f.adapters, { maxActivities: 1 });
  assert.equal(f.store.status().results, 1); assert.equal(f.store.status().decisions, 1);
  assert.equal(f.store.status().virtual_clocks[0].virtual_time, '2026-01-01T08:30');
  assert.equal(f.store.status().virtual_clocks[0].phase, 'ready');
  const calls = f.store.calls(); const lower = calls.find(c => c.operation === 'activity.execute');
  assert.equal(lower.mode, 'mock'); assert.equal(calls.find(c => c.id === lower.parent_id).mode, 'system');
  assert.ok(calls.some(c => c.operation === 'screenshot.persist' && c.parent_id === lower.id && c.mode === 'system'));
  assert.ok(calls.filter(c => c.user_id === 'alice' && c.input.persona).every(c => c.input.persona.original_requirements.interests[0] === '徒步'));
});
test('User-day advancement and virtual clocks survive reopen, retain user-major order, never plan the whole interval', async t => {
  const f = await engine(t);
  await runSimulation(f.store, f.adapters, { maxUserDays: 1 });
  assert.equal(f.store.status().results, 3);
  assert.equal(f.store.all('SELECT * FROM plans').length, 1);
  assert.equal(f.store.status().virtual_clocks[0].virtual_time, '2026-01-01T23:59');
  const reopened = openExisting(f.dir);
  try {
    await runSimulation(reopened, f.adapters, { maxUserDays: 1 });
    assert.equal(reopened.status().results, 6);
    assert.ok(reopened.all('SELECT user_id FROM results').every(r => r.user_id === 'alice'));
    assert.equal(reopened.status().virtual_clocks[0].virtual_date, '2026-01-02');
    assert.throws(() => reopened.setClock('alice', '2026-01-01', '2026-01-01T01:00', 'planning'), /backwards/);
  } finally { reopened.close(); }
  await runSimulation(f.store, f.adapters);
  assert.equal(f.store.status().results, 18);
  assert.equal(f.store.status().schedule_days.length, 6);
  assert.equal(f.store.status().dataset_complete, true);
  assert.ok(buildEvents(f.store).events.every(e => e.mode === 'mock' && e.description.raw_text.includes('Mock')));
});
test('Pause waits for durable result and upper feedback; resume clears the persisted request', async t => {
  const f = await engine(t);
  const paused = await runSimulation(f.store, f.adapters, { afterResult: () => f.store.requestPause(true) });
  assert.equal(paused.advancement.paused, true); assert.equal(paused.results, 1); assert.equal(paused.decisions, 1);
  assert.equal(f.store.status().pause_requested, true);
  await runSimulation(f.store, f.adapters, { maxActivities: 1 });
  assert.equal(f.store.status().results, 2); assert.equal(f.store.status().pause_requested, false);
});
test('User library persists generation inputs, calls and reusable snapshots', async t => {
  const dir = await directory(t); let library = new UserLibrary(dir);
  const adapter = createMockAdapters({ mock: {} }).personas;
  const generated = await library.generate({ count: 2, requirements: '杭州的日常生活用户，关注周末旅行' }, adapter);
  const original = library.list(); assert.equal(original.length, 2);
  assert.ok(original.every(u => u.persona.city === '杭州' && u.provenance.mode === 'mock'));
  assert.equal(library.calls().filter(c => c.status === 'completed').length, 2);
  library.close(); library = new UserLibrary(dir);
  try { assert.deepEqual(library.list(), original); assert.equal(library.batches()[0].id, generated.batch_id); } finally { library.close(); }
});
test('Candidate drafts persist without entering user library; selective review retains untouched model output', async t => {
  const dir = await directory(t); let library = new UserLibrary(dir);
  const draft = await library.preview({ count: 3, cohort_name: '杭州通勤组', requirements: '固定人设', constraints: { city: '杭州', age_min: 27, age_max: 31, occupation: '设计师', interests: ['美食', '徒步'], life_context: '工作日通勤' } }, createMockAdapters({ mock: {} }).personas);
  assert.equal(library.list().length, 0); assert.equal(draft.status, 'draft');
  assert.equal(library.calls().length, 3);
  assert.ok(draft.candidates.every(c => c.persona.city === '杭州' && c.persona.age >= 27 && c.persona.age <= 31 && c.persona.occupation === '设计师'));
  library.close(); library = new UserLibrary(dir);
  try {
    const resumed = library.draft(draft.id); assert.deepEqual(resumed.candidates, draft.candidates);
    const original = resumed.candidates[0];
    const selected = library.commit(draft.id, [{ call_id: original.call_id, persona: { ...original.persona, name: '审核后名称', interests: ['旅行'] } }]);
    assert.equal(selected.user_ids.length, 1); assert.equal(library.list().length, 1);
    const user = library.list()[0]; assert.equal(user.persona.name, '审核后名称');
    assert.equal(user.requirements.cohort_name, '杭州通勤组');
    assert.equal(user.provenance.generated_persona.name, original.persona.name);
    assert.ok(user.provenance.reviewed_fields.includes('name'));
    assert.deepEqual(library.calls().find(c => c.id === original.call_id).output, original.persona);
    assert.throws(() => library.commit(draft.id, [{ call_id: original.call_id, persona: original.persona }]), /重复提交/);
  } finally { library.close(); }
});
test('Invalid or foreign reviews never partially commit; manual profiles do not invent model calls', async t => {
  const dir = await directory(t), library = new UserLibrary(dir); t.productClosers.push(() => library.close());
  const adapter = createMockAdapters({ mock: {} }).personas;
  await assert.rejects(library.preview({ count: 1, requirements: 'test', constraints: { age_min: 50, age_max: 20 } }, adapter), /年龄区间/);
  const a = await library.preview({ count: 2, requirements: 'a' }, adapter), b = await library.preview({ count: 1, requirements: 'b' }, adapter);
  assert.throws(() => library.commit(a.id, [{ call_id: a.candidates[0].call_id, persona: a.candidates[0].persona }, { call_id: b.candidates[0].call_id, persona: b.candidates[0].persona }]), /不属于当前批次/);
  assert.equal(library.list().length, 0); assert.equal(library.draft(a.id).status, 'draft');
  const before = library.calls(); library.manual({ cohort_name: '基准', persona: { name: '对照用户', city: '广州', interests: ['铁路出行'], life_context: '周末出游' } });
  assert.deepEqual(library.calls(), before); assert.equal(library.list()[0].provenance.mode, 'user');
  assert.equal(library.list()[0].persona.mutable, false);
});
test('Review APIs bind only confirmed, edited snapshots to simulations', async t => {
  const dir = await directory(t); const server = await createDebugServer({ dataRoot: dir, port: 0 }); t.productClosers.push(() => server.close());
  const request = async (route, value, status = 200) => { const r = await fetch(server.url + route, value === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Simulator-UI': '1' }, body: JSON.stringify(value) }); const data = await r.json(); assert.equal(r.status, status, JSON.stringify(data)); return data; };
  const draft = await request('/api/users/preview', { count: 1, requirements: '示例用户', constraints: { city: '广州' } }, 201);
  const config = { name: '审核后快照测试', user_ids: [draft.candidates[0].user_id], start_date: '2026-01-01', duration_days: 1, app_ids: [APP_CATALOG[0].app_id] };
  await request('/api/simulations', config, 400);
  const persona = { ...draft.candidates[0].persona, name: '已确认用户', life_context: '通勤浏览' };
  await request(`/api/users/drafts/${draft.id}/commit`, { candidates: [{ call_id: draft.candidates[0].call_id, persona }] }, 201);
  const created = await request('/api/simulations', config, 201), snapshot = await request(`/api/runs/${created.id}`);
  assert.equal(snapshot.users[0].persona.name, '已确认用户'); assert.equal(snapshot.users[0].persona.life_context, '通勤浏览');
  await request('/api/users/manual', { persona: { name: '手动', interests: [] } }, 201);
  assert.equal((await request('/api/users')).users.length, 2);
});
test('Version 1 databases migrate additively without removing existing user/config records', async t => {
  const dir = await directory(t); let store = new Store(dir);
  const config = { run_id: 'old', mode: 'mock', virtual_start_date: '2026-01-01', virtual_end_date: '2026-01-01', virtual_timezone: 'Asia/Hong_Kong', apps: [APP_CATALOG[0]], users: [{ user_id: 'alice', requirements: 'old requirement' }], mock: {} };
  await initialize(store, config, createMockAdapters(config)); const users = store.users();
  store.db.exec('DROP TABLE call_spans; DROP TABLE schedule_days; DROP TABLE virtual_clocks; DROP TABLE run_controls; PRAGMA user_version=1;'); store.close();
  store = openExisting(dir);
  try { assert.deepEqual(store.users(), users); assert.equal(store.get('PRAGMA user_version').user_version, 3); assert.equal(store.calls().length, 0); } finally { store.close(); }
});
test('Legacy completed records reconstruct virtual progress without inventing events', async t => {
  const f = await engine(t, { users: [{ user_id: 'alice', requirements: { interests: ['徒步'] } }], virtual_end_date: '2026-01-01' });
  await runSimulation(f.store, f.adapters);
  const events = buildEvents(f.store).events;
  f.store.db.exec('DELETE FROM schedule_days; DELETE FROM virtual_clocks;');
  const second = openExisting(f.dir);
  try { assert.equal(second.status().virtual_clocks[0].phase, 'finished'); assert.equal(second.status().schedule_days[0].status, 'complete'); assert.deepEqual(buildEvents(second).events, events); }
  finally { second.close(); }
});
test('Product APIs bind generated users and selected apps to a 365-day run, with real lazy planning', async t => {
  const dir = await directory(t); const app = await createDebugServer({ dataRoot: dir, port: 0 }); t.productClosers.push(() => app.close());
  const request = async (route, value, status = 200) => { const response = await fetch(app.url + route, value === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Simulator-UI': '1' }, body: JSON.stringify(value) }); const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result; };
  await request('/api/users/generate', { count: 2, requirements: '杭州固定人设' }, 201);
  const users = (await request('/api/users')).users;
  const created = await request('/api/simulations', { name: '年度仿真', user_ids: users.map(u => u.user_id), start_date: '2026-01-01', duration_days: 365, app_ids: APP_CATALOG.map(a => a.app_id), execution_delay_ms: 0 }, 201);
  const route = `/api/runs/${created.id}`;
  let snapshot = await request(route);
  assert.equal(snapshot.config.virtual_end_date, '2026-12-31'); assert.equal(snapshot.plans.length, 0);
  assert.deepEqual(snapshot.users[0].persona, users[0].persona);
  await request(route + '/jobs', { action: 'plan_next' }, 202);
  for (let tries = 0; tries < 100; tries++) { snapshot = await request(route); if (snapshot.job.status === 'completed') break; await new Promise(resolve => setTimeout(resolve, 15)); }
  assert.equal(snapshot.plans.length, 1); assert.equal(snapshot.status.results, 0);
  const call = snapshot.calls.find(c => c.operation === 'daily.plan');
  const detail = await request(route + '/calls/' + call.id);
  assert.equal(detail.input.user_id, users[0].user_id); assert.equal(detail.output.tasks.length, 3);
  assert.ok((await request('/api/system')).apps.length >= 6);
});
