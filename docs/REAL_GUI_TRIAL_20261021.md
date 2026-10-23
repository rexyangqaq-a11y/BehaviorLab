# 首个真实鸿蒙 GUI 试验：部分完成，任务未通过

2026-10-21，Asia/Hong_Kong。用户确认 Midscene 1.16.0 只用于首个小任务，并在助手说明套餐使用范围后明确指定继续使用已有 Token Plan。本次没有确定最终框架，没有改变主网页的 Mock 模式或四角色模型绑定。

## 实际结果

| 范围 | 结果 |
|---|---|
| 工具与设备 | HDC 3.2.0f；稳定唯一设备 HOP-AL10；API 26；设置 7.0.0.330 |
| 系统字段 | HDC 系统全名 OpenHarmony-7.0.0.38；产品软件 HOP-AL10 7.0.0.36(SP25C00E24R4P1log)，两者是不同字段 |
| 实际首题 | HM-SYS-001：从设置首页进入关于本机，读取可见型号及 HarmonyOS 版本；1 次实际有模型/动作的试验 |
| 执行组合 | @midscene/harmony 1.16.0 + qwen3.7-plus，qwen3 adapter；隔离 runner，不接主调度器 |
| 真实调用 | **4 次图片请求，全部 HTTP 200，0 重试**；4 张实际模型输入 1292×914；原截图 2584×1828 |
| 手机动作 | **4 次 Scroll / 4 次 HDC fling**；第一、二次使左侧列表向下移动，未点击目标导航卡 |
| 用量 | 输入 **29,819**、输出 **741**，合计 **30,560 tokens**；缓存输入 11,520 包含在输入中，不另加；reasoning 字段、实际 Credits 与费用未知 |
| 耗时 | Agent 任务 **41,918 ms**，包含请求、动作和期间观察等待；最终存档观察另计，详见原始 result |
| 证据 | 19 次截图命令、33 条图像资产记录（含重复保存与 4 张模型缩小图），23 个不同资产哈希；不是 33 次截图命令 |
| 结束原因 | 第五次请求在本地预算入口被拒，**未发送**；SDK 顶层包装成 Connection error，控制台保留实际 cause: Model request budget exhausted |
| 业务判定 | **部分完成，GUI 任务未通过**：M1 通过，M2 部分，M3 未通过；用户审核 pending |

模型持续使用“关于本机通常在设置底部”的假设向下找，没有识别本机设置顶部的设备卡片。最终仍在“星闪和蓝牙”，无法据此认定型号/系统版本读取成功。准备阶段曾显示关于本机，那是设备原状态，不属于 Agent 的导航或完成证据；没有拿元数据、Mock、文本 OK 或人工导航替代通过。

## 输入、版本与证据入口

本机完整目录：`output/device_validation_20261021/midscene-HM-SYS-001-execution/`，原始文件不覆盖。

- [可视化回放 report.html](../output/device_validation_20261021/midscene-HM-SYS-001-execution/report.html)：初始、4 次动作后、最终状态；只读本机文件，页面不发网络请求。尚未做桌面浏览器 GUI 打开验收。
- [任务输入](../output/device_validation_20261021/midscene-HM-SYS-001-execution/input.json)、[环境](../output/device_validation_20261021/midscene-HM-SYS-001-execution/environment.json)、[实际运行源码哈希](../output/device_validation_20261021/midscene-HM-SYS-001-execution/run-source.json)。
- [完整事件](../output/device_validation_20261021/midscene-HM-SYS-001-execution/events.jsonl)、[模型输入/响应与 usage](../output/device_validation_20261021/midscene-HM-SYS-001-execution/model-calls.jsonl)、[原始结束记录](../output/device_validation_20261021/midscene-HM-SYS-001-execution/result.json)、[逐项独立初判](../output/device_validation_20261021/midscene-HM-SYS-001-execution/assessment.json)。
- [完整性审计](../output/device_validation_20261021/midscene-HM-SYS-001-execution/evidence-audit.json)：图片哈希、实际发送图引用、请求/动作记录顺序、计数与用量核对通过；保留文件中未命中本机任何模型 key 的值。完整性不等于业务通过。
- [可随源码保存的脱敏摘要](evidence/20261021-real-gui/summary.json)。不含手机原图、账号、key 或请求头；原始截图与 SDK 日志均留在 Git 忽略的本机目录。

四张模型缩小图按本次明确授权随请求发送至用户指定模型服务。Huawei 账号仍只保存在本机 DPAPI 密文中，未用于本轮试验；没有创建华为云测试任务或上传源码/完整证据包。

## 工程发现与修正

1. 设备输出 `width: N, height: N`，SDK 1.16.0 的正则期待无冒号形式，留下旋转前尺寸。适配层以解码真图校准，只接受相同或宽高互换；本次真实滚动已验证相应坐标区域，Tap 尚未验证。
2. 原动作记录包装始终返回 Promise，而 HarmonyAgent 构造时需要同步 actionSpace。修复为保留原同步/异步契约，真实 SDK 零调用构造检查通过。
3. 另一次启动因继承准备文件时误复制旧 run 图被唯一文件保护拒绝；纠正复制范围后再执行。两次技术启动失败均 **0 模型请求、0 Agent 动作**，记录保留，不计为两个 GUI 成功/失败样本。更早坐标检查失败属于零调用准备。
4. 有界入口在本次真实运行限制 4 请求、每次 512 输出、2 MiB JSON、60,000 文本字符、2 图、6 SDK/物理动作、180 秒、零重试。Tap 仅允许已查看的 About 导航卡区域，禁止模型 Shell/Input/Launch/开关。字节限制不是输入 token 硬上限。
5. **运行后**补上第三次相同动作前停止与明确预算阻断日志；8 项定向离线检查通过。未追加真实模型请求，不能宣称这些修正已获真机复测。实际运行源码哈希与当前源码可能不同，应以 run-source 为准。

DevEco Testing 已打开“实用工具 → 设备投屏”官方 GUI 入口；实际投屏仍未验证。回放是已保存截图的浏览界面，不是实时手机投屏，也不是主验证台已支持 real 模式。

## 最少剩余条件

| 条件 | 责任与最小动作 |
|---|---|
| 正确理解实际设置入口 | 助手改进对当前页面的观察与任务约束，并保留重复动作停止。不能直接写死人工坐标后冒充框架完成 |
| 一次新的有界复测 | 首轮 4 次预算已用完，本轮停止追加调用。下次独立输入/预算/证据，验证模型选择目标卡、实际 Tap、最终可读字段和元数据核对 |
| 用户审核与最终选型 | 用户审核本次 partial 记录；最终框架继续未定。MobiAgent 同级候选、Open-AutoGLM 基线不变；一次本机失败不推出总体优劣 |

目前没有需要用户再提供的安装包、手机型号清单、华为密码、商业 APP 账号或四角色绑定。HDC/USB、截图、服务图片协议已不再是本机首题的缺失条件。主网页接入真实执行、存档描述、批量仿真与长活动仍在本轮最小试验之外。
