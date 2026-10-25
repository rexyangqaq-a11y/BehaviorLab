# 开发结构与交接

2026-10-25：当前源码0.5.0-preview.1，首轮离线装配、证据／实际量、恢复及人工入口见[V05_OFFLINE_IMPLEMENTATION](V05_OFFLINE_IMPLEMENTATION.md)。主系统真实会话与安全续接仍未完成，手机／真实模型继续暂停。以下v0.4交接基线为preview.10、9929ed4。v0.4按用户确认的四案例最小真实验证与离线收尾范围交接；主仿真内容生成仍Mock，独立phone-lab为真实GUI验证台，两条执行链尚未生产集成。源码/部署与未测能力以[CURRENT_STATUS.md](CURRENT_STATUS.md)为准；下文带早期日期的拆分记录不作为本轮改动声明。

| 目录/模块 | 职责与修改入口 |
|---|---|
| `src/web-server.mjs`、`web/workspace.mjs` | 主工作台HTTP与UI，模型设置、用户库和仿真入口 |
| `src/phone-lab.mjs` | 真机任务/运行/队列管理、起点冻结、审核、导出及设备互斥 |
| `src/phone-tasks.mjs`、`phone-startpoints.mjs` | 自定义任务版本、命名起点保存/比较；测试页不另设起点 |
| `src/phone-framework-registry.mjs` | 框架唯一注册表，公开元数据、固定适配器和源文件清单 |
| `scripts/phone-lab-worker.mjs` | 公共执行边界：起点、限额、HTTP记录、权限、停止、结果持久化 |
| `integrations/adapters/` | 框架入口。Midscene SDK与Python RPC各自独立，保留原生行为 |
| `integrations/phone-frameworks.py` | Python原生循环的设备/模型RPC桥，不接收服务密钥 |
| `src/phone-device.mjs`、`hdc-environment.mjs` | HDC与设备命令、截图、物理动作及环境探测 |
| `src/gui-trial-transport.mjs`、`phone-evidence.mjs` | 唯一模型HTTP计量与本地证据；凭据清洗和图像资产哈希 |
| `src/phone-action-effects.mjs`、`integrations/phone_protocol.py` | 动作不确定性、物理坐标边界、原生动作协议前置校验；不自动重放或猜测坐标单位 |
| `src/v04-acceptance.mjs`、`web/v04-acceptance.*` | 31项要求的证据核对与允许列表内公开来源；不是31项真实通过成绩 |
| `web/phone-lab.mjs`、`phone-results.mjs`、`phone-trace.mjs` | 四页签交互、列表/矩阵筛选、逐图模型回复与动作 |
| `web/phone-process.mjs`、`phone-process-ui.mjs` | 只读过程轨迹、当前用例、原始回复/动作与证据图 |
| `src/phone-video*.mjs`、`integrations/hoscrcpy/`、`web/phone-video*.mjs` | 可选后台视频会话、固定SDK桥、网页解码；与模型/业务动作分开，见[接入说明](HOSCRCPY_VIDEO.md) |
| `tests/` | 工程回归与夹具，不产生真实GUI通过成绩 |
| `scripts/package-phone-*.mjs/.py`、`build-portable.mjs` | 干净Windows包、独立运行时与许可证、无符号链接依赖 |
| `.data` / `.runtime` / `.build` / `output` | 本机数据、依赖/控制文件、构建过程、交付物，非源码 |

2026-10-23打包增加`--video-archive`和`--source-index`：后者导出已审查的Git索引快照，其他正在编辑的稿件保持不动；前者只接受固定官方JRE的SHA256，安全解压后编译桥，写入相对路径和文件哈希清单。03_CHECK只运行Java/SDK类加载及固定离线契约，不启动视频或模型。发布命令和目标机条件见[部署说明](WINDOWS_PORTABLE.md)。

## 本地工作

用户2026-10-23明确要求每轮改动验证后提交本地Git，现阶段不配置远程、不推送。源码与验证文档纳入提交；凭据、运行数据、原始手机图、依赖和输出包按`.gitignore`排除。未完成的保存点用WIP说明，禁止据此宣称功能完成；提交前检查暂存范围和差异。

Node.js24运行`npm run web`，本机默认4317。核心Mock无需安装npm依赖。真机SDK与Python环境按[操作指南](PHONE_LAB_GUIDE.md)准备，常规维护优先`npm run phone:doctor`。安装依赖是显式的`phone-frameworks-setup.mjs --install --python <Python3.12>`，会访问公开依赖源；不能将安装检查和真实设备测试混在一起。

`npm test`会启动临时本机HTTP和子进程，在受限环境可能需要放行这些操作，不调用供应商或手机。`phone-framework-contract.mjs`只注入合成截图和五条固定模型回复，验证真实上游循环的中文/图片/动作协议。两者通过后是否做真机最小任务应由当前任务授权决定。

## 分工与兼容边界

UI开发修改`web/`和API展示字段，避免改动历史input/result/asset。框架开发只从注册表和adapter入口接入，公共额度/设备日志放worker及统一层。用量计算集中transport，禁止另建SDK客户端绕过。设备/截图改动可能改变所有框架成绩，必须单独说明协议版本和重新验证范围。

2026-10-22曾将大分支移出worker并引入可迁移Python路径。之后的收尾增加严格协议与效果保护，新运行协议为v10，旧运行v4–v7及起点v9分别冻结。本次交接未改业务文件，新保护只有离线与原生契约验证，未追加手机任务；不能把旧真实成绩当新协议复测。

## 交接材料

四题36项[最终结果](PHONE_EVALUATION_RESULTS_20261022.md)，[统计分析](PHONE_EVALUATION_ANALYSIS_20261022.md)，[进一步根因分析](PHONE_FAILURE_DIAGNOSIS_20261022.md)，[框架接入](FRAMEWORK_ADAPTER_GUIDE.md)，[Windows部署](WINDOWS_PORTABLE.md)。当前用户新建的大众点评任务和其运行不属于该36项分母，保留不动。
