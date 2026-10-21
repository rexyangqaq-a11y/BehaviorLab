# Windows 免安装部署

交付面向 Windows 10/11、Intel/AMD x64。本机同类型环境已验证；未在另一台物理电脑实测。包内运行时为 Node.js 24.19.0，无需系统安装、npm 或 Codex。普通本地可写目录即可，当前 Mock 流程可离线运行。

## 给使用者

把 ZIP 完整解压到例如 `D:\BehaviorLab`，双击 `01_START.cmd`，浏览器自动打开。双击 `02_STOP.cmd` 正常停止。服务在后台运行，关闭浏览器不会停止服务；重启电脑后重新双击启动。`start-web.cmd` 保留为相同入口。

默认尝试 4317；端口被其他服务占用时，系统分配空闲端口。重复启动同一个目录会打开其原地址，不会接管其他目录/程序的服务。当前地址保存在 `.runtime/desktop.json`。控制文件中的随机 token 仅用于同一目录的本机命名管道，不通过 HTTP 开放停止接口。停止脚本只联系本目录所属服务，不按端口杀进程。

数据保存在 `.data`，控制文件和日志在 `.runtime`。正常停止后复制整个目录即可继续迁移；恢复后原计划、实际结果、截图与原文继续保留。不要在活动执行中直接复制 SQLite/WAL 文件。备份的副本继续运行后会分叉，不提供自动双向合并。

本包只监听 `127.0.0.1`。这次交付是本机演示部署；不新增认证、远程访问或生产托管。

## 数据快照与包结构

带数据包包含当前 `.users.sqlite` 与各运行的 `state.sqlite`、所有被数据库引用且通过 SHA-256 验证的资产、非运行中的 Web 作业记录。使用 Node SQLite 在线备份 API 生成独立数据库，包含 WAL 已提交内容。打包前拒绝活动租约/作业，打包期间检测源数据库和作业记录变化；发生变化则失败，不交付该快照。源数据库只读，不停止或改写原服务。

不打包 `.runtime`、原日志、临时文件、无关截图、旧导出文件和构建缓存。旧导出包含旧目录的绝对路径，新电脑应重新导出。历史调用输入/输出保留原始内容，不批量替换证据中的旧路径。干净包从空用户库开始。两个包互相独立，任选一个解压使用。

内置 `runtime/node.exe` 已按 [Node.js 官方 v24.19.0 校验表](https://nodejs.org/download/release/v24.19.0/SHASUMS256.txt) 核对 SHA-256；许可证为[官方完整 LICENSE](https://github.com/nodejs/node/blob/v24.19.0/LICENSE)，随运行时提供。平台基线参照 [Node.js v24.19.0 BUILDING.md](https://github.com/nodejs/node/blob/v24.19.0/BUILDING.md)，SQLite 快照实现参照[官方 backup 文档](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html#sqlitebackupsource-db-path-options)。

## 维护者重新打包

```powershell
node scripts/build-portable.mjs --out output/BehaviorLab-Windows-x64 --runtime <node.exe路径> --license <官方LICENSE路径> --checksums <官方SHASUMS256.txt路径>
```

默认包含当前数据；加入 `--clean` 生成干净目录。目标目录必须不存在，拒绝覆盖。生成后将整个目标目录压缩为 ZIP。打包不依赖用户机器的 Codex 路径；分发后的启动脚本优先使用包内运行时。

验证覆盖：官方运行时哈希、数据库完整性/外键、资产哈希、中文和空格路径、后台启动与重复启动、端口冲突、正常停止与再次启动、迁移后新增用户并执行 Mock 闭环。具体数据量与快照时间以包内 `portable-manifest.json` 为准。通过这些验证不代表真实手机/模型已接入或合成行为的自然性已验证。

交付前运行 `node --test tests/*.test.mjs`，29 项通过。测试包括真实子进程和本机 HTTP，未使用手机或模型服务。Windows 下曾在并行测试中出现 SQLite I/O 错误，已调整 Web 服务对每个运行的连接生命周期，避免在后台工作进程打开数据库时反复关闭最后一条 WAL 连接；调整后的完整并行测试通过。该验证不等于覆盖所有硬件和杀毒软件环境。

## 2026-10-20 源码更新

重新回归发现作业文件原子替换时的 `EPERM`：已在源码为短暂占用增加有界重试，并验证旧记录不会因失败被截断。新增三项故障注入测试后，全量 32/32 通过。具体见[开发进度与迭代清单](DEVELOPMENT_BACKLOG.md)。2026-10-19 的 ZIP 未改动，不包含该修复；新版本发布和第二台电脑的资源管理器双击等 GUI 验收仍待完成。

## 2026-10-21 交接更新

当前源码工程回归为 **46/46 通过**；上面的 29/32 项属于当时阶段。历史模型短文本连通通过不代表手机 GUI 能力，最新范围见 [CURRENT_STATUS.md](CURRENT_STATUS.md)。本次仅建立本地源码 Git 基线，不含运行时、数据和安装依赖，不是新的免安装包；2026-10-19 ZIP 未重建，第二台物理电脑 GUI 验收仍未完成。
