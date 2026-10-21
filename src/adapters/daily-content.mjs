import { appInfo } from '../app-catalog.mjs';

export function mockPersona(context) {
  const index = context.generation_index ?? context.requirements.generation_index ?? 0;
  const requirements = context.requirements;
  const brief = typeof requirements.brief === 'string' ? requirements.brief : '';
  const profiles = [
    { name: '沈知夏', age: 29, city: '杭州', occupation: '产品设计师', interests: ['徒步', '城市美食', '摄影'], summary: '关注周末短途出行，也会在通勤时浏览资讯。' },
    { name: '林远', age: 34, city: '上海', occupation: '软件工程师', interests: ['科技', '跑步', '咖啡'], summary: '关注科技与出行信息，习惯比较不同方案。' },
    { name: '周可', age: 26, city: '成都', occupation: '内容编辑', interests: ['烹饪', '阅读', '旅行'], summary: '关注日常生活灵感与本地餐饮信息。' },
    { name: '陈予', age: 41, city: '深圳', occupation: '项目经理', interests: ['亲子出游', '新闻', '美食'], summary: '关注城市生活、家庭周末活动和交通安排。' },
  ];
  const profile = structuredClone(profiles[index % profiles.length]);
  profile.city = brief.match(/杭州|上海|成都|深圳|北京|广州/)?.[0] ?? profile.city;
  if (index >= profiles.length) profile.name += ` ${Math.floor(index / profiles.length) + 1}`;
  if (requirements.city) profile.city = requirements.city;
  if (requirements.occupation) profile.occupation = requirements.occupation;
  if (requirements.age_min != null) profile.age = requirements.age_min + (index % (requirements.age_max - requirements.age_min + 1));
  if (requirements.life_context) profile.life_context = requirements.life_context;
  if (Array.isArray(requirements.interests)) profile.interests = [...requirements.interests];
  return { ...profile, label: profile.name, original_requirements: structuredClone(requirements), mutable: false,
    generation_note: 'Mock 人设内容；真实要求已保存，尚未调用模型验证约束满足度。' };
}
export function mockDailyPlan(context) {
  const day = Math.floor(Date.parse(context.virtual_date) / 86400000);
  const userOffset = [...context.user_id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const interests = context.persona.interests ?? context.persona.original_requirements?.interests ?? ['城市生活'];
  const tasks = ['08:30', '12:20', '20:10'].map((time, index) => {
    const configuredApp = context.apps[(day + userOffset + index * 2) % context.apps.length];
    const app = appInfo(configuredApp.app_id);
    const topic = interests[(day + index) % interests.length];
    const verb = { 新闻: '浏览主题资讯', 美食: '查看周边餐厅与评价', 旅游: '浏览目的地与短途攻略', 出行: '查询出行方案', 社区: '浏览生活笔记', 商城: '浏览商品与比较信息', 自定义: '浏览指定内容' }[app.category];
    return { activity_id: `${context.user_id}_${context.virtual_date}_${index === 0 ? 'first' : `slot${index + 1}`}`, user_id: context.user_id,
      virtual_date: context.virtual_date, virtual_start: `${context.virtual_date}T${time}`, app_id: app.app_id,
      goal: `${verb}：${topic}`, workload: { object_count: index === 0 ? 3 : 2 }, end_condition: '达到对象目标，或页面受阻、无相关对象时报告实际完成量',
      collection_topic: topic, app_name: app.name, mock_content: true, constraints: { single_app: true, available_capabilities: configuredApp.capabilities },
    };
  });
  return { tasks, basis: { summary: 'Mock 每日规划响应；按固定人设、当前虚拟日、指定 APP 与有界近期实际构造演示内容。', persona_name: context.persona.name ?? context.user_id, recent_actual_count: context.recent_actual.length, source: 'mock_planner', behavior_validated: false } };
}
