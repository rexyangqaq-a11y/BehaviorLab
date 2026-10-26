# BehaviorLab · 用户行为序列仿真系统

2026-10-26修复版：[v0.4.0-preview.11说明](docs/releases/v0.4.0-preview.11.md) · [Windows下载](https://github.com/rexyangqaq-a11y/BehaviorLab/releases/download/v0.4.0-preview.11/BehaviorLab-v0.4.0-preview.11-Windows-x64.zip)。真机工作台直接显示历史轨迹，模型配置支持编辑区保存，内置桌面起点可在测试间自动复原。用户已审视历史图片并授权公开分发；v0.5仍在开发分支。


Windows本地用户行为仿真与独立手机Agent测试工作台。本分支提供 **v0.4.0-preview.10**，功能来自v0.4交接基线；v0.5保留开发分支，不混入本包。仓库和Release均为私有，需要登录有权限的GitHub账户下载。

[下载版本](https://github.com/rexyangqaq-a11y/BehaviorLab/releases) · [部署与更新](docs/DEPLOYMENT.md) · [使用教程](docs/USER_GUIDE.md) · [版本计划](docs/ROADMAP.md) · [版本差异](CHANGELOG.md) · [本版说明](docs/releases/v0.4.0-preview.10.md) · [发布验证记录](docs/RELEASE_PUBLICATION.md)

下载Assets中的 `BehaviorLab-v0.4.0-preview.10-Windows-x64.zip`，完整解压后运行 `03_CHECK.cmd`，再运行 `01_START.cmd`；停止用 `02_STOP.cmd`。Windows10/11 x64，包内带Node/Python/HDC和框架依赖。GitHub自动的Source code ZIP仅含源码。

发布包随附v0.4当时已有测试用例、36项历史矩阵的轨迹、1,486张历史原图和结果，含失败记录。按用户授权直接纳入私有Release。打开 `test-archive/index.html` 可离线逐项查看；另提供同内容的独立测试档案下载。[归档范围与分发说明](docs/RELEASE_TEST_ARCHIVE.md)。

| 功能 | 当前边界 |
|---|---|
| 主系统 | 用户库、任务、调度、持久化和导出实际运行；生成内容和手机闭环仍Mock |
| 独立手机工作台 | 三框架／模型组合、起点、逐图模型回复、动作、结果与审核；需自己配置设备和模型 |
| 历史真实测试 | 四题×三框架×三模型：16通过、10部分完成、10未通过；用户复核待定，新保护协议未真机复测 |
| 后续开发 | v0.5接下层、v0.6真实上层、v0.7存档VLM；后续尚未完成的能力不计入本版 |

源码开发需Node24：`node src/web-server.mjs --port 4317`；`node --test tests/*.test.mjs`。主Mock无需安装npm依赖。真实任务、模型费用与手机权限由使用者明确发起；查看历史不会自动执行测试。

源码Git和发布包不带私人模型配置、密钥、运行数据库及无关私人任务。第三方许可证随包保留；项目自身尚未指定开源许可证。

## v0.4交接历史快照

以下保留2026-10-25交接时记录；其中“尚未发布”“仅本地Git”和旧ZIP说明属于当时状态，发布维护以文首及[发布流程](docs/RELEASE_PROCESS.md)为准。

当前核对：2026-10-25。源码为`0.4.0-preview.10`，v0.4核心开发与离线收尾按用户确认范围交接；尚未发布正式`0.4.0`包。功能基线`9929ed4`，完整交接与回退入口见[当前状态](docs/CURRENT_STATUS.md)、[下一任务](docs/NEXT_TASK.md)、[本地基线](docs/LOCAL_BASELINE.md)。

## 当前能做什么

- 主系统的用户库、任务、日调度、虚拟时间、持久化、调用追踪、执行/描述队列和导出实际运行；人设补全、规划调整、主流程手机执行/截图、存档图转文内容仍为Mock。
- 独立[真机工作台](http://127.0.0.1:4317/phone-lab)已接通三个实际框架循环和HDC，具备任务、测试、过程、结果四页签，可查看每图原始模型回复、动作、手机信息、耗时与用量。
- 保留Midscene、MobiAgent、Open-AutoGLM及现有模型接口，由用户配置组合。默认推荐**Midscene + qwen3.7-plus**，用户改选后保留；这是四题3通过1部分完成的样本建议，不是稳定最优结论。[已确认策略](docs/FRAMEWORK_SELECTION_DECISION.md)。
- [v0.4证据核对页](http://127.0.0.1:4317/v04-acceptance)将31项要求的证据、缺口与后续事项分别列出。新增执行保护与审核优先级做过离线验证，未追加真机任务。
- HOScrcpy可直接在网页观看手机连续视频，不需打开官方工具；已有真实出帧证据，也存在未定位的断流，尚未证明长期稳定。[视频说明](docs/HOSCRCPY_VIDEO.md)。

**独立真机工作台尚未接入主仿真调度。** 这一接入属于v0.5；真实上层规划、存档逐图VLM及长期记忆引擎也未实现。

## 测试与真实能力分别统计

| 类型 | 最新事实 |
|---|---|
| 本机安装环境工程回归 | 133/133通过，0失败、0跳过；没有真实模型/手机调用 |
| 干净源码、无数据与依赖 | 129通过、4项依赖相关测试跳过、0失败；共133项 |
| 已安装原生Python循环离线契约 | 两框架各5条固定回复，中文与图片/动作协议通过；不是GUI成绩 |
| 历史短文本模型连通 | 三模型合计60 tokens；只证明当时文本接口可响应 |
| 历史真实GUI任务 | 计算器、存储、淘宝、小红书，三框架×三模型×四题=36单元；16通过、10部分完成、10未通过，用户复核待定 |
| 31项能力清单 | 已有证据6、范围有限13、已知缺口6、未验证2、后续事项4；不是31项全部执行或通过 |

历史工程回归124、26项推荐测试及18项工作台子集属于各自阶段，不能相加。矩阵331次模型请求，含诊断及被替换样本的历史累计373次；未知费用不记零。已有39运行、6任务、83起点、3服务未改。本次交接模型请求0、设备命令0。

[最新验证证据](docs/evidence/20261025-handoff/handoff-verification.json) · [真实GUI结果](docs/PHONE_EVALUATION_RESULTS_20261022.md) · [失败诊断](docs/PHONE_FAILURE_DIAGNOSIS_20261022.md)

## 启动与离线测试

开发环境需Node.js 24。核心Mock无需安装前端依赖或编译；真实框架依赖另行部署，安装与设备检测不会自动授予业务通过。

```powershell
node scripts/desktop-launcher.mjs stop
node scripts/desktop-launcher.mjs start --port 4317 --no-browser
node --test tests/*.test.mjs
```

也可前台执行`node src/web-server.mjs --port 4317`，Ctrl+C停止。主入口为`http://127.0.0.1:4317`，真机工作台为`/phone-lab`，验收页为`/v04-acceptance`。后台不自动热重载：本次交接时原4317服务仍加载较早后端，需正常重启后才有新验收接口。不要删除`.data`或`.runtime`来更新源码。

已安装框架的离线原生契约：`node scripts/phone-framework-contract.mjs`；`03_CHECK.cmd`为依赖/SDK检查，不是手机任务。核心Mock示例及独立执行/描述、恢复、导出方法见[开发说明](docs/DEVELOPMENT.md)与[业务流程](docs/WORKSPACE_V03.md)。

## Windows部署与私人迁移

已交付的[干净包](output/BehaviorLab-Phone-Windows-x64-20261023.zip)和[私人包](output/BehaviorLab-Phone-Windows-x64-20261023-Private.zip)均为**preview.9**，未包含之后的preview.10源码改动。两包包含Node、Python、HDC、三框架及Java/HOScrcpy运行依赖。

完整解压后先`03_CHECK.cmd`，再`01_START.cmd`；停止用`02_STOP.cmd`。私人包含6任务/83起点/39运行与3个模型配置：先在原电脑同一Windows账户查看ZIP外的迁移密码，新电脑启动前运行`04_IMPORT_KEYS.cmd`输入密码。密钥以迁移密码认证加密，导入后由目标Windows账户DPAPI保护；原开发数据库兼容旧格式，本次未改写。详情见[部署](docs/WINDOWS_PORTABLE.md)和[私人迁移](docs/PRIVATE_MIGRATION.md)。

私人包包含原始历史截图，只用于授权电脑间迁移。源码Git与恢复bundle不含运行数据、凭据、数据库、缓存、依赖或发布ZIP。第二台物理电脑尚未验收。

## 下一阶段与协作

下一步仅推进**v0.5：把用户所选下层接入主调度的一个活动**，先做离线契约。用户已决定暂不使用手机、不强行执行百对象任务；不重跑已完成的四题矩阵，不重新要求唯一框架选型，不自动调用模型。

每轮源码/测试/文档改动都提交本地Git，不设置远程、不推送。开新对话先读[AGENTS.md](AGENTS.md)、[CURRENT_STATUS.md](docs/CURRENT_STATUS.md)和[NEXT_TASK.md](docs/NEXT_TASK.md)。框架入口和公共记录边界见[协作开发](docs/DEVELOPMENT.md)、[适配契约](docs/FRAMEWORK_ADAPTER_GUIDE.md)，用量按[调用规则](docs/MODEL_CALL_POLICY.md)执行。
