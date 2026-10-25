import { creatorView, startCreator, setupCreator } from './user-creator.mjs';
import { modelSettingsView, setupModelSettings } from './model-settings.mjs';
import { guiLabView, setupGuiLab } from './gui-lab.mjs';
import { offlineExecutionView, offlineCreationPanel, setupOfflineRuntime } from './v05-runtime.mjs';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const pretty = value => esc(JSON.stringify(value, null, 2));
const paths = {
  overview: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="13" y="3" width="6" height="6" rx="1"/><rect x="3" y="13" width="6" height="6" rx="1"/><rect x="13" y="13" width="6" height="6" rx="1"/>',
  users: '<circle cx="8" cy="7" r="3"/><path d="M2 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v2"/>',
  simulations: '<rect x="3" y="4" width="16" height="16" rx="3"/><path d="M7 1v6M15 1v6M3 10h16m-9 3 4 2.5-4 2.5Z"/>',
  plans: '<rect x="4" y="3" width="14" height="18" rx="2"/><path d="M8 1h6v4H8ZM8 10h7M8 14h7M8 18h4"/>',
  sequence: '<circle cx="5" cy="5" r="2"/><circle cx="5" cy="17" r="2"/><path d="M5 7v8M10 5h10M10 17h10M10 11h6"/>',
  memories: '<path d="M5 3h11l4 4v13H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm11 0v5h4M7 12h8M7 16h8"/>',
  calls: '<rect x="8" y="2" width="7" height="5" rx="1"/><rect x="1" y="16" width="7" height="5" rx="1"/><rect x="15" y="16" width="7" height="5" rx="1"/><path d="M11.5 7v5M4.5 16v-4h14v4"/>',
  apps: '<rect x="5" y="1" width="12" height="21" rx="3"/><path d="M9 18h4M9 4h4"/>',
  play: '<path d="m7 4 12 8-12 8Z"/>', clock: '<circle cx="11" cy="11" r="9"/><path d="M11 5v7l4 2"/>',
  image: '<rect x="2" y="3" width="19" height="17" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 19 5-6 4 4 5-8 4 7"/>',
  arrow: '<path d="M3 11h16M13 5l6 6-6 6"/>', plus: '<path d="M11 3v16M3 11h16"/>', check: '<path d="m4 11 5 5L19 6"/>',
};
const icon = key => `<svg class="icon" viewBox="0 0 23 23" aria-hidden="true">${paths[key] ?? paths.sequence}</svg>`;
const views = { users: ['虚拟用户', 'VIRTUAL USERS', '从外部要求生成简单固定人设，独立保存，并在仿真任务中复用。'], simulations: ['仿真任务', 'BEHAVIOR SIMULATIONS', '选择用户、虚拟时间跨度与可用 APP，让调度器按日请求规划并推进执行。'], plans: ['行为规划', 'DAILY BEHAVIOR PLANS', '按需生成每日计划；依据实际结果局部调整，保留每一个版本。'], sequence: ['行为序列', 'BEHAVIOR SEQUENCES', '按用户与虚拟时间组织已保存的实际结果，追溯每一步操作和截图。'], memories: ['生成记忆', 'GENERATED OBSERVATIONS', '查看截图转文字的上游观察记录。原始描述、加工文本与来源分别保留。'], calls: ['调用链路', 'EXECUTION TRACES', '查看真正发生的模块调用、请求响应和恢复记录，区分系统逻辑与 Mock 内容。'], apps: ['APP 与适配器', 'APPS & ADAPTERS', '在指定 APP 能力范围内规划，逐步替换手机操作与模型服务适配器。'] };
const names = { completed: '已完成', complete: '已完成', partial: '部分完成', pending: '待执行', planned: '已规划', planning: '规划中', running: '运行中', executing: '执行中', working: '描述中', failed: '失败', blocked: '受阻', queued: '启动中', paused: '已暂停', stopped: '已停止', interrupted: '已中断', needs_attention: '需处理', completed_with_issues: '有缺项', finished: '区间完成', ready: '待调度', awaiting_feedback: '等待反馈', day_complete: '当日结束', waiting: '尚未推进' };
names.unplanned = '待规划';
const actionNames = { run: '行为生成', next_activity: '下一活动', next_day: '推进一个用户日', plan_next: '当日规划', retry_descriptions: '文字补生成', describe: '待处理文字生成', export: '数据导出', check: '完整性检查', pipeline: '生成、补齐与导出', interrupt: '中断演练' };
const moduleNames = { runtime: '事件调度', users: '用户管理', upper_planner: '上层规划', lower_executor: '手机执行', records: '图像记录', describer: '图像转文字' };
const phaseBadge = status => `<span class="tag ${esc(status)}">${esc(names[status] ?? status)}</span>`;
const sourceBadge = mode => `<span class="tag ${['system', 'user'].includes(mode) ? 'live' : 'mock'}">${mode === 'system' ? '系统执行' : mode === 'user' ? '手动设定' : ['offline', 'offline_fixture'].includes(mode) ? '离线夹具' : 'Mock'}</span>`;
let saved;
try { saved = localStorage.getItem('behaviorlab_product_run'); } catch { /* optional preference */ }
views.task = ['运行总览', 'SIMULATION WORKSPACE', '按虚拟用户日推进，执行与逐图文字独立保存。'];
views.create_users = ['创建虚拟用户', 'CREATE VIRTUAL USERS', '先明确用户条件，再检查候选人设，确认后进入可复用的用户库。'];
views.users[0] = '用户库'; views.simulations[0] = '仿真任务'; views.apps[0] = '系统设置';
views.apps = ['系统设置', 'SYSTEM SETTINGS', '配置模型服务与角色预设，查看 APP 能力范围和实际接入状态。'];
views.gui_lab = ['下层 Agent 验证', 'GUI FRAMEWORK LAB', 'v0.4 独立用例与调试入口；候选选型和真机效果仍待验证。'];
views.v05 = ['单活动调试', 'V0.5 OFFLINE INTEGRATION', '查看通用活动输入、完成证据与恢复；离线夹具不表示真实手机成绩。'];
const taskViews = ['task', 'plans', 'sequence', 'memories', 'calls', 'v05'];
const tabNames = { task: '运行总览', plans: '行为规划', sequence: '执行记录', memories: '生成记忆', calls: '调用调试', v05: '单活动调试' };
const state = { view: 'simulations', system: { apps: [], modules: [] }, library: { users: [], calls: [], batches: [] }, runs: [], run: saved, snapshot: null, user: '', date: '', app: '', trace: '', history: false, memoryStatus: 'complete', page: 1, connected: true, loading: true, polling: false, submitting: false, filtersByView: {}, librarySearch: '', libraryGroup: '', selectedUsers: new Set(), creator: null };
let pollTimer, toastTimer, navigationMarkup = '', refreshPromise = Promise.resolve();
async function api(route, body) {
  const response = await fetch(route, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Simulator-UI': '1' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`); return data;
}
function toast(text, error = false) { $('#toast').textContent = text; $('#toast').className = `toast${error ? ' error' : ''}`; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 6500 : 3500); }
const active = job => ['queued', 'running', 'stopping'].includes(job?.status);
const busy = () => state.submitting || active(state.snapshot?.job) || state.snapshot?.status.workers.some(w => w.alive);
const app = id => state.system.apps.find(a => a.app_id === id) ?? { app_id: id, name: id, category: '自定义', mark: 'A', color: 'blue' };
const persona = user => user.persona ?? user;
const displayUser = id => state.snapshot?.users.find(u => u.user_id === id) ?? state.library.users.find(u => u.user_id === id) ?? { user_id: id, persona: { name: id } };
const userName = id => persona(displayUser(id)).name ?? persona(displayUser(id)).label ?? id;
const appMark = id => `<span class="app-mark ${esc(app(id).color)}">${esc(app(id).mark)}</span>`;
const appInline = id => `<span class="app-inline">${appMark(id)}${esc(app(id).name)}</span>`;
const avatar = (user, i = 0, small = false) => `<span class="avatar tone-${i % 4}${small ? ' small' : ''}">${esc((persona(user).name ?? persona(user).label ?? user.user_id ?? 'U').slice(0, 1))}</span>`;
const userInline = id => `<span class="user-inline">${avatar(displayUser(id), state.snapshot?.users.findIndex(u => u.user_id === id) ?? 0, true)}${esc(userName(id))}</span>`;
const days = config => Math.round((Date.parse(config.virtual_end_date) - Date.parse(config.virtual_start_date)) / 86400000) + 1;
const expected = s => days(s.config) * s.users.length;
const doneDays = s => s.status.dataset_complete ? expected(s) : s.status.schedule_days.filter(d => d.status === 'complete').length;
function filters(items) { return items.filter(row => (!state.user || row.user_id === state.user) && (!state.date || (row.virtual_date ?? row.virtual_time ?? '').slice(0, 10) === state.date) && (!state.app || (row.app_id ?? row.planned_task?.app_id) === state.app)); }
function filteredActivities(actualOnly = false) { const s = state.snapshot; return filters(s?.activities.filter(a => a.status !== 'superseded' && (!actualOnly || s.results.some(r => r.activity_id === a.id))) ?? []); }
const route = suffix => `/api/runs/${encodeURIComponent(state.run)}${suffix ?? ''}`;
const screenshotUrl = id => route(`/screens/${encodeURIComponent(id)}`);
function empty(title, text, action, buttonText = '新建仿真任务') { return `<div class="empty"><div class="empty-symbol">${icon('sequence')}</div><h3>${title}</h3><div>${text}</div>${action ? `<button class="button primary" data-action="${action}">${buttonText}</button>` : ''}</div>`; }
function stat(label, value, note, symbol) { return `<section class="stat"><div class="stat-label">${label}${icon(symbol)}</div><div class="stat-number">${value}</div><div class="stat-note">${note}</div></section>`; }
function titleStatus(s) { if (active(s.job)) return 'running'; if (s.status.interrupted_activities.some(a => a.status === 'needs_attention')) return 'needs_attention'; if (s.status.dataset_complete) return 'completed'; if (s.job?.status === 'paused' || s.status.pause_requested) return 'paused'; if (s.status.interrupted_activities.length) return 'interrupted'; return s.status.results ? 'ready' : s.plans.length ? 'planned' : 'unplanned'; }
function head() {
  const [title, eyebrow, subtitle] = views[state.view];
  const action = state.view === 'users' ? '<button class="button primary" data-action="new-users">＋ 创建用户</button>' : state.view === 'simulations' ? '<button class="button primary" data-action="new-simulation">＋ 新建仿真</button>' : state.view === 'apps' ? '<button class="button" data-action="integration-info">真实接入资料</button>' : state.view === 'plans' ? `<button class="button primary" data-job="plan_next" ${busy() || !state.run ? 'disabled' : ''}>${icon('plans')} 生成当前日计划</button>` : '';
  return `<div class="page-head ${taskViews.includes(state.view) ? 'section-head' : ''}"><div><p class="eyebrow">${eyebrow}</p><${taskViews.includes(state.view) ? 'h2' : 'h1'}>${title}</${taskViews.includes(state.view) ? 'h2' : 'h1'}><p class="subtitle">${subtitle}</p></div><div class="head-actions">${action}</div></div>`;
}
function filterbar({ apps = false, memory = false, history = false } = {}) {
  const s = state.snapshot;
  return `<div class="filterbar"><label class="sr-only" for="filter-user">筛选用户</label><select id="filter-user"><option value="">全部用户</option>${s.users.map(u => `<option value="${esc(u.user_id)}" ${state.user === u.user_id ? 'selected' : ''}>${esc(userName(u.user_id))}</option>`).join('')}</select><label class="sr-only" for="filter-date">筛选虚拟日期</label><input id="filter-date" type="date" aria-label="筛选虚拟日期" value="${esc(state.date)}" min="${s.config.virtual_start_date}" max="${s.config.virtual_end_date}">${state.date ? '<button class="row-action" data-action="clear-date">清除日期</button>' : ''}${apps ? `<label class="sr-only" for="filter-app">筛选 APP</label><select id="filter-app"><option value="">全部 APP</option>${s.config.apps.map(a => `<option value="${esc(a.app_id)}" ${state.app === a.app_id ? 'selected' : ''}>${esc(app(a.app_id).name)}</option>`).join('')}</select>` : ''}${memory ? `<label class="sr-only" for="filter-memory">文字生成状态</label><select id="filter-memory"><option value="complete" ${state.memoryStatus === 'complete' ? 'selected' : ''}>已生成文字</option><option value="all" ${state.memoryStatus === 'all' ? 'selected' : ''}>全部观察记录</option><option value="incomplete" ${state.memoryStatus === 'incomplete' ? 'selected' : ''}>待补齐 / 失败</option></select>` : ''}${history ? `<label class="inline-check"><input id="plan-history" type="checkbox" ${state.history ? 'checked' : ''}> 显示历史版本</label>` : ''}<span class="result-count">${esc(s.config.experiment_name ?? s.id)} · ${days(s.config)} 个虚拟日</span></div>`;
}
function renderShell() {
  const parent = taskViews.includes(state.view) ? 'simulations' : state.view === 'create_users' ? 'users' : state.view === 'gui_lab' ? 'apps' : state.view;
  const navigation = ['users', 'simulations', 'apps'].map(id => `<button class="nav-link ${parent === id ? 'selected' : ''}" data-view="${id}" aria-current="${parent === id ? 'page' : 'false'}">${icon(id)}<span>${views[id][0]}</span>${id === 'users' ? `<small>${state.library.users.length}</small>` : id === 'simulations' ? `<small>${state.runs.length}</small>` : ''}</button>`).join('');
  if (navigation !== navigationMarkup) { $('#navigation').innerHTML = navigation; navigationMarkup = navigation; }
  $('#breadcrumbs').innerHTML = `工作空间 <span>/</span> ${parent !== state.view ? `<button class="crumb" data-view="${parent}">${views[parent][0]}</button><span>/</span>` : ''}<strong>${taskViews.includes(state.view) ? esc(state.snapshot?.config.experiment_name ?? '任务详情') : views[state.view][0]}</strong>`;
  $('#connection').textContent = state.connected ? '● 本地已连接' : '● 连接断开'; $('#connection').classList.toggle('offline', !state.connected);
}
function render() {
  renderShell();
  if (state.loading) { $('#main').innerHTML = '<div class="loading">正在读取工作空间…</div>'; return; }
  const needsRun = taskViews.includes(state.view);
  if (needsRun && !state.snapshot) { $('#main').innerHTML = '<div class="loading">正在读取此任务…</div>'; return; }
  const body = (state.view === 'simulations' ? offlineCreationPanel() : '') + ({ task: taskOverview, create_users: creatorView, users: usersView, simulations, plans, sequence, memories, calls, apps: appsView, gui_lab: guiLabView, v05: () => offlineExecutionView(state.snapshot, busy()) }[state.view])();
  $('#main').innerHTML = (needsRun ? taskHeader() : '') + head() + (state.view === 'calls' ? traceFilter() : '') + body;
}
function taskHeader() {
  const s = state.snapshot;
  return `<div class="task-context"><button class="row-action back-link" data-view="simulations">← 返回仿真任务</button><div class="task-context-title"><div><p class="eyebrow">SIMULATION WORKSPACE</p><h1>${esc(s.config.experiment_name ?? s.id)}</h1></div>${phaseBadge(titleStatus(s))}</div><div class="task-meta">${sourceBadge(s.config.mode)}<span>${s.users.length} 位固定用户</span><span>${esc(s.config.virtual_start_date)} → ${esc(s.config.virtual_end_date)} · ${days(s.config)} 天</span><span>${s.config.apps.map(a => esc(app(a.app_id).name)).join(' / ')}</span><button class="row-action" data-action="run-config">配置与用户快照 ↗</button></div><nav class="task-tabs" aria-label="任务内导航">${taskViews.map((v, i) => `<button class="${state.view === v ? 'selected' : ''} ${v === 'calls' ? 'diagnostic' : ''}" data-view="${v}" aria-current="${state.view === v ? 'page' : 'false'}">${i > 0 && i < 4 ? '<span class="stage-arrow" aria-hidden="true">→</span>' : ''}${icon(v === 'task' ? 'overview' : v)}${tabNames[v]}</button>`).join('')}</nav></div>`;
}
function taskOverview() {
  const s = state.snapshot;
  return `${jobLine(s)}<div class="grid-two">${currentSimulation(s)}${clockPanel(s)}</div><div class="task-stage-cards">${[['plans', '01', '行为规划', s.plans.length + ' 个已保存版本', '按需请求当日计划，保留调整依据'], ['sequence', '02', '执行记录', s.status.results + ' 项活动 · ' + s.status.screenshot_count + ' 张图像', '查看实际操作、结果与截图'], ['memories', '03', '生成记忆', (s.status.descriptions.find(d => d.status === 'complete')?.count ?? 0) + ' 条观察文字', '从每张截图追溯转文字原文']].map(([v, n, label, count, help]) => `<button class="stage-card" data-view="${v}"><span>${n} / ${label} →</span><strong>${count}</strong><small>${help}</small></button>`).join('')}</div><section class="panel"><div class="panel-head"><div><h3>数据与运行工具</h3><p>工具只作用于上方明确标识的这一项仿真任务</p></div><button class="row-action" data-view="calls">调用调试 →</button></div><div class="panel-body"><div class="actions"><button class="button small" data-job="retry_descriptions" ${busy() ? 'disabled' : ''}>补齐观察文字</button><button class="button small" data-job="export" ${busy() ? 'disabled' : ''}>导出数据</button><button class="button small" data-job="check" ${busy() ? 'disabled' : ''}>完整性检查</button></div><p class="hint">${s.report ? '最近检查：' + (s.report.integrity_passed ? '来源完整性通过' : s.report.issues.length + ' 个缺项') + '；' + esc(s.report.generated_at) + '。继续生成后需重新检查。' : '尚未生成检查报告。执行和观察文字有独立进度，原始文字与加工文本分别保存。'}</p><div class="download-links">${s.files.map(file => `<a href="${route('/files/' + file)}" download>${file} ↗</a>`).join('')}</div><details class="test-options"><summary>开发验证与恢复</summary><p class="hint">仅用于 Mock 任务，调用记录与中断证据均保存。</p><button class="button small" data-job="interrupt" ${busy() ? 'disabled' : ''}>动作记录后中断演练</button>${active(s.job) ? '<button class="button small" data-action="force-stop">立即停止子进程</button>' : ''}</details></div></section>`;
}
function currentSimulation(s) {
  const completeDays = doneDays(s), total = expected(s);
  const texts = s.status.descriptions.find(d => d.status === 'complete')?.count ?? 0;
  return `<section class="panel current-sim"><div class="task-title"><h2>执行推进</h2><span class="tag live">持久化进度</span></div><div class="task-progress"><div class="progress-label"><span>用户日推进进度</span><strong>${completeDays} / ${total} 用户日</strong></div><progress max="${total}" value="${completeDays}"></progress></div><div class="run-microstats"><span>已结束活动<strong>${s.status.results}</strong></span><span>已保存图像<strong>${s.status.screenshot_count}</strong></span><span>已生成观察文字<strong>${texts}<small class="hint"> / ${s.status.screenshot_count}</small></strong></span></div>${controls(s)}<p class="hint">一次推进一天指当前用户的一个虚拟日；调度器优先完成同一用户的区间。</p></section>`;
}
function clockPanel(s) {
  const clocks = s.users.map(u => ({ user_id: u.user_id, virtual_date: s.config.virtual_start_date, virtual_time: `${s.config.virtual_start_date}T00:00`, phase: 'waiting', ...s.status.virtual_clocks.find(c => c.user_id === u.user_id) }));
  const current = clocks.find(c => c.phase !== 'finished') ?? clocks.at(-1);
  return `<section class="panel clock-panel"><div class="panel-head"><h3>虚拟时间管理</h3><span class="tag live">压缩推进</span></div><div class="clock-display"><div class="clock-user"><span>${esc(userName(current.user_id))}</span>${phaseBadge(current.phase)}</div><div class="clock-date">${esc(current.virtual_time.replace('T', ' '))}</div><p class="hint">虚拟活动锚点与真实采集时间独立保存。日期之间无须等待，日终 23:59 是管理边界。</p></div><div class="clock-list">${clocks.slice(0, 3).map(c => `<div class="clock-row"><strong>${esc(userName(c.user_id))}</strong><span>${esc(c.virtual_date)}</span>${phaseBadge(c.phase)}</div>`).join('')}</div></section>`;
}
function controls(s) {
  const finished = doneDays(s) >= expected(s), disabled = busy() || finished ? 'disabled' : '';
  return `<div class="actions"><button class="button primary" data-job="run" ${disabled}>${icon('play')} ${finished ? '活动区间已结束' : s.status.results ? '继续生成' : '开始生成'}</button><button class="button" data-job="next_day" ${disabled}>${icon('clock')} 推进一天</button><button class="button" data-job="next_activity" ${disabled}>下一活动 →</button>${active(s.job) && s.status.workers.some(w => w.name === 'execution' && w.alive) ? `<button class="button warning" data-action="pause" ${s.status.pause_requested ? 'disabled' : ''}>${s.status.pause_requested ? '等待活动结束…' : '暂停任务'}</button>` : ''}</div>`;
}
function usersView() {
  const groups = [...new Set(state.library.users.map(u => u.requirements?.cohort_name).filter(Boolean))];
  const query = state.librarySearch.trim().toLowerCase();
  const users = state.library.users.filter(u => (!state.libraryGroup || u.requirements?.cohort_name === state.libraryGroup) && (!query || JSON.stringify([u.persona, u.requirements?.cohort_name]).toLowerCase().includes(query)));
  const drafts = state.library.batches.filter(b => b.status === 'draft');
  return `<div class="workflow-intro"><div><span class="tag live">第一步 / 固定人设</span><h3>先确认用户，再带入仿真</h3><p>用户独立于任务保存。选择已入库用户，即可配置时间跨度和可用 APP。</p></div><button class="button" data-action="simulate-selected" ${state.selectedUsers.size ? '' : 'disabled'}>用已选 ${state.selectedUsers.size} 位创建仿真 →</button></div>${drafts.length ? `<details class="draft-list panel"><summary>待确认候选 · ${drafts.length} 个批次 <span>候选已保存，尚未进入用户库</span></summary>${drafts.slice(0, 10).map(b => `<div class="draft-row"><div><strong>${esc(b.requirements?.cohort_name || '未命名候选')}</strong><small>${b.requested_count} 位 · ${esc(new Date(b.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Hong_Kong', hour12: false }))}</small></div><button class="row-action" data-draft="${esc(b.id)}">继续检查 →</button></div>`).join('')}</details>` : ''}<div class="filterbar library-filters"><label for="library-search" class="sr-only">搜索用户</label><input id="library-search" placeholder="搜索名称、城市、职业或兴趣" value="${esc(state.librarySearch)}"><label class="sr-only" for="library-group">用户分组</label><select id="library-group"><option value="">全部分组</option>${groups.map(group => `<option value="${esc(group)}" ${state.libraryGroup === group ? 'selected' : ''}>${esc(group)}</option>`).join('')}</select><span class="result-count">${users.length} / ${state.library.users.length} 位已入库用户</span>${state.selectedUsers.size ? '<button class="row-action" data-action="clear-selected-users">清空选择</button>' : ''}</div>${users.length ? `<div class="user-grid">${users.map((u, i) => { const p = persona(u), uses = state.runs.filter(r => r.config?.users.some(x => x.source_user_id === u.user_id)).length; return `<article class="user-card ${state.selectedUsers.has(u.user_id) ? 'picked' : ''}"><div class="user-card-selection"><label class="inline-check"><input type="checkbox" data-pick-user="${esc(u.user_id)}" ${state.selectedUsers.has(u.user_id) ? 'checked' : ''}> 选择此用户</label>${sourceBadge(u.provenance.mode)}</div><div class="user-card-top">${avatar(u, i)}<div><h3>${esc(p.name ?? p.label)}</h3><span class="identity">${p.age ? esc(p.age) + ' 岁 · ' : ''}${esc(p.city || '城市未指定')} · ${esc(p.occupation || '角色未指定')}</span></div></div><div class="interest-tags">${(p.interests ?? []).map(tag => `<span>${esc(tag)}</span>`).join('')}</div><p class="user-summary">${esc(p.summary || p.life_context || '固定人设，查看详情可追溯原始要求。')}</p><div class="cohort-label">${esc(u.requirements?.cohort_name || '未分组')}</div><div class="user-card-foot"><span>${uses} 个任务使用 · 固定快照</span><button class="row-action" data-user="${u.user_id}">查看人设 →</button></div></article>`; }).join('')}</div>` : `<section class="panel">${empty(state.library.users.length ? '没有匹配的用户' : '创建第一位虚拟用户', '可以辅助生成一组候选后检查入库，也可以手动设定一位基准用户。', 'new-users', '＋ 创建用户')}</section>`}<p class="hint">用户库保持独立。人设修改在候选确认时完成；已有任务使用创建时的固定快照。辅助内容标记 Mock，手动设定单独标记来源。</p>`;
}
function simulations() {
  const runs = state.runs.filter(r => !r.error);
  return `<div class="workflow-intro"><div><span class="tag live">第二步 / 行为仿真</span><h3>一个任务，一条完整的数据生产路径</h3><p>选择已确认用户与仿真区间，进入任务后按「规划 → 执行 → 观察文字」查看进度。</p></div><button class="row-action" data-view="users">管理用户库 →</button></div><section class="panel"><div class="panel-head"><div><h3>仿真任务</h3><p>每个任务拥有独立的用户快照、时间进度、规划与来源记录</p></div><span class="tag">${runs.length} 项</span></div>${runs.length ? `<div class="simulation-list">${runs.map(r => { const count = days(r.config) * r.config.users.length, done = r.status.dataset_complete ? count : r.status.schedule_days.filter(d => d.status === 'complete').length; return `<article class="simulation-row"><div class="simulation-row-main"><span class="simulation-icon">${icon('simulations')}</span><div><button class="task-name" data-run="${esc(r.id)}">${esc(r.config.experiment_name ?? r.id)}</button><p>${r.config.users.length} 位用户 · ${esc(r.config.virtual_start_date)} → ${esc(r.config.virtual_end_date)} · ${days(r.config)} 天</p><div class="app-list">${r.config.apps.slice(0, 6).map(a => appMark(a.app_id)).join('')}<span>${r.status.results} 项已执行活动</span></div></div></div><div class="simulation-row-progress"><div>${phaseBadge(active(r.job) ? 'running' : r.status.dataset_complete ? 'completed' : r.job?.status === 'paused' ? 'paused' : r.status.results ? 'ready' : 'unplanned')}<span>${done} / ${count} 用户日</span></div><progress max="${count}" value="${done}"></progress></div><button class="button small" data-run="${esc(r.id)}">进入任务 →</button></article>`; }).join('')}</div>` : empty('尚未创建仿真任务', '先确认用户，再配置日期跨度与可用 APP。', 'new-simulation')}</section>`;
}
function jobLine(s) {
  if (!s.job) return '';
  const job = s.job;
  return `<div class="job-line ${['failed', 'interrupted', 'stopped'].includes(job.status) ? 'error' : ''}">${active(job) ? '<i class="spinner"></i>' : icon('check')}<span>${esc(actionNames[job.action] ?? job.action)} · ${esc(names[job.status] ?? job.status)}${job.error ? `：${esc(job.error)}` : ''}</span><div class="call-stages">${job.stages.map(stage => `<span>${esc(({ plan: '规划', execute: '执行与反馈', describe: '文字生成', export: '导出', check: '检查' })[stage.name] ?? stage.name)} ${stage.status === 'completed' ? '✓' : ''}</span>`).join('')}</div></div>`;
}
function activitiesTable(items) {
  const s = state.snapshot;
  return items.length ? `<div class="table-scroll"><table><thead><tr><th>虚拟时间</th><th>用户 / APP</th><th>活动目标</th><th>实际 / 计划对象</th><th>状态</th><th></th></tr></thead><tbody>${items.map(a => { const result = s.results.find(r => r.activity_id === a.id)?.result; return `<tr><td>${esc(a.virtual_start.slice(11))}<span class="table-sub">${esc(a.virtual_date)}</span></td><td>${esc(userName(a.user_id))}<span class="table-sub">${esc(app(a.app_id).name)}</span></td><td class="cell-wrap">${esc(a.task.goal)}</td><td>${result?.completed_count ?? '—'} / ${a.task.workload.object_count}</td><td>${phaseBadge(a.status)}</td><td><button class="row-action" data-activity="${esc(a.id)}">详情 →</button></td></tr>`; }).join('')}</tbody></table></div>` : empty('尚无已结束的活动', '规划不会直接写成事实；执行结果保存后才会出现在这里。');
}
function plans() {
  const s = state.snapshot;
  let records = filters(s.plans);
  if (!state.history) records = records.filter(p => !s.plans.some(other => other.user_id === p.user_id && other.virtual_date === p.virtual_date && other.version > p.version));
  return `${filterbar({ history: true })}<div class="notice"><span class="tag live">按日调度</span><span>长区间按当前进度逐日请求上层；尚未到达的日期没有虚构计划。筛选只影响展示，不改变调度顺序。</span></div>${records.map(plan => `<section class="plan-day"><div class="plan-day-head"><div><h3>${esc(plan.virtual_date)} <small>${esc(userName(plan.user_id))} · ${plan.tasks.length} 项活动</small></h3></div><div><span class="tag">${plan.version === 1 ? '初始基线' : '局部修订'} v${plan.version}</span><button class="row-action" data-plan="${esc(plan.id)}">模型规划内容 ↗</button></div></div>${plan.tasks.map(task => { const a = s.activities.find(a => a.id === task.activity_id); const result = s.results.find(r => r.activity_id === task.activity_id)?.result; return `<div class="plan-task"><time>${esc(task.virtual_start.slice(11))}</time><div><h3>${esc(task.goal)}</h3><p class="hint">${esc(app(task.app_id).name)} · ${esc(task.end_condition)}</p></div><div class="plan-quantity">计划 <strong>${task.workload.object_count}</strong><p>实际 <strong>${result?.completed_count ?? '—'}</strong></p></div><button class="row-action" data-activity="${esc(task.activity_id)}">${a?.status === 'superseded' ? '已替代' : names[a?.status] ?? '查看'} →</button></div>`; }).join('')}<div class="plan-note">${sourceBadge('mock')} ${esc(typeof plan.basis.output === 'string' ? plan.basis.output : plan.basis.output?.summary ?? plan.basis.decision?.reason ?? '规划响应已保存，点击查看对应请求与响应。')}</div></section>`).join('') || `<section class="panel">${empty('当前范围尚未生成计划', '点击右上角生成当前待执行日的计划，不会启动手机执行。')}</section>`}<div class="stage-next"><button class="row-action" data-view="task">← 运行总览</button><button class="button" data-view="sequence">查看执行与截图 →</button></div>`;
}
function sequence() {
  const s = state.snapshot; const activities = filteredActivities(true); const page = activities.slice((state.page - 1) * 20, state.page * 20);
  return `${filterbar({ apps: true })}${jobLine(s)}<div class="execution-actions panel"><div class="panel-body">${controls(s)}<p class="hint">操作作用于本任务的下一个待执行活动，遵循用户与虚拟时间顺序；筛选仅控制显示。</p></div></div><section class="panel"><div class="panel-head"><h3>已保存行为序列 <span class="tag">${activities.length} 项活动</span></h3><span class="tag mock">执行内容 Mock</span></div>${page.length ? `<div class="sequence">${page.map(a => { const result = s.results.find(r => r.activity_id === a.id).result; const images = s.events.filter(e => e.activity_id === a.id); return `<article class="sequence-item"><time class="sequence-time">${esc(a.virtual_start.slice(11))}<small>${esc(a.virtual_date)}</small></time><div><div class="sequence-title">${appMark(a.app_id)}<strong>${esc(a.task.goal)}</strong>${phaseBadge(result.status)}</div><div class="sequence-body">${esc(userName(a.user_id))} · ${esc(app(a.app_id).name)}<br>实际完成 ${result.completed_count} 个对象 / 计划 ${a.task.workload.object_count} 个；${esc(result.end_reason)}</div><div class="sequence-bottom"><span>${images.length} 张图像</span><span>${images.filter(e => e.description.status === 'complete').length} 条观察文字</span><button class="row-action" data-activity="${esc(a.id)}">操作与截图 →</button></div></div></article>`; }).join('')}</div>` : empty('尚未生成行为序列', '从仿真任务开始或推进一个用户日，结果保存后即可查看。')}</section>${pagination(activities.length, 20)}<div class="stage-next"><button class="row-action" data-view="plans">← 查看行为规划</button><button class="button" data-view="memories">查看生成记忆 →</button></div>`;
}
function memories() {
  const s = state.snapshot;
  const records = filters(s.events).filter(e => state.memoryStatus === 'all' || (state.memoryStatus === 'complete' ? e.description.status === 'complete' : e.description.status !== 'complete'));
  const page = records.slice((state.page - 1) * 12, state.page * 12);
  return `${filterbar({ apps: true, memory: true })}<div class="notice"><span class="tag">观察原文</span><span>此处“记忆”指截图转文字的上游观察记录；每张图单独保留，不做偏好提取、融合或检索。同一对象可有动作前后两条记录。</span><button class="row-action" data-job="retry_descriptions" ${busy() ? 'disabled' : ''}>补齐文字 →</button></div><div class="memory-grid">${page.map(e => `<article class="memory-card"><div class="memory-top">${userInline(e.user_id)}<span>${phaseBadge(e.description.status)} ${sourceBadge(e.description.provenance?.mode ?? 'mock')}</span></div><p class="memory-text ${e.description.raw_text ? '' : 'pending'}">${esc(e.description.raw_text ?? '尚未生成原始文字。')}${e.description.error ? `<br><span class="text-error">错误：${esc(e.description.error)}</span>` : ''}</p><div class="memory-foot"><img loading="lazy" src="${screenshotUrl(e.screenshot.id)}" alt="Mock 来源图像"><p><strong>${esc(app(e.planned_task.app_id).name)} · ${e.screenshot.phase === 'before' ? '动作前' : '动作后'}</strong><br>${esc(e.virtual_time.replace('T', ' '))}</p><button class="row-action" data-screen="${esc(e.event_id)}">查看来源 ↗</button></div></article>`).join('')}</div>${!records.length ? `<section class="panel">${empty('当前范围没有观察文字', '先生成行为序列，或切换状态筛选；失败项可以从已保存截图补跑。')}</section>` : ''}${pagination(records.length, 12)}`;
}
function pagination(total, size) { const pages = Math.ceil(total / size); return pages > 1 ? `<div class="pagination"><button class="button small" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>上一页</button><span>${state.page} / ${pages} 页 · ${total} 条</span><button class="button small" data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>下一页</button></div>` : ''; }
function calls() {
  const s = state.snapshot; const records = filters(s.calls).filter(c => !state.trace || c.trace_id === state.trace).sort((a, b) => b.started_at.localeCompare(a.started_at)); const page = records.slice((state.page - 1) * 35, state.page * 35);
  return `${filterbar()}<section class="panel"><div class="panel-head"><h3>模块运行边界</h3><span class="tag">可替换适配器</span></div><div class="panel-body module-grid">${state.system.modules.map(m => `<div class="module-card"><span>${esc(m.name)}</span>${sourceBadge(m.mode)}</div>`).join('')}</div></section><section class="panel"><div class="panel-head"><div><h3>实际调用记录</h3><p>共 ${s.call_count} 次调用 · 当前载入最近 ${s.calls.length} 条，点击查看请求、响应与父调用</p></div><span class="tag live">持久化 Trace</span></div>${page.map(c => { const duration = c.finished_at ? `${Date.parse(c.finished_at) - Date.parse(c.started_at)} ms` : '进行中'; return `<div class="call-row ${c.parent_id ? 'child' : ''}"><span class="call-time">${esc(new Date(c.started_at).toLocaleTimeString('zh-CN', { hour12: false }))}</span><button class="row-action call-operation" data-call="${esc(c.id)}">${esc(c.operation)}<small>${esc(moduleNames[c.module] ?? c.module)}${c.user_id ? ` · ${esc(userName(c.user_id))}` : ''}</small></button>${sourceBadge(c.mode)}<span>${phaseBadge(c.status)}</span><span>${duration}</span></div>`; }).join('') || empty('还没有运行调用', '生成用户、请求当日计划或推进活动后，对应调用将真实记录。')}</section>${pagination(records.length, 35)}`;
}
function traceFilter() {
  const s = state.snapshot, ids = [...new Set(s.calls.map(c => c.trace_id))];
  return `<div class="filterbar"><label for="filter-trace" class="hint">调用链</label><select id="filter-trace"><option value="">全部调用链</option>${ids.map(id => { const root = s.calls.find(c => c.id === id), any = s.calls.find(c => c.trace_id === id); return `<option value="${esc(id)}" ${state.trace === id ? 'selected' : ''}>${esc(root?.operation ?? '历史 Trace')} · ${esc(new Date(any.started_at).toLocaleTimeString('zh-CN', { hour12: false }))}</option>`; }).join('')}</select><span class="hint">同一 Trace 关联一次调度及其模型、执行与描述调用；父调用可在详情中追溯。</span></div>`;
}
function appsView() {
  return `<section class="panel settings-lab-entry"><div><h3>v0.4 · 真机任务测试</h3><p>自选框架与模型、记录起点、输入任务，查看真实截图、动作、调用量和组合对比。最终框架尚未选定。</p></div><a class="button primary" href="/phone-lab">进入真机测试 →</a></section><section class="panel settings-lab-entry"><div><h3>Mock 工程验证</h3><p>检查调度、记录和故障处理；合成夹具与真实手机结果分别保存。</p></div><button class="button" data-view="gui_lab">进入 Mock 验证台 →</button></section>${modelSettingsView()}<details class="panel settings-app-catalog"><summary>APP 能力目录与模块状态 <span>展开查看</span></summary><div class="panel-body">${appCatalogView()}</div></details>`;
}
function appCatalogView() {
  return `<div class="notice"><span class="tag mock">手机与模型未接入</span><span>这些是指定 APP 的候选能力配置，供规划范围约束使用；当前没有连接真机，也没有把手机操作 API 视为完整手机 Agent。</span></div><div class="app-grid">${state.system.apps.map(a => `<article class="app-card"><div class="app-card-top">${appMark(a.app_id)}<div><h3>${esc(a.name)}</h3><small>${esc(a.category)}</small></div><span class="tag mock">Mock</span></div><div class="capabilities">${a.capabilities.map(cap => `<span>${esc(cap)}</span>`).join('')}</div><p>能力方案待真实接入验证<br>已被 ${state.runs.filter(r => r.config?.apps.some(x => x.app_id === a.app_id)).length} 个仿真任务选用</p><div class="user-card-foot"><span>手机接口 · 未接入</span><span>页面决策 · Mock</span></div></article>`).join('')}</div><section class="panel detail-section"><div class="panel-head"><h3>模块适配器</h3><span class="tag">任务内查看调用调试</span></div><div class="panel-body module-grid">${state.system.modules.map(m => `<div class="module-card"><span>${esc(m.name)}</span>${sourceBadge(m.mode)}</div>`).join('')}</div></section>`;
}

