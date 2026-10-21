# 下一段对话任务

交接日期：2026-10-21。上一段已按用户要求暂停新增功能并建立本地源码基线。不要重读整段历史，也不要重新搭建用户库、调度器、SQLite 或演示网页。

## 唯一目标

**完成 v0.4 第二类 GUI 评测任务包的审核准备和首测范围提案，交用户审核。**

输入是已有 14 条待审核初稿；输出是来源、前置条件、成功证据、判定方式、覆盖缺口与可试范围清楚的一版任务包。不要把定义数量当已执行数量。

此任务不默认包括真实模型请求、手机操作、安装全部候选、实现通用审核平台或 v0.5 接入。后续对话的用户如果另行指定范围，先对照已确认约束调整本文件的任务边界。

## 必须阅读

按以下顺序，遇到关联内容再展开其余设计稿：

1. 根目录 [AGENTS.md](../AGENTS.md)：本工作区协作规则；仅在 PPTX 任务时再读 PPTX 专项约束。
2. [CURRENT_STATUS.md](CURRENT_STATUS.md)：当前真实状态、证据、Git/数据边界。
3. [VERSION_TEST_PLAN.md](VERSION_TEST_PLAN.md)：两类测试与用户审核要求。
4. [V04_GUI_EVALUATION_CASES.md](V04_GUI_EVALUATION_CASES.md) 及 [14 条冻结 JSON](reference/GUI_EVALUATION_CASES_20261021.json)：已有任务，不从零编造一套。
5. [V04_PUBLIC_BENCHMARK_REVIEW_20261021.md](V04_PUBLIC_BENCHMARK_REVIEW_20261021.md)：公开任务、轨迹与判分复用的局限。
6. [V04_FRAMEWORK_TEST_CASES.md](V04_FRAMEWORK_TEST_CASES.md) 与 [V04_GUI_IMPLEMENTATION_COMPARISON.md](V04_GUI_IMPLEMENTATION_COMPARISON.md)：保留另一对话比较范围；31 项是跨两类的验收要求。
7. [MODEL_CALL_POLICY.md](MODEL_CALL_POLICY.md)：节省真实接口 tokens、无默认调用/重试；历史文本连通不等于视觉或动作能力。

涉及需求解释时读 [CODEX_PROJECT_HANDOFF.md](CODEX_PROJECT_HANDOFF.md)、[REQUIREMENTS_CLARIFICATION.md](REQUIREMENTS_CLARIFICATION.md)；涉及接口/业务代码时读 [CONTRACTS.md](CONTRACTS.md)、[VERSION_PLAN.md](VERSION_PLAN.md)。文档里的工程建议和未确认问题不能自动变为用户要求。

## 从哪里继续

- 核心网页/Mock：`src/web-server.mjs`、`src/scheduler.mjs`、`src/runner.mjs`、`src/store.mjs`、`src/descriptions.mjs`。
- v0.4 当前页面：`web/gui-lab.mjs`；7 类夹具：`src/gui-lab-catalog.mjs`；实际只开放 Mock：`src/gui-lab.mjs`。
- 31 项定义源：`src/gui-comparison-cases.mjs`。
- 14 条任务编写/导出工具：`scripts/build-gui-evaluation-cases.mjs`。其输入仍在原本机 `output/`，不属于核心启动依赖；Git 内 JSON 是冻结快照，后续维护先统一数据来源，不手改多个版本制造分歧。
- 可选候选：`integrations/midscene/package.json`、`pnpm-lock.yaml`、`probe.mjs`。SDK Tap 的工具端是替身；没有完整框架模型循环。

## 启动方法

本地工作目录：`D:\work\Memory\UserBehaGene\dev`。核心需要 Node.js 24；已验证环境 v24.19.0，根包无待安装依赖，不需 npm 或前端编译。

Windows 常规入口：完整源码目录内运行 `01_START.cmd`；停止用 `02_STOP.cmd`。源码 Git 基线不含运行时；启动器可用本机 Node，便携包才自带 `runtime/node.exe`。不要把 2026-10-19 的旧 ZIP 当作本次源码。

前台开发：

```powershell
Set-Location -LiteralPath 'D:\work\Memory\UserBehaGene\dev'
node src/web-server.mjs
```

