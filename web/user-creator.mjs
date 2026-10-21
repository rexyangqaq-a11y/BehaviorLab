const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const split = value => value.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
let deps, model;
export function setupCreator(options) { deps = options; }
export function startCreator(draft) {
  model = { step: draft ? 3 : 1, mode: 'assisted', count: 3, cohort_name: '', requirements: '', constraints: {}, candidates: [], draft: null, error: '', busy: false };
  if (draft) {
    model.draft = draft; model.candidates = draft.candidates.map(c => ({ ...c, selected: true, persona: structuredClone(c.persona) }));
    model.cohort_name = draft.requirements.cohort_name ?? ''; model.requirements = draft.requirements.brief ?? ''; model.constraints = draft.requirements.constraints ?? {}; model.count = draft.requested_count;
  }
}
const field = (label, key, value = '', extra = '') => `<label>${label}<input name="${key}" value="${esc(value)}" ${extra}></label>`;
function personaFields(persona = {}, prefix = '') {
  return `<div class="form-grid">${field('名称 / 化名', `${prefix}name`, persona.name, `${prefix ? '' : 'required'} maxlength="100"`)}${field('年龄（可选）', `${prefix}age`, persona.age, 'type="number" min="1" max="120"')}${field('常住城市', `${prefix}city`, persona.city)}${field('职业 / 生活角色', `${prefix}occupation`, persona.occupation)}</div><label>兴趣（逗号分隔）<input name="${prefix}interests" value="${esc((persona.interests ?? []).join('，'))}" placeholder="如：徒步，美食，科技"></label><label>生活背景与使用习惯（可选）<textarea name="${prefix}life_context" rows="2" placeholder="如：工作日通勤，周末喜欢周边游；这是人设背景，由上层规划参考。">${esc(persona.life_context)}</textarea></label><label>人设简述（可选）<textarea name="${prefix}summary" rows="2">${esc(persona.summary)}</textarea></label>`;
}
export function creatorView() {
  if (!model) startCreator();
  const m = model;
  const progress = `<ol class="creation-steps">${['定义创建方式', '设置用户条件', '检查并入库'].map((label, i) => `<li class="${m.step === i + 1 ? 'current' : m.step > i + 1 ? 'done' : ''}" ${m.step === i + 1 ? 'aria-current="step"' : ''}><span>${m.step > i + 1 ? '✓' : i + 1}</span>${label}</li>`).join('')}</ol>`;
  let body = '';
  if (m.step === 1) body = `<h2>你想怎样创建用户？</h2><p class="creator-help">先从少量、可解释的固定人设开始。创建后可复用于多个仿真任务。</p><div class="creation-modes"><label class="creation-mode ${m.mode === 'assisted' ? 'selected' : ''}"><input type="radio" name="mode" value="assisted" ${m.mode === 'assisted' ? 'checked' : ''}><span><strong>辅助批量生成 <em>Mock</em></strong><small>描述目标群体，补全候选，再逐个检查和修改。</small></span></label><label class="creation-mode ${m.mode === 'manual' ? 'selected' : ''}"><input type="radio" name="mode" value="manual" ${m.mode === 'manual' ? 'checked' : ''}><span><strong>手动创建</strong><small>明确设定一位用户，适合基准案例与对照实验。</small></span></label></div><div class="form-grid">${field('分组名称（可选）', 'cohort_name', m.cohort_name, 'placeholder="如：杭州通勤族 · 第一组" maxlength="100"')}${m.mode === 'assisted' ? field('候选数量', 'count', m.count, 'type="number" min="1" max="20" required') : '<p class="field-note">一次创建一位。分组用于整理用户，不会绑定 APP 账号。</p>'}</div><label>原始生成要求 / 研究说明（可选）<textarea name="requirements" rows="4" placeholder="例如：创建生活在杭州的上班族，兴趣有所区别，保持简单固定人设。">${esc(m.requirements)}</textarea></label><div class="creator-tip">用户的人设由你确认；仿真的时间跨度、可用 APP 和采集要求在下一阶段的任务中设置。</div>`;
  if (m.step === 2 && m.mode === 'assisted') body = `<h2>明确共同条件，留出个体差异</h2><p class="creator-help">以下均可选。填写的结构化字段会传给适配器；未填写的字段由适配器补全。自然语言要求尚未通过模型验证。</p><div class="form-grid">${field('常住城市', 'city', m.constraints.city, 'placeholder="不限 / 由适配器补全"')}${field('职业 / 生活角色', 'occupation', m.constraints.occupation, 'placeholder="如：上班族、学生；也可留空"')}</div><div class="form-grid">${field('年龄下限', 'age_min', m.constraints.age_min, 'type="number" min="1" max="120" placeholder="可选"')}${field('年龄上限', 'age_max', m.constraints.age_max, 'type="number" min="1" max="120" placeholder="可选"')}</div><label>共同兴趣（逗号分隔，可选）<input name="interests" value="${esc((m.constraints.interests ?? []).join('，'))}" placeholder="留空时，各候选可有不同兴趣"></label><label>生活背景与使用习惯（可选）<textarea name="life_context" rows="3" placeholder="例如：工作日通勤，周末在本地寻找餐厅与短途旅行信息。">${esc(m.constraints.life_context)}</textarea></label><div class="creator-tip">只指定研究需要控制的条件，其余在候选中检查。生活习惯作为上层规划的背景，不转成调度器的手写行为概率或固定活动表。</div>`;
  if (m.step === 2 && m.mode === 'manual') body = `<h2>设定一位固定用户</h2><p class="creator-help">名称必填，其余可按研究需要填写。这里录入的是虚构用户的人设，不需要账号、手机号或真实身份。</p>${personaFields(m.manual)}`;
  if (m.step === 3) body = `<div class="review-head"><div><h2>检查候选，再放入用户库</h2><p class="creator-help">只保存勾选项。可以调整每位用户，生成原稿与修改字段分别保留。</p></div><span class="tag ${m.mode === 'manual' ? 'live' : 'mock'}">${m.mode === 'manual' ? '手动设定' : '候选内容 Mock'}</span></div>${m.draft ? `<div class="creator-tip">候选原稿已持久化，确认入库时保存修改。返回后可重新审核，未入库候选不能用于仿真。</div>` : ''}<div class="review-candidates">${m.candidates.map((c, i) => `<section class="candidate-card"><div class="candidate-heading"><label class="inline-check"><input name="selected_${i}" type="checkbox" ${c.selected ? 'checked' : ''}> 保存候选 ${i + 1}</label><span>${m.mode === 'manual' ? '人工设定' : '生成原稿可追溯'}</span></div>${personaFields(c.persona, `candidate_${i}_`)}</section>`).join('')}</div>`;
  return `<button class="row-action back-link" data-view="users">← 返回用户库${m.draft ? '（保留草稿）' : ''}</button>${progress}<div class="creator-layout"><form id="creator-form" class="panel creator-form">${body}<div class="form-error" role="alert">${esc(m.error)}</div><div class="dialog-actions">${m.step > 1 ? `<button class="button" type="button" data-creator-back ${m.busy ? 'disabled' : ''}>上一步</button>` : ''}<button class="button primary" type="submit" ${m.busy ? 'disabled' : ''}>${m.busy ? '正在处理…' : m.step === 1 ? '继续设置条件 →' : m.step === 2 ? m.mode === 'manual' ? '检查人设 →' : '生成候选人设 →' : '确认所选用户并入库'}</button></div></form><aside class="creator-aside"><p class="eyebrow">${m.step === 3 ? 'REVIEW BEFORE SAVE' : 'PERSONA DESIGN'}</p><h3>${m.step === 3 ? '入库意味着什么？' : '先把用户定义清楚'}</h3><p>固定身份与兴趣是长期行为的起点。保留少量有用背景，后续让上层结合实际结果决定每天的行为。</p><ol><li>用户库：你确认的固定人设</li><li>仿真任务：时间范围、APP 与用户快照</li><li>任务内：每日规划 → 执行 → 观察文字</li></ol><p>${m.mode === 'assisted' ? '当前辅助生成使用确定性 Mock 模板。原始要求、真实调用和候选原稿落盘；行为自然性仍待真实模型验证。' : '手动创建不会调用人设模型，也不会产生虚构的模型调用记录。'}</p></aside></div>`;
}
function readPersona(form, prefix = '') {
  const get = name => form.elements[prefix + name]?.value ?? '';
  return { name: get('name'), age: get('age') === '' ? undefined : Number(get('age')), city: get('city'), occupation: get('occupation'), interests: split(get('interests')), life_context: get('life_context'), summary: get('summary') };
}
function remember(form) {
  if (!model) return;
  if (model.step === 1) {
    model.mode = form.elements.mode.value; model.cohort_name = form.elements.cohort_name.value; model.requirements = form.elements.requirements.value;
    if (form.elements.count) model.count = Number(form.elements.count.value);
  } else if (model.step === 2 && model.mode === 'assisted') {
    const get = key => form.elements[key].value;
    model.constraints = { city: get('city'), occupation: get('occupation'), age_min: get('age_min') === '' ? undefined : Number(get('age_min')), age_max: get('age_max') === '' ? undefined : Number(get('age_max')), interests: split(get('interests')), life_context: get('life_context') };
  } else if (model.step === 2) model.manual = readPersona(form);
  else model.candidates.forEach((candidate, i) => { candidate.selected = form.elements[`selected_${i}`].checked; candidate.persona = { ...candidate.persona, ...readPersona(form, `candidate_${i}_`) }; });
}
document.addEventListener('input', event => { const form = event.target.closest('#creator-form'); if (form) remember(form); });
document.addEventListener('change', event => { const form = event.target.closest('#creator-form'); if (form) { remember(form); if (event.target.name === 'mode') deps.render(); } });
document.addEventListener('click', event => {
  if (event.target.closest('[data-creator-back]') && !model.busy) { remember(document.querySelector('#creator-form')); model.step--; model.error = ''; deps.render(); }
});
document.addEventListener('submit', async event => {
  if (event.target.id !== 'creator-form') return;
  event.preventDefault(); if (model.busy) return;
  remember(event.target); model.error = '';
  if (model.step === 1) { model.step = 2; deps.render(); return; }
  model.busy = true; deps.render();
  try {
    if (model.step === 2) {
      if (model.mode === 'manual') { model.candidates = [{ selected: true, persona: structuredClone(model.manual) }]; model.draft = null; }
      else {
        const draft = await deps.api('/api/users/preview', { count: model.count, cohort_name: model.cohort_name, requirements: model.requirements, constraints: model.constraints });
        model.draft = draft; model.candidates = draft.candidates.map(c => ({ ...c, selected: true, persona: structuredClone(c.persona) }));
      }
      model.step = 3;
    } else {
      const selected = model.candidates.filter(c => c.selected); if (!selected.length) throw new Error('请至少勾选一位用户');
      const saved = model.mode === 'manual' ? await deps.api('/api/users/manual', { cohort_name: model.cohort_name, requirements: model.requirements, persona: selected[0].persona }) : await deps.api(`/api/users/drafts/${encodeURIComponent(model.draft.id)}/commit`, { candidates: selected.map(c => ({ call_id: c.call_id, persona: c.persona })) });
      await deps.saved(saved); return;
    }
  } catch (error) { model.error = error.message; }
  finally { model.busy = false; deps.render(); }
});
