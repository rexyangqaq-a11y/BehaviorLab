# v0.4 开源 GUI 框架与评测资料：供用户决策

2026-10-21 最新进度：三个重点框架已完成本机部署；Midscene 有一个网页真机成功样本，两个 Python 框架仅通过原生离线契约。当前手机测试暂停、最终选型未定。完整实现与五题九组合方案见 [最新汇报](PHONE_LAB_REPORT_BRIEF_20261021.md)，下文保留最初资料初筛时的状态与公开结果，不作为本机实测成绩。

后续补充：三个重点候选的内部实现、真实使用取舍见[实现比较](V04_GUI_IMPLEMENTATION_COMPARISON.md)；当前仓库已有隔离 SDK 与验证台，实际进度见[单活动验证台](V04_GUI_LAB.md)。本文下方的未安装等表述保留为最初资料初筛时的阶段记录，不代表后续进度。

调研日期：2026-10-20。状态：官方文档、公开源码入口、论文和公开榜单的资料初筛；本报告资料阶段未连接手机或独立复现任何分数。推荐为工程判断，最终由用户决策。

后续工程进度：[v0.4-preview.1 验证台](V04_GUI_LAB.md)已交付，隔离安装 Midscene 鸿蒙 SDK 1.16.0，实际 SDK Tap + HDC 替身的记录契约通过。尚未执行真实模型/设备循环，不能补写为本报告的候选成功率或最终选型结论。

## 1. 已确认条件与选型口径

- 目标系统为鸿蒙 NEXT，计划使用鸿蒙 6 或 7；具体型号、系统构建与 SDK 版本尚未确定。用户表示可连接 Windows 电脑、开启开发者模式并允许调试；这不是已经成功连接的证据。
- 首测范围同时包含系统 APP 和一些常用 APP。后续按手机实际安装情况逐步确定名称、版本、活动与完成标准，不将范围擅自缩成只测一个 APP。
- 手机控制先比较框架原生 SDK 与项目所称 hipyum 两条路线，尚不强制某一条。hipyum 的准确包名、来源和接口仍未核实，不自行认定等同于其他同名或近似名称工具。
- 用户要求扩大候选和公开测试资料范围，给出信息及推荐后由用户最终决策。不能把推荐写成已经选定或部署完成。
- 用户已确认测试手机截图可以发送外部模型服务，先比较外部服务方案。此条件不等于已选定供应商、模型或采购预算，也不表示已上传图像或完成调用。

需要分清三类对象：**框架**管理观察、决策、执行循环；**GUI 模型**提供看图、定位或动作输出；**设备工具**提供截图、点击、输入等接口。高分通常属于框架、模型、提示、工具和评测环境的一套组合。

## 2. 候选全景

下表的“未核实鸿蒙路径”表示本轮没有找到并核实官方可运行的 NEXT 路径，不等于已经证明无法移植。对鸿蒙 6/7 的具体兼容性，所有候选都保留真机验证项。

