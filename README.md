# BehaviorLab · 用户行为序列仿真系统

**交接状态（2026-10-21）**：主工作台 v0.3，验证台 v0.4-preview.1，正式 v0.4 未完成；当前暂停新增功能。最新事实以 [CURRENT_STATUS.md](docs/CURRENT_STATUS.md) 为入口，下一段对话按 [NEXT_TASK.md](docs/NEXT_TASK.md) 继续，本地源码回退见 [LOCAL_BASELINE.md](docs/LOCAL_BASELINE.md)。

当前流程见 [业务流程与用户创建 v0.3](docs/WORKSPACE_V03.md)：左侧为用户库、仿真任务、系统设置；规划、执行、观察文字和调用调试归属具体任务。用户支持辅助生成候选后审核入库，以及手动创建。

继续开发按[版本计划](docs/VERSION_PLAN.md)逐版推进：**v0.4 优先完成开源下层 Agent 选型与最小验证**。现有 [v0.4-preview.1 单活动验证台](docs/V04_GUI_LAB.md)提供 7 类 Mock、环境诊断、记录与恢复，以及 Midscene SDK + 工具替身的离线契约验证。Midscene 与 MobiAgent 同等优先比较，Open-AutoGLM 为基线，未选定胜者。交接时重新运行工程回归 **46/46 通过**，见[测试记录](docs/evidence/20261021-handoff/tests.txt)。2026-10-19 的部署 ZIP 尚未包含此后的修复和新增页面，本次未重打包。

**每版必须随附独立测试用例与测试调试界面**，具体内容到对应版本开发时再设计、实现和验收，不提前展开。见[随版测试交付约定](docs/VERSION_TEST_PLAN.md)。

v0.4 已将另一对话「框架对比」的循环、各层记忆、跨调用续接、百对象活动、部署及费用等映射为[15 维度、31 项验收用例](docs/V04_FRAMEWORK_TEST_CASES.md)。验证台可筛选、展开和下载，全部真实验收仍待执行；不会自动批量调用模型。

第二类 [GUI 任务效果与性能用例](docs/V04_GUI_EVALUATION_CASES.md)现有 **14 条待审核初稿**（10 条公开任务复用、2 条派生、2 条未定稿长活动），已有 [Git 内冻结 JSON](docs/reference/GUI_EVALUATION_CASES_20261021.json)，但尚未接入网页执行/真实 runner/判分或审核工作流。46 项工程回归、7 类 Mock、31 项验收要求、14 条 GUI 定义属于不同集合，不能相加或混成成功率。两类测试按验证目的区分，DFX 只是常规软件工程测试的一部分。

「系统设置 → 模型服务」可保存草稿、地址/模型/鉴权和四角色预设，密钥不回填。三个模型配置已保存，角色仍未绑定。2026-10-20 独立探针对 `qwen3.8-flash`、`qwen3.7-plus`、`deepseek-v4.1-flash-1017` 各一次短文本请求，均 HTTP 200 / OK，合计 **60 tokens**、0 重试，见[脱敏证据](docs/evidence/20261021-handoff/model-text-connectivity.json)。**这不代表图片、动作协议、框架或真机 GUI 能力已通过。** 探针结果未回写配置页，页面 `not_tested` 是现有实现边界。保存/打开配置不自动调用模型；规则见 [MODEL_CALL_POLICY.md](docs/MODEL_CALL_POLICY.md)。本次交接没有新增真实模型请求。

为长期记忆研究生成上游行为序列。当前页面提供用户库、仿真任务与跨度选择、每日规划、行为序列、观察文字、调用链路及 APP 配置。**用户管理、事件调度、虚拟时钟、持久化和调用跟踪实际运行；人设补全、规划/调整、手机决策/操作、截图与描述内容仍为 Mock。** 主流程尚未接入真实模型适配器、手机或 hipyum，不包含记忆提取与检索引擎。

业务基线保存在 [CODEX_PROJECT_HANDOFF.md](docs/CODEX_PROJECT_HANDOFF.md)，已确认需求与建议分级见 [REQUIREMENTS_CLARIFICATION.md](docs/REQUIREMENTS_CLARIFICATION.md)。2026-10-21 按用户要求、检查父目录归属后，在当前 `dev` 目录建立独立本地 Git 基线；未配置远程或上传。凭据、运行数据库/资产、缓存、安装依赖和 `output/` 不提交。

采用 **Node.js 24 原生 ESM + SQLite + 文件资产**，本机已验证 Node v24.19.0。核心网页/Mock 无需第三方安装依赖或前端编译，不需要 npm；Midscene 1.16.0 是可选的隔离候选依赖，清单/锁文件保留，安装目录不提交。Python 不是主程序启动依赖，不能把本机 Windows 别名当成候选 Python 环境已准备好。技术栈是现有工程方案，可替换，不是用户指定要求。

## 运行

### 系统网页

