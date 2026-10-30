import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parsePhoneLedger, readPhoneLedger, readVerifiedPhoneAsset } from '../src/phone-evidence-reader.mjs';
import { PhoneEvidence } from '../src/phone-evidence.mjs';
import { PhoneLab } from '../src/phone-lab.mjs';
import { createDebugServer } from '../src/web-server.mjs';
import { mergeProcessSnapshot } from '../web/phone-process.mjs';
import { renderPhoneEvidenceIntegrity } from '../web/phone-evidence-integrity.mjs';

const runId = 'phone_00000000-0000-0000-0000-000000000101';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX8cAAAAASUVORK5CYII=', 'base64');
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'phone-evidence-reader-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert(path.basename(root).startsWith('phone-evidence-reader-'));
    await rm(root, { recursive: true, force: true });
  });
  const options = { lockPath: path.join(root, 'input.lock'), pausePath: path.join(root, 'pause.json'),
    deviceFactory: async () => { throw Error('no real device allowed'); } };
  const lab = new PhoneLab(root, options), dir = lab.directory('runs', runId);
  await mkdir(dir);
  await writeFile(path.join(dir, 'input.json'), JSON.stringify({ id: runId, name: '合成轨迹',
    created_at: '2026-10-30T00:00:00Z', instruction: '离线核对证据', acceptance: ['有真实依据'] }));
  await writeFile(path.join(dir, 'state.json'), JSON.stringify({ status: 'ended' }));
  return { root, lab, dir, options, ledger: path.join(dir, 'events.jsonl') };
}

test('malformed internal rows retain positions without hiding the damage or copying raw text', () => {
  const result = parsePhoneLedger('{"seq":1,"type":"execution_start"}\nprivate-invalid-text\nnull\n{"seq":3,"type":"execution_end"}\n');
  assert.equal(result.events.length, 2);
  assert.equal(result.integrity.status, 'incomplete');
  assert.deepEqual(result.integrity.issues, [{ line: 2, code: 'invalid_json' }, { line: 3, code: 'invalid_event' }]);
  assert(!JSON.stringify(result).includes('private-invalid-text'));
  assert.equal(parsePhoneLedger('bad\n'.repeat(103)).integrity.issues.length, 100);
  assert.equal(parsePhoneLedger('bad\n'.repeat(103)).integrity.invalid_lines, 103);
});

test('only active unterminated JSON tails are provisional; closed or completed damage is an error', () => {
  const text = '{"seq":1,"type":"execution_start"}\n{"seq":2';
  const active = parsePhoneLedger(text, { active: true });
  assert.equal(active.integrity.status, 'pending_tail');
  assert.equal(active.integrity.pending_tail_line, 2);
  assert.equal(active.integrity.invalid_lines, 0);
  assert.equal(parsePhoneLedger(text).integrity.status, 'incomplete');
  assert.equal(parsePhoneLedger(text + '\n', { active: true }).integrity.status, 'incomplete');
  assert.equal(parsePhoneLedger(text + ',"type":"execution_end"}\r\n').integrity.complete, true);
  assert.equal(parsePhoneLedger('').integrity.complete, true);
});

test('missing and unreadable ledgers are different diagnostics and do not leak filesystem errors', async t => {
  const { dir } = await fixture(t);
  assert.equal(readPhoneLedger(dir).integrity.status, 'missing');
  const result = readPhoneLedger(dir, { readText: () => { throw Object.assign(Error('private-path-and-secret'), { code: 'EACCES' }); } });
  assert.equal(result.integrity.status, 'unreadable');
  assert(!JSON.stringify(result).includes('private-path-and-secret'));
});

test('writers refuse damaged evidence unchanged and safely append after a valid unterminated row', async t => {
  const { dir, ledger } = await fixture(t), damaged = '{"seq":1,"type":"execution_start"}\n{"seq":2';
  await writeFile(ledger, damaged);
  assert.throws(() => new PhoneEvidence(dir), error => error.code === 'EVIDENCE_LEDGER_INVALID');
  assert.equal(await readFile(ledger, 'utf8'), damaged);
  await writeFile(ledger, '{"seq":7,"type":"execution_start"}');
  new PhoneEvidence(dir).record({ type: 'execution_end' });
  const parsed = readPhoneLedger(dir);
  assert.equal(parsed.integrity.complete, true);
  assert.deepEqual(parsed.events.map(event => event.seq), [7, 8]);
});

