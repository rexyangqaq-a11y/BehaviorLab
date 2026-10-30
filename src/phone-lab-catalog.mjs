export const PHONE_LAB_VERSION = '0.4.0-preview.14';
export {PHONE_FRAMEWORKS} from './phone-framework-registry.mjs';
export const PHONE_CASES = [
  { id: 'HM-SYS-001', revision: 2, name: '设置 · 读取关于本机', app: '设置', bundle: 'com.huawei.hmos.settings',
    instruction: '从当前设置首页进入“关于本机/关于手机”，读取页面可见的型号代码与 HarmonyOS 系统版本。保持在关于页面，不修改设置；未显示的字段说明未显示。',
    initial_state: '同一台手机展开横屏；设置左侧列表在顶部、右侧为星闪和蓝牙，无浮窗、无键盘；关于本机未选中。',
    acceptance: ['框架自主进入关于本机页面', '终图可读型号代码和 HarmonyOS 版本', '报告字段与真实图一致，未修改设置'],
    reset: 'settings', expected: ['关于本机', 'HOP-AL10'], forbidden: '修改开关、系统配置、账号操作', origin: 'project_owned_complete_task' },
  { id: 'HM-CALC-001', revision: 3, name: '计算器 · 完成算式', app: '计算器', bundle: 'com.huawei.hmos.calculator',
    instruction: '从手机桌面开始，自主找到并打开计算器，清空已有表达式，再计算 (128 + 37) × 6，并让最终计算结果显示在计算器界面。必须通过界面输入并计算，不要只在文字中给出答案。',
    initial_state: '手机桌面同一页面、展开横屏，无键盘或浮窗；时钟、小组件和最近应用集合/顺序允许变化并截图留证。准备只停止目标 APP 进程并回桌面，不打开 APP、不清除账号或应用数据；框架自行打开并清空表达式。',
    acceptance: ['通过真实 UI 输入算式', '终图实际显示结果 990', '无遗留的其他算式或错误状态'],
    reset: 'home', expected: ['990'], forbidden: '打开任务外应用或调用外部计算接口', origin: 'project_owned_complete_task' },
  { id: 'HM-STOR-001', revision: 3, name: '设置 · 查看存储占用', app: '设置', bundle: 'com.huawei.hmos.settings',
    instruction: '从手机桌面开始，自主找到并打开系统设置，进入“存储”，读取当前已使用空间和总容量，并查看应用/应用和元服务所占空间。保持在存储页面，不执行清理或删除；未显示的字段说明未显示。',
    initial_state: '手机桌面同一页面、展开横屏，无键盘或浮窗；时钟、小组件和最近应用集合/顺序允许变化并截图留证。准备只停止目标 APP 进程并回桌面，不打开 APP、不清除账号或应用数据。',
    acceptance: ['框架自主进入存储页面', '已用/总容量有终图依据', '应用占用可见或明确说明未显示', '没有清理或删除操作'],
    reset: 'home', expected: ['存储'], forbidden: '清理、删除、卸载、修改任何配置', origin: 'project_owned_complete_task' },
  { id: 'HM-TB-001', revision: 3, name: '淘宝 · 搜索并查看商品', app: '淘宝', bundle: 'com.taobao.taobao4hmos',
    instruction: '从手机桌面开始，自主找到并打开淘宝，搜索“折叠手机支架”，打开一个普通商品详情，读取页面显示的商品标题和当前展示价格。保持在该商品详情；不要选择规格、加入购物车、收藏、下单或付款。遇到广告或直播跳过。',
    initial_state: '手机桌面同一页面、展开横屏，无键盘或浮窗；时钟、小组件和最近应用集合/顺序允许变化并截图留证，淘宝同一已登录账号。准备只停止目标 APP 进程并回桌面，不打开 APP、不清除账号或应用数据。',
    acceptance: ['实际搜索指定关键词', '打开普通商品详情而非广告/直播', '标题和展示价格来自终图；不推断优惠后价', '没有购物车、收藏或交易动作'],
    reset: 'home', expected: [], forbidden: '购买、加购、收藏、关注、支付、修改账号', origin: 'project_owned_complete_task', dynamic: '商品及价格可能变化，记录执行时间与实际商品，不跨时段强求同一价格' },
  { id: 'HM-XHS-001', revision: 3, name: '小红书 · 搜索并阅读笔记', app: '小红书', bundle: 'com.xingin.xhs_hos',
    instruction: '从手机桌面开始，自主找到并打开小红书，搜索“杭州旅游”，打开一篇普通图文笔记，读取笔记标题、作者及正文中一条可见的出行建议。保持在该笔记详情。不要点赞、收藏、关注、评论、私信或分享；不要打开广告、直播或视频。',
    initial_state: '手机桌面同一页面、展开横屏，无键盘或浮窗；时钟、小组件和最近应用集合/顺序允许变化并截图留证，小红书同一已登录账号。准备只停止目标 APP 进程并回桌面，不打开 APP、不清除账号或应用数据。',
    acceptance: ['实际搜索指定关键词', '进入普通图文笔记详情', '标题、作者和一条建议有真实图依据', '没有任何互动/发布动作'],
    reset: 'home', expected: [], forbidden: '点赞、收藏、关注、评论、私信、分享或修改账号', origin: 'project_owned_complete_task', dynamic: '搜索结果会变化，固定查询/账号/起始页，记录实际笔记与时刻' },
];
export function phoneModelFamily(model) {
  if (/^qwen3\.(?:7|8)/i.test(model)) return 'qwen3';
  if (/^deepseek-v4\.1-flash/i.test(model)) return 'deepseek';
  return null;
}
export function normalizePhoneLimits(value = {}) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(Error('测试限额格式无效'),{status:400});
  const result = {};
  for (const key of ['max_requests','max_steps','max_actions','max_repeated_actions','max_seconds','max_output_tokens','request_timeout_seconds']) {
    const n = value[key];
    if(n==null||n===''||n===0){result[key]=null;continue;}
    if (!Number.isSafeInteger(n) || n < 1) throw Object.assign(new Error(`${key} 请留空／填0表示不限制，或填写正整数`), {status:400});
    result[key]=n;
  }
  return { ...result, automatic_retries: 0, max_payload_bytes: null, max_text_chars: null, max_images: null, thinking: false };
}
