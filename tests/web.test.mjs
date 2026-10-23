import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import os from 'node:os';
import { createDebugServer } from '../src/web-server.mjs';

async function setup(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'behavior-web-test-'));
  const app = await createDebugServer({ dataRoot: directory, port: 0 });
  t.after(async () => {
    await app.close();
    const target = path.resolve(directory);
    const relative = path.relative(path.resolve(os.tmpdir()), target);
    assert.ok(relative.startsWith('behavior-web-test-') && !relative.includes(path.sep) && !path.isAbsolute(relative));
    await rm(target, { recursive: true, force: true });
  });
  const request = async (route, data, expected = 200, extraHeaders = {}) => {
    const response = await fetch(app.url + route, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Simulator-UI': '1', ...extraHeaders }, body: JSON.stringify(data) });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    return body;
  };
  const template = await request('/api/template');
  template.run_id = 'web_test';
  template.mock.execution_delay_ms = 1; template.mock.description_delay_ms = 1;
  const create = () => request('/api/runs', { config: template }, 201);
  const snapshot = () => request(`/api/runs/${template.run_id}`);
  const wait = async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const value = await snapshot();
      // The worker persists its terminal status just before process exit. Wait
      // for the real process to release ownership before scheduling another job.
      let workerAlive=false;
      if(value.job?.pid)try{process.kill(value.job.pid,0);workerAlive=true;}catch{}
      if (!['queued', 'running', 'stopping'].includes(value.job?.status)&&!workerAlive) return value;
      await delay(20);
    }
    assert.fail('Web job did not finish in time');
  };
  return { app, directory, request, template, create, snapshot, wait };
}

test('Web API runs the actual Mock pipeline, exposes isolated evidence, assets, export and offline report', async t => {
  const f = await setup(t);
  const home = await fetch(f.app.url);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /BehaviorLab/);
  await f.create();
  await f.request('/api/runs/web_test/jobs', { action: 'pipeline' }, 202);
  const s = await f.wait();
  assert.equal(s.job.status, 'completed', JSON.stringify(s.job));
  assert.equal(s.status.dataset_complete, true);
  assert.equal(s.status.results, 8);
  assert.equal(s.events.length, 24);
  assert.equal(s.plans.length, 8);
  assert.equal(s.report.integrity_passed, true);
  assert.deepEqual(s.job.stages.map(stage => stage.name), ['execute', 'describe', 'export', 'check']);
  assert.ok(s.events.every(e => e.synthetic && e.mode === 'mock'));
  const image = await fetch(`${f.app.url}/api/runs/web_test/screens/${s.events[0].screenshot.id}`);
  assert.equal(image.status, 200);
  assert.match(await image.text(), /Not a real phone screenshot/);
  const download = await fetch(`${f.app.url}/api/runs/web_test/files/events.jsonl`);
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.equal((await download.text()).trim().split('\n').length, 24);
  assert.ok(s.description_history.some(h => h.status === 'failed'));
  assert.ok(s.users.every(u => u.persona.original_requirements.interests[0] === (u.user_id === 'user_a' ? '徒步' : '烹饪')));
  await f.request('/api/runs/web_test/jobs', { action: 'run' }, 202);
  const resumed = await f.wait();
  assert.equal(resumed.status.screenshot_count, 24);
  assert.equal(resumed.status.results, 8);
});

test('Web interruption drill records an actual worker exit, releases controls and resumes without duplicates', async t => {
  const f = await setup(t);
  await f.create();
  await f.request('/api/runs/web_test/jobs', { action: 'interrupt' }, 202);
  const stopped = await f.wait();
  assert.equal(stopped.job.status, 'interrupted');
  assert.equal(stopped.status.results, 0);
  assert.equal(stopped.status.screenshot_count, 2);
  assert.equal(stopped.status.workers.some(w => w.alive), false);
  await f.request('/api/runs/web_test/jobs', { action: 'pipeline' }, 202);
  const resumed = await f.wait();
  assert.equal(resumed.job.status, 'completed');
  assert.equal(resumed.status.results, 8);
  assert.equal(resumed.status.screenshot_count, 24);
  assert.ok(resumed.audit.some(a => a.event === 'execution_recovery_authorized'));
});

test('Web stop preserves journals; concurrent jobs are rejected and execution can resume', async t => {
  const f = await setup(t);
  f.template.mock.execution_delay_ms = 250;
  await f.create();
  await f.request('/api/runs/web_test/jobs', { action: 'run' }, 202);
  await f.request('/api/runs/web_test/jobs', { action: 'run' }, 409);
  for (let i = 0; i < 100 && (await f.snapshot()).status.screenshot_count === 0; i++) await delay(10);
  await f.request('/api/runs/web_test/stop', {}, 200);
  const stopped = await f.snapshot();
  assert.equal(stopped.job.status, 'stopped');
  // Each image is committed separately. The stop may land after only the
  // before image; a screenshot pair is not an atomic operation.
  assert.ok(stopped.status.screenshot_count >= 1);
  const retained = stopped.events.map(e => ({ id: e.screenshot.id, sha256: e.screenshot.sha256 }));
  await f.request('/api/runs/web_test/jobs', { action: 'pipeline' }, 202);
  const completed = await f.wait();
  assert.equal(completed.status.results, 8);
  assert.equal(completed.status.screenshot_count, 24);
  for (const image of retained) assert.ok(completed.events.some(e => e.screenshot.id === image.id && e.screenshot.sha256 === image.sha256));
});

test('Web split stages preserve failures until retry and never relabel incomplete data as complete', async t => {
  const f = await setup(t);
  await f.create();
  await f.request('/api/runs/web_test/jobs', { action: 'execute' }, 202);
  const executed = await f.wait();
  assert.equal(executed.status.results, 8);
  assert.equal(executed.status.dataset_complete, false);
  assert.equal(executed.status.descriptions.find(d => d.status === 'pending').count, 24);
  await f.request('/api/runs/web_test/jobs', { action: 'describe' }, 202);
  assert.equal((await f.wait()).status.descriptions.find(d => d.status === 'failed').count, 2);
  await f.request('/api/runs/web_test/jobs', { action: 'check' }, 202);
  const incomplete = await f.wait();
  assert.equal(incomplete.job.status, 'completed_with_issues');
  assert.equal(incomplete.report.integrity_passed, false);
  await f.request('/api/runs/web_test/jobs', { action: 'retry_descriptions' }, 202);
  assert.equal((await f.wait()).status.dataset_complete, true);
});

test('Web API protects local writes, rejects traversal and duplicate IDs, and does not execute arbitrary commands', async t => {
  const f = await setup(t);
  await f.create();
  await f.request('/api/runs', { config: f.template }, 409);
  await f.request('/api/runs/web_test/jobs', { action: 'arbitrary_shell' }, 400);
  await f.request('/api/runs/web_test/jobs', { action: 'run' }, 403, { Origin: 'https://example.com' });
  await f.request('/api/runs', { config: { ...f.template, run_id: '../outside' } }, 400);
  await f.request('/api/runs', { config: { ...f.template, run_id: 'real', mode: 'real' } }, 400);
  await f.request('/api/runs/web_test/files/state.sqlite', undefined, 404);
  await f.request('/api/runs/web_test/screens/missing', undefined, 404);
  const response = await fetch(`${f.app.url}/api/runs/web_test/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"run"}' });
  assert.equal(response.status, 403);
  const jobFile = path.join(f.directory, 'web_test/web-job.json');
  await assert.rejects(readFile(jobFile), /ENOENT/);
});
