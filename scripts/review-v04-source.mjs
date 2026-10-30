/**
 * Read tracked v0.4 source and reproduce two known review findings with files.
 * This is a review aid, not a health check: reproduced defects are not passes.
 * No model endpoint, HDC, phone, application database or running service is used.
 */
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PhoneLab } from '../src/phone-lab.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(project, '.build', 'v04-source-review');
mkdirSync(output, { recursive: true });
const fixtureDirectory = mkdtempSync(path.join(output, 'fixture-'));
const git = args => execFileSync('git', args, {
  cwd: project, encoding: 'utf8', windowsHide: true,
}).trim();
const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
const sourcePaths = tracked.filter(file =>
  /^(src|scripts|integrations|web|tests)\//.test(file) &&
  /\.(mjs|py|java|html|css)$/.test(file) && !file.includes('/vendor/'));
const files = sourcePaths.map(file => {
  const bytes = readFileSync(path.join(project, file));
  const lines = bytes.toString('utf8').split(/\r?\n/);
  return {
    file, sha256: createHash('sha256').update(bytes).digest('hex'),
    lines: lines.length,
    max_line_chars: Math.max(...lines.map(line => line.length)),
    lines_over_240: lines.filter(line => line.length > 240).length,
  };
});

// Import syntax scan only: computed dynamic imports and runtime SDK dependencies
// are outside this inventory. Line length is a signal, not a defect threshold.
const edges = [];
for (const file of sourcePaths.filter(file => file.endsWith('.mjs'))) {
  const source = readFileSync(path.join(project, file), 'utf8');
  for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    const destination = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
    if (tracked.includes(destination)) edges.push({ from: file, to: destination });
  }
}

// Do not construct a real PhoneLab: use only the input-lock method and a
// synthetic dead parent. The current process stands in for a still-live worker.
const lockFile = path.join(fixtureDirectory, 'input.lock');
writeFileSync(lockFile, JSON.stringify({
  token: 'synthetic-previous-owner', pid: 2147483647,
  worker_pid: process.pid, owner: 'synthetic-previous-run',
}));
let release;
let inputLeaseGranted = false;
try {
  release = PhoneLab.prototype.acquire.call({ lockPath: lockFile }, 'synthetic-new-run');
  inputLeaseGranted = true;
} catch (error) {
  if (error.status !== 409) throw error;
} finally {
  release?.();
}

const ledgerDirectory = path.join(fixtureDirectory, 'ledger');
mkdirSync(ledgerDirectory);
writeFileSync(path.join(ledgerDirectory, 'events.jsonl'),
  JSON.stringify({ seq: 1, type: 'execution_start' }) +
  '\n{"seq":2,"type":"action_return"\n');
const snapshot = PhoneLab.prototype.snapshot.call({
  summary: () => ({ id: 'synthetic', state: { status: 'ended' } }),
  runDirectory: () => ledgerDirectory,
}, 'synthetic');

const report = {
  schema_version: 1,
  scope: 'v0.4 tracked source review; synthetic files only',
  checked_at: new Date().toISOString(),
  source_commit: git(['rev-parse', 'HEAD']),
  working_tree_included: true,
  counts: {
    files: files.length,
    lines: files.reduce((sum, file) => sum + file.lines, 0),
    files_with_lines_over_240: files.filter(file => file.lines_over_240).length,
    lines_over_240: files.reduce((sum, file) => sum + file.lines_over_240, 0),
  },
  files,
  static_dependency_edges: edges,
  layer_crossings: edges.filter(edge =>
    edge.from.startsWith('src/') && /^(scripts|web)\//.test(edge.to)),
  known_findings: [
    { id: 'R01', scenario: 'dead parent and live worker', reproduced: inputLeaseGranted },
    { id: 'R02', scenario: 'malformed ledger row silently omitted',
      reproduced: snapshot.events.length === 1 &&
        !snapshot.events.some(event => event.type === 'evidence_ledger_invalid') &&
        !snapshot.integrity_error },
  ],
  real_model_requests: 0,
  real_device_commands: 0,
  limitations: ['not a security certification', 'no whole-program semantic analysis',
    'no real OS orphan-worker timing proof', 'no long-run memory benchmark'],
};
const reportFile = path.join(output, 'report.json');
writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  report: path.relative(project, reportFile), counts: report.counts,
  known_findings: report.known_findings,
  real_model_requests: 0, real_device_commands: 0,
}, null, 2));
