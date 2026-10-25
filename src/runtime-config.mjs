import { frameworkSpec } from './phone-framework-registry.mjs';

const check = (condition, message) => { if (!condition) throw new Error(message); };
export const OFFLINE_LIMITS = Object.freeze({ max_model_turns: 20, max_actions: 40, max_physical_inputs: 80, max_seconds: 120, max_no_progress: 5, max_recovery_rounds: 2, max_recovery_seconds: 15 });
export function normalizeRuntime(input, mode) {
  if (mode === 'mock') { check(input == null, 'Legacy mock mode does not accept a runtime override'); return undefined; }
  check(mode === 'offline', 'mode=mock only or explicit mode=offline; real execution remains paused');
  check(input?.revision === 1, 'runtime.revision=1 required');
  check(input.executor?.source === 'offline_fixture', 'Only offline_fixture execution is enabled; phone/model execution remains paused');
  check(input.executor.fixture_id === 'observations_v1', 'Unknown offline fixture protocol');
  const spec = frameworkSpec(input.executor.framework_id);
  check(['manual', 'mock'].includes(input.planner?.source), 'runtime.planner source must be manual or mock');
  const limits = { ...OFFLINE_LIMITS, ...input.limits };
  for (const [key, value] of Object.entries(limits)) check(Object.hasOwn(OFFLINE_LIMITS, key) && Number.isSafeInteger(value) && value > 0, `Invalid offline limit: ${key}`);
  // Copy only the declared public contract. Unknown fields cannot hide credentials or module paths.
  for (const key of Object.keys(input)) check(['revision', 'executor', 'planner', 'limits'].includes(key), `Unknown runtime field: ${key}`);
  for (const key of Object.keys(input.executor)) check(['source', 'framework_id', 'fixture_id'].includes(key), `Unknown executor field: ${key}`);
  check(Object.keys(input.planner).every(k => k === 'source'), 'Unknown planner field');
  return { revision: 1, executor: { source: 'offline_fixture', framework_id: spec.id, fixture_id: 'observations_v1' }, planner: { source: input.planner.source }, limits };
}
export function expectedAdapterMode(config, role) {
  if (config.mode === 'mock') return 'mock';
  return role === 'executor' ? 'offline_fixture' : role === 'planner' && config.runtime.planner.source === 'manual' ? 'user' : 'mock';
}
export function completionTarget(task) { return task.completion?.kind === 'conditions' ? task.completion.conditions.length : task.workload?.object_count; }
export function completionUnit(task) { return task.completion?.kind === 'conditions' ? 'condition' : task.completion?.unit ?? 'object'; }
