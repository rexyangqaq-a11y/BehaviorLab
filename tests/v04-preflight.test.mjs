import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectPreflight, findHdc, inspectModelConfiguration } from '../scripts/v04-preflight.mjs';

async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'behavior-v04-preflight-'));
  t.after(async () => {
    assert.ok(path.basename(root).startsWith('behavior-v04-preflight-'));
    assert.equal(path.dirname(root), os.tmpdir());
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test('preflight reads only public configuration fields, preserves the database and omits credentials', async t => {
  const root = await temporary(t), file = path.join(root, '.model-services.sqlite');
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE model_settings(id INTEGER,revision INTEGER,document TEXT); CREATE TABLE model_credentials(service_id TEXT,api_key TEXT);');
  db.prepare('INSERT INTO model_settings VALUES(1,3,?)').run(JSON.stringify({ services: [{ id: 'test', model: 'fixture-model', protocol: 'openai-chat', base_url: 'https://example.invalid/v1' }], bindings: {} }));
  db.prepare('INSERT INTO model_credentials VALUES(?,?)').run('test', 'fixture-secret-never-export');
  db.close();
  const before = await readFile(file), report = inspectModelConfiguration(root);
  assert.deepEqual(await readFile(file), before);
  assert.equal(report.revision, 3);
  assert.equal(report.services[0].has_api_key, true);
  assert.equal(report.services[0].image_protocol_verified, false);
  assert.ok(!JSON.stringify(report).includes('fixture-secret-never-export'));
  assert.equal(report.bindings.gui, null);
});

test('missing HDC cannot invoke tools or create a GUI result; explicit missing path does not fall back', async t => {
  const root = await temporary(t);
  const report = await collectPreflight({ dataRoot: root, env: {}, localConfigPath: null, run: () => { throw new Error('Must not execute'); } });
  assert.equal(report.hdc.status, 'not_found');
  assert.equal(report.hdc.target_count, null);
  assert.equal(report.gui_result.status, 'not_executed');
  assert.equal(report.framework_loop_executed, false);
  assert.equal(report.activity_attempts, 0);
  assert.equal(report.model_usage.requests, 0);
  assert.equal(report.final_framework, null);
  assert.equal(findHdc({ explicitPath: path.join(root, 'missing.exe'), env: { PATH: 'would-fall-back' } }), null);
});

test('only explicit trial confirmation clears its gate, with no final framework or runtime execution', async t => {
  const root = await temporary(t), trialPlanPath = path.join(root, 'trial.json');
  await writeFile(trialPlanPath, JSON.stringify({ trial_framework: 'midscene', recommendation: { framework: 'midscene' } }));
  const unconfirmed = await collectPreflight({ dataRoot: root, trialPlanPath, env: {}, localConfigPath: null });
  assert.equal(unconfirmed.trial_framework, null);
  assert.ok(unconfirmed.blockers.some(item => item.id === 'trial_choice'));
  await writeFile(trialPlanPath, JSON.stringify({ trial_framework: 'midscene', final_framework: 'midscene', trial_confirmation: { status: 'user_confirmed', scope: 'first small trial' } }));
  const confirmed = await collectPreflight({ dataRoot: root, trialPlanPath, env: {}, localConfigPath: null });
  assert.equal(confirmed.trial_framework, 'midscene');
  assert.ok(!confirmed.blockers.some(item => item.id === 'trial_choice'));
  assert.equal(confirmed.final_framework, null);
  assert.equal(confirmed.framework_loop_executed, false);
  assert.equal(confirmed.model_usage.requests, 0);
});

test('tool replacement proves only the probe contract: version/list argv, no retries, raw serial omitted and failures unknown', async t => {
  const root = await temporary(t), calls = [];
  const report = await collectPreflight({ dataRoot: root, hdcPath: process.execPath, run: async (binary, args, options) => {
    calls.push(args); assert.equal(binary, process.execPath); assert.equal(options.shell, false);
    return { stdout: args[0] === '-v' ? 'Ver: fixture-version' : 'fixture-device-serial\n' };
  } });
  assert.deepEqual(calls, [['-v'], ['list', 'targets']]);
  assert.equal(report.hdc.version, 'fixture-version');
  assert.equal(report.hdc.status, 'one_target_listed');
  assert.equal(report.gui_result.passed, false);
  assert.ok(!JSON.stringify(report).includes('fixture-device-serial'));
  let failedCalls = 0;
  const failed = await collectPreflight({ dataRoot: root, hdcPath: process.execPath, run: async () => { failedCalls++; throw new Error('secret fixture'); } });
  assert.equal(failedCalls, 2); // One version and one listing, never a retry.
  assert.equal(failed.hdc.status, 'list_failed');
  assert.equal(failed.hdc.target_count, null);
  assert.ok(!JSON.stringify(failed).includes('secret fixture'));
});
