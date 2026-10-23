# 三框架配模型的公开任务评测核对

核对日期2026-10-23。只查询公开资料，不运行模型/设备。用于报告第三页局部修订，其他页保持原文件内容。来源为官方报告、论文正文或项目代码，不将聚合站的二手数字作为结果依据。

## 可以放到相近粒度的组合

统一选整项任务成功率，排除步骤得分、部分完成率、定位准确率和加速倍数。按用户要求，直接展示具体模型名。

| 组合 | 公开任务集 | 整项成功率 | 上限与环境 | 来源性质 |
|---|---|---:|---|---|
| Midscene1.10.3＋Gemini-3.6-Flash | MobileWorld，117任务 | Pass@1 78.63%，92/117 | 50轮，安卓Docker模拟器 | Midscene官方报告，2026-07-28 |
| 论文所称官方执行框架＋MobiMind-Mixed-4B | MobiFlow基础场景 | SR53.8% | 50步，基于真实APP采集轨迹的状态图交互 | 2026-03-17预印本，表3 |
| 论文所称官方执行框架＋AutoGLM-Phone-9B | 同一MobiFlow基础场景 | SR16.7% | 同50步、同状态图评测 | 同一预印本，表3 |

引用与条件：

- [Midscene MobileWorld官方报告](https://midscenejs.com/mobile-world-benchmark-report)列出版本、模型、日期、117题及逐题轨迹。`MastodonNewFilterTask`的验收器按任务意图调整，不能称完全未改原始协议。
- [MobiFlow预印本](https://www.preprints.org/manuscript/202603.1313)第5.1节说明GUI专用模型使用其官方执行框架，最多50步，A100-SXM4-80GB与vLLM。表2定义SR为完整任务成功，CR为进展程度。表3基础场景MobiMind的SR53.8%/CR72.9%，AutoGLM的SR16.7%/CR30.2%。本页只比较SR，不混入CR。
- [MobiBench项目](https://github.com/nanookfyf/MobiBench)有MobiMind和AutoGLM评测入口，MobiMind使用`StaticMobiAgentWorker`和页面状态图推进。[MobiMind入口](https://github.com/nanookfyf/MobiBench/blob/main/agents/MobiMind/bench.py)亦设MAX_STEPS=50。未下载或执行第三方代码，未核验完整数据是否可复现全部论文数字。

可比边界：后两行同一论文、同集、同指标、同50步，但模型不同，无法据此分离框架和模型各自贡献。论文没有钉死官方执行框架的提交版本，不能直接写成本机两个固定版本的复现成绩。预印本尚未同行评审。全套240任务涵盖多个场景，基础场景的分母未从表3独立核实，不能将53.8%或16.7%解释为全240任务成功率。

Midscene这行也是整项任务一次成功、50轮，但MobileWorld与MobiFlow不同，且一个在模拟器中操作，一个在预采集状态图中推进，不能三行直接排名。未找到Midscene在该MobiFlow基础场景的公开结果，也未找到三框架在同一公开任务集、同一模型/预算下的完整对比。这里的“未找到”限定于本次查阅的原始资料，不是断言从未有人测过。

## 其他已核对的“框架＋任意模型”公开实例

| 组合 | 任务集与指标 | 结果 | 说明 |
|---|---|---:|---|
| Midscene1.9.5＋Gemini-3.5-Flash | AndroidWorld Pass@1 | 93.10% | DeepThink开启，120轮，环境/部分验证器有调整 |
| Midscene1.12.0＋Qwen3.7 Plus | AppControlBench，60项iOS任务Pass@1 | 93.33%，56通过/4部分/0失败 | 部分完成不计入Pass@1 |
| Midscene1.12.0＋DeepSeek V4 Flash Vision Exp | 同上 | 86.67% | 模型标识按官方报告，不假定与本机DeepSeek服务完全相同 |
| Midscene1.12.0＋Doubao Seed2.1 Turbo | 同上 | 96.67%，58通过/1部分/1失败 | Completion含部分分，与Pass@1分开 |
| 自定义通用执行方式＋GPT-5 | MobiFlow基础场景SR | 49.7% | 论文通用模型统一执行框架＋图标标注辅助，不标成MobiAgent＋GPT-5 |
| 自定义通用执行方式＋Gemini-2.5-Pro | 同上 | 38.7% | 同样不冒称三候选中的框架 |

原始来源：[AndroidWorld官方报告](https://midscenejs.com/android-world-benchmark-report)、[AppControlBench官方报告](https://midscenejs.com/app-control-bench-report)、[MobiFlow论文表3及附录F](https://www.preprints.org/manuscript/202603.1313)。

未采用的数字：2024闭源AutoGLM的AndroidLab36.2%、AutoGLM-Mobile的AndroidWorld75.8%、MobileRL的AndroidWorld80.2%均不能自动当作Open-AutoGLM当前开源框架成绩。原MobiAgent论文的平均得分/2–3倍复用加速，也不再与整项成功率并列。

## 本机同条件对照

冻结矩阵内固定qwen3.7-plus、同HOP-AL10、同四题、每题15请求/40动作/600秒，Mid/Mobi/Auto严格通过分别3/4、2/4、3/4。模型完整标识直接展示在第三页，不隐藏在备注。每组合一次，历史协议v4–v7与应用内部状态变化仍存在，不能把本机样本当稳定可靠性排名。
