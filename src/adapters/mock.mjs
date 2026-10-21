import { setTimeout as delay } from 'node:timers/promises';
import { now } from '../contracts.mjs';
import { mockPersona, mockDailyPlan } from './daily-content.mjs';

const provenance = name => ({ mode: 'mock', adapter: `mock_${name}`, version: '2', synthetic: true });
const escapeXml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function screen(task, index, phase) {
  if (task.mock_content) return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="700"><rect width="480" height="700" fill="#f4f6fa"/><rect width="480" height="90" fill="#233c66"/><g font-family="Microsoft YaHei,sans-serif"><text x="28" y="42" fill="white" font-size="22">${escapeXml(task.app_name)}</text><text x="28" y="68" fill="#bbcae2" font-size="12">MOCK SCREEN · 非真实 APP 截图</text><rect x="22" y="115" width="436" height="45" rx="10" fill="white"/><text x="40" y="144" fill="#6e7b90" font-size="16">${escapeXml(task.collection_topic)}</text><rect x="22" y="181" width="436" height="312" rx="12" fill="white"/><rect x="40" y="201" width="400" height="148" rx="7" fill="#e5ecf8"/><circle cx="240" cy="273" r="37" fill="#c5d5ee"/><text x="40" y="385" fill="#243e64" font-size="18">合成内容对象 ${index + 1}</text><text x="40" y="420" fill="#78879c" font-size="14">${escapeXml(task.collection_topic)} · ${escapeXml(task.user_id)}</text><text x="40" y="455" fill="#8798ac" font-size="12">本内容仅验证采集与描述调用链路</text><text x="25" y="548" fill="#687e9c" font-size="14">虚拟活动：${escapeXml(task.virtual_start)}</text><text x="25" y="580" fill="#687e9c" font-size="14">观察阶段：${phase} · 对象 ${index + 1}</text><rect x="22" y="622" width="436" height="43" rx="6" fill="#fff1d8"/><text x="40" y="650" fill="#a4772c" font-size="13">MOCK · 没有操作真实手机或访问真实内容</text></g></svg>`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#172033"/><g fill="white" font-family="sans-serif" font-size="18"><text x="24" y="45">MOCK / SYNTHETIC SCREEN</text><text x="24" y="90">${escapeXml(task.user_id)}</text><text x="24" y="135">${escapeXml(task.app_id)}</text><text x="24" y="180">Object ${index + 1} / ${phase}</text><text x="24" y="235">Not a real phone screenshot</text></g></svg>`);
}

