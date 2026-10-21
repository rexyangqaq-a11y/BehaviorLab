import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJob, writeJob } from '../src/web-jobs.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'behavior-job-file-test-'));
  t.after(async () => {
    const relative = path.relative(os.tmpdir(), directory);
    assert.ok(relative.startsWith('behavior-job-file-test-') && !relative.includes(path.sep));
    await rm(directory, { recursive: true, force: true });
  });
  writeJob(directory, { id: 'job', status: 'running' });
  return directory;
}

test('a transient job-file replacement failure preserves the previous record and then commits the new one atomically', async t => {
  const directory = await fixture(t);
  const rename = fs.renameSync;
  let calls = 0;
  t.mock.method(fs, 'renameSync', (source, destination) => {
    calls++;
    assert.equal(readJob(directory).status, 'running');
    if (calls <= 2) throw Object.assign(new Error('temporary sharing violation'), { code: calls === 1 ? 'EPERM' : 'EACCES' });
    return rename(source, destination);
  });
  writeJob(directory, { id: 'job', status: 'completed' });
  assert.equal(calls, 3);
  assert.equal(readJob(directory).status, 'completed');
  assert.deepEqual(await readdir(directory), ['web-job.json']);
});

test('persistent job-file sharing failures are bounded, remain errors and never corrupt the saved record', async t => {
  const directory = await fixture(t);
  let calls = 0;
  t.mock.method(fs, 'renameSync', () => { calls++; throw Object.assign(new Error('still locked'), { code: 'EBUSY' }); });
  assert.throws(() => writeJob(directory, { id: 'job', status: 'completed' }), { code: 'EBUSY' });
  assert.ok(calls > 1 && calls <= 10);
  assert.equal(readJob(directory).status, 'running');
});

test('non-sharing errors are surfaced immediately without retrying or overwriting progress', async t => {
  const directory = await fixture(t);
  let calls = 0;
  t.mock.method(fs, 'renameSync', () => { calls++; throw Object.assign(new Error('disk error'), { code: 'EIO' }); });
  assert.throws(() => writeJob(directory, { id: 'job', status: 'completed' }), { code: 'EIO' });
  assert.equal(calls, 1);
  assert.equal(readJob(directory).status, 'running');
});
