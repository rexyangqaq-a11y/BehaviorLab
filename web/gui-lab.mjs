const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const json = value => esc(JSON.stringify(value, null, 2));
const statusNames = { running: '运行中', stopping: '停止中', stopped: '已停止', interrupted: '进程中断', completed: '夹具完成', partial: '部分完成', blocked: '受阻', failed: '失败', needs_attention: '效果未知 · 需核对' };
const reasonNames = { target_verified: '夹具目标已核对', insufficient_distinct_objects: '不同对象数量不足', step_limit: '达到步数上限', no_progress: '连续无进展', no_results: '搜索无结果', model_error: '模型异常，未发送动作', tool_effect_unknown: '工具超时，不自动重发', user_stopped: '用户停止', time_limit: '达到时间上限', runner_error: '运行异常' };
const eventNames = { created: '保存活动输入', call_start: '调用开始', call_finish: '调用结束', action_intent: '保存动作意图', capture: '保存合成图像', tool_dispatch: '发送 Mock 工具动作', tool_return: 'Mock 工具返回', verified: '夹具对象核对', tool_unknown: '工具效果未知', error: '停止 / 异常', stop_requested: '请求停止', interrupted: '进程中断', resume: '恢复 Mock' };
let api, redraw, toast, catalog, snapshot, selectedRun = '', loading = false, submitting = false, timer, diagnosticsBusy = false, error = '';
let form = { candidate_id: 'midscene', case_id: 'system_read', max_steps: 12, timeout_seconds: 30 };
let comparisonOpen = false, comparisonDimension = '', comparisonFramework = '';
const active = () => ['running', 'stopping'].includes(snapshot?.status);
function setCase(caseId) {
  const c = catalog.cases.find(c => c.id === caseId) ?? catalog.cases[0];
  form = { ...form, case_id: c.id, app: c.app, goal: c.goal, initial_state: c.initial_state, acceptance: c.acceptance };
}
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    catalog = await api('/api/gui-lab');
    if (!form.goal) setCase(form.case_id);
    const running = catalog.experiments.find(e => ['running', 'stopping'].includes(e.status));
    if (running) selectedRun = running.id;
    if (!selectedRun) selectedRun = catalog.experiments[0]?.id ?? '';
    snapshot = selectedRun ? await api(`/api/gui-lab/experiments/${selectedRun}`) : null;
    error = '';
  } catch (cause) { error = cause.message; }
  finally {
    loading = false; redraw(); clearTimeout(timer);
    if (active()) timer = setTimeout(refresh, 650);
  }
}
const tag = (text, kind = '') => `<span class="tag ${kind}">${esc(text)}</span>`;
function environmentView() {
  const d = catalog.diagnostics;
  return `<section class="panel lab-environment"><div class="panel-head"><div><h3>1 / 检查试验条件</h3><p>检测本机与配置；不会请求模型或发送手机操作。</p></div><button class="button" data-lab-action="diagnostics" ${diagnosticsBusy ? 'disabled' : ''}>${diagnosticsBusy ? '正在检查…' : d ? '重新检测环境' : '检测环境'}</button></div><div class="panel-body"><div class="lab-condition-grid">
    <div><small>候选 SDK · Midscene</small><strong>${!d ? '尚未检测' : d.sdk.status === 'passed' ? `${esc(d.sdk.version)} · 离线契约通过` : d.sdk.status === 'not_installed' ? '尚未安装' : '检查失败'}</strong><p>实际 SDK 动作入口 + 工具替身，无模型决策。</p></div>
    <div><small>HDC 与手机</small><strong>${!d ? '尚未检测' : ({ not_found: '未找到 HDC', no_targets: '未发现设备', targets_listed: '已列出设备 · 未实测', probe_failed: '检查失败' }[d.hdc.status] ?? d.hdc.status)}</strong><p>${esc(d?.hdc.detail ?? '目标：鸿蒙 NEXT 6 / 7；具体构建待核对。')}</p></div>
    <div><small>手机决策模型预设</small><strong>${esc(d?.gui_model.name ?? (d ? '尚未指定' : '尚未检测'))}</strong><p>${d?.gui_model.status === 'ready_unverified' ? '字段完整，连接与视觉/动作能力未验证。' : '可在系统设置填写；当前不会调用。'}</p></div></div>
    <p class="hint">${d ? `检测时间：${esc(d.checked_at)} · ${esc(d.node.version)} / ${esc(d.node.platform)} / ${esc(d.node.arch)}` : '当前还没有检测记录。结果会保存，刷新后可查看。'}</p>
    <details><summary>真实验证尚待哪些条件</summary><p class="hint">你确认候选后，固定框架/模型版本、设备构建、实际 APP 与起始状态，再接通完整执行链路。hipyum 与原生 SDK 继续比较。当前暂未开放真机运行，填写模型配置也不会启用它。</p>${d ? `<pre class="json">${json(d)}</pre>` : ''}</details></div></section>`;
}
function formView() {
  const busy = submitting || active(), c = catalog.candidates.find(c => c.id === form.candidate_id);
  const text = (name, label, multiline = false) => `<label>${label}${multiline ? `<textarea name="${name}" rows="2" required maxlength="2000">${esc(form[name])}</textarea>` : `<input name="${name}" value="${esc(form[name])}" required maxlength="100">`}</label>`;
  return `<section class="panel"><div class="panel-head"><div><h3>2 / 准备单活动用例</h3><p>只验证当前活动，不生成每日规划，不推进虚拟时间。</p></div>${tag('项目自建用例 · 非公开榜单')}</div><div class="panel-body"><form id="gui-lab-form"><fieldset ${busy ? 'disabled' : ''}>
    <div class="lab-fields"><label>待比较候选<select name="candidate_id">${catalog.candidates.map(c => `<option value="${c.id}" ${form.candidate_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><label>本版工程用例<select name="case_id">${catalog.cases.map(c => `<option value="${c.id}" ${form.case_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
    <div class="lab-candidate-note"><strong>${esc(c.name)} · ${esc(c.language)} · ${esc(c.path)}</strong><p>${esc(c.note)} <a href="${esc(c.source)}" target="_blank" rel="noreferrer">官方源码 ↗</a></p><small>候选选择只保存到实验输入。下方工程夹具不执行所选框架，不产生候选成功率。</small></div>
    ${text('app', '目标 APP（可修改）')}${text('goal', '活动目标', true)}<details class="lab-input-details"><summary>起始条件与完成依据</summary>${text('initial_state', '起始条件', true)}${text('acceptance', '完成依据', true)}</details>
    <div class="lab-fields"><label>步数上限<input name="max_steps" type="number" min="1" max="30" value="${form.max_steps}" required></label><label>本次执行上限（秒）<input name="timeout_seconds" type="number" min="5" max="120" value="${form.timeout_seconds}" required></label></div>
    <p class="hint">活动文字可用于准备真实测试；当前夹具的动作与核对逻辑由所选工程用例固定，不解释这些文字。</p><div class="lab-run-actions"><button type="submit" class="button primary">${submitting ? '正在提交…' : '运行 Mock 工程用例'}</button><span>最多连续 3 步无进展即退出</span></div>
    </fieldset></form></div></section>`;
}
function comparisonView() {
  const p = catalog.comparison;
  if (!p) return '';
  const dimensions = p.dimensions.filter(d => !comparisonDimension || d.id === comparisonDimension);
  const candidates = catalog.candidates.filter(c => !comparisonFramework || c.id === comparisonFramework);
  return `<details class="panel lab-comparison" id="lab-comparison-panel" ${comparisonOpen ? 'open' : ''}><summary class="lab-comparison-heading"><strong>框架对比验收清单</strong><span>${p.dimensions.length} 个维度 · ${p.case_count} 项用例</span></summary><div class="panel-body">
    <p class="lab-comparison-intro">已纳入另一对话「${esc(p.source_chat)}」的实现、成本与长活动比较。下列是真实框架的统一验收定义；现有 7 类 Mock 只提供局部工程验证，不是候选实测成绩。</p>
    <div class="lab-fields"><label>对比维度<select id="comparison-dimension" aria-label="对比维度"><option value="">全部维度</option>${p.dimensions.map(d => `<option value="${d.id}" ${comparisonDimension === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label><label>查看候选关注点<select id="comparison-framework" aria-label="查看候选关注点"><option value="">全部候选</option>${catalog.candidates.map(c => `<option value="${c.id}" ${comparisonFramework === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
    <div class="lab-comparison-meta">${tag('真实对比尚未执行')}<a class="button small" href="/api/gui-lab/comparison" download>下载完整用例 JSON</a></div><p class="hint">每个候选分别记录：框架已有、能直接复用、需要改造、需要新建、尚未验证。实现成本与测试通过状态分开；Midscene 与 MobiAgent 同等优先深入比较，Open-AutoGLM 作基线。展开或筛选不会调用模型。</p>
    ${dimensions.map(d => `<details class="lab-comparison-dimension" ${comparisonDimension ? 'open' : ''}><summary><strong>${esc(d.name)}</strong><span>${d.cases.length} 项</span></summary><p class="hint">来源：实现比较文档 ${d.source_sections.map(s => '§' + esc(s)).join('、')}</p><div class="lab-comparison-focus">${candidates.map(c => `<div><strong>${esc(c.name)}</strong><p>${esc(d.focus[c.id])}</p></div>`).join('')}</div>
    ${d.cases.map(c => `<details class="lab-comparison-case"><summary><span>${esc(c.id)}</span><strong>${esc(c.name)}</strong><small>待执行</small></summary><dl><dt>执行方法</dt><dd>${esc(c.procedure)}</dd><dt>通过依据</dt><dd>${esc(c.acceptance)}</dd><dt>必须留存的证据</dt><dd>${esc(c.evidence)}</dd>${c.pending.length ? `<dt>待明确的试验条件</dt><dd>${c.pending.map(esc).join('；')}</dd>` : ''}<dt>现有 Mock 局部参考</dt><dd>${c.fixture_ids.length ? c.fixture_ids.map(id => esc(catalog.cases.find(f => f.id === id)?.name ?? id)).join('、') + '；不能代替本项真实框架验收。' : '现有夹具未验证本项框架能力。'}</dd></dl></details>`).join('')}</details>`).join('')}
    <p class="hint">不会自动跑 ${p.case_count} 项 × 三候选 × 三模型。真实模型按需做最小试验，限制输入/输出、次数和步骤，不默认重试或批量测试；百对象的数量、去重与详情口径未定时不执行该项验收。</p></div></details>`;
}
function evidenceView() {
  const s = snapshot, r = s?.result;
  return `<section class="panel" id="lab-evidence"><div class="panel-head"><div><h3>3 / 执行记录与证据</h3><p>输入快照、实际结果与调用顺序分别保存。</p></div>${s ? tag(`${statusNames[s.status]} · Mock`, s.status) : ''}</div><div class="panel-body">
    <div class="lab-history"><label>验证记录<select id="lab-history" ${active() ? 'disabled' : ''}><option value="">选择记录</option>${catalog.experiments.map(e => `<option value="${e.id}" ${e.id === selectedRun ? 'selected' : ''}>${esc(e.input.case_name)} · ${esc(statusNames[e.status] ?? e.status)} · ${esc(e.created_at)}</option>`).join('')}</select></label><button class="button" data-lab-action="refresh">刷新记录</button></div>
    ${!s ? '<div class="lab-empty">先运行一个用例，查看逐步记录、图像与实际结果。</div>' : `<div class="lab-result"><div><small>实际核对对象 / 目标</small><strong>${r?.actual_objects ?? new Set(s.events.filter(e => e.type === 'verified').map(e => e.detail.object_id)).size} / ${s.input.target}</strong></div><div><small>步骤 / 合成图像</small><strong>${s.steps.length} / ${s.assets.length}</strong></div><div><small>结束原因</small><strong class="lab-result-reason">${esc(r ? reasonNames[r.reason] ?? r.reason : active() ? '正在执行夹具' : '记录已保留')}</strong></div></div>
    <div class="lab-evidence-actions">${active() ? '<button class="button" data-lab-action="stop">停止当前 Mock</button>' : ['stopped', 'interrupted'].includes(s.status) ? '<button class="button" data-lab-action="resume">恢复此 Mock 用例</button>' : ''}<a class="button" href="/api/gui-lab/experiments/${s.id}/export" download>导出验证记录 JSON</a></div>
    <p class="lab-provenance">来源：Mock 工程夹具 · 未执行 ${esc(s.input.candidate_name)} 决策循环 · 真实模型调用 0 · 真实手机动作 0 · 存档图转文未运行</p>
    <details class="lab-snapshot"><summary>活动输入快照与实际结果</summary><pre class="json">${json({ input: s.input, result: r, status: s.status })}</pre></details>
    <div class="lab-events">${s.events.map(e => `<details class="lab-event"><summary><span class="lab-event-number">${e.seq}</span><strong>${esc(eventNames[e.type] ?? e.type)}</strong><small>${esc(e.at.slice(11, 23))}</small></summary><pre class="json">${json(e.detail)}</pre></details>`).join('')}</div>
    <details class="lab-gallery-details"><summary>合成图像 · ${s.assets.length} 张（非手机截图）</summary><div class="lab-gallery">${s.assets.map(a => `<figure><a href="/api/gui-lab/experiments/${s.id}/assets/${a.id}" target="_blank" rel="noreferrer"><img src="/api/gui-lab/experiments/${s.id}/assets/${a.id}" alt="Mock 合成画面，${esc(a.phase)}"></a><figcaption>${a.phase === 'before' ? '动作前' : '动作后'} · ${esc(a.step_id.slice(-3))}</figcaption></figure>`).join('')}</div></details>`}
    </div></section>`;
}
export function guiLabView() {
  if (!catalog) { if (!loading) void refresh(); return `<div class="loading">${esc(error || '正在读取 v0.4 验证台…')}</div>`; }
  return `<div id="gui-lab-root"><button class="row-action lab-back" data-view="apps">← 返回系统设置</button><div class="lab-banner"><div><span>v0.4-preview · 下层 Agent 单活动验证</span><p>先验证环境与记录边界，再接真实模型和手机。最终框架尚未选定。</p></div>${tag('当前只开放 Mock', 'mock')}</div>${error ? `<p role="alert" class="form-error">${esc(error)}</p>` : ''}${environmentView()}${comparisonView()}${formView()}${evidenceView()}</div>`;
}
export function setupGuiLab(context) {
  ({ api, redraw, toast } = context);
  document.addEventListener('toggle', event => { if (event.target.id === 'lab-comparison-panel') comparisonOpen = event.target.open; }, true);
  document.addEventListener('input', event => {
    const el = event.target;
    if (!el.closest('#gui-lab-form')) return;
    form[el.name] = ['max_steps', 'timeout_seconds'].includes(el.name) ? Number(el.value) : el.value;
  });
  document.addEventListener('change', async event => {
    const el = event.target;
    if (el.id === 'comparison-dimension' || el.id === 'comparison-framework') {
      if (el.id === 'comparison-dimension') comparisonDimension = el.value; else comparisonFramework = el.value;
      comparisonOpen = true; redraw(); return;
    }
    if (el.name === 'case_id' && el.closest('#gui-lab-form')) { setCase(el.value); redraw(); }
    if (el.name === 'candidate_id' && el.closest('#gui-lab-form')) { form.candidate_id = el.value; redraw(); }
    if (el.id === 'lab-history') { selectedRun = el.value; await refresh(); }
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'gui-lab-form') return;
    event.preventDefault(); if (submitting || active()) return;
    submitting = true; redraw();
    try { const result = await api('/api/gui-lab/experiments', { ...form, mode: 'mock' }); selectedRun = result.id; toast('Mock 工程验证已启动；不调用模型或手机'); }
    catch (cause) { error = cause.message; toast(error, true); }
    finally { submitting = false; await refresh(); }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('button[data-lab-action]'); if (!button || button.disabled) return;
    const action = button.dataset.labAction;
    try {
      if (action === 'diagnostics') {
        if (diagnosticsBusy) return; diagnosticsBusy = true; redraw();
        try { catalog.diagnostics = await api('/api/gui-lab/diagnostics', {}); toast('检测完成；没有请求模型或执行手机动作'); }
        finally { diagnosticsBusy = false; redraw(); }
      }
      if (action === 'refresh') await refresh();
      if (['stop', 'resume'].includes(action) && selectedRun) {
        button.disabled = true; await api(`/api/gui-lab/experiments/${selectedRun}/${action}`, {}); await refresh();
      }
    } catch (cause) { error = cause.message; toast(error, true); redraw(); }
  });
}
