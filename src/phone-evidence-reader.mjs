import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const invalid = message => Object.assign(new Error(message), { status: 409 });

/** Parse diagnostics only. Never rewrite malformed evidence or expose its text. */
export function parsePhoneLedger(text, { active = false } = {}) {
  const events = [], issues = [];
  const lines = text.split('\n');
  let invalidLines = 0, pendingTail = null;
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let event, code;
    try { event = JSON.parse(line); }
    catch { code = 'invalid_json'; }
    if (!code && (!event || typeof event !== 'object' || Array.isArray(event) ||
        typeof event.type !== 'string' || !event.type)) code = 'invalid_event';
    if (code) {
      // A reader can race an append. Only an unterminated final JSON fragment
      // in an active run is provisional; internal/terminated bad rows are errors.
      if (code === 'invalid_json' && active && index === lines.length - 1 && !text.endsWith('\n')) {
        pendingTail = index + 1;
      } else {
        invalidLines++;
        if (issues.length < 100) issues.push({ line: index + 1, code });
      }
      continue;
    }
    events.push(event);
  }
  return { events, append_separator: text.length && !text.endsWith('\n') ? '\n' : '', integrity: {
    schema_version: 1, scope: 'ledger_parsing',
    status: invalidLines ? 'incomplete' : pendingTail ? 'pending_tail' : 'complete',
    complete: invalidLines === 0 && pendingTail === null,
    valid_events: events.length, invalid_lines: invalidLines,
    issues, issues_truncated: invalidLines > issues.length,
    pending_tail_line: pendingTail,
  } };
}

export function readPhoneLedger(directory, { active = false, readText = file => readFileSync(file, 'utf8') } = {}) {
  let text;
  try { text = readText(path.join(directory, 'events.jsonl')); }
  catch (error) {
    return { events: [], integrity: {
      schema_version: 1, scope: 'ledger_parsing',
      status: error.code === 'ENOENT' ? 'missing' : 'unreadable', complete: false,
      valid_events: 0, invalid_lines: 0,
      issues: [{ line: null, code: error.code === 'ENOENT' ? 'missing_ledger' : 'ledger_read_failed' }],
      issues_truncated: false, pending_tail_line: null,
    } };
  }
  return parsePhoneLedger(text, { active });
}

/** Used when serving images and validating evidence for a passed review. */
export function readVerifiedPhoneAsset(directory, asset) {
  if (!asset || typeof asset.file !== 'string') throw invalid('截图引用无效，证据不完整');
  const root = path.resolve(directory), file = path.resolve(root, asset.file);
  if (!file.startsWith(root + path.sep)) throw invalid('截图路径无效，未读取目录外文件');
  let bytes;
  try { bytes = readFileSync(file); }
  catch { throw invalid('截图缺失或不可读，证据不完整'); }
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw invalid('截图哈希核对失败，证据不完整');
  }
  return { bytes, type: asset.format === 'jpeg' ? 'image/jpeg' : 'image/png' };
}
