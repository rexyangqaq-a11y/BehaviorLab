# Windows部署与迁移（2026-10-22）

当前交付`BehaviorLab-Phone-Windows-x64-20261022.zip`，preview.6干净版，适用Windows10/11、Intel/AMD x64。主仿真仍Mock，独立真机工作台包含三框架运行入口。旧2026-10-19包不包含当前工作台。

2026-10-23源码已到preview.8：新增过程页与[HOScrcpy网页连续投屏](HOSCRCPY_VIDEO.md)。上述旧ZIP没有这些更新，本轮未重打包。构建器已包含视频桥源码与本地播放器；可选视频SDK/JDK不自动装入包，新电脑需显式安装JDK17+并执行`hoscrcpy-setup.mjs --install --java <java.exe>`。若没有系统Node命令，使用包内`runtime\node.exe`执行脚本。当前电脑已验证真实视频，第二台物理电脑未验证。

## 新电脑使用

1. 完整解压到可写本地目录，如`D:\BehaviorLab`。运行`03_CHECK.cmd`完成离线检查，再运行`01_START.cmd`打开网页。停止用`02_STOP.cmd`。
2. 主仿真Mock可离线使用。真机前在设置中配置自己的图片模型服务/密钥，包中不带原电脑配置，也没有自动连通探针。
3. 手机开启USB调试，数据线连接并授权新电脑，保持解锁。若系统未识别USB设备，按华为官方SDK/设备说明安装驱动。复制HDC不能替代手机授权。
4. 打开`/phone-lab`，保存任务与起点，选择单项或组合并明确点击执行。真实执行发送所选服务的图片请求，业务结果仍需核对。

最少外部条件：受支持Windows、能识别手机的数据线/驱动、新电脑USB授权与解锁状态、允许目标用途且支持图片的API、访问该API的网络。记录保存在本机，远程API会收到该次模型输入。

## 包内内容

- 官方Node.js24.19.0及完整许可证，哈希匹配[官方校验表](https://nodejs.org/download/release/v24.19.0/SHASUMS256.txt)。
- Midscene1.16.0、MobiAgent4ee7940、Open-AutoGLM86f5538及运行依赖。pnpm本地链接已展开为普通目录，不要求符号链接权限。
- 独立Python3.12.14、标准运行时和手机客户端依赖闭包，各分发包许可证随包保留。版本见`.runtime/python-phone/phone-packages.json`。不依赖Codex缓存或系统Python，无需pip在线安装。
- HDC3.2.0f、libusb与NOTICE。来源为本机此前安装的官方SDK，已检查签名，但未取得官方压缩包独立哈希；分发清单记录本地文件哈希，不补称官方校验完成。
- 框架源码仅复制允许目录内的Git跟踪文件，排除私有.env与字体。MobiAgent使用目标Windows自带字体。未带模型权重、经验/记忆服务。

DevEco Testing投屏GUI不在本包；需要时按[官方工具安装说明](HDC_WINDOWS_SETUP.md)另装。HDC本身是命令行通道。

`03_CHECK.cmd`加载真实SDK、检查固定源码哈希，给两个原生循环注入五个固定回复和合成图，验证中文/JPEG/动作。它不调用HDC、手机或供应商，不代表GUI成功。成功后才将本机Python框架标记可用，报告位于`.runtime/phone-doctor.json`。

## 启动与迁移

启动优先包内`runtime/node.exe`。默认4317被占用会分配空闲端口，重复启动只打开本目录服务；随机控制token只用于本机命名管道，停止不按端口杀进程。

新包`.data`为空，只含脱敏结果文档，不含原电脑数据库、模型密钥、华为账号、原图或真机历史。这是干净部署包，不是历史数据迁移包。需私人历史时先等待所有队列结束并正常停止，再备份原目录，不在运行中复制SQLite/WAL。已用目录包含敏感配置，只在授权电脑间私下迁移。

本版本`.runtime`也保存必需框架/Python/HDC，迁移整个已用目录时保留。启动器会重新识别旧desktop等控制状态，不得按旧说明整目录删除.runtime。Python按项目相对路径定位，支持移动盘符与中文空格目录。历史证据中的旧绝对路径不批量替换，图像查看以资产相对路径为准。

## 维护者构建

先部署固定版本三框架，执行：

```powershell
node scripts/build-portable.mjs --out output/BehaviorLab-Phone-Windows-x64-20261022 --runtime <官方node.exe> --license <完整Node许可证> --checksums <官方SHASUMS256.txt> --clean --phone
```

目标必须不存在。`--clean --phone`生成干净真机版；省略phone不带SDK，省略clean仍只快照Mock用户/运行，不会暗中带真机记录或模型凭据。构建不连接手机或模型。`package-phone-runtime.mjs`、`package-phone-python.py`分别收集固定源码/依赖和Python闭包；各依赖许可证随原目录保留。framework-sources.json记录提交与文件哈希，目标机器无需Git。

验证范围与计数见[交付证据](evidence/20261022-report-release/acceptance.json)。本机检查包括工程回归、SDK实际加载、独立Python导入、原生离线契约、ZIP解压和中文空格目录的启动/浏览器入口。未在第二台物理电脑运行，未做新电脑真机任务，未做资源管理器双击或PowerPoint GUI实测。不能用后台或离线检查替代这些未验证范围。
