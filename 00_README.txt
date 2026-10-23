BehaviorLab 用户行为序列仿真系统 · Windows x64 · 2026-10-22

首次部署
1. 将新的Phone ZIP完整解压到可写的本地目录，例如D:\BehaviorLab，不要在压缩包内运行。
2. 双击03_CHECK.cmd，等待离线检查passed。检查不会调用模型或操作手机。
3. 双击01_START.cmd自动打开网页；02_STOP.cmd正常停止，重复启动打开同一服务。

包内已有Node.js24、独立Python3.12、Midscene1.16.0、固定版本MobiAgent/Open-AutoGLM与HDC。
无需安装Codex、npm、pip、Docker或模型权重。适用Windows10/11、Intel/AMD x64。
USB驱动若未被Windows识别，仍需按华为官方SDK/设备说明安装。

使用真机
1. 网页“系统设置 → 模型服务”重新配置自己的图片模型API与密钥。
2. 手机开启USB调试，用数据线连接，在手机上允许新电脑调试并保持解锁。
3. 打开/phone-lab，在任务中选已有起点，或给手机当前状态起名后保存。
4. 测试页选择框架、服务、任务并明确点击开始；结果页查看逐图回复、动作和审核。
默认每题每组合15请求/40动作/600秒/每次512输出tokens，零重试，整批无总请求上限。
保存配置、浏览页面和离线检查不发请求，实际执行才使用所选模型服务。

范围与数据
主仿真内容生成仍Mock，独立真机工作台已实际测试三框架组合，最终框架未定。
主仿真尚未接入真实手机闭环。离线检查通过不算GUI成功。
此干净包不含原电脑用户库、模型密钥、华为账号、私人文件或真机历史截图。
实际选择远程API执行时，会按配置发送该次模型输入；采集记录保存在本机。

日常使用
默认地址http://127.0.0.1:4317；被占用会分配其他端口，实际url见.runtime\desktop.json。
关闭浏览器不会停止服务，重启电脑后重新运行01_START。问题看.runtime\server.log。
数据在.data，依赖及控制信息在.runtime；正常停止后可备份整个已用目录。
本版本.runtime含必需框架、Python和HDC，不能整目录删除或在迁移时丢弃。
已用目录包含私人配置，分享程序请使用干净ZIP，不分享已用目录。
不要在任务运行中复制SQLite/WAL；不要用旧.data覆盖新电脑已继续运行的数据。
仅监听127.0.0.1，不提供远程托管或多人账户。组织策略限制按组织流程处理。

详细部署/验收范围：docs\WINDOWS_PORTABLE.md
操作指南：docs\PHONE_LAB_GUIDE.md
协作开发：CONTRIBUTING.md、docs\DEVELOPMENT.md、docs\FRAMEWORK_ADAPTER_GUIDE.md
