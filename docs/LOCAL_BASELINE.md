# 本地源码基线与恢复

日期：2026-10-21。本目录此前没有 Git；已检查 `dev` 及逐级父目录、候选源码目录，没有把已有仓库重建或嵌套。

## 归属与基线

- 仓库：`D:\work\Memory\UserBehaGene\dev\.git`，本地 `main` 分支。
- 基线标签：`handoff-20261021`。提交标识以本机 Git 查询为准；未配置远程，没有 push。
- 该提交由工具身份 `Codex <codex@local.invalid>` 创建，命令级指定，不修改用户全局身份。
- 仅记录源码、网页、测试、文档、启动脚本、候选依赖清单/锁文件、示例及审查后的最小脱敏证据。
- 本次交接前后的 49 个实现文件 SHA-256 一致；没有修改业务实现或生成材料工具代码。

查询：

```powershell
git status --short
git show --stat handoff-20261021
git rev-parse handoff-20261021
git remote -v
```

## 忽略和提交前检查

`.gitignore` 排除 `.data`、`.runtime`、`runtime`、`node_modules`、`.cache`、`.build`、`output`、数据库/WAL、凭据配置、压缩发布包、日志和临时文件。清单和锁文件是可复现源码的一部分，安装依赖不提交。

提交前核对过 Git 实际候选/暂存文件、禁入路径、数据库/可执行二进制标记、已保存凭据的精确内容以及常见密钥模式。输出只保留文件/问题类别或计数，不打印凭据。模式检查不能证明未知格式秘密永远不存在；以后新增文件仍须复核。

`.gitattributes` 规定源码文本规范化，Windows `.cmd` 检出为 CRLF；既有图片/PDF/PPTX 不做文本转换。本次没有修改旧 PPT 或发布包。

## 后续开发如何回退

从基线创建新分支，保留原分支的后续提交：

```powershell
git switch -c next/v04-gui-evaluation handoff-20261021
```

运行前确认工作区改动已有保留位置；不要用删除 `.data` 或覆盖数据库来“恢复源码”。Git 不知道在途手机动作的效果，也不恢复用户、密钥、截图或仿真进度。

## 独立源码副本

本地额外保留：`.build/handoff-20261021/source-baseline.bundle`。该目录被忽略，bundle 只包含已提交源码和文档，没有运行数据、凭据或安装依赖。

校验或在一个**尚不存在**的新目录还原：

```powershell
git bundle verify .build/handoff-20261021/source-baseline.bundle
git clone .build/handoff-20261021/source-baseline.bundle D:\BehaviorLab-source-restore
```

示例目录需使用者自行选定；本次实际恢复验证使用本项目忽略的 `.build` 子目录，不向其他位置写入。还原后需要本机 Node.js 24，模型配置不会随源码恢复。若只需本机当前副本继续开发，不必重复 clone。

bundle 的恢复验证结果记录在 [handoff-verification.json](evidence/20261021-handoff/handoff-verification.json)。本地完整审计文件在 `.build/handoff-20261021`；原始运行/材料仍在忽略目录，未删除或迁移。

## 数据、依赖和发布不随源码基线自动恢复

- `.data` 可能含用户/仿真数据、模型密钥；仅在正常停止后作独立本地受控备份。不要分享完整 `.data` 或 `.runtime`，也不要只复制一个活动 SQLite 文件。
- Midscene 是可选 SDK，锁文件保留，`node_modules` 不保留；核心 Mock 可在没有候选 SDK 时运行。
- `output/` 中的旧 ZIP、PPT、图片和第三方研究原始轨迹不提交。现有文档生成脚本的部分原始输入只在本机，干净检出不承诺重建全部材料；核心网页与工程回归不依赖这些资料。
- Git 基线不是新的 Windows 发布包。重新发布、迁移数据或更换机器均另立任务核对，避免把 2026-10-19 旧包当最新版。
