# 下一任务：核对v0.5需求澄清

交接日期：2026-10-25。本文件只列当前指令，不复制旧执行历史；事实快照以[CURRENT_STATUS.md](CURRENT_STATUS.md)为准。

用户要求头脑风暴与其持续讨论确认，再写需求和概要设计，并要求固化[版本开发流程](VERSION_DEVELOPMENT_WORKFLOW.md)。重新[头脑风暴](V05_BRAINSTORM.md)已收敛，用户允许先整理需求；[需求修订2](V05_REQUIREMENTS_CLARIFICATION.md)待核对。[此前概要设计](V05_HIGH_LEVEL_DESIGN.md)暂停采用，不以其阶段A–F开始实现。当前分支`codex/v05-single-activity`，业务实现尚未修改。

## 唯一任务与完成边界

当前只核对需求修订2：收集用户意见并修订，需求获确认且用户明确进入设计后，再整理概要设计。用户单条“可以”仅对应当时的问题，不扩展为整份文档或后续阶段授权；已有明确授权不重复询问。

后续v0.5版本目标保留：让一个手工/Mock上层活动通过用户选择的下层适配器执行，保存实际完成量、证据与`completed/partial/blocked/needs_attention`结果；先完成**不使用手机、不调用真实模型的离线装配和故障契约**。真实上层、人设生成、存档VLM和长期记忆不在v0.5范围。此段为后续目标，不是当前开始编码指令。

必须保留：现有Mock运行可恢复；设备全局排他与任务/模型版本冻结；未知动作效果不自动重放；描述失败只补已有图而不重采活动；目标2个对象实际仅核实1个时记录实际1和partial，重复打开不累计。独立phone-lab继续可用，不将其改成主调度器。

## 必须先阅读

1. 根目录`AGENTS.md`、`README.md`、本文件和[版本开发流程](VERSION_DEVELOPMENT_WORKFLOW.md)。
2. [CURRENT_STATUS.md](CURRENT_STATUS.md)、[LOCAL_BASELINE.md](LOCAL_BASELINE.md)：版本、证据、未测能力及本地回退。
3. [VERSION_PLAN.md](VERSION_PLAN.md)的v0.5段落、[VERSION_TEST_PLAN.md](VERSION_TEST_PLAN.md)：本版特性与测试界面要求。
4. [FRAMEWORK_SELECTION_DECISION.md](FRAMEWORK_SELECTION_DECISION.md)、[FRAMEWORK_ADAPTER_GUIDE.md](FRAMEWORK_ADAPTER_GUIDE.md)、[DEVELOPMENT.md](DEVELOPMENT.md)：配置策略、注册/适配与公共保护。
5. [MODEL_CALL_POLICY.md](MODEL_CALL_POLICY.md)、[PHONE_FAILURE_DIAGNOSIS_20261022.md](PHONE_FAILURE_DIAGNOSIS_20261022.md)：用量与已知错误边界。当前用户指令是不使用手机、不调用真实模型，旧批次授权不自动恢复。
6. 已收敛的头脑风暴B01–B09、需求修订2的R01–R15及待实现用例T01–T17。旧概要设计仅保留历史，不作为当前阶段依据；模块、数据结构和接口待后续设计。

源码重点：`src/contracts.mjs`、`src/runner.mjs`、`src/store.mjs`、`src/adapters/mock.mjs`；对照`src/phone-framework-registry.mjs`、`src/phone-lab.mjs`、`scripts/phone-lab-worker.mjs`、`integrations/adapters/`、`src/phone-action-effects.mjs`和`integrations/phone_protocol.py`。主系统当前仍通过Mock适配器运行，不能把配置保存误认为已经真实装配。

## 基线与启动

仓库根目录为`D:\work\Memory\UserBehaGene\dev`。功能源码基线`9929ed4`，标签`codex/v04-core-20261025`；完整交接标签`codex/v04-handoff-20261025`。v0.5分支已从该标签创建，不重复执行`switch -c`。先检查状态，保留已有用户改动；不要reset或删除数据。

```powershell
git status --short
git switch codex/v05-single-activity
```

本轮仅文档工作，没有重启服务。实施后需要界面／接口验证时再正常停止、启动，单纯阅读和离线契约无需操作现有服务：

