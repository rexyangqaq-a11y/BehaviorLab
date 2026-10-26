# 下一任务：补齐v0.5原生会话桥接的离线契约

## 2026-10-26：v0.4发布修复（当前）

当前阶段：preview.11修复发布与交接完成。用户明确要求历史轨迹进入真机工作台、模型服务保存可见，并内置手机桌面起点以便测试间自动复原，已直接授权本轮修复。2026-10-26用户进一步明确：使用公开仓库，图片已经审视、数据不敏感；授权本项目随包历史原图按现状公开分发。该最新授权替代2026-10-25的仅私有分发限制。密钥、私人配置库和无关任务仍不上传，手机、真实模型和旧队列仍暂停。

完整Windows包离线143/143通过、0跳过，依赖预检通过；实际网页已核对36项历史列表、原图与模型回复、未保存提醒、保存后百炼服务可选、内置桌面起点保存。未操作真实手机或模型，自动复原实机效果未复测。

preview.11已发布，四个公开附件摘要匹配且公开下载校验通过。唯一下一步：将本轮修复合并到v0.5开发分支并做离线回归，再继续原生会话桥接；本轮不恢复真实模型或手机。

下方为此前交接历史，以上文为当前范围。


## v0.4发布交接已完成

私有仓库[rexyangqaq-a11y/BehaviorLab](https://github.com/rexyangqaq-a11y/BehaviorLab)及[预览Release](https://github.com/rexyangqaq-a11y/BehaviorLab/releases/tag/v0.4.0-preview.10)已完成发布、实际下载校验和本机解压检查，记录见[发布交接](RELEASE_PUBLICATION.md)。用户已授权原样测试截图的私有分发，无需重问账号、私有可见性或截图纳入。

唯一下一步：继续v0.5开发分支已经授权的原生会话／安全续接离线契约，保留既有需求和设计基线，不恢复真实模型、手机或旧队列。下方保留原开发交接任务；本轮发布工作不继续编码。

交接日期：2026-10-25。本文件只列当前指令，不复制旧执行历史；事实快照以[CURRENT_STATUS.md](CURRENT_STATUS.md)为准。

## 唯一任务与完成边界

从本地交接基线开始，让一个手工/Mock上层活动通过用户选择的下层适配器执行，保存实际完成量、证据与`completed/partial/blocked/needs_attention`结果；先完成**不使用手机、不调用真实模型的离线装配和故障契约**。真实上层、人设生成、存档VLM和长期记忆不在v0.5本轮范围。

必须保留：现有Mock运行可恢复；设备全局排他与任务/模型版本冻结；未知动作效果不自动重放；描述失败只补已有图而不重采活动；目标2个对象实际仅核实1个时记录实际1和partial，重复打开不累计。独立phone-lab继续可用，不将其改成主调度器。

## 必须先阅读

1. 根目录`AGENTS.md`、`README.md`和本文件。
2. [CURRENT_STATUS.md](CURRENT_STATUS.md)、[LOCAL_BASELINE.md](LOCAL_BASELINE.md)：版本、证据、未测能力及本地回退。
3. [VERSION_PLAN.md](VERSION_PLAN.md)的v0.5段落、[VERSION_TEST_PLAN.md](VERSION_TEST_PLAN.md)：本版特性与测试界面要求。
4. [FRAMEWORK_SELECTION_DECISION.md](FRAMEWORK_SELECTION_DECISION.md)、[FRAMEWORK_ADAPTER_GUIDE.md](FRAMEWORK_ADAPTER_GUIDE.md)、[DEVELOPMENT.md](DEVELOPMENT.md)：配置策略、注册/适配与公共保护。
5. [MODEL_CALL_POLICY.md](MODEL_CALL_POLICY.md)、[PHONE_FAILURE_DIAGNOSIS_20261022.md](PHONE_FAILURE_DIAGNOSIS_20261022.md)：用量与已知错误边界。当前用户指令是不使用手机、不调用真实模型，旧批次授权不自动恢复。

源码重点：`src/contracts.mjs`、`src/runner.mjs`、`src/store.mjs`、`src/adapters/mock.mjs`；对照`src/phone-framework-registry.mjs`、`src/phone-lab.mjs`、`scripts/phone-lab-worker.mjs`、`integrations/adapters/`、`src/phone-action-effects.mjs`和`integrations/phone_protocol.py`。主系统当前仍通过Mock适配器运行，不能把配置保存误认为已经真实装配。

## 基线与启动

仓库根目录为`D:\work\Memory\UserBehaGene\dev`。功能源码基线`9929ed4`，标签`codex/v04-core-20261025`；完整交接标签`codex/v04-handoff-20261025`。先检查状态，保留已有用户改动；不要reset或删除数据。

```powershell
git status --short
git switch -c codex/v05-single-activity codex/v04-handoff-20261025
node scripts/desktop-launcher.mjs stop
node scripts/desktop-launcher.mjs start --port 4317 --no-browser
```

主网页`http://127.0.0.1:4317`，真机工作台`/phone-lab`，只读验收页`/v04-acceptance`。交接时原后台未重载本轮后端，新验收接口仍404；正常重启后再核对。也可前台运行`node src/web-server.mjs --port 4317`。Node要求24，核心Mock无前端构建依赖。`.runtime`包含必要运行时/框架，不能整目录删掉。

## 测试方法

```powershell
node --test tests/*.test.mjs
node --test tests/phone-action-effects.test.mjs tests/phone-workbench.test.mjs tests/phone-process.test.mjs
node scripts/phone-framework-contract.mjs
```

第一条在本机安装环境133/133通过；干净源码副本129通过、4项Python/AutoGLM依赖测试跳过、0失败。第三条要求已安装候选依赖，用合成图和固定回复验证实际原生循环，不访问供应商或手机。环境没有依赖时如实报告跳过/缺条件，不伪造通过。`03_CHECK.cmd`同样只是离线依赖检查。

为v0.5新增独立用例及对应调试入口，至少覆盖：装配来源与配置冻结、设备争用、实际不足量与重复对象、无进展上限、动作发送前后/核验前中断、模型/工具/存储错误、未知效果人工关注及旧Mock兼容。使用临时数据与注入工具，明确标成工程测试，不把它计作新增GUI成绩。

## 用户已确认的决定

- 保留Midscene/MobiAgent/Open-AutoGLM和现有模型接口，由用户配置组合；默认推荐Midscene + qwen3.7-plus，不选唯一框架，不改四角色绑定。
- v0.4四案例36组合真实矩阵作为本轮全流程依据；正常未通过不重测，已完成计算器不为旧批次重复。仅确认接入/记录异常才考虑重测；过去覆盖原记录是用户明确授权的例外。
- **手机暂不连接，其他手机测试暂缓，百对象不强行测试。** 不启动旧队列、视频、设备探测或模型探针。需要恢复真实执行时由用户另行明确恢复并核对当前条件。
- 历史额度为每题每组合最多15请求，整批无总请求上限、零自动重试；这是旧评估规则，不是新对话批量调用授权。费用/usage未知不记零。
- 起点只在任务配置：选择以前的，或给手机当前状态命名；测试自动沿用。结果/详细轨迹在结果与过程页按职责呈现，逐图有模型原始回复，任务保留手机型号。
- 每轮改动通过本地Git管理，不上传远程。API密钥不进源码、日志、聊天或公共导出；私人迁移密钥使用迁移密码加密。

## 仍待决定或待条件具备

v0.5首个真实活动及目标APP/对象口径、何时恢复手机/模型与本次额度、未知效果的人工复核交互、对象身份不确定时的计数规则和正式部署包更新时间。先用已有轨迹夹具与明确的2目标/1实际示例完成离线契约，不为这些问题阻塞基础开发。

hipyum准确来源/契约仍缺，但当前HDC路线已具历史真实证据，不强制改控制路径。百对象数量/SKU/跨APP去重和经验模式仍保留未定，不自动扩展为当前任务。第二台电脑、视频长期稳定性和新v10保护协议真机表现未验证。

## 结束本轮时必须留下

实现与Mock边界、对应测试/界面证据、实际未完成项、源码/部署版本差异和本地提交；同步更新CURRENT_STATUS与唯一下一步。不要只修改版本号宣布完成，不把HTTP200、文本OK、框架finish或离线契约当作真实任务通过。
