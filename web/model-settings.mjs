const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const platforms = { custom: '自定义服务', qwen: '阿里百炼 / Qwen', doubao: '火山方舟 / 豆包', zhipu: '智谱 / AutoGLM', gemini: 'Google Gemini' };
let api, redraw, toast, snapshot, draft, selected = '', loading = false, saving = false, dirty = false, error = '', report = '';
function accept(value) {
  snapshot = value;
  draft = { revision: value.revision, services: value.services.map(({ id, name, provider, protocol, base_url, model, auth, timeout_ms }) => ({ id, name, provider, protocol, base_url, model, auth, timeout_ms })), bindings: { ...value.bindings } };
  if (!draft.services.some(service => service.id === selected)) selected = draft.services[0]?.id ?? '';
  dirty = false; error = ''; report = '';
}
async function load() {
  if (loading || snapshot) return;
  loading = true;
  try { accept(await api('/api/settings/models')); }
  catch { error = '模型配置读取失败，请稍后重新进入系统设置。'; }
  finally { loading = false; redraw(); }
}
function changed() {
  dirty = true; error = ''; report = '';
  document.querySelectorAll('[data-model-save-state]').forEach(el => el.textContent = '有未保存修改：请点击保存，真机工作台仅读取已保存配置。');
  const restore = document.querySelector('[data-model-action="restore"]'); if (restore) restore.disabled = saving;
  const check = document.querySelector('[data-model-action="check"]'); if (check) check.disabled = true;
  const message = document.querySelector('.model-settings .form-error'); if (message) message.textContent = '';
  document.querySelector('.model-check-report')?.remove();
}
export function modelSettingsView() {
  if (!snapshot) { void load(); return `<section class="panel"><div class="panel-body">${error || '正在读取模型服务配置…'}</div></section>`; }
  const service = draft.services.find(s => s.id === selected);
  const saved = snapshot.services.find(s => s.id === selected);
  const keyNote = service?.api_key === null ? '保存后将移除原密钥' : saved?.has_api_key ? '已保存密钥；留空会保留原值' : '可稍后填写；允许先保存草稿';
  const field = (label, name, placeholder, value, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${name === 'api_key' ? 'autocomplete="new-password" spellcheck="false"' : ''} ${name === 'timeout_seconds' ? 'min="0" step="1"' : ''}></label>`;
  return `<section class="panel model-settings"><div class="panel-head"><div><h3>模型服务</h3><p>先保存服务信息，再为各角色选择预设；同一服务可供多个角色使用。</p></div><span class="tag">本机模型服务配置</span></div>
    <div class="panel-body"><div class="model-stage-note">填写后必须点击“保存此服务配置”。真机工作台读取已保存服务；主仿真仍为 Mock。保存或检查配置不会调用模型。</div>
    <div class="model-layout"><div class="model-service-list"><div class="model-list-head"><strong>服务列表 · ${draft.services.length}</strong><button type="button" class="row-action" data-model-action="add" ${saving || draft.services.length >= 20 ? 'disabled' : ''}>＋ 添加</button></div>
    ${draft.services.map(s => `<button type="button" class="model-service-item ${s.id === selected ? 'selected' : ''}" data-model-select="${esc(s.id)}"><strong>${esc(s.name)}</strong><small>${esc(platforms[s.provider])} · ${esc(s.model || '模型待填')}</small></button>`).join('') || '<p class="hint">暂未配置服务。可以先创建一个草稿，之后再填地址和密钥。</p>'}</div>
    ${service ? `<form id="model-service-form" class="model-service-form"><fieldset ${saving ? 'disabled' : ''}><div class="form-grid">${field('服务名称', 'name', '例如：GUI 测试服务', service.name)}<label>服务平台<select name="provider">${Object.entries(platforms).map(([id, name]) => `<option value="${id}" ${service.provider === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label></div>
    <div class="form-grid"><label>接口协议<select name="protocol"><option value="openai-chat" ${service.protocol === 'openai-chat' ? 'selected' : ''}>OpenAI 兼容聊天接口</option><option value="gemini" ${service.protocol === 'gemini' ? 'selected' : ''}>Gemini 原生接口</option></select></label>${field('模型名称', 'model', '填写服务平台提供的完整模型 ID', service.model)}</div>
    ${field('服务地址（Base URL）', 'base_url', 'https://服务域名/接口根路径', service.base_url, 'url')}<p class="hint">以服务平台给出的根地址为准，不在地址中填写密钥。平台名称不会自动判断图像或动作兼容性。</p>
    <div class="form-grid"><label>鉴权方式<select name="auth"><option value="api_key" ${service.auth === 'api_key' ? 'selected' : ''}>API Key</option><option value="none" ${service.auth === 'none' ? 'selected' : ''}>无需鉴权</option></select></label>${field('单次请求超时（秒，0为不限）', 'timeout_seconds', '不限制', service.timeout_ms / 1000, 'number')}</div>
    ${service.auth === 'api_key' ? `${field('API Key', 'api_key', keyNote, service.api_key ?? '', 'password')}<div class="model-secret-note"><span>${esc(keyNote)}。已保存密钥不会回填到网页。</span>${saved?.has_api_key && service.api_key !== null ? '<button type="button" class="row-action" data-model-action="clear-key">移除已保存密钥</button>' : ''}</div>` : ''}
    <p data-model-save-state role="status">${dirty ? '有未保存修改：填写后请点击保存。' : saved ? (saved.missing.length ? '已保存草稿，待补：' + esc(saved.missing.join('、')) : '配置已保存，必填项完整；可到真机工作台选择。') : '尚未保存'}</p><p class="form-error" role="alert">${esc(error)}</p><button type="button" class="button primary" data-model-action="save" ${saving ? 'disabled' : ''}>${saving ? '保存中…' : '保存此服务配置'}</button><p class="hint">保存会一并保存当前服务列表和角色预设。</p>
    <div class="model-editor-foot"><span class="tag">连接状态：未验证</span><button type="button" class="row-action" data-model-action="remove">移除此服务</button></div></fieldset></form>` : '<div class="model-service-empty"><strong>添加第一个模型服务</strong><p>账号信息可以之后补齐，当前可先保存服务名称和角色预设。</p><button type="button" class="button" data-model-action="add">＋ 添加服务</button></div>'}</div>
    <div class="model-role-heading"><h3>角色预设</h3><p class="hint">这里只指定后续接入使用的服务。各模块当前仍使用 Mock。</p></div><div class="model-role-grid">${snapshot.roles.map(role => `<label class="model-role"><span><strong>${esc(role.name)}</strong><small>${esc(role.description)}</small></span><select data-model-role="${role.id}" aria-label="${esc(role.name)}的服务预设"><option value="">暂不指定</option>${draft.services.map(s => `<option value="${esc(s.id)}" ${draft.bindings[role.id] === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select><small>当前运行：Mock</small></label>`).join('')}</div>
    <div class="form-error" role="alert">${esc(error)}</div>${report ? `<div class="model-check-report" role="status">${esc(report)}</div>` : ''}
    <div class="model-actions"><span id="model-save-state" data-model-save-state>${dirty ? '有未保存修改' : '已读取本机配置'}</span><button type="button" class="button" data-model-action="restore" ${saving || !dirty ? 'disabled' : ''}>还原修改</button><button type="button" class="button" data-model-action="check" ${saving || dirty ? 'disabled' : ''}>检查已保存配置</button><button type="button" class="button primary" data-model-action="save" ${saving ? 'disabled' : ''}>${saving ? '保存中…' : '保存配置'}</button></div>
    <p class="hint model-boundary">配置检查只核对必填项。配置完整不等于连接或图像兼容已验证；真机执行仅在工作台明确启动后发生。</p></div></section>`;
}
export function setupModelSettings(context) {
  ({ api, redraw, toast } = context);
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href="/phone-lab"]');
    if (link && (dirty || saving)) { event.preventDefault(); error = saving ? '正在保存，请稍后进入真机工作台。' : '模型服务尚未保存。请先点击“保存此服务配置”，再进入真机工作台。'; redraw(); document.querySelector('[data-model-action="save"]')?.scrollIntoView({block:'center'}); }
  }, true);
  document.addEventListener('submit', event => { if (event.target.id === 'model-service-form') { event.preventDefault(); void save(); } });
  document.addEventListener('input', event => {
    const el = event.target;
    if (!el.closest('#model-service-form')) return;
    const service = draft?.services.find(s => s.id === selected);
    if (!service) return;
    if (el.name === 'timeout_seconds') service.timeout_ms = Number(el.value) * 1000;
    else if (el.name === 'api_key') { if (el.value) service.api_key = el.value; else delete service.api_key; }
    else service[el.name] = el.value;
    changed();
  });
  document.addEventListener('change', event => {
    const el = event.target;
    if (el.dataset.modelRole) { draft.bindings[el.dataset.modelRole] = el.value || null; changed(); redraw(); }
    else if (el.closest('#model-service-form') && ['provider', 'protocol', 'auth'].includes(el.name)) {
      const service = draft.services.find(s => s.id === selected); service[el.name] = el.value;
      if (el.name === 'auth' && el.value === 'none') delete service.api_key;
      changed(); redraw();
    }
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || !snapshot || saving) return;
    if (button.dataset.modelSelect) { selected = button.dataset.modelSelect; redraw(); return; }
    const action = button.dataset.modelAction;
    if (!action) return;
    if (action === 'add') {
      if (draft.services.length >= 20) return;
      const service = { id: `model_${crypto.randomUUID()}`, name: `模型服务 ${draft.services.length + 1}`, provider: 'custom', protocol: 'openai-chat', base_url: '', model: '', auth: 'api_key', timeout_ms: 0 };
      draft.services.push(service); selected = service.id; changed();
    }
    if (action === 'remove') { draft.services = draft.services.filter(s => s.id !== selected); for (const role of snapshot.roles) if (draft.bindings[role.id] === selected) draft.bindings[role.id] = null; selected = draft.services[0]?.id ?? ''; changed(); }
    if (action === 'clear-key') { draft.services.find(s => s.id === selected).api_key = null; changed(); }
    if (action === 'restore') accept(snapshot);
    if (action === 'save') { void save(); return; }
    if (action === 'check') {
      const v = snapshot.validation;
      report = v.service_count === 0 ? '尚无服务配置。可以先添加草稿。' : `已保存 ${v.service_count} 个服务，${v.ready_count} 个必填项完整。${v.issues.length ? '待补：' + v.issues.map(i => `${i.name} · ${i.field}`).join('；') + '。' : ''}尚未调用模型或验证兼容性。`;
    }
    redraw();
  });
  async function save() {
    if (saving || !draft) return;
    saving = true; error = ''; redraw();
    try { accept(await api('/api/settings/models', draft)); toast('模型配置已保存，真机工作台将自动读取；保存未调用模型。'); }
    catch (cause) { error = cause.message; }
    finally { saving = false; redraw(); }
  }
}