```powershell
node scripts/desktop-launcher.mjs stop
node scripts/desktop-launcher.mjs start --port 4317 --no-browser
```

主网页`http://127.0.0.1:4317`，真机工作台`/phone-lab`，只读验收页`/v04-acceptance`。交接时原后台未重载本轮后端，新验收接口仍404；正常重启后再核对。也可前台运行`node src/web-server.mjs --port 4317`。Node要求24，核心Mock无前端构建依赖。`.runtime`包含必要运行时/框架，不能整目录删掉。

## 后续实现阶段测试参考（当前不运行）

```powershell
node --test tests/*.test.mjs
node --test tests/phone-action-effects.test.mjs tests/phone-workbench.test.mjs tests/phone-process.test.mjs
node scripts/phone-framework-contract.mjs
```

第一条在本机安装环境133/133通过；干净源码副本129通过、4项Python/AutoGLM依赖测试跳过、0失败。第三条要求已安装候选依赖，用合成图和固定回复验证实际原生循环，不访问供应商或手机。环境没有依赖时如实报告跳过/缺条件，不伪造通过。`03_CHECK.cmd`同样只是离线依赖检查。

为v0.5新增独立用例及对应调试入口，至少覆盖：装配来源与配置冻结、设备争用、实际不足量与重复对象、无进展上限、动作发送前后/核验前中断、模型/工具/存储错误、未知效果人工关注及旧Mock兼容。使用临时数据与注入工具，明确标成工程测试，不把它计作新增GUI成绩。

## 用户已确认的决定

- 开发按逐轮头脑风暴→汇总收敛→需求核对→概要设计核对→实现验证推进；当前只到需求稿待核对，旧设计暂停采用。
- 首个离线商品活动从手机桌面开始；关键词／条件／数量由上层明确，下层自主操作，不自行放宽条件。
- 详情及条件有证据即计浏览完成；同商品链接／ID及不同规格只计1件，跨店同款分别计；条件或身份未知不计数并继续找商品。
- 自动核对与有界恢复优先，不能可靠继续才人工兜底；人工三态标记后显式继续／结束，标记不自动操作；达到预设上限按实际量和未决状态结束。
- 保留Midscene/MobiAgent/Open-AutoGLM和现有模型接口，由用户配置组合；默认推荐Midscene + qwen3.7-plus，不选唯一框架，不改四角色绑定。
- v0.4四案例36组合真实矩阵作为本轮全流程依据；正常未通过不重测，已完成计算器不为旧批次重复。仅确认接入/记录异常才考虑重测；过去覆盖原记录是用户明确授权的例外。
- **手机暂不连接，其他手机测试暂缓，百对象不强行测试。** 不启动旧队列、视频、设备探测或模型探针。需要恢复真实执行时由用户另行明确恢复并核对当前条件。
- 历史额度为每题每组合最多15请求，整批无总请求上限、零自动重试；这是旧评估规则，不是新对话批量调用授权。费用/usage未知不记零。
- 起点只在任务配置：选择以前的，或给手机当前状态命名；测试自动沿用。结果/详细轨迹在结果与过程页按职责呈现，逐图有模型原始回复，任务保留手机型号。
- 每轮改动通过本地Git管理，不上传远程。API密钥不进源码、日志、聊天或公共导出；私人迁移密钥使用迁移密码加密。

## 仍待决定或待条件具备

具体APP、正式示例关键词／条件／数量、时间／调用／无进展／自动恢复上限、真实商品身份提取、何时恢复手机／模型与本次额度、正式部署包更新时间仍待细化。商品完成、规格／跨店去重、身份不明不计数及人工兜底原则已确认，不重复列为未定。后续离线用例使用合成图、固定回复和明确的2目标／1实际示例；当前先核对需求，不提前实施。

hipyum准确来源/契约仍缺，但当前HDC路线已具历史真实证据，不强制改控制路径。百对象数量/SKU/跨APP去重和经验模式仍保留未定，不自动扩展为当前任务。第二台电脑、视频长期稳定性和新v10保护协议真机表现未验证。

## 结束当前需求阶段时必须留下

已确认结论及来源、需求待核对／确认状态、待细化项、文档核对范围和本地提交，CURRENT_STATUS与唯一下一步同步。需求未确认不进入概要设计，文档完成不宣称功能完成；后续实现阶段再交付测试／界面证据与源码／部署差异。
