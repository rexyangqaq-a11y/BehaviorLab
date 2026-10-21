import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { guiComparisonPlan } from '../src/gui-comparison-cases.mjs';
import { GUI_CASES, GUI_CANDIDATES } from '../src/gui-lab-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const plan = guiComparisonPlan();
const cases = plan.dimensions.flatMap(d => d.cases);
if (new Set(cases.map(c => c.id)).size !== cases.length || cases.some(c => c.fixture_ids.some(id => !GUI_CASES.some(f => f.id === id)))) throw new Error('Case IDs or fixture references are invalid');
const lines = [
  '# v0.4 框架对比验收用例', '',
  '生成日期：2026-10-20。来源：另一对话「框架对比」和[实现比较文档](V04_GUI_IMPLEMENTATION_COMPARISON.md)，重点包括其第 7、8 节的长活动、循环和记忆层次补充。', '',
  `共 **${plan.dimensions.length} 个维度、${plan.case_count} 项统一用例**，面向 Midscene、MobiAgent、Open-AutoGLM；同一用例分别评估各候选，不产生三种不同 Mock 算法。Midscene 与 MobiAgent 同等优先深入比较，Open-AutoGLM 作为基线。其他框架与开放模型的差异在 ALT-01 中保留。`, '',
  '**这是验收定义，真实框架用例尚未执行。** 现有 7 类 Mock 和实际 SDK Tap + 工具替身契约只提供局部证据；不能计作真实候选通过。测试清单齐全不等于正式 v0.4 已完成。', '',
  '本轮没有模型接口调用。打开页面、筛选、下载、生成本文不请求模型；不默认执行全部用例 × 框架 × 模型的组合。后续按需用最小输入、有限输出和调用预算测试，不自动重试。', '',
  '## 1. 入口与用例来源', '',
  '在「系统设置 → 下层 Agent 验证 → 框架对比验收清单」筛选维度与候选，展开单项检查方法和证据；可下载完整 JSON。原有单活动 Mock 表单继续独立使用。', '',
  '本文与网页使用同一份 `src/gui-comparison-cases.mjs`。更新定义后运行 `node scripts/export-gui-comparison.mjs` 同步文档和 JSON；另一对话新增比较点时需再次逐项映射，不自动接纳其工程建议为已确认产品要求。', '',
  '## 2. 覆盖映射', '',
  '| 比较维度 | 实现比较章节 | 用例 |', '|---|---|---|',
  ...plan.dimensions.map(d => `| ${d.name} | ${d.source_sections.map(s => '§' + s).join('、')} | ${d.cases.map(c => c.id).join('、')} |`), '',
  '## 3. 每个候选分别填写的结果', '',
  '先记录框架已有实现，再记录项目处理方式：能直接复用、需要改造、需要新建，以及尚未验证。已有能力可能仍需改造；这些是不同字段，不是按一项评分互相替代，也不等于测试通过。', '',
  '| 字段 | 要记录的内容 |', '|---|---|',
  '| 环境与组合 | 框架/模型/提示/设备/APP 版本、账号环境、初态、控制路线、worker 拓扑 |',
  '| 框架已有 | 具体入口/模块、已核对版本和证据，不能只写“有 Agent/有记忆” |',
  '| 项目处理 | 直接复用什么、改造什么、新建什么；必需与可选组件分开 |',
  '| 尚未验证 | 缺文档/设备/实际调用等条件及其影响，不能当作已证明不支持 |',
  '| 测试状态 | 未执行、受阻、通过、失败或证据不足；保留原因 |',
  '| 证据层次 | 源码核对 / Mock 工程夹具 / SDK 契约 / 真实框架；禁止混计 |',
  '| 实际结果 | 目标与有效实际量、重复/未知对象、误报完成、结束原因、人工干预 |',
  '| 调用与成本 | 实际动作/规划/请求次数、服务 usage、耗时、已核对费用；未知不得补零 |', '',
  'PC/服务器、持久化长活动和真实副作用恢复都属于选型的总接入成本，不能将全部缺口笼统称为“加 recorder”。本版评估需量化这些缺口，不要求提前完成后续版本的整个生产系统。', '',
  '## 4. 逐项用例', '',
];
for (const d of plan.dimensions) {
  lines.push(`### ${d.name}`, '', `来源章节：${d.source_sections.map(s => '§' + s).join('、')}。`, '',
    ...GUI_CANDIDATES.map(c => `- **${c.name}**：${d.focus[c.id]}`), '');
  for (const c of d.cases) lines.push(`#### ${c.id} · ${c.name}`, '',
    `- 执行方法：${c.procedure}`, `- 通过依据：${c.acceptance}`, `- 必留证据：${c.evidence}`,
    ...(c.pending.length ? [`- 待确认：${c.pending.join('；')}。`] : []),
    `- Mock 局部参考：${c.fixture_ids.length ? c.fixture_ids.map(id => GUI_CASES.find(f => f.id === id).name).join('、') + '；不代替本项真实框架验收。' : '现有夹具未验证本项框架能力。'}`,
    '- 当前真实验收状态：未执行。', '');
}
lines.push('## 5. 百对象与费用边界', '',
  '淘宝/京东“100 个手机”已纳入验收范围，但两 APP 合计还是各 100、按商品/商家商品/型号/SKU 去重、跨 APP 同型号怎样算、详情是否含参数/规格/评价，仍待逐项确认。不能静默固定成某种口径，也不因现有表单限 30 步而把百对象目标删掉。', '',
  '可以先短活动，再按证据和预算扩大对象量；2→10→30→100 是工程样本分级建议，不是用户固定要求或已证明能力。100 对象不是 100 个原子步骤，内部小批次不改上层的完整活动目标。', '',
  '模型用量规则见[真实模型调用约定](MODEL_CALL_POLICY.md)。本次没有安装其他框架或运行真实模型/手机；保存的 31 项定义不会触发真实请求。现有 Mock 运行、恢复与数据契约仍按[预览说明](V04_GUI_LAB.md)解释。', '');
await writeFile(path.join(root, 'docs/V04_FRAMEWORK_TEST_CASES.md'), lines.join('\n'));
const output = path.join(root, 'output/gui_comparison_20261020');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'framework-comparison-cases.json'), JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({ dimensions: plan.dimensions.length, cases: plan.case_count, model_requests: 0 }));
