# v0.4 最小真实验证：首测建议与实际准备结果

日期：2026-10-21，Asia/Hong_Kong。本轮用户指令恢复推进 v0.4，优先于交接时“只审核 14 条定义、暂停新增功能”的范围。已读取 AGENTS、CURRENT_STATUS、NEXT_TASK、README、模型用量约定、框架/基准/用例资料，并核对验证台、设备记录包装、模型配置/探针与已安装 SDK 源码。

**最新接续：用户已确认 Midscene 1.16.0 首试，最终框架 null；HDC/设备基线与有界 runner 随后就绪，HM-SYS-001 已实际执行，4 图片请求/4 滚动/41.918 秒，partial、GUI 任务未通过。** 最新事实、回放和最少剩余条件见[真实首题报告](REAL_GUI_TRIAL_20261021.md)。[结构化计划](reference/V04_MINIMAL_REAL_VALIDATION_20261021.json)已更新执行状态；下文保留此前零调用预检/准备阶段历史，不再沿用“缺 HDC / 0 attempts”的旧状态。

## 1. 为什么推荐这个首测候选

这是对首测衔接条件的判断，不是成功率排名，也不是长期/百对象任务总成本结论。

| 候选 | 已核对事实 | 本轮建议 |
|---|---|---|
| Midscene 1.16.0 | 本机安装版本与清单一致；有单任务循环，官方 NEXT/HDC 与 JavaScript SDK；官方示例使用 qwen3.7-plus / qwen3 | 推荐作为首个只读系统任务的试验候选；仍需接图片、传输限额、记录与完成核对 |
| MobiAgent | 官方 runner 仍列 Harmony、端到端及角色配置；本机没有已安装的可运行环境证据 | 保持与 Midscene 同级的详细比较候选；不要求等 Midscene 失败才研究它 |
| Open-AutoGLM | 官方仍提供 --device-type hdc；动作协议需匹配模型 | 保留单步基线；不默认现有通用模型可直接替换其配套协议 |

