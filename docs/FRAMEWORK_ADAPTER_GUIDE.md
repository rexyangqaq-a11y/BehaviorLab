# 新增手机操作框架

## 现有接入契约

`src/phone-framework-registry.mjs`是固定白名单。目录名、adapter名、版本和冻结源文件都来自源码，不能接受网页传入任意模块路径。`PHONE_FRAMEWORKS`只暴露UI所需元数据。worker按注册项动态加载`integrations/adapters/<adapter>.mjs`，调用异步`run(context)`。

context含`input`（冻结任务/服务/额度）、`prompt`、`session`（设备观察/动作）、`transport`（计量HTTP）、`evidence`、`control.signal`，以及共享动作计数和保护。Python适配器复用`dispatch(name,param)`，它负责权限核对、重复动作保护和设备事务。Midscene必须在SDK动作入口同等监测，不能重复派发或多算一次物理动作。`counter.value`是框架动作数，物理输入数由device独立计算。

适配器返回原生结果或抛错。独占子进程在`finally`关闭并移除监听器；与设备共享会话的SDK通过`deferCleanup(close)`登记关闭，worker在最终截图、result/state持久化之后调用，不能提前断开设备导致终图失败。worker拥有统一超时、用量与最终观察。返回finish不自动授予业务通过，最终仍pending_review。

## 接入顺序

1. 注册固定版本/来源、adapter入口和实际参与执行的源文件。不要只改下拉框。
2. 在`integrations/adapters/`实现`export async function run(context)`，可从现有两种入口开始。私有provider key只在JS运输层使用，不发送到Python、stdout或SDK报告。
3. 明确支持的点击/输入/滑动/返回/启动/结束动作及坐标单位、缩放、方向、截图MIME。动作不支持时显式失败，禁止默认为成功/finish。
4. 若复用Python桥，在`runners`显式注册函数，并新增原生响应夹具；未知ID必须拒绝。不要把新的框架默认走MobiAgent分支。
5. 更新部署doctor、固定源码校验和`package-phone-runtime.mjs`必要资源。所有依赖放项目局部路径，通过`phonePython(project)`解析，不能写个人盘符或依赖Codex缓存。
6. 工程回归后做离线原生契约；获得明确范围授权后才做一项真机任务。分别报告部署通过、契约通过、真实任务通过，不能合并。

## 必须保留的执行信息

输入/任务版本与起点、设备型号/系统/应用版本、源码哈希、每个真实模型输入/原始回复/usage、解析结果、设备动作意图/返回、对应截图、耗时、停止原因和独立审核。动作发生但结果未知时停止，不自动重放。自动重试保持0，按用户当前单题单组合15请求上限，整批不设总请求硬上限。

新增适配不应修改旧run中的任何文件。使用新的协议号标识坐标、提示、解析或采集行为改变。测试成功样本必须保留完整的全过程禁止动作判断。
