// Read-only projection of the durable ledger. Never change a recorded event or
// imply that a screenshot was submitted unless its exact asset reference says so.
export const TRACE_IMAGE_ROLES={initial:'初始截图',before:'动作前',after:'动作后',final:'最终截图','sdk-observation':'框架观察图','framework-observation':'框架观察图',model_input:'模型实际输入图','model-screen-masked':'标识遮盖图'};
const text=v=>typeof v==='string'?v:v==null?'':JSON.stringify(v,null,2);
const unique=values=>[...new Set(values)];
function references(value,found=[]){
  if(typeof value==='string'){
    const match=value.match(/^asset:([^#]+)(?:#sha256=([a-f0-9]+))?$/i);
    if(match)found.push({file:match[1],sha256:match[2]??null});
  }else if(Array.isArray(value))value.forEach(v=>references(v,found));
  else if(value&&typeof value==='object')Object.values(value).forEach(v=>references(v,found));
  return found;
}
function responseText(message){
  const content=Array.isArray(message.content)?message.content.map(p=>p.text??text(p)).join('\n'):text(message.content);
  return [content,message.tool_calls?.length?'工具调用：\n'+text(message.tool_calls):''].filter(Boolean).join('\n\n');
}
function returnedJudgment(message,reply){
  const fields=[];
  const add=(label,value)=>{const body=text(value).trim();if(body&&!fields.some(f=>f.text===body))fields.push({label,text:body});};
  // These are fields actually returned by the selected service, not newly
  // generated explanations, translations, or reconstructed internal reasoning.
  add('服务返回的 reasoning_content',message.reasoning_content);
  for(const [tag,label]of [['planning','模型计划'],['log','模型日志'],['think','模型返回的思考字段'],['observation','模型观察']]){
    const match=reply.match(new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>','i'));if(match)add(label,match[1]);
  }
  let parsed;try{parsed=JSON.parse(reply.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,''));}catch{}
  if(parsed&&typeof parsed==='object')for(const key of ['thought','thoughts','thinking','reason','reasoning','analysis','observation','planning','explanation','summary'])if(parsed[key]!=null)add('返回字段 '+key,parsed[key]);
  return fields;
}
export function buildPhoneTrace(events=[]){
  const ordered=events.map((event,index)=>({event,index})),imageRows=ordered.filter(r=>r.event.type==='image'&&r.event.asset);
  const images=imageRows.map(({event,index})=>({asset:event.asset,seq:event.seq,index,links:[],action:null}));
  const calls=ordered.filter(r=>r.event.type==='model_request_start').map(({event,index},n)=>{
    const responseRow=ordered.find(r=>r.index>index&&r.event.type==='model_response'&&r.event.id===event.id),response=responseRow?.event??null;
    const message=response?.response?.choices?.[0]?.message??{},reply=responseText(message),refs=references(event.request?.messages);
    const submitted=images.filter(i=>refs.some(ref=>i.asset.file===ref.file&&(!ref.sha256||i.asset.sha256===ref.sha256)));
    return {id:event.id,number:n+1,index,responseIndex:responseRow?.index??null,request:event,response,reply,judgment:returnedJudgment(message,reply),submitted_asset_ids:unique(submitted.map(i=>i.asset.id)),actions:[],parsed:[]};
  });
  const callById=new Map(calls.map(c=>[c.id,c]));
  const responseBefore=index=>calls.filter(c=>Number.isInteger(c.responseIndex)&&c.responseIndex<index).sort((a,b)=>b.responseIndex-a.responseIndex)[0]??null;
  const actions=ordered.filter(r=>r.event.type==='action_intent').map(({event,index})=>{
    const call=event.model_request_id?callById.get(event.model_request_id):responseBefore(index);
    const row={...event,index,model_request_id:call?.id??null,association:event.model_request_id?'explicit':'event_order'};
    if(call)call.actions.push(row);return row;
  });
  for(const row of ordered.filter(r=>r.event.type==='parsed')){const call=responseBefore(row.index);if(call)call.parsed.push(row.event);}
  for(const image of images){
    const link=(call,kind)=>{if(call&&!image.links.some(l=>l.call_id===call.id&&l.kind===kind))image.links.push({call_id:call.id,kind});};
    image.action=actions.find(a=>a.id===image.asset.action_id||a.before===image.asset.id)??null;
    for(const call of calls)if(call.submitted_asset_ids.includes(image.asset.id))link(call,'submitted');
    if(image.action?.model_request_id)link(callById.get(image.action.model_request_id),'action_basis');
    // For originals not directly referenced, show subsequent decisions before
    // the next action. Explicitly label these as temporal context, not input.
    if(image.asset.role!=='model_input'&&!['before','model-screen-masked'].includes(image.asset.role)){
      const nextAction=actions.find(a=>a.index>image.index)?.index??Infinity;
      for(const call of calls)if(call.index>image.index&&call.index<nextAction)link(call,'following_decision');
    }
    if(!image.links.length&&image.asset.role!=='model_input'){
      const previous=responseBefore(image.index);if(previous)link(previous,'previous_response');
    }
    image.empty_reason=calls.length?'该截图没有可关联的模型请求或回复；可能属于准备或独立观察。':'此记录没有模型请求；该截图仅作准备或观察证据。';
  }
  return {images,calls};
}

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const relationNames={submitted:'本图实际随该请求提交',action_basis:'执行该动作的模型回复',following_decision:'截图后、下一动作前的判断（时序关联）',previous_response:'截图前最近的模型回复（时序关联）'};
const callStatus=call=>call.response?.http_status?'HTTP '+call.response.http_status:call.response?'未取得可核实的服务回复':'等待模型回复';
const imageUrl=(run,asset)=>`/api/phone-lab/runs/${encodeURIComponent(run.id)}/assets/${encodeURIComponent(asset.id)}`;
export function renderPhoneDevice(run){
  const d=run.device_info??{},source={execution_environment:'本次执行时记录',saved_startpoint:'已保存起点记录；尚未取得执行环境',not_recorded:'历史记录缺少设备信息'}[d.source]??'历史记录缺少设备信息';
  return `<section class="trace-device" aria-label="本次任务的手机信息"><div><h3>本次测试手机 · ${esc(d.model??'型号未知')}</h3><p>${esc(source)}</p></div><dl><div><dt>系统全名</dt><dd>${esc(d.os_fullname??'未知')}</dd></div><div><dt>产品软件版本</dt><dd>${esc(d.software_version??'未知')}</dd></div><div><dt>API / 截图尺寸</dt><dd>${esc(d.api??'未知')} / ${d.screen?.width&&d.screen?.height?`${d.screen.width}×${d.screen.height}`:'未知'}</dd></div><div><dt>任务应用版本</dt><dd>${esc(d.app?.version_name??'未记录')}</dd></div></dl></section>`;
}
export function renderCall(call,trace,run,relations=[],{imageAttribute='image'}={}){
  const response=call.response,usage=response?.usage,meta=[callStatus(call),response?.duration_ms!=null?(response.duration_ms/1000).toFixed(2)+' 秒':null,usage?`输入 ${usage.input_tokens??'未知'} / 输出 ${usage.output_tokens??'未知'} tokens`:null].filter(Boolean);
  return `<article class="trace-call" data-model-call="${esc(call.id)}"><div class="trace-call-heading"><strong>模型请求 #${call.number} · ${esc(call.id)}</strong><small>${esc(meta.join(' · '))}</small></div>
    ${relations.length?`<p class="trace-relation">${esc(unique(relations.map(r=>relationNames[r])).join('；'))}</p>`:''}
    <div class="trace-judgment"><h4>模型判断 / 计划</h4>${call.judgment.length?call.judgment.map(f=>`<small>${esc(f.label)} · 原文</small><pre>${esc(f.text)}</pre>`).join(''):`<p class="hint">${response?'服务未单独返回判断字段，请查看完整回复原文。':'尚未取得该请求的回复，不补写判断。'}</p>`}</div>
    ${call.actions.length?`<div class="trace-actions"><h4>框架实际动作</h4>${call.actions.map(a=>`<p><strong>${esc(a.name)}</strong> · ${esc(a.id)}</p><pre>${esc(text(a.param??{}))}</pre>`).join('')}</div>`:'<p class="hint">该请求之后没有关联的实际动作记录，可能仅作观察或结束判断。</p>'}
    ${call.parsed.length?`<details><summary>框架解析结果（按日志顺序关联）</summary><pre>${esc(text(call.parsed))}</pre></details>`:''}
    <details class="trace-reply" ${call.judgment.length?'':'open'}><summary>完整模型回复原文</summary><pre>${esc(call.reply||response?.error||(response?'服务回复没有文本内容。':'等待模型回复。'))}</pre></details>
    <details><summary>本次请求与完整服务响应</summary><pre>${esc(text({request:call.request.request,response:response?.response??response??null}))}</pre></details>
    <div class="trace-inputs"><span>实际提交的模型图：</span>${call.submitted_asset_ids.length?call.submitted_asset_ids.map(id=>{const i=trace.images.find(i=>i.asset.id===id);return `<button ${imageAttribute==='process-image'?'data-process-image':'data-image'}="${esc(id)}">查看 ${esc(TRACE_IMAGE_ROLES[i.asset.role]??i.asset.role)} · ${i.asset.width}×${i.asset.height}</button>`;}).join(''):'<small>日志未找到可核对的图像引用</small>'}</div>
  </article>`;
}
export function renderPhoneTrace(run,{selectedImage=null,showAllImages=false}={}){
  const trace=buildPhoneTrace(run.events??[]),key=trace.images.filter(i=>['initial','after','final'].includes(i.asset.role));
  const shown=trace.images.find(i=>i.asset.id===selectedImage)??trace.images.find(i=>i.asset.id===run.result?.final_asset?.id)??key.at(-1)??trace.images.at(-1);
  if(!shown)return '<p class="empty">尚无真实图像；后续图像与模型回复将在此显示。</p>';
  const gallery=showAllImages?trace.images:key,position=gallery.findIndex(i=>i.asset.id===shown.asset.id),ids=unique(shown.links.map(l=>l.call_id));
  const navigation=`<div class="trace-navigation"><button data-image="${esc(gallery[position-1]?.asset.id??'')}" ${position<=0?'disabled':''}>上一张</button><span>${position>=0?position+1:'—'} / ${gallery.length}</span><button data-image="${esc(gallery[position+1]?.asset.id??'')}" ${position<0||position>=gallery.length-1?'disabled':''}>下一张</button></div>`;
  return `<div class="heading trace-heading"><h3>截图与模型判断</h3><div class="trace-filters"><button data-trace-gallery="key" aria-pressed="${!showAllImages}">关键截图 ${key.length}</button><button data-trace-gallery="all" aria-pressed="${showAllImages}">全部图像 ${trace.images.length}</button></div></div>
    <p class="hint">点击图片可查看关联的模型判断、完整回复和实际动作。只有带“实际提交”标记的图像是该请求的输入；其余按动作或日志顺序关联。以下均为已有记录，不重新调用模型。</p>
    <div class="trace-layout"><section class="trace-picture"><a href="${imageUrl(run,shown.asset)}" target="_blank"><img class="screen" src="${imageUrl(run,shown.asset)}" alt="${esc(TRACE_IMAGE_ROLES[shown.asset.role]??shown.asset.role)} · 真实截图"></a><p class="trace-caption">${esc(TRACE_IMAGE_ROLES[shown.asset.role]??shown.asset.role)} · 事件 #${esc(shown.seq)} · ${shown.asset.width}×${shown.asset.height}<br><small>SHA-256 ${esc(shown.asset.sha256)}</small></p>${navigation}</section>
    <section class="trace-model-panel" aria-label="当前截图关联的模型判断与回复"><h3>当前截图关联的模型判断与回复 · ${ids.length} 次</h3>${ids.length?ids.map(id=>renderCall(trace.calls.find(c=>c.id===id),trace,run,shown.links.filter(l=>l.call_id===id).map(l=>l.kind))).join(''):`<p class="empty">${esc(shown.empty_reason)}</p>`}${shown.asset.role==='final'?'<p class="hint">最终留证截图在框架结束后采集。此前模型回复不代表模型读取过这张终图。</p>':''}</section></div>
    <div class="gallery trace-gallery">${gallery.map(i=>`<button data-image="${esc(i.asset.id)}" aria-pressed="${i.asset.id===shown.asset.id}" aria-label="${esc(TRACE_IMAGE_ROLES[i.asset.role]??i.asset.role)} · 事件 ${esc(i.seq)}"><img loading="lazy" src="${imageUrl(run,i.asset)}" alt="${esc(TRACE_IMAGE_ROLES[i.asset.role]??i.asset.role)}"><small>${esc(TRACE_IMAGE_ROLES[i.asset.role]??i.asset.role)} · #${esc(i.seq)}</small><small>${unique(i.links.map(l=>l.call_id)).length} 次关联回复</small></button>`).join('')}</div>
    <details class="trace-all-calls"><summary>按请求查看全部 ${trace.calls.length} 次模型判断与回复（含无动作请求）</summary>${trace.calls.map(c=>`<details><summary>请求 #${c.number} · ${esc(callStatus(c))} · ${c.actions.length} 个实际动作</summary>${renderCall(c,trace,run)}</details>`).join('')||'<p class="hint">尚无模型请求记录。</p>'}</details>`;
}
