export function phoneTestPlan({mode='single',framework_ids=[],service_ids=[],case_ids=[]}={}){
  const axes=[framework_ids,service_ids,case_ids];
  if(!['single','matrix'].includes(mode)||axes.some(a=>!Array.isArray(a)||!a.length||a.some(id=>typeof id!=='string'||!id)))throw Error('请选择框架、模型服务和任务');
  if(axes.some(a=>new Set(a).size!==a.length))throw Error('同一维度不能重复选择');
  if(mode==='single'&&axes.some(a=>a.length!==1))throw Error('单项测试每个维度只能选择一项');
  const count=framework_ids.length*service_ids.length*case_ids.length;if(count>150)throw Error('一次组合评估最多150个测试单元');
  return {mode,count,framework_ids,service_ids,case_ids,combinations:framework_ids.flatMap(framework_id=>service_ids.map(service_id=>({framework_id,service_id})))};
}
