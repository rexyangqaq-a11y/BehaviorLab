# Windows部署与迁移（2026-10-23）

当前preview.9提供两个Windows10/11、Intel/AMD x64版本：`BehaviorLab-Phone-Windows-x64-20261023.zip`为干净版；同名`-Private.zip`为私人迁移版，保留真机工作台6任务、83起点、39条运行的完整截图/轨迹、3个模型服务与角色配置，API密钥用迁移密码加密。两版均含四页签、三框架与HOScrcpy视频；主仿真仍Mock。旧2026-10-22为preview.6，旧2026-10-19不含当前工作台，不混用旧目录覆盖新包。

本包带独立Temurin21.0.8+9 JRE、固定HOScrcpy SDK1.0.18-beta、预编译视频桥及JMuxer2.1.4，无需在新电脑安装Java或打开官方GUI。Java、Python和HDC均按项目相对路径定位，不依赖原电脑的DevEco/Codex目录。视频边界见[详细说明](HOSCRCPY_VIDEO.md)：本机曾出现断流，未声称长期稳定或任意手机兼容。

## 新电脑使用

1. 完整解压到可写本地目录，如`D:\BehaviorLab`。运行`03_CHECK.cmd`完成离线检查，再运行`01_START.cmd`打开网页。停止用`02_STOP.cmd`。
2. 私人版先在原电脑同一Windows账户运行ZIP之外的“查看迁移密码.cmd”，然后在新电脑启动前运行`04_IMPORT_KEYS.cmd`，隐藏输入密码后恢复3个服务密钥；详见[私人迁移说明](PRIVATE_MIGRATION.md)。干净版跳过04，在设置中配置图片模型服务/密钥。主仿真Mock可离线使用，没有自动连通探针。
3. 手机开启USB调试，数据线连接并授权新电脑，保持解锁。若系统未识别USB设备，按华为官方SDK/设备说明安装驱动。复制HDC不能替代手机授权。
4. 打开`/phone-lab`，保存任务与起点，选择单项或组合并明确点击执行。真实执行发送所选服务的图片请求，业务结果仍需核对。
5. 如需观察视频，先到“测试过程详情”点击开始投屏，再切“测试”页配置并启动。切到任务或结果页会断开；停止/全屏在过程页操作。不采集音频、不自动录像或上传视频。

最少外部条件：受支持Windows、能识别手机的数据线/驱动、新电脑USB授权与解锁状态、允许目标用途且支持图片的API、访问该API的网络。记录保存在本机，远程API会收到该次模型输入。

## 包内内容

- 官方Node.js24.19.0及完整许可证，哈希匹配[官方校验表](https://nodejs.org/download/release/v24.19.0/SHASUMS256.txt)。
- Midscene1.16.0、MobiAgent4ee7940、Open-AutoGLM86f5538及运行依赖。pnpm本地链接已展开为普通目录，不要求符号链接权限。
- 独立Python3.12.14、标准运行时和手机客户端依赖闭包，各分发包许可证随包保留。版本见`.runtime/python-phone/phone-packages.json`。不依赖Codex缓存或系统Python，无需pip在线安装。
- HDC3.2.0f、libusb与NOTICE。来源为本机此前安装的官方SDK，已检查签名，但未取得官方压缩包独立哈希；分发清单记录本地文件哈希，不补称官方校验完成。
- Temurin21.0.8+9 Windows x64 JRE来自[Eclipse官方发行](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.8%2B9)，ZIP已核对官方SHA256；保留完整legal/conf/lib/bin及许可证，未复制DevEco程序。HOScrcpy固定公开Release JAR保持原样及原项目许可，不包含其桌面UI。
- 框架源码仅复制允许目录内的Git跟踪文件，排除私有.env与字体。MobiAgent使用目标Windows自带字体。未带模型权重、经验/记忆服务。

HDC本身是命令行通道；本包网页视频直接使用HOScrcpy后台SDK，不需要DevEco Testing投屏GUI。USB驱动和手机授权仍须在目标电脑完成，见[官方工具安装说明](HDC_WINDOWS_SETUP.md)。

`03_CHECK.cmd`加载真实SDK、检查固定源码哈希，给两个原生循环注入五个固定回复和合成图，验证中文/JPEG/动作；另核对视频/JRE全文件哈希、执行包内Java和视频桥的纯类加载检查。它不调用HDC、手机或供应商，不代表GUI成功。成功后才将本机Python框架标记可用，报告位于`.runtime/phone-doctor.json`。

## 启动与迁移

启动优先包内`runtime/node.exe`。默认4317被占用会分配空闲端口，重复启动只打开本目录服务；随机控制token只用于本机命名管道，停止不按端口杀进程。

干净版`.data`为空，仅含脱敏结果文档。私人版按用户要求带真机历史与模型配置，模型数据库在打包时不含任何密钥行，密钥放在认证加密文件中；随机密码及其原电脑DPAPI查看工具均在ZIP之外。目标电脑导入后按该Windows账户加密保存，原开发数据库旧格式仍兼容读取且本轮不改写。两版都不带华为账号或主仿真私人用户库/历史。私人版的原图和轨迹包含私人信息，仅在授权电脑之间保存和传递。不要在任务运行时复制SQLite/WAL。

本版本`.runtime`也保存必需框架/Python/HDC，迁移整个已用目录时保留。启动器会重新识别旧desktop等控制状态，不得按旧说明整目录删除.runtime。Python按项目相对路径定位，支持移动盘符与中文空格目录。历史证据中的旧绝对路径不批量替换，图像查看以资产相对路径为准。

## 维护者构建

先部署固定版本三框架，执行：

```powershell
node scripts/build-portable.mjs --out output/BehaviorLab-Phone-Windows-x64-20261023 --runtime <官方node.exe> --license <完整Node许可证> --checksums <官方SHASUMS256.txt> --clean --phone --video-archive <官方Temurin21.0.8+9的JRE.zip> --source-index
```

目标必须不存在。先将准备发布的源码纳入Git暂存，`--source-index`只导出指定范围的Git索引快照，避免把其他正在编辑/未跟踪的汇报草稿带入包；不需要改写这些草稿。清单记录基准提交和索引摘要。`--clean --phone`不带私人真机数据；`--video-archive`核对固定官方ZIP并安全解压，使用构建机JDK编译桥，目标电脑只需包内JRE。构建不连接手机或模型。framework-sources.json与phone-video-files.json记录依赖文件哈希，目标机器无需Git。

私人快照构建命令与密钥保护见[私人迁移](PRIVATE_MIGRATION.md)。工程离线回归124/124，包括错误密码、篡改、配置变化拒绝、密钥认证加密和Windows本机保护。本机部署检查包括SDK实际加载、独立Python导入、原生离线契约、ZIP解压与中文空格目录入口；同日preview.8干净包的历史记录见[验收](evidence/20261023-portable/acceptance.json)。未在第二台物理电脑运行，未做目标机真机任务、供应商连通或资源管理器双击。不能用后台或离线检查替代这些未验证范围。
