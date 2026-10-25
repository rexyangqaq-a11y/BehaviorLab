# 下载、部署与更新

适用版本：`0.4.0-preview.10`；Windows 10/11、Intel/AMD x64。程序监听本机 `127.0.0.1`，这是本地桌面工作台部署方式。

## 下载与校验

先登录有仓库权限的GitHub账户，再打开 [GitHub Releases](https://github.com/rexyangqaq-a11y/BehaviorLab/releases)，进入 `v0.4.0-preview.10` 的 Pre-release，下载 `BehaviorLab-v0.4.0-preview.10-Windows-x64.zip` 和 `SHA256SUMS.txt`。发布完成前链接可能尚无该版本；以 Assets 实际文件为准。

`Source code (zip)` 是 GitHub 自动提供的源码快照，不含 Node、Python、HDC 等运行依赖。普通 Windows 用户下载命名的 Windows 包。

在下载目录运行：

```powershell
Get-FileHash .\BehaviorLab-v0.4.0-preview.10-Windows-x64.zip -Algorithm SHA256
```

将结果与 `SHA256SUMS.txt` 同名行逐字符比较。另有独立历史测试档案 ZIP，内容和查看方式见 [测试档案](RELEASE_TEST_ARCHIVE.md)。

## 首次启动

1. 完整解压到可写本地目录，例如 `D:\BehaviorLab-v0.4`，不要在压缩包内运行。
2. 运行 `03_CHECK.cmd`。它核对依赖、文件哈希、Java／SDK加载和固定离线循环，不操作手机、不调用模型。
3. 检查通过后运行 `01_START.cmd`。默认打开 `http://127.0.0.1:4317`；端口冲突时以启动器和 `.runtime/desktop.json` 的实际地址为准。
4. 运行 `02_STOP.cmd` 正常停止。关闭网页不会停止后台服务。

包内带 Node 24、Python 3.12、三框架、HDC、Java和视频 SDK；不需安装 Codex、npm、pip 或模型权重。USB驱动、手机调试许可和远程模型服务仍由使用者准备。依赖许可证随包保留，详见 [第三方组件](THIRD_PARTY_COMPONENTS.md)。

## 配置真实手机与模型

先按 [使用教程](USER_GUIDE.md) 查看历史结果和离线示例。需要新真实任务时，再连接本人授权的鸿蒙设备，启用USB调试、允许这台电脑并保持解锁；在系统设置配置自己的视觉模型 API、模型名和密钥。配置保存不等于图像／动作验证通过。

私有Release按用户要求保留历史测试原图；下载者须有私有仓库权限。发布包不含原电脑的模型账户、密钥、私人用户库或运行数据库；不需要运行 `04_IMPORT_KEYS.cmd`。历史轨迹归档只供查看，不携带可用的设备起点或模型凭据。

## 从源码运行

安装 Node.js 24 后，在项目根执行：

```powershell
node src/web-server.mjs --port 4317
node --test tests/*.test.mjs
```

主 Mock 不需 npm 安装。真实框架另按 [框架指南](PHONE_LAB_GUIDE.md)、[HDC安装](HDC_WINDOWS_SETUP.md) 部署；未安装原生依赖的测试可能明确跳过，不能计为通过。

## 更新与回退

1. 正常停止任务、视频和服务后，备份整个已用目录，包含 `.data` 和 `.runtime`；不要运行中只复制 SQLite 而遗漏 WAL。
2. 每版解压至新目录，先检查和启动干净包。历史档案与自己的新任务分开存放。
3. 迁移本人数据前查阅目标版的数据兼容说明。v0.4 包不接受 v0.5 已升级至 schema 3 的主仿真库回退；不要把新库覆盖进旧版。
4. 回退时停止新服务，启动此前完整保留的旧目录和配套备份。不要用 `reset --hard`、删除 `.data` 或整目录删除 `.runtime` 代替升级／回退。

本次验证覆盖本机隔离解压和启动入口；第二台物理电脑的USB、GUI双击、驱动及真实任务仍需实测。

## 常见问题

| 现象 | 处理 |
|---|---|
| 缺少 `runtime/node.exe` | 重新完整解压 Windows Assets 包，确认没有误下源码 ZIP |
| 检查失败 | 先读 `.runtime/phone-doctor.json`，按缺失组件处理，不直接运行真实任务 |
| 繁忙环境首次原生测试超时 | 先等 `03_CHECK.cmd` 完成；工程回归可用 `runtime/node.exe --test --test-concurrency=1 tests/*.test.mjs` 串行执行。发布时首轮并行有一项15秒超时，后续串行138项通过，详见 [验证范围](RELEASE_VERIFICATION.md) |
| 端口被占用 | 查看启动器报告的实际地址；不要误操作另一个已用目录的服务 |
| 页面能打开，手机未连接 | 主 Mock 与历史查看可用；新真机测试需驱动、调试许可与设备解锁 |
| 模型能返回文字但动作失败 | 检查视觉与动作协议；文本连通不代表GUI任务通过 |
| 投屏断流 | 停止投屏后按页面流程重开；长期稳定性尚未证明 |
