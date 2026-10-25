import { ensure, now } from './contracts.mjs';
import { completionTarget, completionUnit } from './runtime-config.mjs';

function attention(store, activityId, revision) {
  ensure(store.config().mode === 'offline', 'Only offline execution review is enabled');
  const activity = store.activity(activityId), work = store.executionWork(activityId);
  ensure(activity.status === 'needs_attention', 'Activity is not awaiting review');
  ensure(Number.isSafeInteger(revision) && revision === work.revision, 'Execution revision conflict');
  ensure(work.data?.pending, 'No unresolved action to review');
  return { task: activity.task, work };
}
export function reviewExecution(store, activityId, input) {
  const release = store.acquireLease('execution');
  try {
    const { task, work } = attention(store, activityId, input.expected_revision);
    ensure(['occurred', 'not_occurred', 'unknown'].includes(input.verdict), 'Invalid effect verdict');
    ensure(typeof input.reason === 'string' && input.reason.trim().length > 0 && input.reason.length <= 4000, 'Review evidence/reason required (1–4000 characters)');
    const review = { verdict: input.verdict, reason: input.reason.trim(), reviewer: 'user', action_cursor: work.data.pending.cursor, reviewed_at: now() };
    const data = { ...work.data, reviews: [...work.data.reviews, review] };
    return store.saveExecutionWork(task, { revision: work.revision, phase: 'needs_attention', data }, { type: 'user_effect_review', ...review });
  } finally { release(); }
}
export function resolveExecution(store, activityId, input) {
  const release = store.acquireLease('execution');
  try {
    const { task, work } = attention(store, activityId, input.expected_revision);
    ensure(['continue', 'end'].includes(input.command), 'Invalid resolution command');
    const data = structuredClone(work.data), review = data.reviews.at(-1);
    const known = review?.action_cursor === data.pending.cursor && ['occurred', 'not_occurred'].includes(review.verdict);
    if (!known) {
      ensure(input.command === 'end', 'Unresolved effect cannot continue');
      return store.saveExecutionWork(task, { revision: work.revision, phase: 'needs_attention', data }, { type: 'operator_ended_with_unresolved_effect' });
    }
    const pending = data.pending; data.pending = null; data.cursor = pending.cursor + 1;
    data.operator_end_requested = input.command === 'end';
    store.tx(() => {
      store.run("UPDATE activities SET status='executing' WHERE id=?", activityId);
      store.run("UPDATE steps SET status='completed',outcome_json=?,real_finished_at=? WHERE id=? AND activity_id=?", JSON.stringify({ status: 'user_effect_resolved', review }), now(), pending.step_id, activityId);
      store.writeExecutionWork(task, { revision: work.revision, phase: 'executing', data }, { type: 'operator_resolution', command: input.command, review });
    });
    if (input.command === 'end') {
      const attempt = store.get('SELECT * FROM attempts WHERE activity_id=?', activityId);
      const actual = { status: data.completed_count >= completionTarget(task) ? 'completed' : data.completed_count ? 'partial' : 'blocked', completed_count: data.completed_count, workload_unit: completionUnit(task), summary: 'User ended an offline fixture after resolving the effect; prior verified facts retained', end_reason: 'operator_ended', real_started_at: attempt.started_at, real_finished_at: now(), evidence: { objects: data.objects, conditions: data.conditions }, usage: { source: 'fixture', model_turns: data.model_turns, real_requests: 0, real_device_commands: 0 }, failure: null };
      store.saveResult(task, attempt.id, actual, JSON.parse(attempt.provenance_json));
    }
    return store.executionWork(activityId);
  } finally { release(); }
}
