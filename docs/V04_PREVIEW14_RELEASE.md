# BehaviorLab v0.4.0-preview.14

2026-10-30发布准备；功能与离线验证于10月29日完成。按用户明确要求更新GitHub部署包，并纳入新建任务。

- [Windows完整运行包（含你的新任务及36项历史测试）](https://github.com/rexyangqaq-a11y/BehaviorLab/releases/download/v0.4.0-preview.14/BehaviorLab-v0.4.0-preview.14-Windows-x64.zip)
- [随包任务定义JSON（供查看与复用）](https://github.com/rexyangqaq-a11y/BehaviorLab/releases/download/v0.4.0-preview.14/BehaviorLab-v0.4.0-preview.14-BundledTasks.json)
- [SHA256校验表](https://github.com/rexyangqaq-a11y/BehaviorLab/releases/download/v0.4.0-preview.14/SHA256SUMS.txt)
- [发布清单](https://github.com/rexyangqaq-a11y/BehaviorLab/releases/download/v0.4.0-preview.14/release-manifest.json)
- [独立历史测试档案（36项数据未变，复用preview.13附件）](https://github.com/rexyangqaq-a11y/BehaviorLab/releases/download/v0.4.0-preview.13/BehaviorLab-v0.4.0-preview.13-TestArchive.zip)

## 更新内容

1. Midscene、Open-AutoGLM、MobiAgent共用执行前坐标异常恢复。已识别的坐标越界、无效矩形等不进入动作执行；重新截图后让模型重新定位，每个决策最多补2次请求，仍计入原请求／时间限额。原回复、补充请求、截图及用量全部保留。不猜坐标单位、不裁剪越界值、不重放之前已执行的动作。
2. 仅在动作尚未执行、没有未知效果且模型响应及用量已确认时恢复。HTTP／网络错误、权限拦截、截图失败、方向变化、请求限额和手动停止仍终止继续恢复。范围内但语义定位错误、未识别格式和业务结果不由此保证。轨迹区明确显示拒绝、重新请求、交框架核对和次数耗尽。
3. 包含用户自建任务“淘宝-浏览50个商品”（当前修订3）。目标应用淘宝，包名com.taobao.taobao4hmos，起点为“手机桌面＋洛书伴随态（内置，自动复原）”。任务说明、判定要求和禁止操作原样保留，可编辑或停用。
4. 默认桌面启动器及命令行服务首次启动时自动将任务加入任务库；已有相同任务ID的编辑、停用状态与起点选择不覆盖。只导入任务定义与通用内置起点，不自动创建测试、调用模型或恢复队列。

完整包继续保留36项历史测试、12063事件、331次历史请求和1486张原图，可在“结果与对比”查看。独立档案复用preview.13的原附件；本次未追加用户新运行、原始HiLog或新截图。洛书通用机型实测标定、自动投屏、长任务默认不限额、截图时间与手动／自动HiLog均保留。

## 部署、升级与使用

完整解压到可写新目录，先运行03_CHECK.cmd，再运行01_START.cmd。到真机工作台“任务列表”即可找到上述自建任务，打开可核对内容和起点。新任务需要自行配置视觉模型、授权连接并解锁手机后显式启动；包内不含模型密钥。模型服务填写后点击“保存此服务配置”。

升级：先用旧包02_STOP.cmd停止并备份，解压新包到新目录，再复制旧包.data后启动；保留旧目录可回退。不要导入v0.5 schema3库。旧包原目录及旧Release附件不覆盖。若使用已安装修复的本地preview.13，主要新增差异是正式版本记录及随包任务自动初始化。

测试结束并日志收尾后，可在“结果与对比 → 详情 → 原始记录与导出”下载含原图证据ZIP或完整JSON；其中保留模型请求、原始回复和定位恢复记录。

[部署教程](DEPLOYMENT.md) · [使用教程](USER_GUIDE.md) · [版本计划](ROADMAP.md) · [坐标修复详情](PHONE_GROUNDING_RECOVERY_20261029.md)

## 验证与边界

完整Windows包207/207、开发源码220/220离线回归通过，依赖检查通过；新任务首次初始化、可编辑、起点保存与升级保留修改均已核对。三个原生框架均以合成截图／固定回复验证“错误坐标不执行，重新定位后只执行一次有效动作”。实际网页已用隔离数据核对任务内容、编辑入口与洛书起点。

本轮没有运行真实手机业务或真实模型；未宣称50商品任务已完成或长时真机稳定性验收通过。历史业务结果16通过、10部分完成、10未通过，用户复核待定。v0.5主调度、schema3和其他开发功能未进入此包。本次只推送v0.4发布分支，不推送新v0.5开发提交。

任务定义源码：[bundled-phone-tasks.json](../examples/bundled-phone-tasks.json)。新包只在交互启动阶段初始化，底层调试服务器库需显式启用初始化参数。