默认 `http://127.0.0.1:4317/`，验证台路径 `/#/settings/gui-lab`；后台启动器可能避让端口，以实际 READY 地址为准。后端没有自动热重载。

交接源码后想隔离试验数据，可前台使用：

```powershell
node src/web-server.mjs --port 4318 --data .data/handoff-sandbox
```

这会新建隔离数据目录；没有旧用户或模型凭据。不要复制密钥到代码、命令参数、文档或导出。

## 测试方法

```powershell
node --test tests/*.test.mjs
node --test tests/gui-lab.test.mjs
node --test tests/model-settings.test.mjs tests/model-probe.test.mjs
```

第一行为交接时的全量 **46 项**；后两行按实际改动选择，勿为形式重复跑全部。测试含本地 HTTP 和子进程；模型探针测试注入替身，不发付费请求。正常 Windows 权限下交接回归 46/46 通过；受限沙箱可能阻止本地连接/临时文件替换，应记录环境差异，不删保护或改成假通过。

不要把 `scripts/probe-model-services.mjs --send` 当普通回归命令：它会访问真实服务。本次任务也不运行 HDC 或手机命令。14 条 GUI 定义未执行，不能汇总成功率。

## 用户已确认的决定

- 目标：为长期记忆研究生成上游仿真行为序列；不把 Mock 称作真实数据，也不把它称为真实人类行为。
- 复用已有仓库、组件和架构；程序管进度，上层生成每日计划与调整，下层做页面决策与操作。
- 执行与逐图描述分别推进；计划/实际、虚拟/真实时间、原文/加工文本分别保存。
- 当前优先 v0.4 下层开源框架选型与最小验证。用户最终选择框架；不因 Midscene 已安装就判定它胜出。
- 手机目标为鸿蒙 NEXT，拟用 6 或 7；可 USB 连接、开启调试。先测系统 APP 和常用 APP；具体设备构建与 APP 条件尚未冻结。
- 原生 SDK 与 hipyum 两路线先比较，不预设必须走 hipyum。
- 允许手机截图发送外部模型，先比较外部服务。三个模型配置已保存且历史短文本连通通过，无需再索要已提供的账号信息；真实图片/动作能力未测。
- 节省真实模型 API tokens，按需小试；不默认重试、全组合跑批或持续循环。
- 每版随附独立测试用例和调试界面，随版细化，不提前铺开长期系统。
- 第一类是常规软件工程测试，DFX 只是其中一部分；第二类验证框架＋模型的 GUI 效果与性能。第二类可自动判定或由助手执行后整理证据初判，结果交用户审核。
- 当前要求暂停新增功能、先完成交接；只建立本地源码基线，不上传远程。

## 仍待决定的问题

不要一口气向用户索取全部条件；先解决本任务需要的事项：

1. **本任务优先**：14 条中哪些纳入首测；哪些规则补齐/删改；系统 APP 与缺失 APP 的来源如何补；开放内容与动态任务的采样、未知/部分完成口径。
2. **真实接入任务再确认**：实际设备型号/构建、已安装 APP/账号、初态/重置条件；候选与模型角色组合、hipyum 文档；允许的具体状态变更与预算。
3. **长活动前再确认**：淘宝/京东百对象数量分配、商品/型号/SKU/跨 APP 去重、详情深度、预算。
4. **扩量前再确认**：适合应用后端/自动化用途的模型服务与计费；当前 Token Plan 调通不表示可直接用于无人值守批量仿真。

## 本任务验收出口

- 提交第二类用例的明确版本与变更表，列原版公开任务、派生任务、项目扩展以及无法立即执行的条件。
- 每项可定位输入、前置条件、必要里程碑、成功证据、判分方式和性能统计；公开评分与本项目补齐条件分开。
- 交一份最小首测范围提案给用户审核，不给未执行任务填成绩，不自行宣布某框架胜出。
- 更新 CURRENT_STATUS 的已完成/未完成与唯一下一步；若用户要求实际开发，再在新范围内推进。
- 保留本地基线和业务数据；仅提交本任务授权的文件，继续不提交凭据和运行目录。

本地基线操作见 [LOCAL_BASELINE.md](LOCAL_BASELINE.md)。
