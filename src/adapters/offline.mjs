import { ensure, now } from '../contracts.mjs';
import { completionTarget, completionUnit } from '../runtime-config.mjs';
import { runRegisteredFramework } from '../framework-runtime.mjs';
import { acquireDeviceLease } from '../device-lease.mjs';
import path from 'node:path';

const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const screen = event => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="#edf3fc"/><text x="20" y="35" font-size="20">OFFLINE FIXTURE · SYNTHETIC</text><foreignObject x="20" y="65" width="440" height="550"><div xmlns="http://www.w3.org/1999/xhtml" style="font:16px sans-serif;white-space:pre-wrap;overflow-wrap:anywhere">${xml(JSON.stringify(event, null, 2))}</div></foreignObject></svg>`);
function condition(c, fields) {
  if (!Object.hasOwn(fields, c.field) || fields[c.field] == null) return 'unknown';
  const value = fields[c.field];
  const pass = c.op === 'eq' ? value === c.value : c.op === 'lte' ? typeof value === 'number' && value <= c.value : c.op === 'gte' ? typeof value === 'number' && value >= c.value : typeof value === 'string' && value.includes(String(c.value));
  return pass ? 'pass' : 'fail';
}
function verify(task, observation, data, evidence) {
  const rule = task.completion;
  const fields = observation.fields ?? {};
  const checks = rule.conditions.map(c => ({ ...c, result: condition(c, fields), evidence }));
  if (rule.kind === 'conditions') {
    data.conditions = data.conditions.map((prior, i) => checks[i].result === 'pass' ? checks[i] : prior);
    data.completed_count = data.conditions.filter(c => c.result === 'pass').length;
    data.observations.push({ evidence, page: observation.page, checks });
    return;
  }
  const identity = observation.identity ?? {};
  if (observation.page !== 'detail' && Object.keys(identity).length === 0) {
    data.observations.push({ evidence, page: observation.page, checks }); return;
  }
  const known = rule.identity_fields.every(f => Object.hasOwn(identity, f) && ['string', 'number'].includes(typeof identity[f]) && String(identity[f]).length > 0);
  const key = known ? JSON.stringify([task.app_id, ...rule.identity_fields.map(f => identity[f])]) : null;
  const prior = key && data.objects.find(o => o.identity_key === key && o.status === 'verified');
  const status = prior ? 'duplicate' : observation.page !== 'detail' || !known || checks.some(c => c.result === 'unknown') ? 'unverified' : checks.some(c => c.result === 'fail') ? 'rejected' : 'verified';
  data.objects.push({ identity_key: key, identity, fields, checks, status, evidence, duplicate_of: prior?.evidence ?? null });
  data.completed_count = new Set(data.objects.filter(o => o.status === 'verified').map(o => o.identity_key)).size;
}
const fresh = (task, clock) => ({ cursor: 0, completed_count: 0, objects: [], observations: [], conditions: (task.completion?.conditions ?? []).map(c => ({ ...c, result: 'unknown' })), pending: null, recovery_rounds: 0, model_turns: 0, actions: 0, physical_inputs: 0, no_progress: 0, started_ms: clock(), reviews: [] });

/** Recorded inputs exercise the MAIN scheduler, not a native framework loop. */
export function createOfflineExecutor(config, hooks = {}) {
  const limits = config.runtime.limits, clock = hooks.clock ?? Date.now;
  const load = context => context.recorder.work();
  const save = (context, work, data, event, phase = 'executing') => context.recorder.checkpoint({ revision: work.revision, phase, data }, { source: 'offline_fixture', ...event });
  const result = (context, data, reason) => ({ status: data.completed_count >= completionTarget(context.task) ? 'completed' : data.completed_count > 0 ? 'partial' : 'blocked', completed_count: data.completed_count, workload_unit: completionUnit(context.task), summary: `OFFLINE FIXTURE: verified ${data.completed_count} ${completionUnit(context.task)}; not a real GUI result`, end_reason: reason, real_started_at: context.real_started_at, real_finished_at: now(), evidence: { objects: data.objects, conditions: data.conditions }, usage: { source: 'fixture', model_turns: data.model_turns, real_requests: 0, real_device_commands: 0 }, failure: null });
  async function capture(context, work, observation, stepIndex, action = { type: 'fixture_observe' }, recovery = false) {
    const step = context.recorder.beginStep({ step_index: stepIndex, app_id: context.task.app_id, action });
    const evidence = await context.recorder.capture(step, { capture_index: 0, phase: 'observation', media_type: 'image/svg+xml', bytes: screen(observation), metadata: { synthetic: true, source: 'offline_fixture', page: observation.page, object_id: String(observation.identity?.product_id ?? 'unverified') } });
    const data = structuredClone(work.data), before = data.completed_count;
    if (observation.raw_response != null) data.model_turns++;
    verify(context.task, observation, data, evidence);
    if (!recovery) { data.cursor++; data.no_progress = data.completed_count > before ? 0 : data.no_progress + 1; }
    context.recorder.finishStep(step, { status: 'fixture_observed', evidence, raw_response: observation.raw_response ?? null }, { work: { revision: work.revision, phase: recovery ? 'recovering' : 'executing', data }, event: { type: 'observation', source: 'offline_fixture', evidence, raw_response: observation.raw_response ?? null } });
    return load(context);
  }
  async function recover(context) {
    await hooks.onRecover?.(context);
    let work = load(context);
    if (!work.data) return { kind: 'needs_attention', reason: 'No durable offline checkpoint' };
    try { await context.recorder.validateEvidence(); }
    catch (error) {
      save(context, work, work.data, { type: 'recovery_evidence_invalid', error: error.message }, 'needs_attention');
      return { kind: 'needs_attention', reason: 'Saved evidence is missing or corrupt' };
    }
    if (context.recorder.steps().some(s => s.status !== 'completed' && s.id !== work.data.pending?.step_id)) {
      save(context, work, work.data, { type: 'recovery_unresolved_step' }, 'needs_attention');
      return { kind: 'needs_attention', reason: 'Unresolved step outside the saved action checkpoint' };
    }
    if (!work.data.pending) return { kind: 'resume', reason: 'Durable fixture cursor contains no unresolved action' };
    if (work.data.recovery_started_ms == null) work = save(context, work, { ...work.data, recovery_started_ms: clock() }, { type: 'recovery_started' }, 'recovering');
    const started = work.data.recovery_started_ms;
    while (work.data.recovery_rounds < limits.max_recovery_rounds && work.data.model_turns < limits.max_model_turns && clock() - started < limits.max_recovery_seconds * 1000 && clock() - work.data.started_ms < limits.max_seconds * 1000) {
      const observation = context.task.fixture?.recovery?.[work.data.recovery_rounds];
      if (!observation) break;
      const data = structuredClone(work.data); data.recovery_rounds++;
      work = save(context, work, data, { type: 'recovery_observe', round: data.recovery_rounds }, 'recovering');
      const pending = work.data.pending;
      const index = context.recorder.steps().length;
      work = await capture(context, work, observation, index, { type: 'fixture_recovery_observe' }, true);
      if (observation.resolution?.action_index === pending.cursor && ['occurred', 'not_occurred'].includes(observation.resolution.effect)) {
        const next = structuredClone(work.data); next.pending = null; next.cursor = pending.cursor + 1;
        context.recorder.finishStep(pending.step_id, { status: 'effect_resolved', effect: observation.resolution.effect, source: 'fixed_recovery_observation' }, { work: { revision: work.revision, phase: 'executing', data: next }, event: { type: 'action_effect_resolved', action_index: pending.cursor, effect: observation.resolution.effect } });
        return { kind: 'resume', reason: 'Fixed observation resolved fixture effect; original action is not replayed' };
      }
    }
    work = save(context, work, work.data, { type: 'recovery_exhausted' }, 'needs_attention');
    return { kind: 'needs_attention', reason: 'Bounded fixture recovery could not resolve the action', progress: work.data };
  }
  return {
    acquire({ directory }) { return acquireDeviceLease(path.join(path.dirname(directory), '.offline-fixture-device.lock'), 'offline:' + config.run_id); },
    async recover(context) { return recover(context); },
    async execute(context) {
      return runRegisteredFramework(config.runtime.executor.framework_id, context, { source: 'offline_fixture', loadAdapter: async spec => {
        await hooks.onFrameworkDispatch?.(spec);
        return { run: runFixture };
      } });
    },
  };
  async function runFixture(context) {
      ensure(context.task.completion, 'Offline completion rule required');
      ensure(Array.isArray(context.task.fixture?.events), 'Explicit offline fixture events required; no default activity script');
      let work = load(context);
      if (!work.data) work = save(context, work, fresh(context.task, clock), { type: 'execution_start', framework_id: config.runtime.executor.framework_id });
      if (work.data.pending) {
        const recovery = await recover(context);
        if (recovery.kind !== 'resume') return { kind: 'needs_attention', reason: recovery.reason, progress: recovery.progress };
        work = load(context);
      }
      const events = context.task.fixture.events;
      if (work.data.operator_end_requested) return result(context, work.data, 'operator_ended');
      while (work.data.cursor < events.length) {
        const data = structuredClone(work.data);
        if (data.completed_count >= completionTarget(context.task)) return result(context, data, 'target_reached');
        if (data.no_progress >= limits.max_no_progress || data.model_turns >= limits.max_model_turns || data.actions >= limits.max_actions || data.physical_inputs >= limits.max_physical_inputs || clock() - data.started_ms >= limits.max_seconds * 1000) return result(context, data, 'offline_limit_reached');
        const event = events[data.cursor], index = context.recorder.steps().length;
        ensure(event && ['observe', 'action', 'model_error', 'tool_rejected'].includes(event.type), 'Unknown fixture event');
        if (event.type === 'observe') { work = await capture(context, work, event, index); await hooks.afterOfflineObservation?.({ context, work }); continue; }
        if (event.type === 'model_error') {
          data.model_turns++;
          save(context, work, data, { type: 'model_error', raw_response: event.raw_response ?? null, error: event.error ?? 'fixed model error' });
          return result(context, data, 'fixture_model_error');
        }
        const step = context.recorder.beginStep({ step_index: index, app_id: context.task.app_id, action: { type: 'fixture_action', name: event.name ?? 'rejected', raw_response: event.raw_response ?? null, parameters: event.parameters ?? {} } });
        data.pending = { cursor: data.cursor, step_id: step, name: event.name }; data.model_turns++; data.actions++;
        work = save(context, work, data, { type: 'action_intent', cursor: data.cursor, step_id: step, raw_response: event.raw_response ?? null });
        await hooks.afterOfflineIntent?.({ context, work });
        if (event.type !== 'tool_rejected') {
          data.physical_inputs++;
          work = save(context, work, data, { type: 'dispatch_started', step_id: step });
          try { await hooks.offlineTool?.({ task: context.task, event, step_id: step }); }
          catch (error) {
            if (error.interrupted) throw error;
            work = save(context, work, data, { type: 'action_unknown', step_id: step, error: error.message }, 'recovering');
            const recovery = await recover(context);
            if (recovery.kind !== 'resume') return { kind: 'needs_attention', reason: recovery.reason, progress: recovery.progress };
            work = load(context); continue;
          }
          await hooks.afterOfflineDispatch?.({ context, work });
          if (event.effect === 'unknown') {
            work = save(context, work, data, { type: 'action_unknown', step_id: step }, 'recovering');
            const recovery = await recover(context);
            if (recovery.kind !== 'resume') return { kind: 'needs_attention', reason: recovery.reason, progress: recovery.progress };
            work = load(context); continue;
          }
        }
        data.pending = null; data.cursor++;
        context.recorder.finishStep(step, { status: event.type === 'tool_rejected' ? 'rejected_before_dispatch' : 'fixture_returned' }, { work: { revision: work.revision, phase: 'executing', data }, event: { type: event.type === 'tool_rejected' ? 'action_rejected' : 'action_return', step_id: step } });
        work = load(context);
      }
      return result(context, work.data, 'fixture_exhausted');
  }
}