本轮在线复核：[Midscene Harmony 指南](https://midscenejs.com/platforms/harmonyos)、[模型组织](https://midscenejs.com/model-selection)、[MobiAgent runner](https://github.com/IPADS-SAI/MobiAgent/blob/main/runner/README.md)、[Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM)。动态文档可能继续更新，真实 attempt 要同时固定本机版本与提示/协议。

模型建议先用单个 **qwen3.7-plus**：Midscene 官方 Harmony 示例给出该组合，阿里云[模型页](https://help.aliyun.com/zh/model-studio/qwen3-7-plus)明确图片输入；这是文档兼容依据，本机图片与动作协议仍未验证。暂不三模型全组合，不重测历史 OK 文本。

已有凭据不需要用户重新提供。四角色全绑定、hipyum 来源、商业 APP 账号及百对象规则均不是首个只读系统任务的先决条件；隔离试验可以显式指定单个服务而不改全局绑定。调用路线仍须遵守已有用量规则。[Token Plan 使用范围](https://help.aliyun.com/zh/model-studio/token-plan-personal-overview)明确区分工具内交互式使用与自动化脚本/自定义后端；不能默认当前套餐密钥可供自建 runner 使用，也不能把该密钥移到标准 API 地址尝试。先核对实际接入路线；需要标准 API 时由用户在现有设置页配置允许该用途的服务。

## 2. 首题与最小测试次序

首题 **HM-SYS-001** 是项目系统 APP 小任务：

> 从系统设置首页出发，进入“关于本机/关于手机”，读取页面可见的设备型号及 HarmonyOS 系统版本。保持在该页面，不修改设置；未显示的字段说明未显示。

测试者打开设置首页属于人工准备，应单独计入记录。候选必须根据实际截图决定并执行后续导航。系统元数据、人工导航、模型完成宣称都不能代替候选 GUI 通过。

1. **设备基础检查，0 模型请求**：HDC 版本与唯一目标；只读采集型号/完整构建/API、设置 APP 版本；获取初始原图并核对尺寸、旋转与坐标。未知字段保留 null/原因。当前未能开始此设备阶段。
2. **有界真实候选任务**：候选确认后接通 runner；以首题的真实初图同时核对图片/动作协议，避免另跑一轮文本探针。保存所有内部模型请求、动作与实际截图。若不兼容，留下该次失败及 usage，停止，不静默换模型或重试。
3. **独立完成核对**：按首题 M1–M3 整理图像/步骤/版本证据，提出助手初判，交用户审核；不加一个默认收费核验模型。
4. **常用 APP 后续项**：已有 GUI-004（QQ 音乐设置 30 分钟定时关闭）仅作条件候选，待实际安装/版本、初态、修改与恢复条件核对后安排；未排期、未执行。未将范围永久缩为系统 APP。

首题来源于现有 `system_read` 的任务意图，另建真实证据要求；没有执行对应 Mock。它是补充的项目自有任务，不混入原 14 条冻结集，不冒充公开 Android 基准任务。

建议首 attempt 上限：1 次任务、4 次模型请求（含内部规划/定位/核验）、6 次设备动作、每请求最多 512 输出 tokens、总时限 180 秒、0 自动重试、关闭思考、0 存档描述请求。这些是**待 runner 落实的工程默认**，尚无真实硬限制实现；不能由 SDK 规划步数代替总请求数。实际 SDK 提示与图片包在发送前应检查并固定字节/图数上限；字节限制不等于输入 token 硬上限。usage 缺失时记未知，实际 Credits/费用未知时不补零。

## 3. 本轮实际结果与证据

| 范围 | 实际结果 | 边界 |
|---|---|---|
| 环境预检 | Windows x64 / 10.0.26300，Node v24.19.0；Midscene 1.16.0；配置 revision=3，三项凭据存在、四角色 null | 只读取配置公开字段与凭据存在性，不读取/输出 key |
| HDC 发现 | PATH、HDC_HOME 未找到；补查 C/D Program Files、D:/tools、常见 Huawei/DevEco/OpenHarmony 目录与安装注册信息未发现 | 不是全盘不存在证明；HDC 命令实际发送 0，target_count=null，不能记“设备数 0” |
| USB/PnP | Win32_PnPEntity 查询返回“无法从客户端中访问 CIM 资源” | USB 连接状态未知；没有借此推断未连接，也未请求额外系统权限 |
| SDK 契约复核 | 1.16.0 实际 Tap → 假 HDC，intent/fake_hdc_click/outcome 顺序通过 | framework_loop_executed=false、model_calls=0，不是真机或候选循环 |
| 定向工程检查 | 新预检 3 项＋既有模型探针 2 项，**5/5 通过** | SQLite 只读与密钥不导出、缺 HDC 不发命令、工具参数/失败不重试；工具与服务均为替身；没有重跑全量 46 项 |
| 真实 GUI 首题 | **受阻，未执行，attempt 数 0** | 实际动作 0、手机截图 0、模型请求 0、tokens 0；任务耗时尚不存在，不能拿预检的 7 ms 当任务耗时 |

证据：

- [本轮预检快照](evidence/20261021-v04-minimal/preflight.json)与[原始本机输出](../output/v04_minimal_real_20261021/preflight.json)。
- [本轮 SDK 离线契约输出](evidence/20261021-v04-minimal/sdk-contract.json)。
- [定向测试原始输出](evidence/20261021-v04-minimal/tests.txt)。
- 可复跑的[预检脚本](../scripts/v04-preflight.mjs)，不导入 SDK、不请求模型、不发设备 shell/GUI 命令；若找到 HDC，仅执行 version 和 list targets，目标标识只保存哈希。

现有 `src/gui-lab.mjs` 仍拒绝 real 模式，所有旧 Mock 事件仍标 mock_fixture；本轮没有把真实结果塞进 Mock 数据表或主仿真数据。

## 4. 最少缺失条件及责任

| 条件 | 谁处理 | 本轮状态 / 最小下一动作 |
|---|---|---|
| 首测试验候选 | 用户决定 | 已同意先试 Midscene；仅代表首测，不代表最终选型 |
| 可访问的设备工具和手机 | 用户提供本机条件；助手验证 | 提供已有 hdc.exe/SDK 路径，USB 连接并在手机允许调试；若尚未安装，从[华为官方工具入口](https://developer.huawei.com/consumer/cn/download/)准备 HDC。无需先提供所有商业 APP/账号 |
| 设备基线与截图 | 助手执行 | 前项具备后采集真实型号/构建/APP 与初图；无需用户手写版本清单 |
| 有界执行、模型协议和证据贯通 | 助手实现 | 所选候选的实际传输重试/请求/输出限制、受限动作、持久化、停止和独立核对尚未接通；这是项目缺口，不让用户提供现成 runner |
| 可用于实际执行路线的模型服务 | 助手先核对；必要时用户配置 | 已有模型/凭据可读，视觉能力只有文档依据。工具内交互接入与自建自动化 runner 的许可范围分别判断；不先要求重交密钥或新采购 |

候选回复已收到；HDC 尚未安装，手机稍后连接。自动下载受浏览器/登录流程阻碍，用户手工下载官方 Windows 包后提供本机路径即可继续。真机可视化补充选择为 DevEco Testing UIViewer；未安装、未做其 GUI 验证。长活动数量/去重、hipyum、完整 14 条审核、存档 VLM 与生产部署预算都可后置。上文原预检/测试为确认前的历史快照，保留不覆盖。

## 5. 首个真实任务必须交付什么

结构化提案已逐文件列出输入、环境、events、全部原图、模型调用与结果。执行时新建独立目录，开始前写输入/环境，调用前写请求开始，动作前 flush 意图；未知效果停止，不自动重放。

每张实际原图须记录哈希、时间、步骤、动作前后语义、尺寸和格式；模型的真实输入/响应脱敏保存，图片按原图哈希引用，不保存密钥/请求头。结果按里程碑引用证据，记录任务真实耗时（含等待）、全部调用与动作计数、可得 input/output/cache/reasoning usage、未知用量数、人工介入与停止原因。助手初判与用户审核分开。

当前只有计划与预检，没有 attempt 目录、真机图像或 GUI 完成证据。它们必须在实际运行时产生，不能用占位图/空字段模板补成通过。下次继续从候选和设备条件接续，不重建主系统或再跑三个文本 OK。

2026-10-21 首试确认后补验：预检已读取 trial_framework=midscene，final_framework=null，不再列候选待确认；HDC 仍 not_found。新增确认边界检查后定向测试 **6/6 通过**；[新预检](evidence/20261021-v04-minimal/preflight-after-confirmation.json)、[测试输出](evidence/20261021-v04-minimal/tests-after-confirmation.txt)。原始 5/5/预检快照保留；仍 0 真实 GUI attempts、0 模型请求。
# 最新接续结果

本文后文保留准备阶段历史。设备连接与有界 runner 随后已就绪，真实 HM-SYS-001 已执行一次，4 图片请求/4 滚动/41.918 秒；**partial、GUI 任务未通过**，最终框架未定。最新事实、最少剩余条件与本机回放见 [真实首题报告](REAL_GUI_TRIAL_20261021.md)，不再沿用后文“0 attempts / 缺 HDC”的旧状态。
