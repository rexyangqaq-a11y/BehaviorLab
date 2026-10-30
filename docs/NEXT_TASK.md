# v0.4 下一任务

日期：2026-10-31。当前阶段：本地R01/R02修复及固定框架依赖离线补验完成，220/220通过、0跳过、0失败；未更新原服务和已发布包。**唯一下一步：项目组核对本地正式候选清单，确认冻结范围与发布安排。** 不再将12项原生测试列为缺失，不自动开始R03或真实任务。

## 必须阅读

1. 根目录 `AGENTS.md`、[README](../README.md)、[CURRENT_STATUS](CURRENT_STATUS.md)。
2. [PRD](PRD.md)、[架构Spec](ARCHITECTURE.md)、[三模块分工](COLLABORATION_MODULES.md)、[文档规范](DOCUMENTATION_SPEC.md)。
3. [原审查与处理状态](CODE_REVIEW_V04_20261030.md)、[R01/R02修复](V04_RELIABILITY_FIXES_20261030.md)。
4. [最新补验与候选清单](V04_OFFLINE_CANDIDATE_20261031.md)、[核验清单](evidence/20261031-v04-native-validation/verification.json)。
5. [开发指南](DEVELOPMENT.md)、[贡献规范](../CONTRIBUTING.md)、[框架适配](FRAMEWORK_ADAPTER_GUIDE.md)。明确恢复发布后再读发布流程及已有发布记录。

## 已确认的决定

- preview.14为正式版功能基线；随后暂停正式发布，先补资料、审查与协作分工。
- 本轮仅v0.4，供项目组内部协作；按开源工程规范组织，许可证暂不确定；不纳入其他本地开发或语言更换议题。
- 保留三框架与模型接口，由用户配置；默认推荐不锁定唯一组合。PRD只有一类业务使用者。
- M1用户与行为规划；M2手机活动执行，含证据采集、存档和行为数据交付；M3整体中控平台，含工作台、仿真运行、公共基础、模块契约与软件部署升级。
- M2执行／存档／导出可独立推进；M3先提交执行结果，再请求M1反馈。相关模块共同定义契约，中控维护统一版本。
- 后续“继续”已用于R01/R02本地修复及本轮离线补验，没有恢复真实手机／模型、旧队列、正式发布或全模块源码重构。

## 当前源码、环境与记录

独立工作副本分支 `codex/v04-github-release`；本轮验证的业务源码 `7920d6d`，后续文档提交不改变该业务实现。已发布标签 `v0.4.0-preview.14` / `4da6336` 不变，勿改写或覆盖旧附件。

Node24.22.1、Midscene1.16.0、Python3.12.14、固定版本Python框架与依赖已在本工作副本的忽略目录恢复。原依赖配置未读取凭据；没有复制HDC、Java或用户数据库。其他电脑需按锁文件／可信部署包重建，不能假定忽略目录随Git存在。

全量220/220、原生定向组26/26、两框架中文／图像／动作契约通过；这些互有覆盖，不相加。HTTP诊断ZIP已用正常和损坏合成记录核对。原生夹具不是模型调用或真实GUI通过；原服务及私人库未重启／迁移。

## 启动与测试

在当前v0.4源码根目录，选择空闲端口与独立数据目录：

```powershell
git status --short
node src/web-server.mjs --port 4321 --data .build/dev-v04
```

浏览器打开 `http://127.0.0.1:4321/phone-lab`。当前仍不做设备检测、自动投屏或真实任务；Ctrl+C停止。不读取原私人库，不覆盖原服务源码。

```powershell
node --test --test-concurrency=1 tests/phone-grounding-recovery.test.mjs tests/phone-long-task.test.mjs tests/phone-protocol.test.mjs
node scripts/phone-framework-contract.mjs
node --test --test-concurrency=1 tests/*.test.mjs
node scripts/review-v04-source.mjs
```

新改动、失败或环境变化才重跑对应验证；纯文档无需重复全量。旧／未知锁保守阻塞，不能直接删除；坏账本不追加审核，诊断ZIP保留原始文件。当前协议 `phone-lab-v14-worker-lease-ledger-integrity-v1`，不改历史记录。

## 待决定与后续条件

由项目组核对本地候选的需求范围、三模块资料、R03–R06及真实系统／跨安装未验证项，再决定是否冻结与恢复正式打包／发布。候选清单已给出具体对象和剩余验证，不需要重复讨论三框架是否保留。

若明确恢复发布，应新建构建和标签，核对完整包依赖／资源、doctor、安装／停止／回退和下载摘要，不覆盖旧标签或ZIP；用户数据、密钥和新运行仍排除。此时的真实手机或模型测试需单独明确范围，不自动恢复旧队列。
