import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { normalizeConfig, ensure } from './contracts.mjs';
import { createMockAdapters } from './adapters/mock.mjs';
import { createOfflineExecutor } from './adapters/offline.mjs';
import { frameworkSpec } from './phone-framework-registry.mjs';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(v => v === undefined ? 'null' : canonical(v)).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const fingerprint = value => createHash('sha256').update(canonical(value)).digest('hex');
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const executionFiles = ['src/runtime-assembly.mjs', 'src/runtime-config.mjs', 'src/contracts.mjs', 'src/adapters/offline.mjs', 'src/phone-framework-registry.mjs', 'src/framework-runtime.mjs', 'src/device-lease.mjs', 'src/scheduler.mjs', 'src/store.mjs', 'src/execution-review.mjs', 'src/tracing.mjs', 'src/adapters/mock.mjs', 'src/adapters/daily-content.mjs'];
const readSources = () => Object.fromEntries(executionFiles.map(file => [file, createHash('sha256').update(readFileSync(new URL('../' + file, import.meta.url))).digest('hex')]));
const loadedSources = freeze(readSources());

/** Pure local assembly: never opens providers, credentials, HDC or native SDKs. */
export function createRuntimeAdapters(input, hooks = {}) {
  const config = freeze(normalizeConfig(input));
  const bundle = createMockAdapters(config, hooks);
  if (config.mode === 'mock') return bundle;
  const spec = frameworkSpec(config.runtime.executor.framework_id);
  const sources = loadedSources;
  ensure(fingerprint(readSources()) === fingerprint(sources), 'Execution sources changed on disk; restart the service before creating adapters');
  const framework = { id: spec.id, version: spec.version, adapter: spec.adapter };
  bundle.planner = {
    provenance: { mode: config.runtime.planner.source === 'manual' ? 'user' : 'mock', adapter: `${config.runtime.planner.source}_activity_plan`, version: '1', synthetic: true },
    async plan(context) {
      await hooks.onPlan?.(context);
      return { tasks: structuredClone(config.activities.filter(t => t.user_id === context.user_id && t.virtual_date === context.virtual_date).sort((a, b) => a.virtual_start.localeCompare(b.virtual_start))), basis: `${config.runtime.planner.source} supplied activities; offline execution only` };
    },
    async adjust(context) { await hooks.onAdjust?.(context); return { kind: 'continue', reason: 'Keep supplied plan; do not invent activities or relax conditions' }; },
  };
  bundle.executor = createOfflineExecutor(config, hooks);
  bundle.executor.provenance = { mode: 'offline_fixture', adapter: 'recorded_observations', version: '1', synthetic: true, framework, native_loop_executed: false, source_fingerprint: fingerprint(sources) };
  bundle.executor.snapshot = (task, planId) => {
    ensure(config.activities.some(t => t.activity_id === task.activity_id && canonical(t) === canonical(task)), 'Activity differs from supplied frozen plan');
    const value = { revision: 1, task, plan_id: planId, runtime: config.runtime, app: config.apps.find(a => a.app_id === task.app_id), framework, sources, model: { source: 'fixed_fixture', real_requests: 0 }, tool: { source: 'injected_fixture', real_device_commands: 0 } };
    return { ...structuredClone(value), fingerprint: fingerprint(value) };
  };
  return bundle;
}