/** Deterministic engineering fixtures, NOT an autonomous behavior model or phone agent. */
export function createMockAdapters(config, hooks = {}) {
  return {
    personas: {
      provenance: provenance('personas'),
      async generate(context) {
        return mockPersona(context);
      },
    },
    planner: {
      provenance: provenance('planner'),
      async plan(context) {
        await hooks.onPlan?.(context);
        if (config.mock.scenario === 'daily_apps_v1') return mockDailyPlan(context);
        const task = (suffix, time, count) => ({
          activity_id: `${context.user_id}_${context.virtual_date}_${suffix}`,
          user_id: context.user_id, virtual_date: context.virtual_date,
          virtual_start: `${context.virtual_date}T${time}`, app_id: context.apps[0].app_id,
          goal: `MOCK browse synthetic objects (${suffix})`, workload: { object_count: count },
          end_condition: `Stop after ${count} synthetic objects or fixture obstruction`,
          constraints: { synthetic_only: true },
        });
        return { tasks: [task('first', '09:00', 3), task('second', '14:00', 2)], basis: 'MOCK deterministic fixture; not a claim of behavioral naturalness' };
      },
      async adjust(context) {
        await hooks.onAdjust?.(context);
        if (context.latest_result.status === 'partial' && context.remaining_tasks.length > 0) {
          return {
            kind: 'replace_remaining', reason: 'MOCK fixture: reduce the remaining collection target after partial completion',
            remaining_tasks: context.remaining_tasks.map(t => ({ ...t, activity_id: `${t.activity_id}_revised`, workload: { object_count: 1 }, end_condition: 'Stop after 1 synthetic object or fixture obstruction' })),
          };
        }
        return { kind: 'continue', reason: 'MOCK fixture: keep saved daily plan' };
      },
    },
    executor: {
      provenance: provenance('executor'),
      async recover(context) {
        await hooks.onRecover?.(context);
        // Only this synthetic executor is intrinsically idempotent. A real executor
        // must observe the current page and assess uncertain action outcomes.
        return { kind: 'resume', reason: 'MOCK fixture has no external side effects; continue from durable step journal' };
      },
      async execute(context) {
        const { task, recorder } = context;
        const partial = config.mock.partial_first_activity && task.activity_id.endsWith('_first');
        const count = partial ? Math.min(2, task.workload.object_count) : task.workload.object_count;
        for (let index = 0; index < count; index++) {
          if (context.previous_steps.some(s => s.step_index === index && s.status === 'completed')) continue;
          const stepId = recorder.beginStep({ step_index: index, app_id: task.app_id, action: { type: 'mock_browse', object_id: `${task.activity_id}_object_${index + 1}`, ...(task.mock_content ? { app_name: task.app_name, target: task.collection_topic, page_decision: 'Mock 页面理解与对象选择', phone_instruction: { type: 'mock_open_object', index: index + 1 } } : {}) } });
          for (const [captureIndex, phase] of ['before', 'after'].entries()) {
            await recorder.capture(stepId, {
              capture_index: captureIndex, phase, bytes: screen(task, index, phase), media_type: 'image/svg+xml', captured_at: now(),
              metadata: { synthetic: true, object_id: `${task.activity_id}_object_${index + 1}`, fail_once: Boolean(config.mock.description_fail_once && context.is_first_activity && index === 0 && phase === 'after') },
            });
          }
          await hooks.afterCapture?.({ ...context, step_id: stepId, step_index: index });
          await delay(config.mock.execution_delay_ms);
          recorder.finishStep(stepId, { status: 'mock_observed', object_id: `${task.activity_id}_object_${index + 1}`, synthetic: true });
          await hooks.afterStep?.({ ...context, step_id: stepId, step_index: index });
        }
        return {
          status: partial && count < task.workload.object_count ? 'partial' : 'completed',
          completed_count: count,
          summary: `MOCK actually generated ${count} synthetic objects; target ${task.workload.object_count}`,
          end_reason: partial ? 'mock_fixture_partial_completion' : 'mock_fixture_target_reached',
          failure: null, real_started_at: context.real_started_at, real_finished_at: now(),
        };
      },
    },
    describer: {
      provenance: provenance('describer'),
      async describe(context) {
        await hooks.onDescribe?.(context);
        await delay(config.mock.description_delay_ms);
        if (context.screenshot.metadata.fail_once && context.attempt_number === 1) throw new Error('MOCK injected first description failure');
        return {
          raw_text: context.task.mock_content ? `【Mock 转文字】虚拟时间 ${context.task.virtual_start}，用户 ${context.task.user_id} 在 ${context.task.app_name} 的模拟活动中关注「${context.task.collection_topic}」。本图为对象 ${context.screenshot.metadata.object_id.split('_').at(-1)} 的${context.screenshot.phase === 'before' ? '动作前' : '动作后'}观察。本条来自合成截图描述，未调用 VLM，不表示真实浏览事实。` : `MOCK description: ${context.screenshot.user_id}, ${context.screenshot.metadata.object_id}, ${context.screenshot.phase}. Synthetic fixture; no VLM called.`,
          model: 'mock-template-no-model', prompt_version: context.task.mock_content ? 'mock-daily-v1' : 'mock-v1',
        };
      },
    },
  };
}
