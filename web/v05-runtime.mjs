const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const pretty = value => esc(JSON.stringify(value, null, 2));
const labels = { pending: '待执行', executing: '执行中', recovering: '自动恢复中', partial: '部分完成', completed: '已完成', blocked: '受阻', needs_attention: '待处理', verified: '已核实', duplicate: '重复，不计数', rejected: '不符合条件', unverified: '待核实，不计数', pass: '满足', fail: '不满足', unknown: '未知' };
const drafts = new Map();
const creation = { framework: 'midscene', scenario: 'product_partial' };
try {
  const saved = JSON.parse(localStorage.getItem('behaviorlab_v05_offline_selection') ?? 'null');
  if (['midscene', 'mobiagent', 'autoglm'].includes(saved?.framework)) creation.framework = saved.framework;
  if (['product_partial', 'automatic_recovery', 'needs_attention', 'non_product'].includes(saved?.scenario)) creation.scenario = saved.scenario;
} catch { /* Optional browser preference; run snapshots remain authoritative. */ }
const base = run => `/api/runs/${encodeURIComponent(run)}`;
export function offlineCreationPanel() {
  return `<section class="panel"><div class="panel-body"><h3>v0.5 离线工程用例</h3><p>创建独立案例，验证主调度接入、实际量与恢复。使用合成数据，不调用手机或真实模型，不计为GUI成绩。</p><label>框架选择 <select data-v05-create-field="framework">${[['midscene','Midscene'],['mobiagent','MobiAgent'],['autoglm','Open-AutoGLM']].map(([id,name])=>`<option value="${id}" ${creation.framework===id?'selected':''}>${name}</option>`).join('')}</select></label><label>离线场景 <select data-v05-create-field="scenario">${[['product_partial','商品：2目标／1实际／重复与条件'],['automatic_recovery','未知效果经自动观察解决'],['needs_attention','自动核对无法解决，转人工'],['non_product','非商品：核对指定信息']].map(([id,name])=>`<option value="${id}" ${creation.scenario===id?'selected':''}>${name}</option>`).join('')}</select></label><button class="button small" data-v05-create>创建离线案例</button></div></section>`;
}
function reviewControls(run, activity, work, busy) {
  if (!work?.data?.pending || activity.status !== 'needs_attention') return '';
  const draft = drafts.get(run + '/' + activity.id) ?? { verdict: 'unknown', reason: '' };
  return `<div class="notice"><div data-v05-draft="${esc(run + '/' + activity.id)}"><h4>人工兜底：查看证据后标记</h4><label>动作效果 <select id="v05-verdict-${esc(activity.id)}" data-v05-field="verdict">${[['unknown', '仍未知'], ['occurred', '已发生'], ['not_occurred', '未发生']].map(([v, name]) => `<option value="${v}" ${draft.verdict === v ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>判断依据<textarea id="v05-reason-${esc(activity.id)}" data-v05-field="reason" placeholder="填写证据与判断依据；保存标记不会触发动作">${esc(draft.reason)}</textarea></label><div class="actions"><button class="button small" data-v05-review data-v05-activity="${esc(activity.id)}" data-revision="${work.revision}" ${busy ? 'disabled' : ''}>保存复核标记</button><button class="button small" data-v05-resolve="continue" data-v05-activity="${esc(activity.id)}" data-revision="${work.revision}" ${busy ? 'disabled' : ''}>显式继续</button><button class="button small" data-v05-resolve="end" data-v05-activity="${esc(activity.id)}" data-revision="${work.revision}" ${busy ? 'disabled' : ''}>结束本次调试</button></div><p>保存意见后再选择继续或结束。仍未知时结束只停止本次调试，活动保留待处理。</p></div></div>`;
}
function evidenceTable(activity, data) {
  const rows = activity.task.completion?.kind === 'conditions'
    ? (data?.conditions ?? []).map(c => `<tr><td>${esc(c.field)}</td><td>${esc(labels[c.result])}</td><td>${esc(c.value)}</td></tr>`)
    : (data?.objects ?? []).map(o => `<tr><td>${esc(Object.values(o.identity).join(' / ') || '身份未核实')}</td><td>${esc(labels[o.status])}</td><td>${esc(o.checks.map(c => c.field + '：' + labels[c.result]).join('；'))}</td></tr>`);
  return rows.length ? `<table><thead><tr><th>对象／条件</th><th>核验结果</th><th>条件依据</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p>尚无已保存的对象或条件证据。</p>';
}
function stageSummary(snapshot) {
  const completed = snapshot.status.descriptions.filter(d => d.status === 'complete').reduce((n,d)=>n+d.count,0);
  return '<section class="panel"><div class="panel-body"><p>阶段状态：执行结果 ' + snapshot.status.results + ' 项；反馈 ' + snapshot.status.decisions + ' 项；已有图描述 ' + completed + ' / ' + snapshot.status.screenshot_count + '；导出 ' + (snapshot.files?.includes('run.json') ? '已有产物（生成时间见导出文件）' : '尚未生成') + '。</p></div></section>';
}
export function offlineExecutionView(snapshot, busy = false) {
  if (snapshot.config.mode !== 'offline') return '<section class="panel"><div class="panel-body"><h3>单活动调试</h3><p>此任务使用旧Mock。可创建独立v0.5离线案例，原任务不会改写。</p><button class="button small" data-v05-create>创建离线案例</button></div></section>';
  const waiting = snapshot.activities.find(a => ['pending', 'executing', 'needs_attention'].includes(a.status));
  return `${stageSummary(snapshot)}<section class="panel"><div class="panel-body"><h3>单活动调试 · 离线夹具</h3><p>上层：${esc(snapshot.config.runtime.planner.source)}；所选框架：${esc(snapshot.config.runtime.executor.framework_id)}；执行：注入适配器与固定回复；描述：Mock。</p><p><strong>原生框架循环未执行，真实模型请求0、设备命令0。</strong></p><div class="actions"><button class="button small" data-job="plan_next" ${busy ? 'disabled' : ''}>生成／查看当前计划</button><button class="button" data-v05-run ${busy || !waiting || waiting.status === 'needs_attention' ? 'disabled' : ''} data-v05-activity="${esc(waiting?.id)}">执行当前一个活动</button><button class="button small" data-job="retry_descriptions" ${busy ? 'disabled' : ''}>补已有图描述</button><button class="button small" data-job="export" ${busy ? 'disabled' : ''}>导出记录</button></div><p>先生成当前计划，再执行一个活动。活动目标来自配置，固定页面与回复仅用于工程夹具。</p><details><summary>查看活动输入和离线限额</summary><pre class="json">${pretty({ runtime: snapshot.config.runtime, activities: snapshot.config.activities })}</pre></details></div></section>${snapshot.activities.map(activity => {
    const execution = snapshot.executions?.find(e => e.activity_id === activity.id), actual = snapshot.results.find(r => r.activity_id === activity.id)?.result;
    const work = execution?.work, data = work?.data;
    const images = snapshot.events.filter(e => e.activity_id === activity.id);
    const target = activity.task.completion?.kind === 'conditions' ? activity.task.completion.conditions.length : activity.task.workload?.object_count;
    const unit = activity.task.completion?.kind === 'conditions' ? '项条件' : activity.task.completion?.unit === 'product' ? '件商品' : '个对象';
    return `<section class="panel"><div class="panel-body"><h3>${esc(activity.task.goal)}</h3><p><strong>${esc(labels[activity.status] ?? activity.status)} · 已核实 ${esc(actual?.completed_count ?? data?.completed_count ?? 0)} / ${esc(target)} ${unit}</strong> · 自动恢复 ${esc(data?.recovery_rounds ?? 0)} 轮</p><p>${esc(actual?.end_reason ?? (data?.pending ? '动作效果未决，自动核对无法解决后等待人工处理。' : '尚未产生结果'))}</p>${reviewControls(snapshot.id, activity, work, busy)}${evidenceTable(activity, data)}<details><summary>查看 ${images.length} 张合成观察图</summary><div class="screenshot-gallery">${images.map(e => `<a href="${base(snapshot.id)}/screens/${encodeURIComponent(e.screenshot.id)}" target="_blank"><img alt="离线合成观察 ${esc(e.screenshot.phase)}" src="${base(snapshot.id)}/screens/${encodeURIComponent(e.screenshot.id)}"></a>`).join('')}</div></details><details><summary>实际结果与证据原文</summary><pre class="json">${pretty(actual ?? { progress: data, phase: work?.phase })}</pre></details><details><summary>冻结来源、原始回复、恢复与人工历史</summary><pre class="json">${pretty(execution ?? '尚未执行')}</pre></details></div></section>`;
  }).join('')}`;
}
export function setupOfflineRuntime({ api, snapshot, busy, refresh, selectRun, toast, submitting }) {
  const saveDraft = event => {
    if (event.target.dataset?.v05CreateField) {
      creation[event.target.dataset.v05CreateField] = event.target.value;
      try { localStorage.setItem('behaviorlab_v05_offline_selection', JSON.stringify(creation)); } catch { /* optional */ }
    }
    const field = event.target.dataset?.v05Field, form = event.target.closest('[data-v05-draft]');
    if (field && form) drafts.set(form.dataset.v05Draft, { verdict: 'unknown', reason: '', ...drafts.get(form.dataset.v05Draft), [field]: event.target.value });
  };
  document.addEventListener('input', saveDraft); document.addEventListener('change', saveDraft);
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-v05-create],[data-v05-run],[data-v05-review],[data-v05-resolve]');
    if (!button || busy()) return;
    const id = button.dataset.v05Activity;
    const reviewInput = button.hasAttribute('data-v05-review') ? { expected_revision: Number(button.dataset.revision), verdict: document.getElementById('v05-verdict-' + id).value, reason: document.getElementById('v05-reason-' + id).value } : null;
    submitting(true);
    try {
      if (button.hasAttribute('data-v05-create')) {
        const config = await api('/api/v05/template?scenario=' + encodeURIComponent(creation.scenario));
        config.runtime.executor.framework_id = creation.framework;
        config.run_id = 'offline_' + Date.now().toString(36);
        config.mock.execution_delay_ms = 0; config.mock.description_delay_ms = 0;
        const created = await api('/api/runs', { config });
        await selectRun(created.id, 'v05'); toast('已创建独立离线案例；请先生成当前计划');
      } else {
        const root = base(snapshot().id);
        if (button.hasAttribute('data-v05-run')) await api(root + '/jobs', { action: 'next_activity', expected_activity_id: id });
        else if (reviewInput) { await api(`${root}/activities/${id}/review`, reviewInput); toast('复核意见已保存，没有触发动作'); }
        else {
          const result = await api(`${root}/activities/${id}/resolution`, { expected_revision: Number(button.dataset.revision), command: button.dataset.v05Resolve });
          if (button.dataset.v05Resolve === 'continue' && result.phase !== 'needs_attention') await api(root + '/jobs', { action: 'next_activity', expected_activity_id: id });
        }
        await refresh();
      }
    } catch (error) { toast(error.message, true); }
    finally { submitting(false); }
  });
}
