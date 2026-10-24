# 本地源码基线与恢复

更新：2026-10-25。仓库根为`D:\work\Memory\UserBehaGene\dev`，Git归属该目录，不是父目录仓库；本地`main`，未配置远程、不推送。早期交接保存在Git历史，不重建或改写旧提交。

## 当前基线

| 标识 | 用途 |
|---|---|
| `bc5cbd6` / `codex/preview10-before-closeout-20261025` | 收尾前、已验证用户配置与默认推荐的preview.10 |
| `9929ed4` / `codex/v04-core-20261025` | 已有执行保护、严格协议、审核优先级及证据核对功能源码；本机133/133离线回归 |
| `codex/v04-handoff-20261025` | 功能源码加当前README、CURRENT_STATUS、NEXT_TASK、忽略规则及交接证据；完整提交号用下方命令查询 |

源码版本号仍preview.10，已交付部署ZIP仍preview.9。Git标签不是正式0.4.0发布包，也不恢复数据库或手机状态。

```powershell
git status --short
git rev-parse --show-toplevel
git rev-parse codex/v04-handoff-20261025
git show --stat codex/v04-core-20261025
git remote
```

## 本次审计与边界

本次交接不改业务实现：交接前后19个已有变更/新增业务与测试文件SHA-256一致；它们在此前开发阶段已实现，本次仅验证、提交和补文档。安装环境133项全通过，另对无数据/无依赖的干净源码副本验证129通过/4依赖测试跳过/0失败。原39运行、6任务、83起点与1728份元数据哈希保留。交接不调用真实模型、不操作手机。

`.gitignore`排除`.data`、`.runtime`、`runtime`、`node_modules`、缓存、`.build`、`output`、数据库/WAL、凭据配置、私钥、DPAPI密码文件、加密迁移密钥文件、日志和发布压缩包。依赖清单/锁文件保留，安装产物不提交。提交前核对实际跟踪/暂存路径、历史禁入路径和常见密钥形态；审计只输出计数/文件类别，不打印密钥。

只有源码、测试、文档和审查后的脱敏工程证据进入Git；真实原始截图、账户、密钥和运行SQLite均不进入基线。原开发数据库旧格式未被本次交接改写。详见[交接审计](evidence/20261025-handoff/handoff-verification.json)。

## 不破坏现有工作地回退

确认工作区改动已有保存位置后，从目标标签开新分支：

```powershell
git switch -c codex/inspect-v04 codex/v04-handoff-20261025
```

不使用`reset --hard`或删除目录“恢复源码”；不要覆盖正在使用的`.data`。Git不撤回手机在途动作，不恢复账号/图像/密钥，不自动重放任务。

## 额外源码恢复包

交接提交完成后生成本地`.build/handoff-20261025/source-baseline.bundle`，校验并在本项目忽略目录内恢复验证。它仅包含Git源码历史及交接标签，不含未跟踪的数据/依赖/发布ZIP；不上传远程。

```powershell
git bundle verify .build/handoff-20261025/source-baseline.bundle
git clone .build/handoff-20261025/source-baseline.bundle D:\BehaviorLab-source-restore
```

示例目标必须尚不存在，路径由使用者选择；本次实际验证只写本项目`.build`子目录。最终bundle校验记录在`.build/handoff-20261025/bundle-verification.json`。基线验证文件清单保存在交接证据中，最终提交号不写回自身，避免自引用哈希。

## 数据与依赖另行保管

Git/bundle不是私人数据备份。`.data`及已使用目录只在正常停服后受控备份，不能运行中单拷SQLite而丢WAL。`.runtime`含Python、HDC和Java/HOScrcpy依赖，迁移已用目录不能整目录删除。源码恢复后需Node24，候选依赖按部署说明准备；没有候选SDK时相关测试应跳过或报告缺条件。

现有私人preview.9 ZIP包含历史截图和加密密钥，只在授权电脑间传递。ZIP外的迁移密码查看工具受原Windows账户保护，不能直接复制到新电脑解密。原始运行、报告和安装依赖仍保留原忽略目录，本次未删除或上传。
