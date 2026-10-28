BehaviorLab v0.4.0-preview.12 · Windows 10/11 x64

下载与首次部署
1. 本目录来自Release中的Windows-x64.zip，包含Node/Python/HDC、三框架和Java视频依赖。
2. 完整解压到可写本地目录；先运行03_CHECK.cmd，再运行01_START.cmd。
3. 02_STOP.cmd正常停止。关闭网页不会停止后台，实际地址看启动器及.runtime/desktop.json。
4. 本私有Release包没有模型账户或凭据，不需要运行04_IMPORT_KEYS.cmd。

查看当时已有的测试
打开test-archive/index.html，离线逐项查看四题×三框架×三模型的36项历史测试。
包含用例、冻结输入、模型回复、动作、截图及结果；失败和部分完成保留。
16通过、10部分完成、10未通过，用户复核待定；历史旧协议成绩不算新版保护的真机复测。
历史查看不会调用模型或设备，也不会自动加入队列。
截图原样随私有Release分发，授权记录以test-archive/privacy-review.json为准。

新任务与范围
主系统内容生成和执行仍Mock，真实下层尚未接入主调度。
独立/phone-lab可以在自行配置授权设备和模型后显式启动新真机测试。
手机需要驱动、USB调试许可并保持解锁；模型使用你的视觉API，实际调用产生费用。
默认每组合15请求、40动作、600秒、每次512输出tokens，零自动重试；整批没有默认总请求上限。
保存配置、看历史、离线检查不等于真实任务通过。

教程与维护
部署及升级：docs/DEPLOYMENT.md
使用与离线示例：docs/USER_GUIDE.md
版本计划：docs/ROADMAP.md；各版说明：CHANGELOG.md
本版测试档案：docs/RELEASE_TEST_ARCHIVE.md
详细真机操作：docs/PHONE_LAB_GUIDE.md
第三方组件：docs/THIRD_PARTY_COMPONENTS.md

数据在.data，必需依赖与控制信息在.runtime。正常停服后备份整个已用目录。
更新使用新目录；不要删除.data/.runtime，不要把v0.5的schema3库覆盖给v0.4。
本服务只监听127.0.0.1。第二台物理电脑、更多手机兼容及长期投屏稳定性未验收。

preview.11: 真机工作台 -> 结果与对比，可直接查看随包36项历史测试。
模型服务填写后请点击“保存此服务配置”；只填写而未保存不会进入测试列表。
升级：停止旧包，备份旧目录，将旧包 .data 复制到全新解压包后启动；不要覆盖或删除旧目录。

preview.12: 连接手机后自动投屏，可在顶部关闭；失败不循环重试。
新增洛书起点，内置v0.5实测HOP-AL10指定版本／2584x1828机型标定，无需导入。
详见 docs/V04_PREVIEW12_BACKPORT.md；旧专用标定可选05_IMPORT_STARTPOINT.cmd迁移。
