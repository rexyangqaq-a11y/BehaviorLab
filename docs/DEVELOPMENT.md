# v0.4 开发指南

文档标识 DEV-V04 / R1，2026-10-30。面向项目组内部开发；对应已发布 `v0.4.0-preview.14` 与本轮文档／注释整理。业务入口见[PRD](PRD.md)，模块与数据流见[架构 Spec](ARCHITECTURE.md)。本页不要求连接手机或调用模型。

## 环境与依赖

| 层次 | 必要条件 | 说明 |
|---|---|---|
| 主 Mock、网页、一般工程测试 | Node.js 24、Git | Node 内置 HTTP 与 SQLite，原生网页模块；主工程不需 npm install 或前端构建 |
| Midscene 适配 | `integrations/midscene` 固定依赖 | `package.json` 和 pnpm 锁文件固定版本；不要使用未锁定的最新 SDK 替代 |
| Python 原生框架夹具 | Python 3.12、框架 checkout 与 requirements | 局部放 `.runtime`，用 `phonePython(project)` 解析；自动测试未装齐时可能跳过 |
| 真实鸿蒙任务 | HDC、USB／调试许可、已解锁手机、视觉模型配置 | 是另一个授权与验证层次，不是打开开发页面的前提 |
| 视频／HiLog | 随包 Java／HOScrcpy 及 HDC | 可选观察能力；类加载通过不是视频出帧或业务成功 |

完整 Windows 包提供可运行依赖，是普通使用者的最短入口。源码仓库不保存已安装依赖。自行部署原生环境前阅读[框架指南](PHONE_LAB_GUIDE.md)和[HDC说明](HDC_WINDOWS_SETUP.md)，核对安装脚本与锁文件；安装会下载依赖，不要把安装与真实验证混为一谈。

## 安全的首次开发启动

在当前 v0.4 源码目录核对分支与版本。项目组既有服务继续使用原目录；为开发选择空闲端口和全新数据目录。

```powershell
node --version
git status --short
node src/web-server.mjs --port 4321 --data .build/dev-v04
```

打开 `http://127.0.0.1:4321`。`/phone-lab` 是独立手机工作台，`/v04-acceptance` 是证据清单。Ctrl+C 正常关闭。启动器／CLI 的交互启动会导入缺失的随包任务定义，不会覆盖同 ID 编辑，也不会自动开始运行。

需要后台启动时，在自己的工作副本使用：

```powershell
node scripts/desktop-launcher.mjs start --port 4321 --no-browser
node scripts/desktop-launcher.mjs status
node scripts/desktop-launcher.mjs stop
```

启动器使用该副本默认 `.data`，不接收前台命令的 `--data` 参数。端口被占用时可能自动换端口，以 `READY` 和该副本 `.runtime/desktop.json` 为准。服务不热重载；不要结束未知进程、删除锁或清空数据来更新源码。

## 无手机完整示例

使用尚未存在的新运行目录。示例故意设置描述首轮失败；补跑描述后完整性通过属于夹具预期，不是一次真机任务。

```powershell
node src/cli.mjs init --config examples/mock-run.json --data .build/tutorial-v04
node src/cli.mjs run --data .build/tutorial-v04
node src/cli.mjs status --data .build/tutorial-v04
node src/cli.mjs describe --data .build/tutorial-v04 --retry-failed
node src/cli.mjs export --data .build/tutorial-v04
node src/cli.mjs check --data .build/tutorial-v04
```

`check` 预期 `integrity_passed: true`。主流程使用合成人设／计划／动作／图像／描述。重复 `run` 可恢复未完成阶段，成功活动不重新采集；不要为了重复教程删除别人已有运行。

## 验证分层

| 级别 | 命令／方法 | 能证明什么 |
|---|---|---|
| 语法 | `node --check src/phone-lab.mjs` | 指定文件可解析；不是逻辑正确证明 |
| 定向工程测试 | `node --test tests/phone-action-effects.test.mjs tests/phone-grounding-recovery.test.mjs` | 合成输入、异常／未知效果与定位逻辑 |
| 全量工程回归 | `node --test --test-concurrency=1 tests/*.test.mjs` | 该源码／环境下测试事实；失败和跳过分别保留 |
| 原生离线循环 | `node scripts/phone-framework-contract.mjs` | 已装上游循环、中文／图像／动作协议，模型回复与设备为注入夹具 |
| 完整依赖诊断 | `node scripts/phone-doctor.mjs` 或 `03_CHECK.cmd` | 固定依赖、源码哈希、类加载与离线协议；会写诊断，不发送真实业务调用 |
| 源码审查复现 | `node scripts/review-v04-source.mjs` | 源码指标及R01/R02原现象是否仍复现；不是整机健康检查 |
| 网页／真实设备 | 按显式任务范围核对入口与证据 | 与上述级别分别记录，不因工程通过自动执行 |

preview.14 完整包已有207/207离线通过记录。本轮重新验证的环境、通过／跳过数以[审查报告](CODE_REVIEW_V04_20261030.md)为准。无原生依赖的源码结果不能借用完整包的207项通过数字。

## 修改入口与接入步骤

- 用户／日／活动推进：`scheduler.mjs`；持久化与 schema：`store.mjs`、`contracts.mjs`。
- 测试生命周期：`phone-lab.mjs`；真正循环与保护：`scripts/phone-lab-worker.mjs`。
- 新框架：固定注册 → adapter `run(context)` → 离线协议夹具 → doctor／构建资源；详见[框架接入](FRAMEWORK_ADAPTER_GUIDE.md)。
- 输入授权：`phone-worker-lease.mjs`与公共`device-lease.mjs`；证据解析：`phone-evidence-reader.mjs`。
- 物理输入／截图：`phone-device.mjs`；用量：`gui-trial-transport.mjs`；未知效果：`phone-action-effects.mjs`。
- 定位纠正：`phone-grounding-recovery.mjs`；起点与通用机型：`phone-startpoints.mjs`、`phone-companion-start.mjs`。
- UI 与轨迹：`web/`；HTTP 路由和服务装配：`web-server.mjs`；不要在 UI 复制预算、调度或审核规则。
- 导出与描述：`output.mjs`、`descriptions.mjs`；描述补跑只处理已有图。

## 数据、错误与协作

`.data`、`.runtime`、`node_modules`、原始新图、数据库、缓存与包按忽略规则保留本地。新版本不直接打开未知来源的高版本数据库。正常停服后备份整个数据与必要配置，包含 SQLite WAL；原目录保留回退。

本地R01/R02修复已使用worker租约与统一完整性诊断，验证见[修复记录](V04_RELIABILITY_FIXES_20261030.md)，未更新已发布包。旧格式／不确定锁保守返回409；不要直接删锁。坏账本不继续追加审核，诊断ZIP保留原始文件；解析完成不等于全部图片或业务通过。跨安装互斥和真实系统硬杀未验证，长轨迹全量读取R03仍在。受限环境可能禁止本机端口、子进程或 DPAPI，报告实际失败原因，不将环境失败抹掉为通过。

每轮修改按[贡献规范](../CONTRIBUTING.md)验证和提交。已确认按用户与行为规划、手机活动执行（含证据／存档／数据交付）、整体中控平台三大模块组织，文件归属和契约见[协作 Spec](COLLABORATION_MODULES.md)。每项任务确定一个牵头模块、公共文件一个主要提交方；本轮文档不自动开始源码重构、真实运行或发布。
