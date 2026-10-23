export const EVALUATION_PHASES={stage1:'① 单配置 · 全任务',stage2:'② 单框架 · 多模型 · 单任务',stage3:'③ 多框架 · 最佳模型 · 单任务',stage4:'④ 多框架 · 多模型 · 全任务',anomaly_retest:'接入异常重测'};
export function filterPhoneRuns(rows,filters={}){
  return rows.filter(r=>(!filters.framework||r.framework_id===filters.framework)&&(!filters.model||r.service?.model===filters.model)&&
    (!filters.task||(r.case_id??'custom')===filters.task)&&(!filters.phone||(r.device_info?.model??'unknown')===filters.phone)&&
    (!filters.verdict||(r.review?.verdict??'pending_review')===filters.verdict)&&(!filters.phase||(r.phase_id??'historical')===filters.phase)&&
    (!filters.evaluation||(r.evaluation_id??r.batch_id??'historical')===filters.evaluation)&&(!filters.search||[r.id,r.name,r.task_name,r.task?.name,r.case_id,r.framework?.name,r.service?.model,r.device_info?.model].some(v=>String(v??'').toLocaleLowerCase().includes(filters.search.trim().toLocaleLowerCase()))));
}

export function comparablePhoneGroups(rows){
  const groups=new Map();
  for(const r of rows){
    if(r.evaluation_exclusion||!r.evaluation_protocol||!r.result?.model_usage?.requests||!r.result?.same_start?.same)continue;
    const key=JSON.stringify([r.evaluation_protocol,r.case_id,r.case_revision,r.instruction,r.framework_id,r.framework?.version,r.source_versions,r.service_id,r.service?.model,r.startpoint?.contract?.comparison_key,r.device_info?.app,r.limits,r.video_observation_at_start?.enabled?r.video_observation_at_start:null]);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
  }
  return [...groups.values()];
}

export function phoneResultTotals(rows){
  const verdicts={passed:0,partial:0,failed:0,blocked:0,cannot_determine:0,pending_review:0};let requests=0,knownTokens=0,unknown=0;
  for(const r of rows){const verdict=r.review?.verdict??'pending_review';verdicts[verdict]=(verdicts[verdict]??0)+1;const u=r.result?.model_usage;if(u){requests+=u.requests??0;knownTokens+=(u.known_input_tokens??0)+(u.known_output_tokens??0);unknown+=u.unknown_usage_requests??0;}}
  return {total:rows.length,verdicts,requests,knownTokens,unknown};
}