const filterKeys = ['user', 'date', 'app', 'trace', 'history', 'memoryStatus', 'page'];
function rememberFilters() { if (taskViews.includes(state.view)) state.filtersByView[`${state.run}/${state.view}`] = Object.fromEntries(filterKeys.map(key => [key, state[key]])); }
function restoreFilters() { Object.assign(state, { user: '', date: '', app: '', trace: '', history: false, memoryStatus: 'complete', page: 1 }, state.filtersByView[`${state.run}/${state.view}`] ?? {}); }
function routeHash() { return taskViews.includes(state.view) ? `#/tasks/${encodeURIComponent(state.run)}/${state.view}` : state.view === 'create_users' ? '#/users/new' : state.view === 'gui_lab' ? '#/settings/gui-lab' : state.view === 'apps' ? '#/settings' : `#/${state.view === 'simulations' ? 'tasks' : 'users'}`; }
function saveRoute() { const hash = routeHash(); if (location.hash !== hash) location.hash = hash; }
function navigate(view) {
  if (!views[view]) return;
  if (taskViews.includes(view) && !state.run) view = 'simulations';
  rememberFilters(); state.view = view; restoreFilters();
  if (!taskViews.includes(view)) state.snapshot = null;
  saveRoute(); render(); if (taskViews.includes(view) && !state.snapshot) void refresh();
}
async function selectRun(id, view) {
  rememberFilters();
  state.run = id; state.snapshot = null; state.user = ''; state.date = ''; state.app = ''; state.trace = ''; state.page = 1;
  state.view = taskViews.includes(view) ? view : 'task'; restoreFilters(); saveRoute();
  try { localStorage.setItem('behaviorlab_product_run', id); } catch { /* optional preference */ }
  render(); await refresh();
}
function refresh() {
  if (state.polling) return refreshPromise.then(refresh);
  refreshPromise = performRefresh(); return refreshPromise;
}
async function performRefresh() {
  state.polling = true;
  try {
    const before = JSON.stringify([state.runs, state.library, state.snapshot, state.system, state.connected]);
    const selectionAtStart = state.run;
    const [system, library, { runs }] = await Promise.all([api('/api/system'), api('/api/users'), api('/api/runs')]);
    state.system = system; state.library = library; state.runs = runs;
    if (selectionAtStart === state.run && taskViews.includes(state.view) && !runs.some(r => r.id === state.run && !r.error)) { state.run = ''; state.view = 'simulations'; state.snapshot = null; saveRoute(); toast('任务不存在，已返回任务列表', true); }
    const selected = state.run;
    if (selected && taskViews.includes(state.view)) { const snapshot = await api(`/api/runs/${encodeURIComponent(selected)}`); if (selected === state.run && taskViews.includes(state.view)) state.snapshot = snapshot; }
    state.connected = true; const first = state.loading; state.loading = false;
    if (['create_users', 'apps', 'gui_lab'].includes(state.view)) renderShell();
    else if (first || before !== JSON.stringify([state.runs, state.library, state.snapshot, state.system, state.connected])) render();
    else renderShell();
  } catch (error) { if (state.connected) toast(`连接失败：${error.message}`, true); state.connected = false; state.loading = false; renderShell(); }
  finally { state.polling = false; clearTimeout(pollTimer); pollTimer = setTimeout(refresh, active(state.snapshot?.job) ? 500 : 2000); }
}
async function startJob(action) {
  if (!state.run || busy()) return;
  state.submitting = true; render();
  try { await api(route('/jobs'), { action }); if (action === 'plan_next') { state.user = ''; state.date = ''; } toast(`${actionNames[action] ?? action}已提交`); }
  catch (error) { toast(error.message, true); }
  finally { state.submitting = false; render(); await refresh(); }
}
function showDialog(html) { $('#detail-content').innerHTML = html; if (!$('#detail-dialog').open) $('#detail-dialog').showModal(); }
function detailHeader(title, eyebrow = 'SOURCE & EVIDENCE') { return `<div class="dialog-head"><div><p class="eyebrow">${eyebrow}</p><h2>${esc(title)}</h2></div><button class="close" data-close="detail-dialog" aria-label="关闭">×</button></div>`; }
function openUser(id) {
  const u = state.library.users.find(u => u.user_id === id); if (!u) return;
  const p = u.persona, used = state.runs.filter(r => r.config?.users.some(x => x.source_user_id === id)), call = state.library.calls.find(c => c.id === u.provenance.call_id);
  showDialog(`${detailHeader(p.name ?? id, 'VIRTUAL USER PROFILE')}<div class="notice">${sourceBadge(u.provenance.mode)}<span>${u.provenance.mode === 'user' ? '此人设由用户手动设定，未调用人设生成模型。' : '辅助内容来自 Mock 适配器；确认的人设、生成原稿及人工调整分别保留。'}</span></div><dl class="label-value"><dt>分组</dt><dd>${esc(u.requirements?.cohort_name || '未分组')}</dd><dt>基本背景</dt><dd>${esc([p.age && p.age + ' 岁', p.city, p.occupation].filter(Boolean).join(' · ') || '未指定')}</dd><dt>兴趣</dt><dd>${esc(p.interests?.join(' / ') || '未指定')}</dd><dt>生活习惯</dt><dd>${esc(p.life_context || '未指定')}</dd><dt>人设简述</dt><dd>${esc(p.summary || '未指定')}</dd></dl><section class="detail-section"><h3>已使用此用户的任务 · ${used.length}</h3>${used.map(r => `<button class="button small" data-run="${esc(r.id)}">${esc(r.config.experiment_name ?? r.id)} →</button>`).join('') || '<p class="hint">尚未用于仿真。可从用户库勾选后创建任务。</p>'}</section><section class="detail-section"><details><summary>原始条件与固定人设</summary><pre class="json">${pretty({ requirements: u.requirements, persona: p })}</pre></details></section><section class="detail-section"><details><summary>生成原稿、人工修改与调用来源</summary><pre class="json">${pretty({ user_id: u.user_id, batch_id: u.batch_id, provenance: u.provenance, generation_call: call, created_at: u.created_at })}</pre></details></section>`);
}
function openPlan(id) {
  const p = state.snapshot.plans.find(p => p.id === id); if (!p) return;
  showDialog(`${detailHeader('每日规划 · 请求与响应', 'UPPER PLANNER / MOCK RESPONSE')}<p class="hint">${esc(p.virtual_date)} · ${esc(userName(p.user_id))} · v${p.version} ${sourceBadge('mock')}</p><h3>上层输出与决策依据</h3><pre class="json">${pretty({ tasks: p.tasks, basis: p.basis })}</pre><section class="detail-section"><h3>规划输入：固定人设、有限近期实际与当天计划</h3><pre class="json">${pretty(p.context)}</pre></section>`);
}
function openActivity(id) {
  const s = state.snapshot, a = s.activities.find(a => a.id === id); if (!a) return;
  const result = s.results.find(r => r.activity_id === id), decision = s.decisions.find(d => d.activity_id === id), images = s.events.filter(e => e.activity_id === id);
  showDialog(`${detailHeader(a.task.goal, 'ACTIVITY / PLAN & ACTUAL')}<p class="hint">${esc(userName(a.user_id))} · ${esc(a.virtual_start)} · ${esc(app(a.app_id).name)} ${phaseBadge(a.status)} ${sourceBadge('mock')}</p><div class="details-grid"><section><h3>原计划</h3><pre class="json">${pretty(a.task)}</pre></section><section><h3>已保存的实际结果</h3><pre class="json">${pretty(result?.result ?? '尚未产生实际结果；计划数量不是已完成事实。')}</pre></section></div><section class="detail-section"><h3>活动后调整决定</h3><pre class="json">${pretty(decision?.decision ?? '尚未产生调整决定')}</pre></section><section class="detail-section"><h3>手机指令与观察来源 ${sourceBadge('mock')}</h3><p class="hint">具体页面理解和手机指令由 Mock 执行器返回，不表示已接通 hipyum。</p><pre class="json">${pretty(images.filter(e => e.screenshot.phase === 'before').map(e => ({ step_id: e.step_id, action: e.action })))}</pre></section><section class="detail-section"><h3>生成截图 · ${images.length} 张 ${sourceBadge('mock')}</h3><div class="screenshot-gallery">${images.map(e => `<button class="screenshot-button" data-screen="${esc(e.event_id)}"><img src="${screenshotUrl(e.screenshot.id)}" alt="Mock 合成截图"><span>步骤 ${e.order[3] + 1} · ${e.screenshot.phase}<br>${esc(names[e.description.status])}</span></button>`).join('')}</div></section>`);
}
function openScreen(id) {
  const s = state.snapshot, e = s.events.find(e => e.event_id === id); if (!e) return;
  showDialog(`${detailHeader('截图与观察原文', 'IMAGE / TEXT OBSERVATION')}<div class="image-evidence"><img class="detail-image" src="${screenshotUrl(e.screenshot.id)}" alt="带 Mock 标识的合成截图"><div><p>${sourceBadge('mock')} ${phaseBadge(e.description.status)}</p><dl class="label-value"><dt>用户</dt><dd>${esc(userName(e.user_id))}</dd><dt>虚拟活动时间</dt><dd>${esc(e.virtual_time)} · ${esc(e.virtual_timezone)}</dd><dt>真实采集时间</dt><dd>${esc(e.screenshot.real_captured_at)}</dd><dt>转文字处理时间</dt><dd>${esc(e.description.real_processed_at ?? '尚未处理')}</dd><dt>模型 / 提示版本</dt><dd>${esc(e.description.model ?? '—')} / ${esc(e.description.prompt_version ?? '—')}</dd><dt>动作关联</dt><dd>${esc(e.screenshot.phase)} · 步骤 ${e.order[3] + 1}</dd></dl></div></div><section class="detail-section"><h3>原始观察文字</h3><div class="raw-text">${esc(e.description.raw_text ?? '尚未生成原始文字')}</div>${e.description.error ? `<p class="text-error">错误：${esc(e.description.error)}</p>` : ''}</section><section class="detail-section"><h3>加工文本与依据（独立保存）</h3><pre class="json">${pretty(e.processed_texts.length ? e.processed_texts : '无加工文本')}</pre></section><section class="detail-section"><h3>描述尝试与错误历史</h3><pre class="json">${pretty(s.description_history.filter(h => h.screenshot_id === e.screenshot.id))}</pre></section><section class="detail-section"><h3>来源与哈希</h3><pre class="json">${pretty(e.screenshot)}</pre></section>`);
}
async function openCall(id) {
  try { const c = await api(route(`/calls/${encodeURIComponent(id)}`)); showDialog(`${detailHeader(c.operation, 'PERSISTED CALL TRACE')}<p class="hint">${sourceBadge(c.mode)} ${phaseBadge(c.status)} · ${esc(moduleNames[c.module] ?? c.module)}</p><dl class="label-value"><dt>Trace ID</dt><dd class="mono">${esc(c.trace_id)}</dd><dt>调用 ID</dt><dd class="mono">${esc(c.id)}</dd><dt>父调用</dt><dd class="mono">${esc(c.parent_id ?? '根调用')}</dd><dt>真实起止时间</dt><dd>${esc(c.started_at)} → ${esc(c.finished_at ?? '运行中')}</dd></dl>${c.error ? `<p class="text-error">${esc(c.error)}</p>` : ''}<div class="details-grid"><section><h3>实际请求</h3><pre class="json">${pretty(c.input)}</pre></section><section><h3>实际返回 ${c.mode === 'mock' ? sourceBadge('mock') : ''}</h3><pre class="json">${pretty(c.output)}</pre></section></div>`); } catch (error) { toast(error.message, true); }
}
function openNewSimulation(selectedIds) {
  if (!state.library.users.length) { toast('请先创建并确认至少一位虚拟用户'); startCreator(); navigate('create_users'); return; }
  const form = $('#simulation-form'); form.elements.name.value = '日常生活行为 · 第一组'; form.elements.start_date.value = '2026-01-01'; form.elements.duration_days.value = '7';
  $('#profile-picker').innerHTML = state.library.users.map((u, i) => `<label class="profile-option"><input type="checkbox" name="user_ids" value="${u.user_id}" ${(selectedIds ? selectedIds.has(u.user_id) : i < 2) ? 'checked' : ''}>${avatar(u, i, true)}<span><strong>${esc(persona(u).name ?? u.user_id)}</strong><small>${esc(persona(u).city)} · ${esc((persona(u).interests ?? []).slice(0, 2).join(' / '))}</small></span></label>`).join('');
  $('#app-picker').innerHTML = state.system.apps.map(a => `<label class="app-option"><input name="app_ids" type="checkbox" value="${a.app_id}" ${a.suggested ? '' : 'checked'}>${appMark(a.app_id)}${esc(a.name)}${a.suggested ? '（候选）' : ''}</label>`).join('');
  form.querySelector('.form-error').textContent = ''; updateSpan(); $('#simulation-dialog').showModal();
}
function updateSpan() {
  const form = $('#simulation-form'), n = Number(form.elements.duration_days.value), start = form.elements.start_date.value;
  const count = form.querySelectorAll('[name=user_ids]:checked').length;
  document.querySelectorAll('[data-days]').forEach(button => button.classList.toggle('selected', Number(button.dataset.days) === n));
  try { const end = new Date(Date.parse(start) + (n - 1) * 86400000).toISOString().slice(0, 10); $('#span-summary').textContent = `${start} → ${end}，共 ${n} 个虚拟日 × ${count} 位用户 = ${n * count} 个用户日。时间区间只约束调度，未来计划按需生成。`; }
  catch { $('#span-summary').textContent = '请填写有效日期与正整数天数。'; }
}
function integrationInfo() { showDialog(`${detailHeader('真实接入进度', 'INTEGRATION STATUS')}<div class="panel-body"><h3>鸿蒙手机与首批 APP</h3><p class="hint">已明确鸿蒙 NEXT，计划使用鸿蒙 6 或 7，可连接 Windows 并允许调试。系统 APP 与常用 APP 都纳入首测；具体型号、版本与活动逐步确定。</p><h3>模型服务</h3><p class="hint">允许测试截图使用外部模型服务。可以在系统设置保存地址、模型名、鉴权与角色预设；当前只检查配置完整性，真实调用尚未接入。</p><h3>GUI 框架与手机控制</h3><p class="hint">开源框架正在选型，由用户最终决策。原生 SDK 与 hipyum 两条路线继续比较；只有手机操作 API 不代表已有完整 Agent。</p></div>`); }

