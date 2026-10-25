# BehaviorLab · 用户行为序列仿真系统

当前核对：2026-10-25。源码为`0.5.0-preview.1`，v0.4核心开发与离线收尾按用户确认范围交接；尚未发布正式`0.4.0`包。功能基线`9929ed4`，完整交接与回退入口见[当前状态](docs/CURRENT_STATUS.md)、[下一任务](docs/NEXT_TASK.md)、[本地基线](docs/LOCAL_BASELINE.md)。

v0.5从`codex/v04-handoff-20261025`在本地分支`codex/v05-single-activity`推进。[头脑风暴](docs/V05_BRAINSTORM.md)及[需求基线](docs/V05_REQUIREMENTS_CLARIFICATION.md)已确认，纳入“具体活动不固化”的用户补充；[概要设计修订2](docs/V05_HIGH_LEVEL_DESIGN.md)经用户核对后进入离线实现。首轮已接通通用活动、来源冻结、证据与实际量、有界恢复和人工兜底，见[离线实现记录](docs/V05_OFFLINE_IMPLEMENTATION.md)。商品浏览仅首个案例，具体活动来自上层输入。主系统真实框架会话桥接／续接尚未完成；手机与真实模型继续暂停。

## 当前能做什么

- 主系统的用户库、任务、日调度、虚拟时间、持久化、调用追踪、执行/描述队列和导出实际运行；旧Mock兼容，新增显式离线夹具装配、单活动调试和人工复核。真实上层、手机执行和存档VLM尚未接入。
- 独立[真机工作台](http://127.0.0.1:4317/phone-lab)已接通三个实际框架循环和HDC，具备任务、测试、过程、结果四页签，可查看每图原始模型回复、动作、手机信息、耗时与用量。
- 保留Midscene、MobiAgent、Open-AutoGLM及现有模型接口，由用户配置组合。默认推荐**Midscene + qwen3.7-plus**，用户改选后保留；这是四题3通过1部分完成的样本建议，不是稳定最优结论。[已确认策略](docs/FRAMEWORK_SELECTION_DECISION.md)。
- [v0.4证据核对页](http://127.0.0.1:4317/v04-acceptance)将31项要求的证据、缺口与后续事项分别列出。新增执行保护与审核优先级做过离线验证，未追加真机任务。
- HOScrcpy可直接在网页观看手机连续视频，不需打开官方工具；已有真实出帧证据，也存在未定位的断流，尚未证明长期稳定。[视频说明](docs/HOSCRCPY_VIDEO.md)。

**主调度已接入离线执行契约，真实下层会话尚未接通。** 这一接入属于v0.5；真实上层规划、存档逐图VLM及长期记忆引擎也未实现。

## 测试与真实能力分别统计

| 类型 | 最新事实 |
|---|---|
| 本机安装环境工程回归 | v0.5当前154/154通过，0失败、0跳过；没有真实模型/手机调用 |
| v0.5网页实际操作 | 隔离4391核对商品实际量、自动恢复、人工复核与非商品条件核验；均为合成夹具 |
| v0.4历史干净源码、无数据与依赖 | 129通过、4项依赖相关测试跳过、0失败；共133项 |
| 已安装原生Python循环离线契约 | 两框架各5条固定回复，中文与图片/动作协议通过；不是GUI成绩 |
| 历史短文本模型连通 | 三模型合计60 tokens；只证明当时文本接口可响应 |
| 历史真实GUI任务 | 计算器、存储、淘宝、小红书，三框架×三模型×四题=36单元；16通过、10部分完成、10未通过，用户复核待定 |
| 31项能力清单 | 已有证据6、范围有限13、已知缺口6、未验证2、后续事项4；不是31项全部执行或通过 |

历史工程回归124、26项推荐测试及18项工作台子集属于各自阶段，不能相加。矩阵331次模型请求，含诊断及被替换样本的历史累计373次；未知费用不记零。已有39运行、6任务、83起点、3服务未改。本次交接模型请求0、设备命令0。

[v0.5验证记录](docs/V05_OFFLINE_IMPLEMENTATION.md) · [v0.4交接证据](docs/evidence/20261025-handoff/handoff-verification.json) · [真实GUI结果](docs/PHONE_EVALUATION_RESULTS_20261022.md) · [失败诊断](docs/PHONE_FAILURE_DIAGNOSIS_20261022.md)

## 启动与离线测试

开发环境需Node.js 24。核心Mock无需安装前端依赖或编译；真实框架依赖另行部署，安装与设备检测不会自动授予业务通过。

```powershell
node scripts/desktop-launcher.mjs stop
node scripts/desktop-launcher.mjs start --port 4317 --no-browser
node --test tests/*.test.mjs
```

也可前台执行`node src/web-server.mjs --port 4317`，Ctrl+C停止。主入口为`http://127.0.0.1:4317`，真机工作台为`/phone-lab`，验收页为`/v04-acceptance`。后台不自动热重载：原4317服务没有重启，不会自动加载v0.5源码；本轮使用独立4391及临时数据验证。使用新源码前备份运行库，再正常重启，schema升级至3。不要删除`.data`或`.runtime`来更新源码。

已安装框架的离线原生契约：`node scripts/phone-framework-contract.mjs`；`03_CHECK.cmd`为依赖/SDK检查，不是手机任务。核心Mock示例及独立执行/描述、恢复、导出方法见[开发说明](docs/DEVELOPMENT.md)与[业务流程](docs/WORKSPACE_V03.md)。

## Windows部署与私人迁移

已交付的[干净包](output/BehaviorLab-Phone-Windows-x64-20261023.zip)和[私人包](output/BehaviorLab-Phone-Windows-x64-20261023-Private.zip)均为**preview.9**，未包含之后的preview.10源码改动。两包包含Node、Python、HDC、三框架及Java/HOScrcpy运行依赖。

完整解压后先`03_CHECK.cmd`，再`01_START.cmd`；停止用`02_STOP.cmd`。私人包含6任务/83起点/39运行与3个模型配置：先在原电脑同一Windows账户查看ZIP外的迁移密码，新电脑启动前运行`04_IMPORT_KEYS.cmd`输入密码。密钥以迁移密码认证加密，导入后由目标Windows账户DPAPI保护；原开发数据库兼容旧格式，本次未改写。详情见[部署](docs/WINDOWS_PORTABLE.md)和[私人迁移](docs/PRIVATE_MIGRATION.md)。

私人包包含原始历史截图，只用于授权电脑间迁移。源码Git与恢复bundle不含运行数据、凭据、数据库、缓存、依赖或发布ZIP。第二台物理电脑尚未验收。

## 下一阶段与协作

当前处于v0.5实现与验证阶段，唯一下一步为补齐原生框架会话桥接／安全续接的离线契约，真实执行仍暂停。已确认的需求和进入实施授权无需重复询问。通用目标来自上层，固定步骤限于合成夹具；尚未宣称v0.5整体完成。详见[下一任务](docs/NEXT_TASK.md)。

每轮源码/测试/文档改动都提交本地Git，不设置远程、不推送。开新对话先读[AGENTS.md](AGENTS.md)、[CURRENT_STATUS.md](docs/CURRENT_STATUS.md)和[NEXT_TASK.md](docs/NEXT_TASK.md)。框架入口和公共记录边界见[协作开发](docs/DEVELOPMENT.md)、[适配契约](docs/FRAMEWORK_ADAPTER_GUIDE.md)，用量按[调用规则](docs/MODEL_CALL_POLICY.md)执行。
