import {buildPhoneTrace,renderCall} from './phone-trace.mjs';
import {phoneImageTime} from './phone-image-time.mjs';
export const processActive=run=>['queued','running','stopping'].includes(run?.state?.status);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function currentProcessRun(catalog,heldId=null){
  const runs=catalog?.runs??[];
  return runs.find(r=>r.id===catalog.busy?.owner)??runs.find(processActive)??runs.find(r=>r.id===heldId)??null;
}
export function mergeProcessSnapshot(previous,update){
  const rows=previous?.id===update.id&&!update.reset?previous.events??[]:[],events=new Map(rows.map(e=>[e.seq,e]));
  for(const e of update.events??[])events.set(e.seq,e);
  const ordered=[...events.values()].sort((a,b)=>a.seq-b.seq);
  return {...update,state:update.state??(previous?.id===update.id?previous.state:null),events:ordered,assets:ordered.filter(e=>e.type==='image'&&e.asset).map(e=>e.asset)};
}
const phases={checking_start:'核对手机起点',execution:'框架执行中',final_observation:'采集最终依据'};
export const processPhase=run=>processActive(run)?phases[run.state?.phase]??'等待框架执行':({ended:'框架已结束，等待业务核对',failed:'执行失败',blocked:'执行受阻',stopped:'已停止',interrupted:'执行中断，待核对',needs_attention:'动作效果未知，需人工核对；不自动重放'}[run?.state?.status]??'读取执行状态');
const eventLabels={grounding_response_rejected:'定位坐标无效，动作未执行',grounding_recovery_requested:'重新截图并请求重新定位',grounding_recovery_returned:'收到重新定位回复，交框架核对',grounding_recovery_exhausted:'重新定位次数已用完，停止执行',hilog_capture_start:'开始本次测试自动HiLog',hilog_capture_end:'自动HiLog已收尾',execution_start:'开始执行',framework_return:'框架返回',execution_stopped:'执行停止',execution_end:'执行收尾',model_request_blocked:'模型入口阻断',framework_io_stopped:'框架调用停止',permission_policy_check:'权限操作已拦截'};
export function processSteps(run){
  const trace=buildPhoneTrace(run.events??[]),steps=[];
  for(const call of trace.calls)steps.push({id:'model:'+call.id,seq:call.request.seq,at:call.request.at,kind:'model',title:'模型请求 #'+call.number,status:call.response?'已回复':'等待回复',call});
  const actions=trace.calls.flatMap(c=>c.actions),seen=new Set();
  for(const a of [...actions,...(run.events??[]).filter(e=>e.type==='action_intent')]){
    if(seen.has(a.id))continue;seen.add(a.id);
    const outcome=(run.events??[]).find(e=>e.id===a.id&&['action_return','action_unknown'].includes(e.type));
    steps.push({id:'action:'+a.id,seq:a.seq,at:a.at,kind:'action',title:'动作 #'+seen.size+' · '+a.name,status:outcome?.type==='action_unknown'?'效果未知':outcome?'动作已返回':processActive(run)?'执行中':'缺少返回，待核对',action:a,outcome,call:trace.calls.find(c=>c.actions.some(x=>x.id===a.id))});
  }
  for(const e of run.events??[])if(eventLabels[e.type]&&(e.type!=='permission_policy_check'||e.allowed===false))steps.push({id:'event:'+e.seq,seq:e.seq,at:e.at,kind:'event',title:eventLabels[e.type],status:e.reason??e.error??'',event:e});
  return {trace,steps:steps.sort((a,b)=>a.seq-b.seq)};
}
const clock=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleTimeString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false}):'时间未记录';
export function renderProcessSteps(steps,selected){return steps.map(s=>`<button class="process-step ${s.kind}" data-process-step="${esc(s.id)}" aria-pressed="${s.id===selected}"><span class="step-mark">${s.kind==='model'?'M':s.kind==='action'?'A':'·'}</span><span><strong>${esc(s.title)}</strong><small>${esc(s.status)}</small></span><time>${esc(clock(s.at))}</time></button>`).join('')||'<p class="empty">等待第一条执行记录。</p>';}
export function renderProcessStep(run,projection,selected){
  const step=projection.steps.find(s=>s.id===selected);if(!step)return '<div class="empty">开始执行后，选择左侧步骤查看模型回复、动作与对应截图。</div>';
  const {trace}=projection;let images=[];
  if(step.kind==='model')images=trace.images.filter(i=>step.call.submitted_asset_ids.includes(i.asset.id)).map(i=>i.asset);
  if(step.kind==='action')images=trace.images.filter(i=>i.asset.action_id===step.action.id||i.asset.id===step.action.before).map(i=>i.asset);
  if(step.kind==='event')images=trace.images.filter(i=>i.asset.role===(step.event.type==='execution_start'?'initial':['execution_end','execution_stopped'].includes(step.event.type)?'final':null)).map(i=>i.asset);
  const physical=step.action?(run.events??[]).filter(e=>e.seq>step.seq&&e.seq<(step.outcome?.seq??Infinity)&&['hdc_intent','hdc_return','hdc_failed_or_unknown'].includes(e.type)):[];
  const shots=images.length?`<div class="process-evidence-images">${images.map(a=>`<figure><a href="/api/phone-lab/runs/${encodeURIComponent(run.id)}/assets/${encodeURIComponent(a.id)}" target="_blank" rel="noopener"><img loading="lazy" src="/api/phone-lab/runs/${encodeURIComponent(run.id)}/assets/${encodeURIComponent(a.id)}" alt="${esc(a.role==='model_input'?'模型实际输入图':a.role==='before'?'动作前截图':a.role==='after'?'动作后截图':'执行截图')}"></a><figcaption>${esc(a.role)} · ${esc(phoneImageTime(run,a).text)}</figcaption></figure>`).join('')}</div>`:'';
  return `<h3>${esc(step.title)}</h3><p class="hint">${esc(clock(step.at))} · ${esc(step.status)}</p>${step.action?`<h4>实际动作参数与返回</h4><pre>${esc(JSON.stringify({name:step.action.name,param:step.action.param,outcome:step.outcome??'尚无返回'},null,2))}</pre>${physical.length?`<details><summary>动作期间的 HDC 命令与返回 · ${physical.length} 条</summary><pre>${esc(JSON.stringify(physical,null,2))}</pre></details>`:''}`:''}${step.event?`<pre>${esc(JSON.stringify(step.event,null,2))}</pre>`:''}${shots}${step.call?renderCall(step.call,trace,run,[],{imageAttribute:'process-image'}):''}`;
}
