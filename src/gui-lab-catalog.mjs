export const GUI_LAB_VERSION = '0.4.0-preview.1';
export const GUI_CANDIDATES = [
  { id: 'midscene', name: 'Midscene', language: 'Node.js', package: '@midscene/harmony', version: '1.16.0', source: 'https://github.com/web-infra-dev/midscene', path: '官方 Harmony / HDC', stage: 'real_framework', note: '已局部部署；独立真机页有一题助手核对通过，最终框架未定。本页仍只运行 Mock。' },
  { id: 'mobiagent', name: 'MobiAgent', language: 'Python', source: 'https://github.com/IPADS-SAI/MobiAgent', path: '官方 Harmony 分支', stage: 'sdk_contract', note: '已固定源码与局部环境，原生循环离线契约通过；真实 GUI 及模型组合待测。本页仍为 Mock。' },
  { id: 'autoglm', name: 'Open-AutoGLM', language: 'Python', source: 'https://github.com/zai-org/Open-AutoGLM', path: '官方 HDC 路径', stage: 'sdk_contract', note: '已固定源码与局部环境，原生单步循环离线契约通过；真实 GUI 与现有模型动作协议待测。本页仍为 Mock。' },
];

// Project-owned engineering fixtures, not imported benchmark tasks or scores.
export const GUI_CASES = [
  { id: 'system_read', name: '系统 APP · 只读查看', app: '系统设置', goal: '打开关于页面并查看系统版本，不修改设置。', initial_state: '由测试者打开设置首页；实际起点需真机核对。', acceptance: '保留关于页面截图及可见版本信息。', scenario: 'success', target: 1 },
  { id: 'news_two', name: '新闻 · 两个不同对象', app: '今日头条（示例）', goal: '搜索出行话题，打开两篇不同文章查看。', initial_state: '搜索页；城市、账号和 APP 版本在真机测试前固定。', acceptance: '两篇不同文章各有标题/对象标识和打开后的截图。', scenario: 'success', target: 2 },
  { id: 'food_duplicate', name: '美食 · 重复对象不累计', app: '大众点评（示例）', goal: '查看两家符合城市和预算条件的不同餐厅。', initial_state: '餐厅列表；夹具重复返回同一对象。', acceptance: '重复餐厅只能计一次，不能把两次打开当作两家。', scenario: 'duplicate', target: 2 },
  { id: 'no_results', name: '社区 · 无结果', app: '小红书（示例）', goal: '搜索指定话题；无结果时如实结束。', initial_state: '搜索页；夹具返回空列表。', acceptance: '记录无结果证据，实际数量为零，不宣称完成。', scenario: 'empty', target: 1 },
  { id: 'model_error', name: '模型异常 · 不发送动作', app: '系统设置', goal: '验证模型响应失败时不下发手机动作。', initial_state: '夹具在决策阶段返回错误。', acceptance: '模型错误保留，工具发送次数为零。', scenario: 'model_error', target: 1 },
  { id: 'tool_unknown', name: '工具超时 · 效果未知', app: '系统设置', goal: '验证工具返回超时后停止，不自动重发。', initial_state: '夹具模拟已发送但未得到工具返回。', acceptance: '动作意图在发送前保存，结果需人工关注，不自动重试。', scenario: 'tool_unknown', target: 1 },
  { id: 'loop', name: '循环与停止 · 有界退出', app: '携程（示例）', goal: '查看两个不同目的地；页面无进展时停止。', initial_state: '夹具持续返回相同页面和对象。', acceptance: '达到步数、时间或连续无进展上限后退出，支持手动停止和 Mock 续跑。', scenario: 'loop', target: 2 },
];
