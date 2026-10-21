/** Runtime contracts, deliberately independent of adapters and persistence. */
export const SCHEMA_VERSION = 2;
export const TERMINAL = ['completed', 'partial', 'blocked'];
export const now = () => new Date().toISOString();
export const json = value => JSON.stringify(value);
export const parse = value => value == null ? null : JSON.parse(value);
export function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
export function safeId(value, label = 'id') {
  ensure(typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value), `Invalid ${label}`);
  return value;
}
export function validDate(value) {
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value, `Invalid virtual date: ${value}`);
}
export function dates(config) {
  const result = [];
  for (let date = config.virtual_start_date; date <= config.virtual_end_date;) {
    result.push(date);
    date = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }
  return result;
}
export function normalizeConfig(input) {
  const config = structuredClone(input);
  safeId(config.run_id, 'run_id');
  ensure(config.mode === 'mock', 'Phase A CLI accepts mode=mock only; real integrations are not implemented.');
  validDate(config.virtual_start_date);
  validDate(config.virtual_end_date);
  ensure(config.virtual_start_date <= config.virtual_end_date, 'Invalid virtual date range');
  new Intl.DateTimeFormat('en', { timeZone: config.virtual_timezone });
  ensure(Array.isArray(config.users) && config.users.length > 0, 'users required');
  ensure(new Set(config.users.map(u => safeId(u.user_id, 'user_id'))).size === config.users.length, 'Duplicate user_id');
  ensure(config.users.every(u => u.requirements != null), 'Each user needs original requirements');
  ensure(Array.isArray(config.apps) && config.apps.length > 0, 'apps required');
  ensure(new Set(config.apps.map(a => safeId(a.app_id, 'app_id'))).size === config.apps.length, 'Duplicate app_id');
  ensure(config.apps.every(a => Array.isArray(a.capabilities)), 'Each app needs capabilities');
  config.settings = { recent_activity_limit: 5, description_max_attempts: 3, ...config.settings };
  for (const key of ['recent_activity_limit', 'description_max_attempts']) {
    ensure(Number.isSafeInteger(config.settings[key]) && config.settings[key] > 0, `Invalid ${key}`);
  }
  config.mock = { partial_first_activity: true, description_fail_once: false, execution_delay_ms: 1, description_delay_ms: 2, ...config.mock };
  for (const key of ['execution_delay_ms', 'description_delay_ms']) {
    ensure(Number.isFinite(config.mock[key]) && config.mock[key] >= 0, `Invalid ${key}`);
  }
  return config;
}
export function validateTask(task, context) {
  safeId(task.activity_id, 'activity_id');
  ensure(task.user_id === context.user_id, 'Task user isolation violation');
  ensure(task.virtual_date === context.virtual_date, 'Task virtual date mismatch');
  ensure(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(task.virtual_start), 'virtual_start must be local YYYY-MM-DDTHH:mm');
  ensure(task.virtual_start.slice(0, 10) === context.virtual_date, 'Task time/date mismatch');
  ensure(task.virtual_start.slice(11, 13) <= '23' && task.virtual_start.slice(14) <= '59', 'Invalid virtual clock time');
  ensure(context.apps.some(a => a.app_id === task.app_id), 'Task app outside supplied capability list');
  ensure(typeof task.goal === 'string' && task.goal.length > 0, 'Task goal required');
  ensure(Number.isSafeInteger(task.workload?.object_count) && task.workload.object_count > 0, 'Task needs positive object_count');
  ensure(typeof task.end_condition === 'string' && task.end_condition.length > 0, 'Task end_condition required');
}
export function validateTasks(tasks, context) {
  ensure(Array.isArray(tasks), 'Planner must return tasks array (empty is allowed)');
  tasks.forEach(task => validateTask(task, context));
  ensure(new Set(tasks.map(t => t.activity_id)).size === tasks.length, 'Duplicate activity_id in plan');
  ensure(tasks.every((t, i) => i === 0 || tasks[i - 1].virtual_start <= t.virtual_start), 'Planner tasks must be in virtual-time order');
}
export function validateResult(result, task) {
  ensure(TERMINAL.includes(result.status), 'Invalid result status');
  ensure(Number.isSafeInteger(result.completed_count) && result.completed_count >= 0, 'Invalid actual count');
  ensure(typeof result.summary === 'string' && typeof result.end_reason === 'string', 'Result summary and end_reason required');
  ensure(typeof result.real_started_at === 'string' && typeof result.real_finished_at === 'string', 'Actual timestamps required');
  ensure(Date.parse(result.real_started_at) <= Date.parse(result.real_finished_at), 'Invalid actual timestamp order');
  if (result.status === 'completed') ensure(result.completed_count >= task.workload.object_count, 'Completed result below target');
}
/**
 * Adapter bundle (all methods may be async):
 * personas.generate({user_id, requirements}) -> fixed persona
 * planner.plan(context) -> {tasks, basis}; planner.adjust(context) -> decision
 * executor.execute({task, persona, attempt_id, previous_steps, recorder}) -> actual result
 * executor.recover(sameContext) -> {kind:'resume'|'needs_attention', reason}
 * describer.describe({screenshot, bytes, attempt_number, task}) ->
 *   {raw_text, model, prompt_version}
 *
 * recorder.beginStep(intent) must precede external action; capture stores EVERY
 * observation with explicit phase; finishStep records actual outcome. Recovery
 * belongs to the executor, NEVER to a generic automatic action-replay loop.
 */
export function assertAdapters(bundle, mode) {
  for (const [name, methods] of Object.entries({ personas: ['generate'], planner: ['plan', 'adjust'], executor: ['execute', 'recover'], describer: ['describe'] })) {
    const adapter = bundle[name];
    ensure(adapter?.provenance?.mode === mode && typeof adapter.provenance.adapter === 'string', `${name} provenance mismatch`);
    methods.forEach(method => ensure(typeof adapter[method] === 'function', `${name}.${method} missing`));
  }
}
