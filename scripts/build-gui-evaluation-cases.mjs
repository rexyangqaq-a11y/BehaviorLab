import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Offline authoring only. Never imports/runs the downloaded Python, calls a
// model, starts a candidate framework, or sends a device command.
const root = new URL('../output/gui_evaluation_cases_20261021/', import.meta.url);
const revision = JSON.parse(await readFile(new URL('sources/revision.json', root), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('../output/benchmark_research_20261021/catalog.json', import.meta.url), 'utf8'));
const entries = [];
const add = (id, sourceId, title, apps, prerequisites, checks, judging, notes = [], kind = 'public_task_reuse', instruction = null) => {
  entries.push({ id, sourceId, title, apps, prerequisites, checks, judging, notes, kind, instruction });
};
add('GUI-001', 1, '关闭 B 站后台播放', ['哔哩哔哩'],
  ['后台播放初态为开，保存设置状态；记录允许修改的开关和恢复办法。'],
  ['进入正确应用的相关设置，截图可识别应用和选项。', '把后台播放设为关；以动作后的控件状态/可见效果确认，不能仅凭点击命中。', '再次观察仍为关；若只能通过系统权限实现，记录替代路径和实际改动。'],
  '状态规则候选＋助手复核，报告交用户审核', ['源规则存在点击命中可计成功的分支；本项目增加状态复核，不能直接复用其分数。']);
add('GUI-002', 4, '开启 QQ 夜间模式', ['QQ'],
  ['使用可登录的测试账号；初态为日间，记录系统主题和应用跟随设置。'],
  ['进入 QQ 的主题/夜间模式入口。', '设置为夜间模式，允许不同有效入口。', '返回应用内容页后实际为深色；状态与画面对应，排除仅由系统主题自动切换。'],
  '状态规则候选＋助手复核，报告交用户审核');
add('GUI-003', 18, '开启抖音自动连播', ['抖音'],
  ['该 APP 版本提供自动连播；初态为关；固定可播放的测试内容，不操作点赞或发布。'],
  ['到达有自动连播功能的页面。', '动作后可见启用状态。', '采集至少一次内容结束到下一条开始的实际画面/事件；无法观察效果时标无法判断，不能仅凭模型声称已开启。'],
  '开关状态候选＋执行后效果复核', ['效果观察窗口需结合测试内容确定并记录；时长统计含等待，不能假装等待时间为模型推理。']);
add('GUI-004', 35, 'QQ 音乐设置 30 分钟定时关闭', ['QQ音乐'],
  ['定时关闭初态为未开启；应用可播放，记录执行前状态和恢复办法。'],
  ['找到定时关闭入口。', '选定 30 分钟，保存所选值。', '离开设置再查看仍启用且倒计时合理；不等待完整 30 分钟，不能据此宣称实际到点关闭已验证。'],
  '状态/数值规则候选＋助手复核', ['本用例验证设置成功，不验证 30 分钟后的实际关闭；后者需单独安排。']);
add('GUI-005', 26, '比较两款音乐 APP 的会员价格', ['汽水音乐', 'QQ音乐'],
  ['两 APP 可打开会员页；固定账号、币种和观察时间，记录促销与续费条件。'],
  ['两平台分别取得可见会员名称、周期、价格及限制，关联原图。', '对同周期/可比权益给出比较；首购价与续费价、折扣与原价不可混算。', '最终回答可由实际截图核对；不可比或缺失项明确说明，不编造价目。'],
  '数值计算自动化候选＋助手审核可比性', ['源评分文字主要检查进入页面与找到价格，本项目补齐原指令要求的比较结论。']);
add('GUI-006', 53, '比较两人在抖音和微博的粉丝总量', ['抖音', '微博'],
  ['运行前核对两人的四个官方主页身份，固定同一采集时间窗口。'],
  ['取得两人在两平台的四个粉丝数量，逐条关联身份和原图。', '保留原始显示值、单位和约数精度，计算各人跨平台总量。', '结论与可见数字一致；区间重叠无法比较时明确不确定，不以四舍五入伪造精确差值。'],
  '算术自动化候选＋助手审核账号身份和证据');
