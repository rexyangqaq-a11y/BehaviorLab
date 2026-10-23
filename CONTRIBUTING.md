# 协作开发入口

先读[当前状态](docs/CURRENT_STATUS.md)、[下一步](docs/NEXT_TASK.md)和[开发结构](docs/DEVELOPMENT.md)。PPT工作另遵守[固定规则](docs/PPTX_AUTHORING_RULES.md)。本地测试/记录、账号和依赖不提交；不要清理其他开发者或用户新增的数据。

普通代码验证用`npm test`。`npm run phone:doctor`只做离线部署和原生夹具检查，绝不等于真机通过。新增框架按[接入说明](docs/FRAMEWORK_ADAPTER_GUIDE.md)实现。真实测试需要沿用项目[用量规则](docs/MODEL_CALL_POLICY.md)，保留失败和原始证据，不把自动重试或Mock记为真实通过。

提交说明写清行为变化、涉及协议、验证结果和未验证范围。新增或改变动作、提示、截图、坐标/解析、起点或模型配置时升级运行协议并冻结源码。无需为纯文档/普通展示变更重跑真机。当前最终框架仍未确认。
