import path from 'node:path';
import { openExisting } from '../src/store.mjs';
import { createMockAdapters } from '../src/adapters/mock.mjs';
import { runSimulation, prepareNextDay } from '../src/runner.mjs';
import { describeSaved } from '../src/descriptions.mjs';
import { exportRun, checkRun } from '../src/output.mjs';
import { readJob, writeJob } from '../src/web-jobs.mjs';
import { now } from '../src/contracts.mjs';

const [directory, jobId] = process.argv.slice(2);
let job = readJob(directory);
if (job?.id !== jobId) throw new Error('Web job identity mismatch');
const store = openExisting(directory);
const adapters = createMockAdapters(store.config(), job.action === 'interrupt' ? { afterCapture: () => process.exit(73) } : {});
const save = () => writeJob(directory, job);
const stage = async (name, operation) => {
  const record = { name, status: 'running', started_at: now() };
  job.stages.push(record);
  save();
  try {
    const result = await operation();
    record.status = result?.integrity_passed === false ? 'issues' : 'completed';
    record.result = name === 'execute' ? { results: result.results, screenshot_count: result.screenshot_count, dataset_complete: result.dataset_complete } : result;
    record.finished_at = now();
    save();
    return result;
  } catch (error) {
    record.status = 'failed'; record.error = error.message; record.finished_at = now(); save();
    throw error;
  }
};
try {
  job = { ...job, status: 'running', pid: process.pid, started_at: now() };
  save();
  const action = job.action;
  let paused = false;
  if (action === 'plan_next') await stage('plan', () => prepareNextDay(store, adapters));
  if (['pipeline', 'run', 'execute', 'interrupt', 'next_activity', 'next_day'].includes(action)) {
    const result = await stage('execute', () => runSimulation(store, adapters, { describe: !['execute', 'interrupt'].includes(action), maxActivities: action === 'next_activity' ? 1 : Infinity, maxUserDays: action === 'next_day' ? 1 : Infinity }));
    paused = result.advancement?.paused;
  }
  if (!paused && ['pipeline', 'describe', 'retry_descriptions'].includes(action)) await stage('describe', async () => ({ processed: await describeSaved(store, adapters.describer, { retryFailed: action !== 'describe' }) }));
  if (!paused && ['pipeline', 'export'].includes(action)) await stage('export', () => exportRun(store, path.join(directory, 'export')));
  if (!paused && ['pipeline', 'check'].includes(action)) await stage('check', () => checkRun(store, path.join(directory, 'export')));
  job.status = paused ? 'paused' : job.stages.some(s => s.status === 'issues') ? 'completed_with_issues' : 'completed';
} catch (error) {
  job.status = 'failed'; job.error = error.message;
  process.exitCode = 1;
} finally {
  job.finished_at = now(); save(); store.close();
}
