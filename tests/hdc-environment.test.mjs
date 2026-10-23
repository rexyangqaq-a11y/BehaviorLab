import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { findHdc, parseHdcTargets } from '../src/hdc-environment.mjs';

test('HDC empty output and failure messages never become an empty or valid device list', () => {
  for (const [stdout, stderr] of [['', ''], ['[Fail] connect failed', ''], ['[Empty]', '[Fail] server failed'], ['[Info] Server started', ''], ['Unexpected help text', '']]) {
    assert.equal(parseHdcTargets(stdout, stderr).status, 'unverified');
  }
  assert.deepEqual(parseHdcTargets('[Empty]\r\r\n'), { status: 'empty', targets: [] });
  assert.deepEqual(parseHdcTargets('', 'fixture-id\r\n'), { status: 'targets', targets: ['fixture-id'] });
});

test('project HDC config remains local, cannot escape its directory and cannot override an explicit path', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'behavior-hdc-env-'));
  t.after(async () => { assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('behavior-hdc-env-')); await rm(root, { recursive: true, force: true }); });
  const config = path.join(root, 'device-tools.json'), binary = path.join(root, 'hdc.exe');
  await writeFile(binary, 'fixture, never executed');
  await writeFile(config, JSON.stringify({ schema_version: 1, hdc: { relative_executable: 'hdc.exe' } }));
  assert.equal(findHdc({ env: {}, localConfigPath: config }), binary);
  assert.equal(findHdc({ explicitPath: path.join(root, 'missing.exe'), env: {}, localConfigPath: config }), null);
  await writeFile(config, JSON.stringify({ schema_version: 1, hdc: { relative_executable: '../outside.exe' } }));
  assert.equal(findHdc({ env: {}, localConfigPath: config, exists: () => true }), null);
});
