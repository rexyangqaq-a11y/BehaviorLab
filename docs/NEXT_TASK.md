# 下一任务：补齐v0.5原生会话桥接的离线契约

## 当前唯一下一步：完成v0.4 GitHub首发

2026-10-25用户新指令优先：公开仓库`rexyang97/BehaviorLab`，v0.4首发，v0.5保留开发分支，包含当时已有测试用例、轨迹与结果。当前阶段为**发布准备与验证**。先落实用户对含个人／设备信息截图的公开方式及CLI授权，再完成最终ZIP、校验与提交／上传；不重复询问已确认的仓库可见性或首发版本。事实和恢复入口见[GITHUB_RELEASE_STATUS](GITHUB_RELEASE_STATUS.md)。

以下原生桥接任务保留为v0.5后续开发事项，发布期间不继续编码；现有离线实施授权与已确认需求不丢失，手机和真实模型仍暂停。

交接日期：2026-10-25。当前阶段是**实现与验证**，源码`0.5.0-preview.1`，分支`codex/v05-single-activity`。用户已核对概要设计并以“继续”授权离线实施；需求、设计与进入实施无需重复确认。事实以[CURRENT_STATUS](CURRENT_STATUS.md)和[首轮实现记录](V05_OFFLINE_IMPLEMENTATION.md)为准。

## 唯一下一步

补齐主执行器与三种原生框架的会话桥接／安全续接离线契约。现有主调度通过统一注册边界运行注入适配器；完整模型运输、会话和控制保护仍主要位于phone-lab worker，不能将当前夹具集成称为真实下层接通。

先核对原生循环的观察、发送、停止及续接边界，用合成图、固定回复、注入设备验证安全续接，不重新执行原prompt、不重放已派发动作。无法证明续接能力时显式attention，不伪造恢复通过。继续保留旧Mock、独立phone-lab、四角色绑定和三框架选择。

## 开始前必读与现状

1. 根目录[AGENTS](../AGENTS.md)、[README](../README.md)、[版本开发流程](VERSION_DEVELOPMENT_WORKFLOW.md)。
2. [头脑风暴B01–B10](V05_BRAINSTORM.md)、[需求修订3](V05_REQUIREMENTS_CLARIFICATION.md)、[概要设计修订2与实施反馈](V05_HIGH_LEVEL_DESIGN.md)、[版本计划](VERSION_PLAN.md)、[随版测试要求](VERSION_TEST_PLAN.md)。
3. [实现记录](V05_OFFLINE_IMPLEMENTATION.md)中的场景追踪／限制、[框架契约](FRAMEWORK_ADAPTER_GUIDE.md)、[模型调用规则](MODEL_CALL_POLICY.md)、[本地基线](LOCAL_BASELINE.md)。

先检查Git，保留用户改动，不重新创建分支或reset。首轮已实现来源冻结、schema 3、完成证据／实际量、有界恢复、人工复核与调试页；154项工程测试通过，网页有合成数据证据。原生Python契约与主调度替身派发分开统计。未发布新版ZIP，私人运行库未迁移，现有4317没有重启。

源码重点：`src/runtime-assembly.mjs`、`src/framework-runtime.mjs`、`src/adapters/offline.mjs`、`src/device-lease.mjs`、`src/execution-review.mjs`、`src/scheduler.mjs`、`src/store.mjs`；对照`scripts/phone-lab-worker.mjs`、`integrations/adapters/`和`integrations/phone_protocol.py`。实际新增表为快照／revision工作JSON／事件，尚未拆独立对象与复核关系表。

## 保持的边界

- 活动APP、目标、条件和数量来自上层／任务，商品只是首个案例，生产执行链不写死购物脚本。版本顺序v0.5下层部分接入→v0.6真实上层→v0.7存档VLM。
- 自动观察与有界恢复先行，人工最后兜底。保存意见零动作，继续／结束独立；未知结束保留attention与已知量，已知结束不推进下一活动。
- 设备全局排他、来源冻结、原始证据、描述失败只补已有图、实际不足量partial与去重规则继续有效。
- 手机、模型、视频、探针、旧队列保持暂停；历史每题15请求不构成新调用授权，不补四题矩阵、不强行百对象测试。恢复真实执行需用户明确恢复并核对条件。
- 所有工程验证用临时数据，隔离端口；已有4317和私人库不为离线契约重启或迁移。新版使用旧库前备份再重启；不能删除`.data`或`.runtime`。
- 每轮改动验证后本地Git提交，进行中标WIP；核对暂存路径，不含凭据、原始手机图、库、依赖、输出包，不设置远程、不推送。

## 验证与交付

```powershell
node --test tests/v05-runtime.test.mjs tests/phone-action-effects.test.mjs tests/phone-workbench.test.mjs tests/phone-process.test.mjs
node --test tests/*.test.mjs
```

按改动范围运行有意义检查，真实来源保持禁用。原生离线契约应另存本轮输出，避免覆盖历史日志。分别报告替身集成、原生循环、网页实际操作、真实手机效果和未验证范围，不能把HTTP200或注入图当成GUI成绩。同步CURRENT_STATUS、唯一下一步、源码／部署差异和本地提交。
