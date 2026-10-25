# 使用教程

适用：v0.4.0-preview.10。先按 [部署教程](DEPLOYMENT.md) 启动。历史查看、主系统 Mock 和新真机任务分别使用，不把演示结果当真实采集。

## 查看随版历史测试

打开发布目录中的 `test-archive/index.html`，按任务／框架／模型进入某条记录；页面显示目标、判定、逐步事件、模型原始回复、动作和关联截图。所有文件在本地，不需要模型密钥或连接手机。JSON／JSONL保留便于分析，截图哈希清单用于完整性核对。

此档案是2026-10-22已有测试的导出副本，不重新执行，也不自动进入运行队列。36项的16通过／10部分完成／10未通过是助手独立判定，用户复核待定；运行状态 `ended` 不等于业务通过。具体归档范围及脱敏边界见 [档案说明](RELEASE_TEST_ARCHIVE.md)。

## 跑一个无手机、无模型的完整示例

在完整 Windows 包根目录打开 PowerShell，使用一个尚未使用的新目录：

```powershell
.\runtime\node.exe src/cli.mjs init --config examples/mock-run.json --data .data/tutorial-v04
.\runtime\node.exe src/cli.mjs run --data .data/tutorial-v04
.\runtime\node.exe src/cli.mjs status --data .data/tutorial-v04
.\runtime\node.exe src/cli.mjs describe --data .data/tutorial-v04 --retry-failed
.\runtime\node.exe src/cli.mjs export --data .data/tutorial-v04
.\runtime\node.exe src/cli.mjs check --data .data/tutorial-v04
```

这组命令使用合成人设、计划、截图和描述，数据只写入本地示例目录。示例故意包含首活动部分完成、首轮描述失败；`run`后看到描述未完成是预期夹具，`describe --retry-failed`只补已有截图的描述，不重新采集活动。最后应见 `integrity_passed: true`；它核对数据完整性，不能证明真实行为效果。源码方式把 `.\runtime\node.exe` 换成 `node`。重复 `run` 可恢复本示例进度，成功活动不会重新采集，部分完成事实不改成目标全部完成。

主网页提供用户库、任务和运行状态，参数与业务流程见 [主工作台说明](WORKSPACE_V03.md)。v0.4主调度的内容生成和执行仍为Mock；在设置选择框架不会把主仿真自动切成真实手机闭环。

## 自行执行一项真实手机任务

1. 在系统设置保存自己的模型服务。截图会按该服务配置发送到模型端，先核对输入范围及额度。
2. 连接授权设备，允许电脑调试并解锁。在 `/phone-lab` 的任务页创建或选择任务，填写具体目标、通过依据、APP和允许操作。
3. 手动将手机摆到准备状态，为当前页面命名并保存起点；任务改版后重新核对起点。
4. 在测试页选择框架、服务和任务，先检查限额，再明确点击开始。默认每组合15请求、40动作、600秒、每次512输出tokens，零自动重试；整批没有默认总请求上限。
5. 在测试过程页看截图、回复、动作和消耗，需要时开启投屏。停止后先核对在途动作，未知效果不要直接重放。
6. 在结果页查看实际证据并填写用户审核，分别记录通过、部分完成、未通过及原因。可下载单条JSON和证据包。

默认推荐 Midscene + qwen3.7-plus，源自本机四题3通过1部分完成；它不是稳定成功率或所有APP上的最优结论，用户选择优先。

## 日常保存与排错

运行数据和密钥留在 `.data`，必需运行依赖及控制文件在 `.runtime`。停止服务后备份完整已用目录；不要把已用目录当干净程序包分享。故障先看 `.runtime/server.log` 和检查报告。更细的四页签、审核及协议说明见 [真机工作台指南](PHONE_LAB_GUIDE.md)。
