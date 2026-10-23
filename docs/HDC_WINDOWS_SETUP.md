# Windows：HDC 与真机可视化工具下载

更新：2026-10-21。**最新：用户已下载两个 ZIP，HDC 3.2.0f 已安装，Testing 已启动并进入“实用工具 → 设备投屏”；等待手机稳定连接。** 详见[安装与 GUI 入口核对报告](HDC_INSTALL_RESULT_20261021.md)。下文下载步骤作为新电脑/后续恢复说明。Midscene 仅为首试候选，最终框架未定；真实手机任务与模型调用均未执行。

## 建议下载的两项

| 工具 | 用途 | 官方入口 |
|---|---|---|
| Command Line Tools，Windows x64 | 含 HarmonyOS SDK 工具链，供 HDC 连接、截图与设备命令使用 | [DevEco Studio 资源页](https://developer.huawei.com/consumer/cn/deveco-studio/resources/) → Command Line Tools |
| DevEco Testing，Windows 桌面客户端 | UIViewer 支持设备镜像投屏、控件信息预览；本地测试调试入口 | [DevEco Testing](https://developer.huawei.com/consumer/cn/deveco-testing/) / [资源页](https://developer.huawei.com/consumer/cn/deveco-testing/resources/) |

仅为本轮 HDC 与真机观察，不要求同时下载完整 DevEco Studio、模拟器、所有 SDK 或云测试资源。若已有完整 DevEco Studio，可先寻找其内置 HDC，无需重复安装 Command Line Tools。UIViewer 并不是被测 Agent；Midscene Playground/报告承担 Agent 调试与轨迹查看。

## 你先完成下载

1. 在本机常用浏览器打开上面的华为官方资源页；登录华为账号。若遇到验证码、开发者协议或实名要求，按官网提示由本人完成。
2. 点击 **Command Line Tools** 的下载入口，选择 **Windows / x64（64 位）**、当前可用的正式 **Release** 包。保存下载页显示的版本和 **SHA-256** 校验值；尚未核对具体包，不预先写死版本或声称支持某个手机构建。
3. 从 **DevEco Testing** 的官方入口下载 Windows 客户端，供之后打开 UIViewer。不要只下载 Python Hypium 库后把它当作桌面投屏界面。
4. 暂时只下载即可；不用自己修改系统 PATH，也不用先安装驱动。把实际安装包在电脑上的完整路径告诉助手，例如 `C:/Users/<你>/Downloads/<实际包名>.zip`。包可较大，等待下载完成后再操作。
5. 助手接着核对文件类型/版本/SHA-256、保留整个 HDC 工具目录和所需 DLL，解压安装并配置项目入口。网页上显示的校验值应与本地计算一致；没有官方校验值时明确记录缺项，不能把自行计算的哈希称作官方验证。

Command Line Tools 官方[获取说明](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-commandline-get)要求下载后做完整性检查。HDC 通常在解压后的 `command-line-tools/sdk/default/openharmony/toolchains/hdc.exe`，以实际包内容为准，不能只把 `command-line-tools/bin` 当作 HDC 目录。

## 安装后由助手验证

1. 用明确的 hdc.exe 路径执行 `-v`，记录版本和本机工具哈希。本项目已可直接使用 `node scripts/hdc.mjs -v`。
2. 执行 `list targets`。手机未连接时保留空列表结果；列到设备也不表示截图/操作/GUI 任务已通过。
3. 手机通过可传数据的 USB 线连接，打开 USB 调试并在手机允许本机调试。首次只做设备型号/构建、截图与坐标核对，0 模型调用。
4. DevEco Testing 进入 **实用工具 → 设备投屏**，选择本地设备查看画面；同页 UIViewer 用于控件检查。本轮已实查客户端与此入口，尚未验证真机投屏，不创建云测试任务。
5. 然后执行 HM-SYS-001。继续遵守模型用量规则和首个真实任务的完整证据要求。

HDC 本身是命令行工具。华为[DevEco Testing 官方介绍](https://developer.huawei.com/consumer/cn/deveco-testing/)明确列出 UIViewer 的镜像投屏/控件信息，以及 Hypium 的测试脚本、执行日志和步骤截图。Midscene 的 [Harmony Playground](https://midscenejs.com/platforms/harmonyos)另提供候选 Agent 的可视化试验入口；本项目旧验证台仍只运行 Mock。

## 自动下载阶段的历史状态（已由用户手工下载接续）

官方页面可以访问，但本轮自动浏览器接入超时，下载中心跳转到华为登录流程；公开工具目录请求返回 401，尚未取得授权安装包或其校验值。未尝试绕过认证。

另外核对到 OpenHarmony 官方发布说明中的公开 SDK 镜像，但其 Windows/Linux 完整包约 2.5 GB，且不能直接据此认定兼容目标商业鸿蒙构建；本轮未下载该替代包或冒充安装完成。按用户提出的手工下载路径继续。

用户随后已提供 Downloads 路径并完成安装接续。下一次连接手机即可；账号和安装包路径不需重复发送。模型服务、四角色绑定、商业 APP 账号和长活动口径可后置。