add('GUI-007', 55, '筛选两个高播放视频并计算倍速观看时间', ['哔哩哔哩'],
  ['搜索页面支持播放量排序或等效证据；固定关键词，排除广告和同一视频重复项。'],
  ['按指令检索并核实排序，确定搜索结果中前两个符合条件的不同视频。', '保存视频身份、播放量和各自完整时长的可见依据。', '将时长统一为秒后求和并除以 1.5，报告单位与舍入；计算输入必须来自采集证据。'],
  '排序/对象证据复核＋算术自动化候选', ['源评分文字未完整覆盖时长与倍速计算，本项目补齐；不将补齐后的结果冒充原版分数。']);
add('GUI-008', 87, '比较颐和园到大兴机场的通行耗时', ['高德地图'],
  ['运行前记录起终点具体位置、出发时间与拟比较交通方式；定位权限与所在城市可用。'],
  ['确认正确起终点，不把首都机场和大兴机场混淆。', '查看约定范围内可用交通方式，逐项保存路线和预估耗时。', '指出观察时最短耗时的可行方式；不存在的路线或缺失数据明确说明。'],
  '时间数值比较自动化候选＋助手核对路线', ['必须先冻结交通方式范围；动态交通结果使用本次截图，不硬编码固定正确答案。']);
add('GUI-009', 74, '在高德与携程比较同酒店房价', ['高德地图', '携程'],
  ['把“后天”锚定到同一 UTC+8 参考日，固定入住/离店、人数、同一门店及可比房型。'],
  ['两平台均进入正确门店，日期和入住条件一致。', '取得大床房可见价格、税费/早餐/取消及促销条件，保留原图。', '作出可比价格结论；售罄、房型/权益不一致需明示，不替换酒店凑结果。'],
  '数值自动化候选＋助手审核可比条件', ['只查询比较，不下单；不同候选间价格漂移要记录，不能当模型错误。']);
add('GUI-010', 49, '小红书南京一日游攻略与高德路线规划', ['小红书', '高德地图'],
  ['固定参考日期和南京城市；运行前约定“多个帖子”的最少样本数，尚未确认。'],
  ['实际浏览多个不同攻略帖，保存帖子身份和用于规划的内容证据。', '规划中的地点与帖子信息对应，在高德查到景点间交通方式和路线依据。', '给出覆盖地点、顺序、交通和一日可行性的总结；未查到的时段/费用不作为已证事实。'],
  '执行后由助手按证据初评，交用户审核', ['开放规划任务，不能仅靠出现关键词或最终总结自证成功；帖子数口径待审。']);
add('GUI-011', 14, '筛选餐厅并比较距离（只查询）', ['小红书', '高德地图'],
  ['固定城市、参照地点与距离比较方式；APP 可查询。'],
  ['找到三个不同的候选餐厅，对川菜、黑珍珠相关条件逐项保留依据，缺证据不默认成立。', '在高德识别同一家门店，按同一种距离口径比较到颐和园的距离。', '给出最近候选及证据，数量不足如实报告；不执行收藏。'],
  '执行后由助手复核条件和对象，交用户审核', ['从公开任务删除收藏步骤，目标和评分均有改动；只能作为本项目派生用例。'],
  'public_task_variant', '在小红书查找北京黑珍珠餐厅推荐，核实三家川菜相关候选；用高德按同一距离口径比较它们到颐和园的距离，报告最近的一家，不收藏。');
add('GUI-012', 27, '微博与今日头条同事件评论比较（只读取）', ['微博', '今日头条'],
  ['固定观察时段，记录选取的三条社会新闻；每事件/每平台评论采样规则和数量待审。'],
  ['从微博热搜取得三条不同社会新闻身份与可见评论，不杜撰缺失内容。', '在今日头条匹配同一事件，保存评论样本及关联，不能拿不同事件作比较。', '给出以实际样本为依据的态度对比，说明样本局限和无法匹配项；不发帖子。'],
  '执行后由助手抽查样本和总结，交用户审核', ['删除原任务的小红书发布步骤；评论采样阈值尚未冻结，不计入可执行批次。'],
  'public_task_variant', '读取微博热搜前三条社会新闻及评论，在今日头条查找相同事件并采样评论，给出态度对比与样本依据，不发布内容。');
