import fs, { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const ACTIONS = ['pipeline', 'run', 'execute', 'describe', 'retry_descriptions', 'interrupt', 'export', 'check', 'plan_next', 'next_activity', 'next_day'];
export const ACTIVE_JOBS = ['queued', 'running', 'stopping'];
// Windows scanners/readers can briefly deny replacing a file. Keep the old
// complete record until rename succeeds; never fall back to truncating it.
const renameWaits = [10, 20, 40, 80, 160, 200, 200, 200];
const waitCell = new Int32Array(new SharedArrayBuffer(4));
export function readJob(directory) {
  const filename = path.join(directory, 'web-job.json');
  if (!existsSync(filename)) return null;
  return JSON.parse(readFileSync(filename, 'utf8'));
}
export function writeJob(directory, job) {
  const filename = path.join(directory, 'web-job.json');
  const temporary = `${filename}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(job, null, 2) + '\n', { flush: true });
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temporary, filename); break; }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= renameWaits.length) throw error;
      Atomics.wait(waitCell, 0, 0, renameWaits[attempt]);
    }
  }
}
export function isAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}
