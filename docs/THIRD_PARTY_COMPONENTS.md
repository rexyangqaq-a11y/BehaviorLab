# 第三方组件与许可

本项目发布包带有下列第三方组件；它们的许可证和NOTICE随对应组件保留。项目未替使用者取得模型服务、手机账户或APP内容的授权。项目自身尚未指定开源许可证，公开仓库不自动授予再分发或商用许可。

| 组件 | 固定版本／标识 | 包内许可位置 |
|---|---|---|
| Node.js | 24.19.0 Windows x64 | `runtime/NODE-LICENSE.txt`、官方校验表 |
| Midscene Harmony | 1.16.0 | `integrations/midscene/node_modules/` 对应包许可证 |
| MobiAgent | `4ee794021bb34a8de4d00c52ca8fa6f0065a45ff` | `.runtime/frameworks/MobiAgent/LICENSE` |
| Open-AutoGLM | `86f55382982fb054e8fc98ca80609dff8a2cdc3c` | `.runtime/frameworks/Open-AutoGLM/LICENSE` |
| Python及依赖 | 随包清单记录实际版本 | `.runtime/python-phone/` 许可证及dist-info元数据 |
| HDC | 随包设备工具清单记录 | `.runtime/hdc/NOTICE.txt`、`oh-uni-package.json` |
| Temurin JRE | 21.0.8+9 | `.runtime/java-video/legal/` |
| HOScrcpy SDK | 1.0.18-beta | `.runtime/hoscrcpy/licenses/HOScrcpy-LICENSE` |
| JMuxer | 2.1.4 | `web/vendor/JMUXER_LICENSE` |

模型权重和Microsoft字体不随包分发。运行时与框架清单分别见 `portable-manifest.json`、`.runtime/framework-sources.json` 和 `.runtime/phone-video-files.json`。
