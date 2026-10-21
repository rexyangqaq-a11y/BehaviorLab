import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
const project = fileURLToPath(new URL('../', import.meta.url));

test('portable launcher handles a moved Unicode directory, concurrent starts, port collision, authenticated stop and persistent Mock continuation', { timeout: 60000 }, async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'behavior-portable-test-'));
  const root = path.join(temporary, '中文 迁移目录');
  await mkdir(root);
  for (const name of ['src', 'scripts', 'web', 'examples', 'package.json']) await cp(path.join(project, name), path.join(root, name), { recursive: true });
  const launcher = path.join(root, 'scripts/desktop-launcher.mjs');
  const stateFile = path.join(root, '.runtime/desktop.json');
  const run = (...args) => exec(process.execPath, [launcher, ...args], { cwd: os.tmpdir(), windowsHide: true, timeout: 25000 });
  const occupying = net.createServer(socket => socket.end());
  await new Promise(resolve => occupying.listen(0, '127.0.0.1', resolve));
  let pid;
  t.after(async () => {
    await run('stop').catch(() => {});
    await new Promise(resolve => occupying.close(resolve));
    for (let i = 0; pid && i < 100; i++) { try { process.kill(pid, 0); await delay(50); } catch { break; } }
    const relative = path.relative(os.tmpdir(), temporary);
    assert.ok(relative.startsWith('behavior-portable-test-') && !relative.includes(path.sep));
    await rm(temporary, { recursive: true, force: true });
  });
  const args = ['start', '--port', String(occupying.address().port), '--no-browser'];
  let started;
  try { started = await Promise.all([run(...args), run(...args)]); }
  catch (error) { error.message += '\nSERVICE LOG:\n' + await readFile(path.join(root, '.runtime/server.log'), 'utf8').catch(() => '(no log)'); throw error; }
  const saved = JSON.parse(await readFile(stateFile, 'utf8'));
  pid = saved.pid;
  assert.notEqual(new URL(saved.url).port, String(occupying.address().port));
  assert.ok(started.every(result => result.stdout.includes(`READY ${saved.url}`)));
  assert.equal(JSON.parse((await run('status')).stdout).pid, pid);
  assert.equal((await fetch(saved.url)).status, 200);
  assert.equal((await fetch(saved.url + '/workspace.mjs')).status, 200);
  const request = async (route, body, expected = 200, base = saved.url) => {
    const response = await fetch(base + route, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Simulator-UI': '1' }, body: JSON.stringify(body) });
    const value = await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return value;
  };
  const user = await request('/api/users/manual', { persona: { name: '迁移验证用户', city: '广州', interests: ['美食'] } }, 201);
  const simulation = await request('/api/simulations', { name: '迁移闭环 Mock', user_ids: user.user_ids, start_date: '2026-01-01', duration_days: 1, app_ids: ['toutiao', 'dianping'], execution_delay_ms: 1 }, 201);
  await request(`/api/runs/${simulation.id}/jobs`, { action: 'next_activity' }, 202);
  let snapshot;
  for (let i = 0; i < 200; i++) {
    snapshot = await request(`/api/runs/${simulation.id}`);
    if (!['queued', 'running', 'stopping'].includes(snapshot.job?.status)) break;
    await delay(25);
  }
  assert.equal(snapshot.job.status, 'completed', JSON.stringify(snapshot.job));
  assert.equal(snapshot.status.results, 1);
  const screens = snapshot.status.screenshot_count;
  assert.ok(screens > 0 && snapshot.events.every(event => event.synthetic));
  // A wrong control token must not stop a running simulator.
  await new Promise(resolve => {
    const socket = net.createConnection(saved.pipe);
    socket.on('error', resolve); socket.on('close', resolve);
    socket.once('connect', () => socket.write(JSON.stringify({ token: 'wrong', action: 'stop' }) + '\n'));
  });
  assert.equal(JSON.parse((await run('status')).stdout).pid, pid);
  // A stale/mismatched PID in a copied control file cannot authorize termination.
  await writeFile(stateFile, JSON.stringify({ ...saved, pid: pid + 1 }));
  assert.match((await run('stop')).stdout, /NOT_RUNNING/);
  await writeFile(stateFile, JSON.stringify(saved));
  assert.equal((await fetch(saved.url + '/api/system')).status, 200);
  assert.match((await run('stop')).stdout, /STOPPED/);
  assert.equal(JSON.parse((await run('status')).stdout).running, false);
  // A copied stale control file is ignored when the previous service has stopped.
  await writeFile(stateFile, JSON.stringify(saved));
  await run('start', '--port', '0', '--no-browser');
  const resumed = JSON.parse(await readFile(stateFile, 'utf8'));
  pid = resumed.pid;
  assert.notEqual(resumed.pid, saved.pid);
  const recovered = await request(`/api/runs/${simulation.id}`, undefined, 200, resumed.url);
  assert.equal(recovered.status.results, 1);
  assert.equal(recovered.status.screenshot_count, screens);
  await request(`/api/runs/${simulation.id}/jobs`, { action: 'pipeline' }, 202, resumed.url);
  for (let i = 0; i < 300; i++) {
    snapshot = await request(`/api/runs/${simulation.id}`, undefined, 200, resumed.url);
    if (!['queued', 'running', 'stopping'].includes(snapshot.job?.status)) break;
    await delay(25);
  }
  assert.equal(snapshot.job.status, 'completed', JSON.stringify(snapshot.job));
  assert.equal(snapshot.status.dataset_complete, true);
  assert.equal(snapshot.report.integrity_passed, true);
  assert.ok(snapshot.status.results > 1);
  assert.equal((await request('/api/users', undefined, 200, resumed.url)).users.length, 1);
  const image = await fetch(resumed.url + `/api/runs/${simulation.id}/screens/${snapshot.events[0].screenshot.id}`);
  assert.equal(image.status, 200);
});
