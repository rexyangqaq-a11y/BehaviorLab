// User-supplied APP examples; capability descriptions are integration proposals,
// not verified phone APIs. No account, device or model is connected here.
export const APP_CATALOG = [
  { app_id: 'toutiao', name: '今日头条', category: '新闻', mark: '头', color: 'red', capabilities: ['浏览新闻', '搜索主题', '查看文章'], integration_status: 'mock' },
  { app_id: 'dianping', name: '大众点评', category: '美食', mark: '评', color: 'orange', capabilities: ['搜索餐厅', '查看商户', '浏览评价'], integration_status: 'mock' },
  { app_id: 'ctrip', name: '携程', category: '旅游', mark: '携', color: 'blue', capabilities: ['浏览目的地', '查看酒店', '浏览攻略'], integration_status: 'mock' },
  { app_id: 'meituan', name: '美团', category: '美食', mark: '美', color: 'yellow', capabilities: ['浏览商户', '查看团购信息', '搜索周边'], integration_status: 'mock' },
  { app_id: 'railway12306', name: '铁路12306', category: '出行', mark: '路', color: 'indigo', capabilities: ['查询车次', '查看时刻', '比较出行方案'], integration_status: 'mock' },
  { app_id: 'xiaohongshu', name: '小红书', category: '社区', mark: '红', color: 'rose', capabilities: ['浏览笔记', '搜索攻略', '查看话题'], integration_status: 'mock' },
  { app_id: 'jd', name: '京东', category: '商城', mark: '京', color: 'red', capabilities: ['搜索商品', '浏览商品详情', '比较商品信息'], integration_status: 'mock', suggested: true },
];
export const appInfo = id => APP_CATALOG.find(app => app.app_id === id) ?? { app_id: id, name: id, category: '自定义', mark: 'A', color: 'blue', integration_status: 'mock' };
