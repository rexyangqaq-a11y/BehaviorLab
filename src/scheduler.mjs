import { assertAdapters, dates, ensure, normalizeConfig } from './contracts.mjs';
import { backgroundDescriptions } from './descriptions.mjs';
import { traced } from './tracing.mjs';

export async function initialize(store, input, adapters) {
  const config = normalizeConfig(input);
  assertAdapters(adapters, config.mode);
  const personas = [];
  for (const user of config.users) {
    const persona = user.persona_snapshot
      ? await traced(store, { module: 'users', operation: 'persona.snapshot', mode: 'system', user_id: user.user_id, input: { source_user_id: user.source_user_id ?? user.user_id, generation_call_id: user.persona_provenance?.call_id ?? null } }, async () => structuredClone(user.persona_snapshot))
      : await traced(store, { module: 'users', operation: 'persona.generate', ...adapters.personas.provenance, user_id: user.user_id, input: user }, () => adapters.personas.generate(structuredClone(user)));
    personas.push(persona);
  }
  store.initialize(config, personas, Object.fromEntries(Object.entries(adapters).map(([key, value]) => [key, value.provenance])));
}
function planningContext(store, user, date) {
  const config = store.config();
  return { user_id: user.user_id, persona: user.persona, virtual_date: date, virtual_timezone: config.virtual_timezone,
    apps: config.apps, generation_requirements: config.external_requirements ?? '', recent_actual: store.recentResults(user.user_id, config.settings.recent_activity_limit), plan: store.latestPlan(user.user_id, date) };
}
const childCall = (root, extra) => ({ trace_id: root.trace_id, parent_id: root.id, ...extra });
async function prepareDay(store, user, date, planner, root) {
  const existing = store.latestPlan(user.user_id, date);
  if (existing) return existing;
  store.setDay(user.user_id, date, 'planning'); store.setClock(user.user_id, date, `${date}T00:00`, 'planning');
  const context = planningContext(store, user, date);
  await traced(store, childCall(root, { module: 'upper_planner', operation: 'daily.plan', ...planner.provenance, user_id: user.user_id, virtual_date: date, input: context }), async call => {
    const output = await planner.plan(structuredClone(context));
    store.saveInitialPlan(user.user_id, date, output, context, { ...planner.provenance, call_id: call.id });
    return output;
  });
  store.setDay(user.user_id, date, 'planned'); store.setClock(user.user_id, date, `${date}T00:00`, 'planned');
  return store.latestPlan(user.user_id, date);
}
function dayEnded(store, plan) { return plan && !store.missingFeedback(plan) && !plan.tasks.some(t => ['pending', 'executing', 'needs_attention'].includes(store.activity(t.activity_id).status)); }
function completeDay(store, user, date) {
  store.tx(() => {
    store.setDay(user.user_id, date, 'complete');
    const phase = date === store.config().virtual_end_date ? 'finished' : 'day_complete';
    const prior = store.get('SELECT virtual_time FROM virtual_clocks WHERE user_id=?', user.user_id);
    if (!prior || prior.virtual_time <= `${date}T23:59`) store.setClock(user.user_id, date, `${date}T23:59`, phase);
  });
}
async function executeActivity(store, user, task, executor, hooks, root) {
  store.setDay(user.user_id, task.virtual_date, 'running'); store.setClock(user.user_id, task.virtual_date, task.virtual_start, 'executing');
  await traced(store, childCall(root, { module: 'lower_executor', operation: 'activity.execute', ...executor.provenance, user_id: user.user_id, activity_id: task.activity_id, virtual_date: task.virtual_date, input: { task, persona: user.persona } }), async call => {
    const provenance = { ...executor.provenance, call_id: call.id, trace_id: call.trace_id };
    const attempt = store.beginAttempt(task, provenance);
    const recorder = {
      beginStep: intent => store.beginStep(task, attempt.id, intent),
      capture: (stepId, capture) => traced(store, childCall(call, { module: 'records', operation: 'screenshot.persist', mode: 'system', user_id: task.user_id, activity_id: task.activity_id, virtual_date: task.virtual_date, input: { step_id: stepId, phase: capture.phase, capture_index: capture.capture_index, source_mode: executor.provenance.mode } }), () => store.capture(task, attempt.id, stepId, capture, provenance)),
      finishStep: (stepId, outcome) => store.finishStep(task, stepId, outcome),
    };
    const context = { task: structuredClone(task), persona: structuredClone(user.persona), attempt_id: attempt.id,
      real_started_at: attempt.started_at, previous_steps: store.steps(attempt.id), recorder,
      is_first_activity: store.get('SELECT id FROM activities WHERE user_id=? ORDER BY virtual_start,ordinal LIMIT 1', user.user_id)?.id === task.activity_id };
    if (attempt.recovering) {
      const recovery = await traced(store, childCall(call, { module: 'lower_executor', operation: 'activity.recover', ...executor.provenance, user_id: user.user_id, activity_id: task.activity_id, input: { previous_steps: context.previous_steps } }), () => executor.recover(context));
      if (recovery?.kind !== 'resume') {
        const reason = recovery?.reason ?? 'Executor did not authorize safe resume'; store.markNeedsAttention(task, reason);
        throw new Error(`Activity ${task.activity_id} needs attention: ${reason}`);
      }
      store.audit('execution_recovery_authorized', task.user_id, task.activity_id, { recovery, provenance });
    }
    const result = await executor.execute(context);
    store.saveResult(task, attempt.id, result, provenance); store.setClock(task.user_id, task.virtual_date, task.virtual_start, 'awaiting_feedback');
    await hooks.afterResult?.({ task, result });
    return result;
  });
}
async function executeAll(store, adapters, hooks, root, { maxActivities, maxUserDays }) {
  let executed = 0; let completedDays = 0;
  const yielded = reason => ({ reason, executed_activities: executed, completed_user_days: completedDays, paused: reason === 'pause_requested' });
  for (const user of store.users()) for (const date of dates(store.config())) {
    if (store.get('SELECT status FROM schedule_days WHERE user_id=? AND virtual_date=?', user.user_id, date)?.status === 'complete') continue;
    let plan = store.latestPlan(user.user_id, date);
    if (dayEnded(store, plan)) { completeDay(store, user, date); continue; }
    if (store.pauseRequested()) return yielded('pause_requested');
    if (executed >= maxActivities || completedDays >= maxUserDays) return yielded('budget_reached');
    await prepareDay(store, user, date, adapters.planner, root);
    for (;;) {
      plan = store.latestPlan(user.user_id, date);
      const feedback = store.missingFeedback(plan);
      if (feedback) {
        const context = { ...planningContext(store, user, date), activity: feedback, latest_result: store.result(feedback.activity_id), remaining_tasks: store.pendingTasks(plan) };
        await traced(store, childCall(root, { module: 'upper_planner', operation: 'activity.adjust', ...adapters.planner.provenance, user_id: user.user_id, activity_id: feedback.activity_id, virtual_date: date, input: context }), async call => {
          const decision = await adapters.planner.adjust(structuredClone(context)); store.saveDecision(feedback, decision, context, { ...adapters.planner.provenance, call_id: call.id });
          store.setClock(user.user_id, date, feedback.virtual_start, 'ready');
          await hooks.afterDecision?.({ task: feedback, decision }); return decision;
        });
        continue;
      }
      const next = plan.tasks.find(t => ['pending', 'executing', 'needs_attention'].includes(store.activity(t.activity_id).status));
      if (!next) { completeDay(store, user, date); completedDays++; break; }
      if (store.pauseRequested()) return yielded('pause_requested');
      if (executed >= maxActivities || completedDays >= maxUserDays) return yielded('budget_reached');
      ensure(store.activity(next.activity_id).status !== 'needs_attention', `Activity ${next.activity_id} awaits operator/executor recovery policy; no action replay performed`);
      await executeActivity(store, user, next, adapters.executor, hooks, root); executed++;
    }
  }
  return yielded('interval_complete');
}
export async function prepareNextDay(store, adapters) {
  assertAdapters(adapters, store.config().mode);
  const release = store.acquireLease('execution');
  try {
    store.recoverCalls();
    return await traced(store, { module: 'runtime', operation: 'schedule.prepare_day', mode: 'system', input: {} }, async root => {
      for (const user of store.users()) for (const date of dates(store.config())) {
        let plan = store.latestPlan(user.user_id, date);
        if (dayEnded(store, plan)) { completeDay(store, user, date); continue; }
        plan = await prepareDay(store, user, date, adapters.planner, root);
        return { user_id: user.user_id, virtual_date: date, plan, execution_started: false };
      }
      return { interval_complete: true };
    });
  } finally { release(); }
}
export async function runSimulation(store, adapters, { describe = true, maxActivities = Infinity, maxUserDays = Infinity, ...hooks } = {}) {
  assertAdapters(adapters, store.config().mode);
  ensure(maxActivities > 0 && maxUserDays > 0, 'Advance budgets must be positive');
  const release = store.acquireLease('execution');
  let advancement;
  try {
    store.recoverCalls(); store.requestPause(false);
    advancement = await traced(store, { module: 'runtime', operation: 'schedule.advance', mode: 'system', input: { describe, max_activities: Number.isFinite(maxActivities) ? maxActivities : null, max_user_days: Number.isFinite(maxUserDays) ? maxUserDays : null } }, async root => {
      let done = false;
      const worker = describe ? backgroundDescriptions(store, adapters.describer, () => done, { ...hooks, traceParent: root }) : Promise.resolve();
      const execution = (async () => { try { return await executeAll(store, adapters, hooks, root, { maxActivities, maxUserDays }); } finally { done = true; } })();
      const results = await Promise.allSettled([execution, worker]);
      const failure = results.find(r => r.status === 'rejected'); if (failure) throw failure.reason;
      return results[0].value;
    });
  } finally { release(); }
  if (advancement.reason === 'interval_complete') store.requestPause(false);
  return { ...store.status(), advancement };
}