换电脑使用见 [Windows 免安装部署](docs/WINDOWS_PORTABLE.md) 和根目录 `00_README.txt`。Windows 免安装包内带运行时；完整解压后双击 `01_START.cmd`，自动后台启动并打开浏览器，`02_STOP.cmd` 正常停止。原 `start-web.cmd` 也是同一入口。

开发者也可在项目目录前台执行：

```powershell
node src/web-server.mjs
```

打开 **http://127.0.0.1:4317**。先在「用户库」创建并确认人设，再「新建仿真」选择用户、1/7/30/90/365 天或自定义跨度、可用 APP。任务可生成当前日计划、推进下一活动、推进一个用户日、连续生成和暂停，并查看记忆原文与调用详情。操作详见 [业务流程 v0.3](docs/WORKSPACE_V03.md)，架构基础见 [v0.2](docs/WORKSPACE_V02.md)。原有 `.data/` 运行继续保留；schema v1 自动增量升级。端口或数据位置可用 `--port 4318 --data .data` 修改。只监听本机，无需安装前端依赖或构建。旧服务不会自动重载后端，更新代码后需重启服务。

### 命令行

在项目目录使用 PowerShell：

```powershell
node src/cli.mjs init --config examples/mock-run.json --data .data/demo
node src/cli.mjs run --data .data/demo
node src/cli.mjs status --data .data/demo
node src/cli.mjs describe --data .data/demo --retry-failed
node src/cli.mjs export --data .data/demo
node src/cli.mjs check --data .data/demo
node --test tests/*.test.mjs
```

配置示例故意注入每个用户首项活动的一张图像首次描述失败。第一次 `run` 后结果应为 8 个实际活动结果、8 个反馈决定、24 张合成图像；描述为 18 成功、2 失败、4 等待前序。执行已完成，数据集尚未完整。运行 `describe --retry-failed` 后 24 张描述全部完成。4 个原计划中的剩余任务因局部调整被替代，记录保留。

`init` 拒绝覆盖已有运行目录。`run` 读取保存的进度；可随时 Ctrl+C，之后对同一目录再次执行 `run`。Mock 可安全续跑；真实动作的恢复必须由执行适配器另行判断。`run --no-descriptions` 只推进执行；`describe` 单独补描述。已经成功的活动不会因描述失败重采，已经成功的原始描述不会重写。`--retry-failed` 每次补跑一次失败项，受尝试上限约束；达到上限后需检查原因，不提供强制清除错误的命令。

退出码：0 为命令成功，1 为配置/运行错误或恢复需人工处理，2 为离线完整性检查失败。`run` 成功仅表示执行循环正常结束，完整状态请看 `dataset_complete` 和检查报告。

历史受限 Windows 沙箱曾阻止临时文件替换或本地 HTTP；应核对执行环境，不删除恢复保护或忽略失败。交接时在正常 Windows 权限下全量 **46/46 通过**，包含真实本地进程和 HTTP，但没有使用真实模型、VLM 或手机。最早 13 项、发布时 29 项、预览时 44 项等是历史阶段数量。

## 产物与边界

```text
src/contracts.mjs          数据校验、版本、适配器契约
src/store.mjs              SQLite 进度、关联约束、资产与审计
src/runner.mjs             运行管理：请求、保存、调度、恢复
src/adapters/mock.mjs      人设/上层/下层/描述器合成夹具
src/descriptions.mjs       持久化描述队列，活动内按序处理
src/output.mjs            可重建的 JSONL 导出与离线完整性报告
src/cli.mjs                命令行
tests/pipeline.test.mjs    状态恢复、隔离、顺序等关键验证
docs/                     需求分级、架构、接口、阶段报告
.data/<run>/state.sqlite   数据库及 WAL 文件
.data/<run>/assets/        按用户保存的全部合成图像
.data/<run>/export/        events.jsonl、run.json、check-report.json
```

每个事件是一张图像的观察记录，明确动作前/后/独立观察语义。计划与实际并列；虚拟时间只精确到活动锚点，步骤使用顺序键，不伪造秒级行为时间。真实采集时间和描述处理时间另存。导出包含全部计划版本、实际结果、调整决定、描述尝试历史和来源；资产以路径和 SHA-256 引用，交付时需保留原运行目录中的 `assets/`。

状态中的 `dataset_complete` 表示流水线阶段完成，不表示每项任务达标或行为真实。导出还会验证资产字节；资产缺失/损坏时标记不完整。离线检查报告独立输出证据，绝不触发重规划。Mock 的行为自然性标为 `not_evaluated`。

详细内容见 [系统页面与架构 v0.2](docs/WORKSPACE_V02.md)、[需求与工程决策](docs/BASELINE.md)、[模块契约](docs/CONTRACTS.md)。[阶段 A 报告](docs/PHASE_A_REPORT.md) 与 [旧调试台说明](docs/WEB_DEBUG.md) 是历史交付记录。交接文件原文保存在 [业务基线副本](docs/CODEX_PROJECT_HANDOFF.md)。