for (const [id, app] of [['GUI-013', '淘宝'], ['GUI-014', '京东']]) {
  add(id, null, `${app}手机商品长活动（规模口径待确认）`, [app],
    ['沿用用户提出的百对象方向；两 APP 数量分配、商品/型号/SKU 去重和详情深度尚待确认。', '先准备短样本，冻结搜索条件、目标数量与预算后才能进入长活动。'],
    ['按约定对象身份去重，为每个实际完成对象保存详情字段与页面证据；身份不确定单列。', '持续执行中保持条件、已完成对象与缺项；返回列表/重排后不将重复访问累加。', '按有效达标量报告目标完成情况、遗漏、误报完成、无进展和总耗时/用量；不足量保留 partial，不补造对象。'],
    '逐对象证据检查＋助手抽样/争议项复核，交用户审核',
    ['项目场景扩展，不来自 RealMobile，不声称公开标准用例；数量口径未定，本轮仅列为待完善项。', '真实中断恢复的工程正确性另归第一类测试；本项只评估续接后的任务效果与重复/遗漏表现。'],
    'project_extension', `在${app}搜索并浏览约定数量的不同手机商品，保留每对象详情和证据；数量分配、身份和详情要求待用户确认。`);
}

const cases = [];
for (const entry of entries) {
  let source = null;
  if (entry.sourceId) {
    const bytes = await readFile(new URL(`sources/realmobile-${entry.sourceId}.py`, root));
    const code = bytes.toString('utf8');
    // Read declarations as text; do not evaluate Python or arbitrary expressions.
    const ruleMatch = code.match(/^STEPRULES\s*=\s*("""|''')([\s\S]*?)\1/m);
    const queryMatch = code.match(/^QUERY\s*=\s*"([^"\r\n]*)"\s*$/m);
    assert(ruleMatch && queryMatch, `Missing text declarations for source ${entry.sourceId}`);
    const originalQuery = queryMatch[1];
    assert.equal(originalQuery, catalog.tasks.find(t => t.id === entry.sourceId)?.query, `Source/catalog mismatch ${entry.sourceId}`);
    source = {
      benchmark: 'RealMobile', task_id: entry.sourceId, original_instruction: originalQuery,
      original_rubric_text: ruleMatch[2].trim(), repository: revision.repository, revision: revision.revision,
      rule_url: `${revision.repository}/blob/${revision.revision}/realmobile/rules/${entry.sourceId}.py`,
      viewer_url: `https://seerray-lab.github.io/Xiaomi-GUI/realmobile/viewer/task.html?id=${entry.sourceId}`,
      local_rule_file: `sources/realmobile-${entry.sourceId}.py`, rule_sha256: createHash('sha256').update(bytes).digest('hex'),
      code_license: 'Apache-2.0', attribution: 'Xiaomi / SeerRay-Lab, Xiaomi-GUI and RealMobile',
    };
  }
  cases.push({
    id: entry.id, track: 'gui_task_evaluation', title: entry.title, origin: entry.kind, source,
    instruction: entry.instruction ?? source.original_instruction, apps: entry.apps,
    prerequisites: ['实际鸿蒙 NEXT 构建、APP/账号和可重置初态需核对；当前未完成。', ...entry.prerequisites],
    milestones: entry.checks.map((requirement, i) => ({ id: `${entry.id}-M${i + 1}`, requirement, mandatory: true, verdict: 'not_assessed', evidence: [] })),
    proposed_judging: entry.judging,
    rubric_status: 'project_draft_pending_user_review',
    rubric_scope: 'Project review criteria for HarmonyOS adaptation; not official benchmark scoring',
    execution_status: 'not_run', assistant_assessment: null,
    user_review: { status: 'pending_review', decision: null, comment: null },
    readiness: { task_definition: entry.kind === 'project_extension' ? 'needs_parameters' : 'draft_for_review', device: 'not_verified', runner: 'not_integrated', automatic_judge: 'not_implemented' },
    limits: { configured: false, required_before_execution: true },
    notes: entry.notes,
  });
}
assert.equal(cases.length, 14); assert.equal(new Set(cases.map(c => c.id)).size, 14);
assert.equal(cases.filter(c => c.origin === 'public_task_reuse').length, 10);
assert.equal(cases.filter(c => c.origin === 'public_task_variant').length, 2);
assert(cases.every(c => c.execution_status === 'not_run' && c.milestones.every(m => m.evidence.length === 0)));
const pack = {
  schema_version: 1, revision: '2026-10-21.draft.1', track: 'gui_task_evaluation', status: 'draft_pending_user_review',
  case_count: cases.length, original_task_reuse_count: 10, derived_task_count: 2, project_extension_count: 2,
  source_revision: revision, automatic_execution: false, real_model_calls_in_preparation: 0,
  measurement_policy: {
    measured_combination: ['framework/version', 'model/service', 'role split', 'prompt/parser', 'phone/OS build', 'APP/account', 'initial state', 'task/rubric version'],
    metrics: ['end-to-end elapsed time including waits', 'model latency and calls by role', 'tool actions', 'input/output/cache/reasoning usage when available', 'screenshots and missing evidence', 'verified objects/subgoals', 'interventions', 'cost per verified object'],
    outcome_values: ['success', 'failure', 'partial', 'cannot_determine', 'blocked'],
    decision_policy: 'Automatic checks are proposed only. Assistant produces evidence-based initial assessment; user reviews the report. Agent completion text is not ground truth.',
    aggregation: 'Report all scheduled attempts and outcomes; no rate before actual execution. A conservative rate uses user-reviewed successes / all scheduled attempts; optionally report executable-only rate with exclusions and denominator separately.',
    repeats: 'Choose trial count and budget before execution; do not multiply all frameworks and models automatically. No P95 claims from insufficient samples.',
    public_score_policy: 'HarmonyOS adaptation and changed judges must not be reported as official RealMobile leaderboard scores.',
  },
  gaps: ['系统 APP 的公开任务尚未选入，需继续核对 AndroidLab/AndroidWorld 的具体来源和 NEXT 迁移。', '美团/大众点评/12306 的公开任务尚未整理成条目；本包不宣称覆盖全部首测 APP。', '两条长活动参数、部分动态任务口径和实际可用 APP 仍需逐步确认。', '未接入网页用例库/真实 runner/自动判分器/审核持久化界面。'],
  cases,
};
await writeFile(new URL('cases.json', root), JSON.stringify(pack, null, 2) + '\n');
const kindName = { public_task_reuse: '公开任务原指令复用', public_task_variant: '公开任务派生', project_extension: '项目场景扩展（未定稿）' };
const doc = [
  '# v0.4 GUI 任务效果与性能评测用例（待审核初版）', '',
  '日期：2026-10-21。本文件仅属于第二类测试。共 14 个条目：10 条公开任务原指令复用、2 条明确派生、2 条未定稿项目长活动。不是已执行结果，不是可立即运行的鸿蒙测试包。', '',
  '**目前已完成任务定义初稿和来源固定；鸿蒙适配、runner、自动判分器和审核界面均未完成。所有条目未执行，未生成初判或用户审核结论。**', '',
  '常规软件工程测试另按[随版测试约定](VERSION_TEST_PLAN.md)管理；31 项框架验收要求不能当作 31 条 GUI 任务。', '',
  '## 1. 清单', '', '| ID | 任务 | APP | 来源 | 判定建议 |', '|---|---|---|---|---|',
  ...cases.map(c => `| ${c.id} | ${c.title} | ${c.apps.join('、')} | ${c.source ? `[RealMobile #${c.source.task_id}](${c.source.viewer_url}) · ${kindName[c.origin]}` : kindName[c.origin]} | ${c.proposed_judging} |`), '',
  '## 2. 统一结果和性能口径', '',
  '- 执行前固定框架、模型角色、提示/解析器、手机/系统、APP/账号、初态与任务/规则版本。原版 Android 任务与鸿蒙适配分别报告。',
  '- 自动采集真实时间、模型调用和延迟、动作数、截图、服务 usage、有效对象、人工干预与可核对成本。未返回的 usage 记未知，不补零；等候时间计入总耗时并单列。',
  '- 任务结果记录成功、失败、部分完成、无法判断或受阻；模型 Complete、程序正常退出、截图保存成功均不单独证明任务成功。',
  '- 本初版建议所有必需里程碑有证据且满足，才能初判成功；未满足里程碑逐项列出。原始评分文字留存，新增条件与补齐检查属于本项目待审规则，不冒充原版评分。',
  '- 可自动确定的数值/状态检查与执行后评审结合；自动判分尚未实现。由助手先整理逐任务/逐里程碑证据、原因、争议和初判，再交用户审核，保留两者差异。',
  '- 报告列出所有预定尝试及状态；保守成功率以用户审核通过数/全部预定尝试为分母。若另报可执行任务成功率，须同时列排除项和分母，不默默丢弃失败或受阻任务。重复次数与预算在运行前确定，少量单次尝试不报告稳定 P95 或胜出排名。',
  '- 本轮没有调用模型、运行下载代码或操作手机；本地重建清单不会联网。', '',
  '## 3. 逐条任务、条件和成功依据', '',
];
for (const c of cases) {
  doc.push(`### ${c.id} · ${c.title}`, '', `- 来源：${kindName[c.origin]}${c.source ? `；[任务 #${c.source.task_id}](${c.source.viewer_url})、[固定版本评分代码](${c.source.rule_url})。` : '；来自用户既有百对象方向，具体口径待确认。'}`,
    `- 执行指令：${c.instruction}`, '- 前置条件：' + c.prerequisites.join('；'), '- 成功依据（本项目待审初稿）：',
    ...c.milestones.map(m => `  - ${m.id}：${m.requirement}`),
    `- 判定建议：${c.proposed_judging}。`, '- 证据：每项里程碑关联实际步骤、原图和必要的控件/数值/对象；公开参考轨迹不能填作本次运行证据。',
    ...c.notes.map(n => `- 差异/限制：${n}`), '- 状态：未执行；待用户审核用例定义；无实际成绩。', '');
}
doc.push('## 4. 尚缺覆盖与下一步', '', ...pack.gaps.map(g => '- ' + g), '',
  '本包是可审核的首版任务定义；不能把“14 条已整理”写成“14 条已就绪/已通过”。后续先核对实际设备、APP 和所选框架，再分小批补执行与审核结果，不自动批跑全部组合。', '',
  '## 5. 来源、数据和复核', '',
  `- 来源仓库固定版本：\`${revision.revision}\`；公开任务的原指令、原始规则文字和规则文件 SHA-256 均保存在 JSON 中。`,
  '- [完整结构化清单](../output/gui_evaluation_cases_20261021/cases.json)，供审核和后续界面导入；当前网页尚未接入此包。',
  '- [来源快照](../output/gui_evaluation_cases_20261021/sources/)仅供核对，未执行；保留 Xiaomi-GUI Apache-2.0 许可证及作者归属。',
  '- 离线复核/重建：`node scripts/build-gui-evaluation-cases.mjs`；没有网络、凭据或设备接口。生成时检查来源指令与目录一致、规则声明完整、14 个 ID 唯一、来源数量和所有任务未执行。',
  '- [公开基准调研](V04_PUBLIC_BENCHMARK_REVIEW_20261021.md)保留判分器抽查与迁移差异；任务及判定初稿仍需审查，规则文字可读不等于已验证规则正确。', '');
await writeFile(new URL('../docs/V04_GUI_EVALUATION_CASES.md', import.meta.url), doc.join('\n'));
console.log(JSON.stringify({ cases: cases.length, public_task_reuse: 10, public_task_variants: 2, pending_project_extensions: 2, executed: 0, paid_model_calls: 0, source_revision: revision.revision }));