test('snapshots, cursor updates and user review retain damage without rewriting the source', async t => {
  const { lab, dir, ledger } = await fixture(t);
  const original = '{"seq":1,"type":"execution_start"}\n{"seq":2';
  await writeFile(ledger, original);
  assert.equal(lab.snapshot(runId).ledger_integrity.status, 'incomplete');
  assert.equal(lab.processSnapshot(runId, 1).ledger_integrity.status, 'incomplete');
  for (const verdict of ['passed', 'cannot_determine', 'failed']) {
    assert.throws(() => lab.review(runId, { verdict, note: '需要核对', evidence_ids: [] }), error => error.status === 409);
  }
  assert.equal(await readFile(ledger, 'utf8'), original);
  await writeFile(path.join(dir, 'state.json'), JSON.stringify({ status: 'running' }));
  const pending = lab.processSnapshot(runId);
  assert.equal(pending.ledger_integrity.status, 'pending_tail');
  await writeFile(ledger, '{"seq":1,"type":"execution_start"}\n{"seq":2,"type":"execution_end"}\n');
  const merged = mergeProcessSnapshot(pending, lab.processSnapshot(runId, 1));
  assert.equal(merged.ledger_integrity.complete, true);
  assert.deepEqual(merged.events.map(event => event.seq), [1, 2]);
});

test('missing, tampered and escaping image references cannot certify a passed result', async t => {
  const { lab, dir } = await fixture(t), recorder = new PhoneEvidence(dir);
  const asset = await recorder.image(image, 'image/png', 'final');
  const decision = { verdict: 'passed', note: '合成图片核对', evidence_ids: [asset.id] };
  await unlink(path.join(dir, asset.file));
  assert.throws(() => lab.review(runId, decision), error => error.status === 409 && /缺失/.test(error.message));
  await assert.rejects(lab.asset('runs', runId, asset.id), error => error.status === 409);
  await writeFile(path.join(dir, asset.file), 'tampered');
  assert.throws(() => lab.review(runId, decision), error => error.status === 409 && /哈希/.test(error.message));
  assert.throws(() => readVerifiedPhoneAsset(dir, { ...asset, file: '../outside.png' }), error => error.status === 409);
  await writeFile(path.join(dir, asset.file), image);
  assert.equal(lab.review(runId, decision).verdict, 'passed');
  lab.review(runId, { ...decision, reviewer: 'user', verdict: 'partial' });
  lab.review(runId, { ...decision, reviewer: 'assistant' });
  assert.equal(lab.summary(runId).review.verdict, 'partial');
  assert.equal(readPhoneLedger(dir).integrity.complete, true);
});

test('HTTP exports and process snapshots expose the same integrity report without hardware', async t => {
  const { root, options, ledger } = await fixture(t);
  await writeFile(ledger, '{"seq":1,"type":"execution_start"}\ninvalid\n');
  const app = await createDebugServer({ dataRoot: root, port: 0, phoneLabOptions: options });
  try {
    const snapshot = await (await fetch(app.url + '/api/phone-lab/runs/' + runId + '/export')).json();
    const process = await (await fetch(app.url + '/api/phone-lab/runs/' + runId + '/process?after_seq=1')).json();
    assert.deepEqual(snapshot.ledger_integrity, process.ledger_integrity);
    assert.equal(snapshot.ledger_integrity.complete, false);
    const review = await fetch(app.url + '/api/phone-lab/runs/' + runId + '/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Simulator-UI': '1' },
      body: JSON.stringify({ verdict: 'passed', note: 'should block', evidence_ids: [] }),
    });
    assert.equal(review.status, 409);
    assert.equal((await fetch(app.url + '/phone-evidence-integrity.mjs')).status, 200);
  } finally { await app.close(); }
});

test('the shared UI warning distinguishes an active tail from stable corruption and escapes values', () => {
  assert.equal(renderPhoneEvidenceIntegrity({ ledger_integrity: { complete: true } }), '');
  const pending = renderPhoneEvidenceIntegrity({ ledger_integrity: { status: 'pending_tail', pending_tail_line: '<img>' } });
  assert(pending.includes('role="status"'));
  assert(pending.includes('&lt;img&gt;'));
  const bad = renderPhoneEvidenceIntegrity({ ledger_integrity: { status: 'incomplete', issues: [{ line: 2 }] } });
  assert(bad.includes('role="alert"'));
  assert(bad.includes('第2行'));
  assert(bad.includes('暂不保存审核'));
});