| 项目 / 类型 | 可核对的能力与公开情况 | 鸿蒙路径与本项目取舍 |
|---|---|---|
| [Midscene.js](https://midscenejs.com/platforms/harmonyos) / 自动化 SDK、Agent 框架 | 官方有 HarmonyDevice、HarmonyAgent、Playground 和 JavaScript SDK；动作/查询/断言及报告入口 | **明确 NEXT + HDC 路径**。适合现有 Node 工程；需补验动作前持久化、所有实际采集图留存、停止和业务完成判断。MIT 包许可见[包声明](https://github.com/web-infra-dev/midscene/blob/main/packages/harmony/package.json) |
| [Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM) / 手机 Agent 与配套模型 | Python；官方提供 `--device-type hdc`，设备工厂与单步 `step`；Apache-2.0 代码 | **明确 NEXT + HDC 路径**。适合作为清晰的单步基线；需包装记录、实际进度和恢复，不能把 finished 当业务成功。模型动作协议需要匹配 |
| [MobiAgent](https://github.com/IPADS-SAI/MobiAgent) / 可定制手机 Agent 系统 | MobiMind 模型、AgentRR 操作复用、MobiFlow 验证；Python runner 有 `--device Android|Harmony`；Apache-2.0 | **有官方 Harmony 运行分支**，值得与前两者同列重点候选。分支对 NEXT 6/7 的具体控制与记录表现待测；偏好记忆、经验与复用只按需要启用 |
| [Droidrun → Mobilerun](https://github.com/droidrun/mobilerun) / 通用手机 Agent 框架 | Python；Android/iOS、Portal、视觉与无障碍信息、模型替换、推理与调用追踪；MIT | 当前官方路径为 Android/iOS，**未核实 NEXT 适配**。高分与工程能力值得参考，但 Portal/无障碍接口替换量要单独评估 |
| [ARTEMIS](https://github.com/google/artemis) / 手机操作与测试框架 | Python SDK、CLI、网页控制台；观察/动作与规划核对模式；Apache-2.0 | 官方以 Android、ADB 和辅助服务为核心，未核实 NEXT 路径。值得评估高分方法，但迁移不只是换连接命令 |
| [Minitap mobile-use](https://github.com/minitap-ai/mobile-use) / 多 Agent 手机框架 | 任务分解、输入后核对、循环检测；Android/iOS；Apache-2.0 | 未核实 NEXT 路径。作为高成功率方法对照；同名项目多，必须固定组织名，不能把 MadeAgents 的结果算给它 |
| [FinalRun](https://github.com/droid-ash/finalrun-agent) / 自然语言移动测试框架 | Android/iOS、YAML 用例、模型选择、动作/视频/日志；Apache-2.0 | 未核实 NEXT 路径。适合考察测试交付方式；测试框架的任务约束与行为仿真器的单活动执行需求仍须对齐 |
| [Mobile-Agent-v3 / v3.5](https://github.com/X-PLUG/MobileAgent) / 研究框架与 GUI-Owl 模型 | v3 有规划、进度、反思等分工；v3.5 有 GUI-Owl-1.5 模型与移动执行代码；不同版本分别比较 | [v3.5 官方移动部署](https://github.com/X-PLUG/MobileAgent/tree/main/Mobile-Agent-v3.5)明确当前仅 Android 调试路径。可作算法/模型候选，不能直接宣称已有 NEXT 适配 |
| [MAI-UI / Qwen-UI-Agent](https://github.com/Tongyi-MAI/MAI-UI) / GUI 模型与执行研究 | MAI-UI 有已发布的小模型及执行/评测材料；Qwen-UI-Agent 是后续工作 | 未核实 NEXT 路径；新版本高分、实现、权重和服务可用性须分别确认。[Qwen 子目录](https://github.com/Tongyi-MAI/MAI-UI/tree/main/Qwen-UI-Agent)本轮主要核对到报告与说明，不能直接当作已经可部署的完整框架 |
| [UI-Venus](https://github.com/inclusionAI/UI-Venus) / GUI 模型与运行工具 | 当前官方页介绍 UI-Venus-2 的 9B/27B、移动框架和评测；代码与模型分别核对版本 | 真实移动执行示例是 ADB 路径，未核实 NEXT。值得做开放模型质量对照；预录截图推理示例本身不操作手机 |
| [UI-TARS](https://github.com/bytedance/UI-TARS) / GUI 模型、提示和动作解析 | 1.5-7B 有开放权重与解析工具，提供手机动作提示；后续版本发布内容分别核对 | 适合模型/动作协议对照，不能因有 MOBILE_USE 提示就视为完整鸿蒙 Agent；也不将 UI-TARS-2 的报告等同于 1.5 开源交付 |
| [AppAgentX](https://github.com/Westlake-AGI-Lab/AppAgentX) / 操作复用研究框架 | 从历史轨迹形成高层操作；官方部署包含 Android ADB、图像服务及记忆相关组件 | 未核实 NEXT。更适合研究经验复用的收益；本版不因采用其思路就要求引入 Neo4j/Pinecone 或行为库 |
| [MadeAgents MobileUse](https://github.com/MadeAgents/mobile-use) / 反思与探索框架 | Android ADB、WebUI、Python API、AndroidWorld/AndroidLab；MIT | 未核实 NEXT；可研究分层反思与进度。与 Minitap mobile-use 是不同项目，分数不能混用 |
| [AgentCPM-GUI](https://github.com/OpenBMB/AgentCPM-GUI) / 手机模型与执行、训练工具 | 开放动作格式、状态字段、评测和 CAGUI 中文资料；代码 Apache-2.0 | 主要面向 Android，未核实 NEXT；适合中文离线诊断及后续模型路线，非当前最低改造量候选 |

补充观察项：[agent-qa](https://github.com/vostride/agent-qa)公开源码并有高分条目，但[当前许可](https://github.com/vostride/agent-qa/blob/main/LICENSE.md)是 FSL-1.1-ALv2，带竞争用途限制，不能与 MIT/Apache-2.0 简单合并为同一开放程度。本轮不将它作为默认开源主选。

[hmdriver2](https://github.com/codematrixer/hmdriver2)等鸿蒙 UI 自动化工具可作为设备层候选。它们不自动包含大模型规划、观察决策、进度与完成判断，不能据此认定已有完整手机 Agent。通用 LangGraph 等编排工具、页面解析器也分别按自己的层次比较。

## 3. 哪些公开分数较高

### 3.1 AndroidWorld：完整组合的代表结果

[AndroidWorld 官方仓库链接的社区榜](https://docs.google.com/spreadsheets/d/1cchzP9dlTZ3WXQTfYNhh3avxoLipqHN75v1Tb86uhHo/edit?gid=0)明确说明结果来自社区提交，没有独立验证。下列是本轮读取到的代表结果，**不作为同一实验条件下的严格排序，也不是我们的复测结果**。

| 组合 / 报告版本 | AndroidWorld 结果 | 条件、来源和解读 |
|---|---|---|
| Mobilerun，2026-09 条目 | **100% Pass@1** | 榜单：GPT-6 Astra，截图 + 无障碍树，1 次试验；框架开放不等于所用模型权重开放 |
| Minitap mobile-use，2026-02 论文 | **100%，116/116** | [作者论文](https://arxiv.org/abs/2602.07787)及[报告](https://www.minitap.ai/benchmark)；社区榜该名称仍显示旧的 91.4%，来源更新不同步，复现时按论文对应组合固定 |
| ARTEMIS，2026-08 条目 | **99.1% Pass@1** | 社区榜：Gemini 3.7 Flash + Gemini Robotics ER 2，截图 + 无障碍树，1 次试验 |
| FinalRun，2026-03 条目 | **97.4% Pass@1** | 社区榜：Gemini 3 Flash / Flash Lite，截图 + 无障碍树，1 次试验 |
| Midscene.js 1.9.5 报告 | **93.10% Pass@1** | [作者报告](https://midscenejs.com/android-world-benchmark-report)：Gemini-3.5-Flash、DeepThink、循环上限 120；说明了环境稳定性修复及部分判定器修改，不能省略这些条件 |
| UI-Venus-2-27B | **84.0%** | [作者当前结果表](https://github.com/inclusionAI/UI-Venus#-benchmark-results)，属于专用模型路线，非与上面闭源模型组合相同条件 |
| MAI-UI-8B | **70.7%** | 社区榜中的开放 8B 版本；235B 的 76.7% 是另一型号，不能说开放 8B 达到 76.7% |
| UI-TARS-1.5 | **64.2%** | [作者 README](https://github.com/bytedance/UI-TARS#performance)；旧版本代表基线，不作为当前最高分结论 |

Midscene 的 Pass@2/3 与 Pass@1 分开；不拿多次尝试的最好结果与别人单次成功率比较。不把榜单中的 AutoGLM-Mobile 80.2% 直接赋给当前 Open-AutoGLM + AutoGLM-Phone-9B；它们名称、模型及工具条件不同。Mobile-Agent-v3 的 73.3% 与 GUI-Owl-1.5 的结果也分别保留，不通过版本号推断分数必然上升。

### 3.2 更难的 MobileWorld：选择同一列再读数

MobileWorld 分为 GUI-only、用户交互、MCP 三类。以下仅列 **GUI-only 的 117 项、50 步**，不是 201 项整体成绩。

| 组合 | GUI-only 成功率 | 来源和限制 |
|---|---|---|
| Qwen-UI-Agent | **82.1%** | [基准公开结果数据](https://github.com/Tongyi-MAI/MobileWorld/blob/main/site/leaderboard.json)，单次；实现/权重可得性另核实 |
| UI-Venus-2-27B | **76.1%** | [作者结果表](https://github.com/inclusionAI/UI-Venus#-benchmark-results)；100 步报告 82.9%，这里不混用 |
| UI-Venus-2-9B | **65.8%** | 同一作者表；较小模型方向值得对照，不据此承诺本机资源足够 |
| GUI-Owl-1.5-32B-Instruct | **43.9%** | 基准公开结果数据，3 次试验；与框架额外分工的组合分开 |
| MAI-UI-8B | **27.5%** | 基准公开结果数据，单次；AndroidWorld 与 MobileWorld 的数值不能横向相减作统一退化率 |

榜单可收录作者或社区报告，不能把“出现在基准官网”自动写成独立复现。任务随机参数、试验次数、历史图数、动作工具、模型版本和判定器仍需逐项固定。

**关于高分的工程结论**：AndroidWorld 已出现多项满分报告，仍值得作基础能力与复现入口，但单独用它难以代表中文商业 APP、鸿蒙 6/7、采集记录完整性及长期行为质量。分数与项目适配分别判断。

## 4. 可用的公开测试环境与数据

| 测试资料 | 实际测什么 | 本项目怎样使用与限制 |
|---|---|---|
| [AndroidWorld](https://github.com/google-research/android_world) | Android 模拟器在线任务，116 项 / 20 APP，程序初始化和核对 | 用于对照通用能力和复现公开组合；其环境和验证器不直接在 NEXT 运行 |
| [MobileWorld](https://github.com/Tongyi-MAI/MobileWorld) | 201 项 / 20 APP；长链路、跨 APP、用户交互、MCP；自托管环境 | GUI-only 与另两类分开；Docker/KVM 等环境成本先核对，非本版必须完整部署 |
| [AndroidLab](https://github.com/THUDM/Android-Lab) | 138 项 / 9 APP，预定义 Android 环境、子目标与冗余等指标 | 可参考系统 APP 和离线任务的完成核对；不是鸿蒙系统 APP 的即用套件 |
| [MobiFlow](https://github.com/IPADS-SAI/MobiAgent/tree/main/MobiFlow) | DAG 里程碑与多路径验证；从已采集轨迹检查任务进度 | 很适合参考中文商业 APP 的完成证据设计；需核对现有配置覆盖和误判，不能把 OCR/模型判定当绝对真值 |
| [VenusBench-Mobile](https://github.com/inclusionAI/UI-Venus/tree/VenusBench-Mobile) | 27 个 Android APP、149 个主要任务及 80 个变体；程序/模型核验 | 适合参考模糊条件、噪声与稳定性诊断；Android 环境与鸿蒙迁移分别验证 |
| [AndroidControl](https://github.com/google-research/google-research/tree/master/android_control)、[AITW](https://github.com/google-research/google-research/tree/master/android_in_the_wild) | 离线截图、指令、动作轨迹 | 帮助区分看图、定位、动作错误；动作匹配不等于在线任务完成 |
| [CAGUI](https://huggingface.co/datasets/openbmb/CAGUI) | 中文 APP 的 grounding 与 Agent 评测资料；数据卡注明 CC-BY-NC-4.0 | 补中文页面诊断；来源见 [AgentCPM-GUI](https://github.com/OpenBMB/AgentCPM-GUI#evaluation-data)，不等于覆盖鸿蒙版同名 APP；数据许可与代码许可分开 |
| [ScreenSpot](https://github.com/njucckevin/SeeClick#gui-grounding-benchmark-screenspot) | 静态画面中按指令定位元素；含手机/桌面/网页 | 先关注手机子集。ScreenSpot-Pro 偏专业桌面难定位，不能拿其分数当手机端到端成功率 |

以上“公开”不表示代码、权重、图片与 APP 安装包统一采用相同许可。准备下载时核对对应资源的可取得性与条款，不默认要求训练模型或下载全部资料。

本轮没有核实到一套可以直接覆盖 **鸿蒙 6/7 + 系统 APP + 所选常用商业 APP** 的现成统一评测套件。因此建议保留一组项目自己的鸿蒙实测活动，公开测试作参考或对照。这里不提前生成未来版本用例，也不把 Android 用例简单改名当鸿蒙用例。

## 5. 我的推荐，供用户取舍

### 5.1 优先深入的三项框架

1. **Midscene**：若优先考虑 Windows/现有 Node 工程衔接、网页调试和可替换模型，建议作为第一个安装验证候选。选它的理由是可用的 NEXT 路径和调试能力，不是将其公开分数认定为最高。
2. **MobiAgent**：应与 Midscene 同列重点比较，尤其贴近中文常用 APP、轨迹采集与多路径完成验证。需要量化 Python 侧桥接、依赖、截图留存和 Harmony 具体实现的成本。先把可选偏好记忆与操作复用关掉验证基础能力，再根据证据决定是否引入。
3. **Open-AutoGLM**：建议保留为单步执行和官方 HDC 路径的基线。循环相对直接，便于定位模型与工具问题；实际进度、业务核对和持久化恢复由适配层补足。

以上是**优先试验名单**，没有替用户选定。是否把其中两项放入同批真机对照，等待用户看完资料后决定。

### 5.2 高分方案怎样纳入

- 若愿意投入鸿蒙控制层迁移，**Mobilerun、ARTEMIS、Minitap mobile-use**值得评估；优先看它们的反馈循环、输入核对、循环退出和日志，而不是直接复制整个测试平台。
- 若重点是开放权重模型的能力，建议关注 **UI-Venus-2 与 MAI-UI 已开放版本**；作为模型/动作协议路线验证，不能默认与现有 SDK 直接兼容。
- **Qwen-UI-Agent**值得跟踪，82.1% 的 MobileWorld 报告很突出，但不能以报告存在代替“当前已取得完整可运行代码和权重”。
- **FinalRun**适合参考用例、报告与调试交付；**AppAgentX**适合后续研究重复行为加速，不把行为库设为本版前置条件。

若所有候选在同一批鸿蒙活动上都达不到需要的效果，再依据失败类型讨论模型分工、定位补强或任务拆解。当前不按论文最高分提前重写系统。

## 6. 共同验证门槛与两条控制路线

选中候选试验时，先固定 commit/tag、模型和提示版本、设备系统构建、APP/账号和起始条件。官方 HDC 路径只证明存在实现方向，不能直接宣称鸿蒙 6/7 全部兼容。

共同门槛为：Windows 上可启动；能观察并操作指定 NEXT 设备；动作发送前可持久化；全部实际采集图可留存；可记录真实模型和工具调用；可停止并说明未完成原因；完成结果可通过证据复核。短暂工具超时不代表动作未发生，不能默认自动重发。

原生 SDK 先验证其已有控制、记录和完成判断；hipyum 路线再核对截图/动作语义、时序、输入、错误和改造量。先比较，暂不要求实现两套，同一时段只有一个运行控制同一手机。

保持现有程序管进度、上层管每日活动、下层管当前活动操作的边界。框架内部工作记忆不升级为长期记忆系统；实时视觉与后续逐图存档 VLM 分开。当前资料比较也不替代本版要求的独立测试用例与测试调试界面交付。

### 6.1 允许外部模型后的组合比较

建议首轮采用“Windows 运行 Agent 框架 → HDC/选定设备接口操作鸿蒙手机 → 截图与活动上下文调用外部视觉模型”的部署方式。手机不必先部署模型权重；这是本轮工程建议，不冻结后续端侧路线。

| 候选组合 | 已核对的官方依据 | 需要比较的内容 |
|---|---|---|
| Midscene + Qwen 或 Doubao Seed API | [官方模型指南](https://midscenejs.com/model-selection)与[配置示例](https://midscenejs.com/model-common-config)列出对应模型适配 | 从账号实际可用的一个视觉型号开始；检验鸿蒙中文页面、动作格式、耗时、调用量和费用，不根据系列名保证效果 |
| Midscene + Gemini API | 同一官方指南有适配；已有 AndroidWorld 公开组合供参考 | 作为另一模型对照，固定实际型号；先前 Gemini 报告不等于其他型号或鸿蒙真机成绩 |
| Open-AutoGLM + AutoGLM-Phone 外部服务 | [官方 README](https://github.com/zai-org/Open-AutoGLM)列出外部模型服务配置 | 核对当前账号访问和动作协议，作为专用模型/单步循环的基线，不直接用任意文字模型替换 |
| MobiAgent + 远程模型端点 | [runner 文档](https://github.com/IPADS-SAI/MobiAgent/blob/main/runner/README.md)提供按角色配置兼容端点 | 还需找到实际可用服务与匹配模型；支持远程端点不等于已核实存在即用的 MobiMind 托管 API，其他模型需核对提示和解析 |

先使用一个具备图像输入和动作能力的默认模型验证基础循环；出现明确问题后再比较规划、定位、核对分工。Midscene 的角色配置可分开，但不要求首轮同时部署多种模型。框架和模型最终组合继续由用户决策。

当前不编造价格或费用排名。拿到实际型号与账号后核对官方单价，再按同批任务记录图像/文本用量、重试、总耗时和真实账单/可得用量，比较每次成功任务的总成本，而不只比较每百万 token 单价。此处尚未发起模型请求。

## 7. 逐步确认，不一次问完

已知：NEXT、鸿蒙 6 或 7、可连接电脑和调试、系统及常用 APP 两类首测、两条控制路线先比较；测试截图允许发送外部模型服务，先比较外部服务方案。

用户已明确**暂不提供模型账号信息，留出配置界面后自行填写**。现已在系统设置中提供[模型服务配置界面](MODEL_SERVICE_SETTINGS.md)，允许先保存草稿和角色预设；不会据此调用模型或切换 Mock。账号不再作为当前资料比较的前置问题。实际型号/端点在试验准备时通过页面填写，首批 APP/活动、hipyum 接口和试验预算再逐项确认，不要求现在一次答完。

## 8. 本轮实际完成与局限

完成候选扩展、公开分数与设置核对、测试资料分类和工程推荐；同步需求稿、版本计划和开发清单。没有安装依赖或刷机，没有连接真实手机，没有请求付费模型，没有新的成功率实测，也没有把产品标成 v0.4 完成。

本机检查仅确认 Node 可找到、当前 PATH 未找到 hdc、Python 命令指向 WindowsApps 别名；不能据此判断磁盘上完全没有相关工具。Midscene npm 发布元数据本轮读取到 `@midscene/harmony=1.16.0`；上述 93.10% 是作者 **1.9.5** 组合的报告，不冒充 1.16.0 的效果。安装阶段仍需锁定整套依赖并复核同版本源码。

公开网页、分支与榜单可能更新，引用的是 2026-10-20 本轮看到的内容；不同来源更新不同步已分别注明。本报告供决策，后续用同批真实鸿蒙活动补齐效果、费用和适配工作量。
