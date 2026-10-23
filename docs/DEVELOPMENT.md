# 开发结构与交接

2026-10-22，preview.6。主仿真内容生成仍Mock，独立phone-lab为真实GUI验证台，两条执行链尚未生产集成。不要把这个版本号解释成正式v0.4完成。

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
| `web/phone-lab.mjs`、`phone-results.mjs`、`phone-trace.mjs` | 四页签交互、列表/矩阵筛选、逐图模型回复与动作 |
| `web/phone-process.mjs`、`phone-process-ui.mjs` | 只读过程轨迹、当前用例、原始回复/动作与证据图 |
| `src/phone-video*.mjs`、`integrations/hoscrcpy/`、`web/phone-video*.mjs` | 可选后台视频会话、固定SDK桥、网页解码；与模型/业务动作分开，见[接入说明](HOSCRCPY_VIDEO.md) |
| `tests/` | 工程回归与夹具，不产生真实GUI通过成绩 |
| `scripts/package-phone-*.mjs/.py`、`build-portable.mjs` | 干净Windows包、独立运行时与许可证、无符号链接依赖 |
| `.data` / `.runtime` / `.build` / `output` | 本机数据、依赖/控制文件、构建过程、交付物，非源码 |

## 本地工作

用户2026-10-23明确要求每轮改动验证后提交本地Git，现阶段不配置远程、不推送。源码与验证文档纳入提交；凭据、运行数据、原始手机图、依赖和输出包按`.gitignore`排除。未完成的保存点用WIP说明，禁止据此宣称功能完成；提交前检查暂存范围和差异。

Node.js24运行`npm run web`，本机默认4317。核心Mock无需安装npm依赖。真机SDK与Python环境按[操作指南](PHONE_LAB_GUIDE.md)准备，常规维护优先`npm run phone:doctor`。安装依赖是显式的`phone-frameworks-setup.mjs --install --python <Python3.12>`，会访问公开依赖源；不能将安装检查和真实设备测试混在一起。

`npm test`会启动临时本机HTTP和子进程，在受限环境可能需要放行这些操作，不调用供应商或手机。`phone-framework-contract.mjs`只注入合成截图和五条固定模型回复，验证真实上游循环的中文/图片/动作协议。两者通过后是否做真机最小任务应由当前任务授权决定。

## 分工与兼容边界

UI开发修改`web/`和API展示字段，避免改动历史input/result/asset。框架开发只从注册表和adapter入口接入，公共额度/设备日志放worker及统一层。用量计算集中transport，禁止另建SDK客户端绕过。设备/截图改动可能改变所有框架成绩，必须单独说明协议版本和重新验证范围。

本轮将大分支移出worker、复用同一注册表并引入可迁移Python路径。原生循环、提示、限额与业务判定未借机调整。旧运行v4–v7、界面起点v9仍各自保留；新增架构入口参与源码冻结。当前版本真实运行尚未新增，离线验证不能代替该事实。

## 交接材料

四题36项[最终结果](PHONE_EVALUATION_RESULTS_20261022.md)，[统计分析](PHONE_EVALUATION_ANALYSIS_20261022.md)，[进一步根因分析](PHONE_FAILURE_DIAGNOSIS_20261022.md)，[框架接入](FRAMEWORK_ADAPTER_GUIDE.md)，[Windows部署](WINDOWS_PORTABLE.md)。当前用户新建的大众点评任务和其运行不属于该36项分母，保留不动。
