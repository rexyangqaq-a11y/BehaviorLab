import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ModelSettings } from '../src/model-settings.mjs';
import { createDebugServer } from '../src/web-server.mjs';

async function directory(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'behavior-model-settings-'));
  t.after(async () => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root));
    assert.ok(relative.startsWith('behavior-model-settings-') && !relative.includes(path.sep) && !path.isAbsolute(relative));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
const service = (changes = {}) => ({ id: 'gui_service', name: '视觉测试服务', provider: 'custom', protocol: 'openai-chat', base_url: 'https://model.example.invalid/v1', model: 'vision-test', auth: 'api_key', timeout_ms: 60000, ...changes });
const input = (revision, services = [service()], bindings = { gui: 'gui_service' }) => ({ revision, services, bindings });

test('model drafts persist across reopen and distinguish complete configuration from actual connectivity', async t => {
  const root = await directory(t);
  let store = new ModelSettings(root);
  try {
    const saved = store.save(input(0, [service({ base_url: '', model: '' })]));
    assert.deepEqual(saved.services[0].missing, ['服务地址', '模型名称', 'API Key']);
    assert.equal(saved.bindings.gui, 'gui_service');
    assert.equal(saved.runtime_mode, 'mock');
    store.close(); store = new ModelSettings(root);
    const restored = store.read();
    assert.equal(restored.revision, 1);
    assert.equal(restored.services[0].name, '视觉测试服务');
    const ready = store.save(input(1, [service({ api_key: 'test-secret-never-a-real-key' })]));
    assert.equal(ready.services[0].configuration_status, 'ready_unverified');
    assert.equal(ready.services[0].connection_status, 'not_tested');
    assert.equal(ready.runtime_mode, 'mock');
  } finally { store.close(); }
});

test('credential edits preserve, replace, remove and delete keys without including them in public settings', async t => {
  const root = await directory(t); const store = new ModelSettings(root);
  try {
    const saved = store.save(input(0, [service({ api_key: 'secret-fixture-unique-1' })]));
    assert.equal(saved.services[0].has_api_key, true);
    assert.ok(!JSON.stringify(saved).includes('secret-fixture'));
    assert.ok(!Object.hasOwn(saved.services[0], 'api_key'));
    const preserved = store.save(input(1, [service({ model: 'another-model' })]));
    assert.equal(preserved.services[0].has_api_key, true);
    assert.equal(store.credential('gui_service'), 'secret-fixture-unique-1');
    if(process.platform==='win32')assert.ok(store.db.prepare('SELECT api_key FROM model_credentials').get().api_key.startsWith('win-dpapi:v1:'));
    store.save(input(2, [service({ api_key: 'secret-fixture-unique-2' })]));
    assert.equal(store.credential('gui_service'), 'secret-fixture-unique-2');
    const cleared = store.save(input(3, [service({ api_key: null })]));
    assert.equal(cleared.services[0].has_api_key, false);
    store.save(input(4, [service({ api_key: 'secret-fixture-unique-3' })]));
    store.save(input(5, [], {}));
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM model_credentials').get().n, 0);
  } finally { store.close(); }
});

test('invalid or stale edits never overwrite a newer configuration or its credential', async t => {
  const root = await directory(t); const store = new ModelSettings(root);
  try {
    store.save(input(0, [service({ api_key: 'secret-original-fixture' })]));
    assert.throws(() => store.save(input(0, [service({ api_key: null })])), { status: 409 });
    for (const changes of [{ base_url: 'javascript:alert(1)' }, { base_url: 'https://user:secret@host.invalid' }, { base_url: 'https://host.invalid?api_key=secret' }, { timeout_ms: -1 }, { api_key: 'secret\nheader' }]) {
      assert.throws(() => store.save(input(1, [service(changes)])), { status: 400 });
    }
    assert.throws(() => store.save(input(1, [service()], { gui: 'unknown' })), { status: 400 });
    assert.throws(() => store.save(input(1, [service(), service()])), { status: 400 });
    assert.equal(store.read().revision, 1);
    assert.equal(store.credential('gui_service'), 'secret-original-fixture');
    store.save(input(1, [service({ auth: 'none' })]));
    assert.equal(store.read().services[0].has_api_key, false);
  } finally { store.close(); }
});

test('settings API protects writes, redacts secrets and leaves runtime and user/call data untouched', async t => {
  const root = await directory(t); const app = await createDebugServer({ dataRoot: root, port: 0 });
  try {
  const post = headers => fetch(app.url + '/api/settings/models', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input(0, [service({ api_key: 'api-secret-fixture' })])) });
  assert.equal((await post({})).status, 403);
  assert.equal((await post({ 'X-Simulator-UI': '1', Origin: 'https://outside.invalid' })).status, 403);
  const response = await post({ 'X-Simulator-UI': '1' });
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes('api-secret-fixture'));
  const publicSettings = await (await fetch(app.url + '/api/settings/models')).text();
  assert.ok(!publicSettings.includes('api-secret-fixture'));
  const system = await (await fetch(app.url + '/api/system')).json();
  assert.ok(system.modules.filter(m => ['persona_generator', 'upper_planner', 'lower_executor', 'describer'].includes(m.id)).every(m => m.mode === 'mock'));
  assert.deepEqual((await (await fetch(app.url + '/api/users')).json()).calls, []);
  assert.deepEqual((await (await fetch(app.url + '/api/runs')).json()).runs, []);
  assert.equal((await fetch(app.url + '/model-settings.mjs')).status, 200);
  } finally { await app.close(); }
});
