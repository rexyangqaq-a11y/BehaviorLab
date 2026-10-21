# AndroidWorld 的任务与本项目的适用范围

核查日期：2026-10-19。以下按官方任务注册表与定义归类，列出代表性任务，不是 116 个模板的逐项全清单。官方介绍的规模是 20 个 APP、116 个参数化任务；姓名、日期、内容等可变化，不是 116 条固定指令。[官方介绍](https://google-research.github.io/android_world/)

## 1. 主要操作任务

| 场景 | 任务内容举例 | 官方任务 ID 举例 |
|---|---|---|
| 日历 | 创建单次/重复日程，按日期删除事件 | SimpleCalendarAddOneEvent、SimpleCalendarAddRepeatingEvent |
| 联系人 | 新增联系人、准备新联系人草稿 | ContactsAddContact、ContactsNewContactDraft |
| 短信 | 发送、回复最近短信、转发收到的地址 | SimpleSmsSend、SimpleSmsReplyMostRecent、SimpleSmsSendReceivedAddress |
| 笔记 | 创建、修改、移动、合并、删除笔记 | MarkorCreateNote、MarkorMergeNotes |
| 文件 | 移动和删除文件 | FilesMoveFile、FilesDeleteFile |
| 记账 | 新增多笔记录、删除目标项或重复项 | ExpenseAddMultiple、ExpenseDeleteDuplicates2 |
| 菜谱 | 新建多个菜谱、删重复项、按约束删除 | RecipeAddMultipleRecipes、RecipeDeleteMultipleRecipesWithConstraint |
| 地图 | 收藏位置、创建标记、记录轨迹 | OsmAndFavorite、OsmAndMarker、OsmAndTrack |
| 媒体 | 创建或保存播放列表、管理播放队列 | VlcCreatePlaylist、RetroPlayingQueue |
| 拍摄与录音 | 拍照、录像、录音并按要求命名 | CameraTakePhoto、CameraTakeVideo、AudioRecorderRecordAudioWithFileName |
| 时钟与系统 | 秒表、计时器、Wi-Fi/蓝牙开关、亮度、剪贴板 | ClockTimerEntry、SystemWifiTurnOn、SystemBrightnessMax |
| 绘图与浏览器 | 创建绘图、浏览器画图/迷宫/乘法任务 | SimpleDrawProCreateDrawing、BrowserMaze、BrowserMultiply |

任务名称及组合以 [官方 registry.py](https://github.com/google-research/android_world/blob/main/android_world/registry.py) 为准。部分打电话相关任务在当前注册代码中被注释停用；不能把源码里出现的所有类都算作当前默认启用的任务。MiniWoB 是仓库另行支持的网页任务族，不应直接混算进 AndroidWorld 主任务集。

## 2. 信息查询类任务

还有打开 APP、阅读内容后回答问题的任务，例如查询某日有哪些日历事件、下一个事件、会议地点；官方介绍也展示查询高优先级待办和运动统计。它们测试页面检索、时间/条件理解和汇总，不一定修改 APP 状态。任务由 textproto 模板动态注册。[查询任务定义](https://github.com/google-research/android_world/blob/main/android_world/task_evals/information_retrieval/proto/tasks.textproto)、[动态注册逻辑](https://github.com/google-research/android_world/blob/main/android_world/task_evals/information_retrieval/information_retrieval_registry.py)

## 3. 复杂任务的具体例子

1. ExpenseAddMultipleFromMarkor：在 Markor 的 my_expenses.txt 中筛出可报销交易，再录入记账 APP。需要跨页面阅读、条件筛选、暂存字段和多次填写。[任务实现](https://github.com/google-research/android_world/blob/main/android_world/task_evals/single/expense.py)
2. MarkorMergeNotes：按给定顺序把三个已有笔记合并成新笔记，保留要求的分隔。需要读取多个对象、顺序管理与输出核对。[任务实现](https://github.com/google-research/android_world/blob/main/android_world/task_evals/single/markor.py)
3. MarkorTranscribeReceipt：在图库查看收据图片，再到 Markor 创建包含交易内容的文件。涉及视觉读图和跨 APP 信息转移。[任务实现](https://github.com/google-research/android_world/blob/main/android_world/task_evals/single/markor.py)
4. ExpenseDeleteDuplicates2：在含有干扰记录及近似记录的数据中清除完全重复的支出，保留唯一项。需要区分完全相同与看起来相似，不能误删。[任务实现](https://github.com/google-research/android_world/blob/main/android_world/task_evals/single/expense.py)

## 4. 对我们的借鉴与限制

适合借鉴的是任务目标、初始化、可核对的成功条件，以及多对象/多步骤/干扰条件设计。它能测试下层是否有可用操作能力，但不能验证我们的固定人设、长期行为自然性，或今日头条、大众点评、携程、小红书等商业 APP 的实际兼容性。

其中跨 APP 任务用于了解复杂任务结构；本项目首版单活动限一个 APP 仍是暂定约束，不因参考这些任务而自动放开。真实商业 APP 不一定能像评测环境那样读取数据库或系统状态，完成验证常需依赖可见页面和操作证据。
