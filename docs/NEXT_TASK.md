# v0.4 交接与下一步

2026-10-31。v0.4.0正式Release、四个新附件、源码新标签及下载回读均已完成；不再继续上传或重新打包该版本。**唯一下一步：在新目录按部署指南进行使用者本机部署与使用验收。** 原服务未替换，不自动启动模型、手机、投屏或旧队列。

## 下一对话先读

AGENTS.md、[README](../README.md)、[CURRENT_STATUS](CURRENT_STATUS.md)、[正式版说明](releases/v0.4.0.md)、[发布记录](RELEASE_PUBLICATION.md)、[发布核对](evidence/20261031-v04-final-release/publication-check.json)，再按任务阅读[PRD](PRD.md)、[架构](ARCHITECTURE.md)、[三模块分工](COLLABORATION_MODULES.md)、[开发指南](DEVELOPMENT.md)与[审查](CODE_REVIEW_V04_20261030.md)。

## 已冻结决定与范围

- 正式标签v0.4.0固定指向 `8665e189feb2a7ef3e0e4eca6ae0f49e9b8ae05b`，不得改写；后续交接文档提交不回填或替换已发布ZIP。旧preview标签和附件保留。
- 仅v0.4，保留三框架／模型由用户配置；一个业务使用者，三个一级模块分工已确认。整体解耦未做，主仿真内容仍Mock。
- 用户“继续，直到发布最终版”对应本轮发布，现已完成；不自动延伸为后续版本或新的真实调用授权。
- 原有36项历史及用户自建任务定义已随包，模型密钥／私人库／新运行未携带。项目许可证按用户要求仍暂不指定。

## 部署与开发入口

下载[Windows完整包](https://github.com/rexyangqaq-a11y/BehaviorLab/releases/download/v0.4.0/BehaviorLab-v0.4.0-Windows-x64.zip)，校验SHA256后完整解压到可写新目录；先03_CHECK.cmd、再01_START.cmd，停止02_STOP.cmd。GitHub自动源码ZIP没有运行依赖，完整包不依赖安装Codex。

升级先停旧服务并备份完整旧目录，再按兼容说明迁移本人.data；不覆盖旧.runtime、不导入更高schema库、不删未知锁续跑。密钥跨账户迁移按PRIVATE_MIGRATION，不把无法解密当空密钥覆盖。旧目录保留回退。

源码开发使用独立工作副本、空闲端口和新数据目录：

```powershell
node src/web-server.mjs --port 4321 --data .build/dev-v04
node --test --test-concurrency=1 tests/*.test.mjs
```

完整包当前220/220、doctor、启动／停止、合成网页、中文空格路径与匿名下载检查均已通过；没有新改动、失败或环境变化时不重复全量。不连接设备或模型也能查看历史和运行Mock。

## 仍保留的问题

R03全量轨迹读取与R04–R06维护债；真实OS／设备硬杀、跨安装互斥、长期视频、第二台电脑、任意APP和数量目标未验证。后续修复先本地验证并Git提交；新版本按用户确认的需求／设计流程开展，不继承本轮发布或旧批次调用预算。
