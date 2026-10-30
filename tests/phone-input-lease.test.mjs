import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { fork } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import os from 'node:os';
import path from 'node:path';
import { acquireDeviceLease, readDeviceLease } from '../src/device-lease.mjs';
import { waitForPhoneInputLease } from '../src/phone-worker-lease.mjs';
import { PhoneLab } from '../src/phone-lab.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'phone-input-lease-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert(path.basename(root).startsWith('phone-input-lease-'));
    await rm(root, { recursive: true, force: true });
  });
  return path.join(root, 'input.lock');
}

test('PhoneLab cannot steal a dead parent lease while its worker is alive', async t => {
  const file = await fixture(t);
  const old = { host: hostname(), pid: 2147483647, worker_pid: process.pid,
    token: 'synthetic-old', owner: 'old-run' };
  await writeFile(file, JSON.stringify(old));
  assert.throws(() => PhoneLab.prototype.acquire.call({ lockPath: file }, 'new-run'),
    error => error.status === 409);
  assert.deepEqual(readDeviceLease(file), old);
});

test('input leases reclaim confirmed dead workers but keep legacy and uncertain locks', async t => {
  const file = await fixture(t);
  for (const old of [{ pid: 2147483647 }, { host: 'another-host', pid: 2147483647, worker_pid: null }]) {
    await writeFile(file, JSON.stringify(old));
    await assert.rejects(async () => PhoneLab.prototype.acquire.call({ lockPath: file }, 'new-run'),
      error => error.status === 409);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), old);
  }
  await writeFile(file, JSON.stringify({ host: hostname(), pid: 2147483647, worker_pid: 2147483647 }));
  const release = PhoneLab.prototype.acquire.call({ lockPath: file }, 'new-run');
  assert.equal(readDeviceLease(file).owner, 'new-run');
  assert.equal(release(), true);
});

function channel() {
  const value = new EventEmitter();
  Object.assign(value, { connected: true, pid: process.pid, ppid: process.pid,
    sent: [], send(message, callback) { this.sent.push(message); callback?.(null); } });
  return value;
}

test('workers require a registered, matching lease and recheck after replacement or disconnect', async t => {
  const file = await fixture(t), release = acquireDeviceLease(file, 'fixture-run');
  release.registerWorker(process.pid);
  const ipc = channel(), pending = waitForPhoneInputLease({ owner: 'fixture-run', channel: ipc });
  assert.deepEqual(ipc.sent, [{ type: 'phone_input_lease_request' }]);
  ipc.emit('message', { type: 'phone_input_lease', file, token: release.token, worker_pid: process.pid });
  const lease = await pending;
  lease.assertOwnership();
  await writeFile(file, JSON.stringify({ ...readDeviceLease(file), token: 'replaced' }));
  assert.throws(lease.assertOwnership, error => error.action_not_sent && !error.effect_unknown);
  ipc.connected = false;
  assert.throws(lease.assertOwnership, /断开/);
  assert.equal(ipc.listenerCount('message'), 0);
});

test('missing grants, wrong workers and parent loss fail before task I/O and remove listeners', async t => {
  const file = await fixture(t), release = acquireDeviceLease(file, 'fixture-run');
  release.registerWorker(process.pid);
  const wrong = channel(), mismatch = waitForPhoneInputLease({ owner: 'fixture-run', channel: wrong });
  wrong.emit('message', { type: 'phone_input_lease', file, token: release.token, worker_pid: 1 });
  await assert.rejects(mismatch, error => error.action_not_sent);
  const disconnected = channel(), lost = waitForPhoneInputLease({ owner: 'fixture-run', channel: disconnected });
  disconnected.connected = false; disconnected.emit('disconnect');
  await assert.rejects(lost, error => error.action_not_sent);
  const waiting = channel();
  await assert.rejects(waitForPhoneInputLease({ owner: 'fixture-run', channel: waiting, timeoutMs: 5 }), /超时/);
  for (const ipc of [wrong, disconnected, waiting]) {
    assert.equal(ipc.listenerCount('message'), 0);
    assert.equal(ipc.listenerCount('disconnect'), 0);
  }
});

const messageOf = (child, type) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { clean(); reject(Error('fixture message timeout: ' + type)); }, 5000);
  const receive = message => { if (message?.type === type) { clean(); resolve(message); } };
  const clean = () => { clearTimeout(timer); child.removeListener('message', receive); };
  child.on('message', receive);
});

test('actual child IPC waits for parent registration and keeps the lease until process exit', async t => {
  const file = await fixture(t), release = acquireDeviceLease(file, 'fixture-run');
  const child = fork(new URL('./helpers/phone-input-lease-fixture.mjs', import.meta.url), [],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => { if (child.exitCode == null) child.kill(); });
  await messageOf(child, 'phone_input_lease_request');
  let ready = false; child.on('message', message => { if (message?.type === 'fixture_ready') ready = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(ready, false);
  release.registerWorker(child.pid);
  const approved = messageOf(child, 'fixture_ready');
  child.send({ type: 'phone_input_lease', file, token: release.token, worker_pid: child.pid });
  await approved;
  assert.equal(release(), false);
  assert.throws(() => acquireDeviceLease(file, 'other'), error => error.status === 409);
  const checked = messageOf(child, 'fixture_checked');
  child.send({ type: 'fixture_check' }); await checked;
  const closed = once(child, 'close'); child.send({ type: 'fixture_exit' }); await closed;
  assert.equal(release(), true);
});