document.addEventListener('click', async event => {
  const target = event.target.closest('button'); if (!target || target.disabled) return;
  if (target.dataset.close) { $(`#${target.dataset.close}`).close(); return; }
  if (target.dataset.view) { navigate(target.dataset.view); return; }
  if (target.dataset.run) { if ($('#detail-dialog').open) $('#detail-dialog').close(); await selectRun(target.dataset.run, 'task'); return; }
  if (target.dataset.draft) { try { const draft = await api(`/api/users/drafts/${encodeURIComponent(target.dataset.draft)}`); startCreator(draft); navigate('create_users'); } catch (error) { toast(error.message, true); } return; }
  if (target.dataset.job) { await startJob(target.dataset.job); return; }
  if (target.dataset.user) { openUser(target.dataset.user); return; }
  if (target.dataset.plan) { openPlan(target.dataset.plan); return; }
  if (target.dataset.activity) { openActivity(target.dataset.activity); return; }
  if (target.dataset.screen) { openScreen(target.dataset.screen); return; }
  if (target.dataset.call) { await openCall(target.dataset.call); return; }
  if (target.dataset.page) { state.page = Number(target.dataset.page); render(); return; }
  if (target.dataset.days) { $('#simulation-form').elements.duration_days.value = target.dataset.days; updateSpan(); return; }
  const action = target.dataset.action;
  if (action === 'new-users') { startCreator(); navigate('create_users'); }
  if (action === 'new-simulation') openNewSimulation();
  if (action === 'simulate-selected') openNewSimulation(state.selectedUsers);
  if (action === 'clear-selected-users') { state.selectedUsers.clear(); render(); }
  if (action === 'clear-date') { state.date = ''; state.page = 1; render(); }
  if (action === 'integration-info') integrationInfo();
  if (action === 'run-config') showDialog(`${detailHeader('任务配置与人设快照')}<pre class="json">${pretty(state.snapshot.config)}</pre>`);
  if (action === 'pause' || action === 'force-stop') {
    target.disabled = true;
    try { await api(route(action === 'pause' ? '/pause' : '/stop'), {}); toast(action === 'pause' ? '暂停已请求，将在当前活动结果与反馈保存后生效' : '子进程已停止，记录保留'); }
    catch (error) { toast(error.message, true); }
    await refresh();
  }
});
document.addEventListener('change', async event => {
  const el = event.target;
  if (el.dataset.pickUser) { el.checked ? state.selectedUsers.add(el.dataset.pickUser) : state.selectedUsers.delete(el.dataset.pickUser); render(); return; }
  if (el.id === 'library-group') { state.libraryGroup = el.value; render(); return; }
  if (el.id === 'filter-user') state.user = el.value;
  if (el.id === 'filter-date') state.date = el.value;
  if (el.id === 'filter-app') state.app = el.value;
  if (el.id === 'filter-memory') state.memoryStatus = el.value;
  if (el.id === 'filter-trace') state.trace = el.value;
  if (el.id === 'plan-history') state.history = el.checked;
  if (el.id.startsWith('filter-') || el.id === 'plan-history') { state.page = 1; render(); }
  if (el.closest('#simulation-form')) updateSpan();
});
$('#simulation-form').addEventListener('input', updateSpan);
document.addEventListener('input', event => {
  if (event.target.id !== 'library-search') return;
  const cursor = event.target.selectionStart; state.librarySearch = event.target.value; render();
  $('#library-search').focus(); $('#library-search').setSelectionRange(cursor, cursor);
});
$('#simulation-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, submit = form.querySelector('[type=submit]'); submit.disabled = true;
  try {
    const result = await api('/api/simulations', { name: form.elements.name.value, start_date: form.elements.start_date.value, duration_days: Number(form.elements.duration_days.value), user_ids: [...form.querySelectorAll('[name=user_ids]:checked')].map(el => el.value), app_ids: [...form.querySelectorAll('[name=app_ids]:checked')].map(el => el.value), requirements: form.elements.requirements.value, test_partial: form.elements.test_partial.checked, test_description_failure: form.elements.test_description_failure.checked });
    $('#simulation-dialog').close(); await selectRun(result.id, 'task'); toast('仿真任务已创建，人设与区间已固定；可按活动或按日推进');
  } catch (error) { form.querySelector('.form-error').textContent = error.message; }
  finally { submit.disabled = false; }
});
setupCreator({ api, render: () => { if (state.view === 'create_users') render(); }, saved: async result => { state.selectedUsers = new Set(result.user_ids); state.libraryGroup = ''; state.librarySearch = ''; await refresh(); navigate('users'); toast(`已确认 ${result.user_ids.length} 位用户，可用已选用户创建仿真`); } });
setupModelSettings({ api, redraw: () => { if (state.view === 'apps') render(); }, toast });
setupGuiLab({ api, redraw: () => { if (state.view === 'gui_lab') render(); }, toast });
setupOfflineRuntime({ api, snapshot: () => state.snapshot, busy, refresh, selectRun, toast, submitting: value => { state.submitting = value; render(); } });
async function readRoute() {
  const parts = location.hash.slice(2).split('/');
  if (parts[0] === 'tasks' && parts[1]) {
    const id = decodeURIComponent(parts[1]), view = taskViews.includes(parts[2]) ? parts[2] : 'task';
    if (id === state.run && view === state.view) return;
    if (id === state.run) navigate(view); else await selectRun(id, view);
  } else {
    const view = parts[0] === 'users' ? parts[1] === 'new' ? 'create_users' : 'users' : parts[0] === 'settings' ? parts[1] === 'gui-lab' ? 'gui_lab' : 'apps' : 'simulations';
    if (state.view !== view) navigate(view);
  }
}
window.addEventListener('hashchange', () => { void readRoute(); });
await readRoute(); await refresh(); render();
