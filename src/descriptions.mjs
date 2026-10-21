import { setTimeout as delay } from 'node:timers/promises';
import { traced } from './tracing.mjs';

export async function drainDescriptions(store, describer, hooks = {}) {
  let count = 0;
  for (let screenshot; (screenshot = store.nextDescription());) {
    const attempt = store.startDescription(screenshot);
    let output;
    let failure;
    try {
      const bytes = await store.readAsset(screenshot);
      output = await traced(store, { trace_id: hooks.traceParent?.trace_id, parent_id: hooks.traceParent?.id, module: 'describer', operation: 'screenshot.describe', ...describer.provenance, user_id: screenshot.user_id, activity_id: screenshot.activity_id, virtual_date: screenshot.task.virtual_date, input: { screenshot_id: screenshot.id, sha256: screenshot.sha256, phase: screenshot.phase, attempt_number: attempt, task: screenshot.task } }, async call => ({ ...await describer.describe({ screenshot, bytes, attempt_number: attempt, task: screenshot.task }), call_id: call.id }));
      // Validation errors are description failures too; preserve them for inspection.
      store.finishDescription(screenshot, output, null, { ...describer.provenance, call_id: output.call_id });
    } catch (error) {
      failure = error;
      store.finishDescription(screenshot, null, error, describer.provenance);
    }
    count++;
    await hooks.afterDescription?.({ screenshot, output, failure, attempt });
  }
  return count;
}

export async function describeSaved(store, describer, { retryFailed = false, ...hooks } = {}) {
  const release = store.acquireLease('descriptions');
  try {
    store.recoverDescriptions();
    if (retryFailed) store.retryFailedDescriptions();
    return await drainDescriptions(store, describer, hooks);
  } finally { release(); }
}

export async function backgroundDescriptions(store, describer, done, hooks = {}) {
  const release = store.acquireLease('descriptions');
  try {
    store.recoverDescriptions();
    do {
      await drainDescriptions(store, describer, hooks);
      if (!done()) await delay(10);
    } while (!done() || store.nextDescription());
  } finally { release(); }
}
