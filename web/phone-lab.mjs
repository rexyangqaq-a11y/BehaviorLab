import {renderPhoneTrace,renderPhoneDevice} from './phone-trace.mjs';
import {filterPhoneRuns,comparablePhoneGroups,phoneResultTotals} from './phone-results.mjs';
import {phoneTestPlan,resolvePhoneSelection} from './phone-test-plan.mjs';
import {createProcessPanel} from './phone-process-ui.mjs';
import {createPhoneVideoPanel} from './phone-video-ui.mjs';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const labels={needs_attention:'需人工核对',queued:'等待启动',running:'执行中',ended:'框架已结束',failed:'执行失败',blocked:'受阻',stopped:'已停止',interrupted:'中断待核对',stopping:'正在停止',waiting_for_start:'等待确认起点',passed:'通过',partial:'部分完成',cannot_determine:'无法确定',pending_review:'待核对'};
const verdicts={passed:'通过',partial:'部分完成',failed:'未通过',blocked:'受阻',cannot_determine:'无法确定',pending_review:'待核对'};
const active=r=>['queued','running','stopping'].includes(r?.state?.status),date=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'时间未知';
const seconds=v=>v==null?'—':(v/1000).toFixed(1)+'s',number=v=>v==null?'—':Number(v).toLocaleString('zh-CN');
const api=async(route='',data)=>{const r=await fetch('/api/phone-lab'+route,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-UI':'1'},body:JSON.stringify(data)});const value=await r.json();if(!r.ok)throw Error(value.error??'请求失败');return value;};
function message(text,error=false){$('message').hidden=false;$('message').className=error?'error':'';$('message').textContent=text;}
let saved={};try{saved=JSON.parse(localStorage.getItem('phone-lab-ui-v3')??'{}');}catch{}
let savedSelection={};try{savedSelection=JSON.parse(localStorage.getItem('phone-lab-selection-v1')??'{}');}catch{}
let catalog,mode='single',tab='tasks',editingTask=null,taskTemplate=null,multiInitialized=false,busy=false,polling=false,selectionSignature='',startsSignature='',taskSignature='';
let resultView=saved.view==='comparison'?'comparison':'records',page=0,selectedRun=null,snapshot=null,selectedImage=null,showAllTraceImages=false,detailTab='trace',reviewEditing=false,reviewDraft=null,lastDetailSignature='';
const multi={frameworks:new Set(),services:new Set(),tasks:new Set()};
const filterIds={origin:'filter-origin',framework:'filter-framework',model:'filter-model',task:'filter-task',phone:'filter-phone',verdict:'filter-verdict',phase:'filter-phase',evaluation:'filter-evaluation',search:'filter-search'};
const processPanel=createProcessPanel({api,getCatalog:()=>catalog,openResults:selectRun,message});
const videoPanel=createPhoneVideoPanel({api,getCatalog:()=>catalog,message});
function filters(){return Object.fromEntries(Object.entries(filterIds).map(([k,id])=>[k,$(id).value]));}
function persist(){try{localStorage.setItem('phone-lab-ui-v3',JSON.stringify({filters:filters(),view:resultView,sort:$('result-sort').value,pageSize:$('page-size').value}));}catch{}}
function persistSelection(){savedSelection={framework_id:$('framework').value,service_id:$('service').value};try{localStorage.setItem('phone-lab-selection-v1',JSON.stringify(savedSelection));}catch{}}
const tasks=()=>catalog?.tasks??catalog?.cases??[],taskById=id=>tasks().find(t=>t.id===id),availableTasks=()=>tasks().filter(t=>!t.archived);
const serviceLabel=s=>s.name?(s.name.includes(s.model)?s.name:s.name+' · '+s.model):s.model;
const runTaskName=r=>r.task_name??r.task?.name??r.name;
const frameworkName=id=>catalog.frameworks.find(f=>f.id===id)?.name??id,serviceName=id=>{const s=catalog.services.find(s=>s.id===id);return s?serviceLabel(s):id;};
const usableService=s=>s.protocol==='openai-chat'&&s.family&&!s.missing?.length,usableFramework=f=>f.available;
function showTab(next,{hash=true}={}){if(!['tasks','test','process','results'].includes(next))next='tasks';tab=next;document.querySelectorAll('.tab').forEach(el=>el.hidden=el.id!==next);document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('selected',b.dataset.tab===next);b.setAttribute('aria-selected',String(b.dataset.tab===next));});if(hash)history.replaceState(null,'','#'+next);processPanel.setVisible(next==='process');videoPanel.setVisible(next==='process',{keepAlive:next==='test'});if(next==='results')renderResults();}
function options(id,rows,{placeholder=null}={}){const el=$(id),previous=el.value,signature=JSON.stringify([placeholder,rows]);if(el.dataset.optionsSignature!==signature){el.innerHTML=(placeholder!=null?`<option value="">${esc(placeholder)}</option>`:'')+rows.map(([value,label,disabled])=>`<option value="${esc(value)}"${disabled?' disabled':''}>${esc(label)}</option>`).join('');el.dataset.optionsSignature=signature;if(rows.some(([v,,disabled])=>v===previous&&!disabled))el.value=previous;else if(placeholder!=null)el.value='';else el.value=rows.find(([, ,disabled])=>!disabled)?.[0]??'';}}

function renderTasks(){
  const query=$('task-search').value.trim().toLowerCase(),origin=$('task-origin').value;
  const rows=tasks().filter(t=>(origin==='archived'?t.archived:!t.archived)&&(!origin||origin==='archived'||(origin==='builtin'?t.read_only:!t.read_only))&&(!query||[t.name,t.app,t.instruction].some(s=>String(s??'').toLowerCase().includes(query))));
  $('task-count').textContent=availableTasks().length+'项';
  $('task-list').innerHTML=rows.map(t=>`<article class="card task-card"><div class="heading"><span class="tag">${t.read_only?'内置':'自定义'}${t.archived?' · 已停用':''}</span><small>版本 ${t.revision}</small></div><h3>${esc(t.name)}</h3><p class="task-meta">${esc(t.app)} · ${esc(t.startpoint_name??'尚未选择起点')}</p><p class="task-description">${esc(t.instruction)}</p><div class="button-row"><button data-task-open="${esc(t.id)}">${t.read_only?'查看任务':'编辑任务'}</button>${!t.archived?`<button data-task-test="${esc(t.id)}" class="text-button">用于测试 →</button>`:''}</div></article>`).join('')||'<div class="empty">没有匹配的任务。可以清除搜索或新建任务。</div>';
}
const taskFields={name:'task-name',app:'task-app',instruction:'task-instruction',acceptance:'task-acceptance',forbidden:'task-forbidden'};
function openTask(id=null,copy=false){
  const original=id?taskById(id):null;editingTask=copy?null:original;taskTemplate=copy?original:null;
  const value=original?{...original,name:original.name+(copy?'（副本）':''),reset:original.reset==='settings'&&copy?'manual':original.reset}:{name:'',app:'当前应用',instruction:'',acceptance:'',reset:'home',bundle:'',initial_state:'手机桌面同一页面和方向，无键盘或浮窗。',forbidden:'不修改账号，不进行交易、发布或互动。'};
  for(const [key,id]of Object.entries(taskFields)){$(id).value=Array.isArray(value[key])?value[key].join('\n'):value[key]??'';$(id).disabled=Boolean(editingTask?.read_only);}
  $('task-editor-title').textContent=editingTask?(editingTask.read_only?'查看任务':'编辑任务'):'新建任务';
  $('task-editor-hint').textContent=editingTask?.read_only?'任务内容只读，起点可在下方设置。':editingTask?'保存后生成新版本，历史执行内容不变。':'填写任务内容并选择起点，保存后即可用于测试。';
  $('save-task').hidden=false;$('save-task').disabled=Boolean(editingTask?.archived);$('copy-task').hidden=!original;$('copy-task').dataset.source=id??'';$('archive-task').hidden=!editingTask||editingTask.read_only;$('archive-task').textContent=editingTask?.archived?'恢复任务':'停用任务';
  $('start-mode-existing').checked=Boolean(catalog.starts.some(s=>(s.contract?.ready||s.builtin)&&s.library_visible!==false));$('start-mode-current').checked=!$('start-mode-existing').checked;$('start-name').value='';$('task-startpoint').value='';
  $('task-browser').hidden=true;$('task-editor').hidden=false;startsSignature='';renderPreparation();$('task-startpoint').value=original?.startpoint_id??'builtin_home';renderPreparation();showTab('tasks');$('task-editor').scrollIntoView({block:'start'});if(!editingTask?.read_only)$('task-name').focus();
}
function closeTask(){editingTask=null;$('task-editor').hidden=true;$('task-browser').hidden=false;renderTasks();}
async function saveTask(){
  const current=$('start-mode-current').checked,startName=$('start-name').value.trim(),chosen=$('task-startpoint').value;
  if(current&&!startName)throw Error('请为手机当前状态填写起点名称');if(!current&&!chosen)throw Error('请选择已有起点');
  const value=Object.fromEntries(Object.entries(taskFields).map(([key,id])=>[key,$(id).value]));if(editingTask)value.expected_revision=editingTask.revision;
  if(taskTemplate){Object.assign(value,{reset:taskTemplate.reset==='settings'?'manual':taskTemplate.reset,initial_state:taskTemplate.initial_state});if(value.app===taskTemplate.app)value.bundle=taskTemplate.bundle;}
  let task=editingTask,point=null,taskSaved=false;busy=true;renderPreparation();renderPlan();
  try{
    if(!editingTask?.read_only){task=await api('/tasks'+(editingTask?'/'+editingTask.id:''),value);taskSaved=true;}
    point=current?await api('/starts',{named:true,name:startName}):{id:chosen};
    await api('/tasks/'+task.id+'/startpoint',{expected_revision:task.revision,startpoint_id:point.id,reuse:true});
    await refreshCatalog();openTask(task.id);message('任务设置已保存，测试将自动使用已选起点。');
  }catch(error){
    if(taskSaved){await refreshCatalog();openTask(task.id);$('start-mode-current').checked=current&&!point?.contract?.ready;$('start-mode-existing').checked=!$('start-mode-current').checked;$('start-name').value=startName;$('task-startpoint').value=point?.contract?.ready?point.id:chosen;renderPreparation();}
    throw Error((taskSaved?'任务内容已保存，起点保存未完成：':'任务设置保存未完成：')+error.message);
  }finally{busy=false;renderPreparation();renderPlan();}
}

function selection(){return mode==='single'?{mode,framework_ids:[$('framework').value].filter(Boolean),service_ids:[$('service').value].filter(Boolean),case_ids:[$('case').value].filter(Boolean)}:{mode,framework_ids:[...multi.frameworks],service_ids:[...multi.services],case_ids:[...multi.tasks]};}
const limits=()=>Object.fromEntries(['max_requests','max_actions','max_seconds','max_output_tokens'].map(id=>[id,Number($(id).value)]));
function selectedStart(id){return catalog.starts.find(s=>s.id===taskById(id)?.startpoint_id&&(s.contract?.ready||s.builtin));}
function syncSelection(){
  const signature=JSON.stringify([catalog.frameworks.map(f=>[f.id,f.available]),catalog.services.map(s=>[s.id,s.model,s.name,s.family,s.missing]),tasks()]);
  if(signature!==selectionSignature){
    const preferred=resolvePhoneSelection(catalog,{framework_id:$('framework').value||savedSelection?.framework_id,service_id:$('service').value||savedSelection?.service_id});
    options('framework',catalog.frameworks.map(f=>[f.id,f.name+(!f.available?' · 未就绪':''),!f.available]));options('service',catalog.services.map(s=>[s.id,serviceLabel(s)+(!usableService(s)?' · 不可用':''),!usableService(s)]));
    $('framework').value=preferred.framework_id;$('service').value=preferred.service_id;
    const recommendation=catalog.selection_policy?.recommended_default;
    $('configuration-recommendation').textContent=recommendation?`默认推荐：${frameworkName(recommendation.framework_id)} + ${recommendation.model}（本轮四题：3通过、1部分完成）。框架与模型服务均可自行选择，保留你的选择。`+(!catalog.services.some(s=>usableService(s)&&s.model.toLowerCase()===recommendation.model.toLowerCase())?' 推荐模型尚未就绪，可在模型服务中配置，或选择其他可用服务。':''):'';
    const previous=$('case').value;options('case',availableTasks().map(t=>[t.id,t.name]));if(!previous)$('case').value=availableTasks().find(t=>t.reset==='home')?.id??availableTasks()[0]?.id??'';
    for(const [axis,rows]of Object.entries({frameworks:catalog.frameworks.filter(usableFramework),services:catalog.services.filter(usableService),tasks:availableTasks()})){
      const allowed=new Set(rows.map(r=>r.id));for(const id of multi[axis])if(!allowed.has(id))multi[axis].delete(id);
      $('multi-'+axis).innerHTML=`<div class="pick-tools"><button type="button" data-axis="${axis}" data-pick="all">全选</button><button type="button" data-axis="${axis}" data-pick="none">清空</button></div>`+rows.map(r=>`<label class="pick-option"><input type="checkbox" data-multi-axis="${axis}" value="${esc(r.id)}" ${multi[axis].has(r.id)?'checked':''}><span>${esc(axis==='services'?serviceLabel(r):r.name)}</span></label>`).join('');
    }selectionSignature=signature;
  }
  $('service-status').textContent=!catalog.services.length?'尚无已保存的模型服务。请到系统设置添加并点击保存。前往设置 →':catalog.services.map(s=>serviceLabel(s)+'：'+(s.missing?.length?'待补 '+s.missing.join('、'):s.protocol!=='openai-chat'?'接口需选 OpenAI 兼容聊天接口':!s.family?'当前框架尚不支持该模型系列':'已保存，可选择（连接尚未验证）')).join('；');
  renderPreparation();renderPlan();
}
function setMode(next){
  if(next==='matrix'&&!multiInitialized){multi.frameworks.add($('framework').value);multi.services.add($('service').value);multi.tasks.add($('case').value);multiInitialized=true;selectionSignature='';}
  mode=next;document.querySelectorAll('[data-test-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.testMode===mode)));
  document.querySelectorAll('.single-dimension').forEach(el=>el.hidden=mode!=='single');document.querySelectorAll('.multi-dimension').forEach(el=>el.hidden=mode!=='matrix');
  for(const id of ['framework','service','case'])$(id).disabled=mode==='matrix';$('test-name-label').textContent=mode==='single'?'测试名称（可选）':'评估名称（可选）';$('test-name').placeholder=mode==='single'?'例如：计算器 · Midscene 首次验证':'例如：Qwen3.7 两框架复核';syncSelection();
}
function renderPreparation(){
  if(!catalog)return;const rows=catalog.starts.filter(s=>(s.contract?.ready||s.builtin)&&(s.library_visible!==false||s.id===editingTask?.startpoint_id));
  options('task-startpoint',rows.map(s=>[s.id,(s.name||'未命名起点')+(s.builtin?'':' · '+date(s.source_captured_at??s.created_at))]),{placeholder:'请选择起点'});
  const current=$('start-mode-current').checked,disabled=busy||editingTask?.archived;
  $('existing-start-fields').hidden=current;$('current-start-fields').hidden=!current;$('task-startpoint').required=!current;$('start-name').required=current;
  for(const id of ['start-mode-existing','start-mode-current','task-startpoint','start-name'])$(id).disabled=Boolean(disabled);
  $('preview-task-start').hidden=current||!$('task-startpoint').value||$('task-startpoint').value==='builtin_home';$('preview-task-start').disabled=Boolean(busy);
  $('task-start-hint').textContent=current?'保存任务设置时记录当前状态。以后测试自动沿用，无需再次选择或命名。':$('task-startpoint').value==='builtin_home'?'内置手机桌面：开始测试后自动按两次 Home，记录当前手机基准；组合测试每项前复原并核对，状态不符时停止，不调用模型。不会清除应用数据。':'仅在任务设置时配置，单项测试与组合评估自动沿用。';
  $('save-task').disabled=Boolean(busy||editingTask?.archived||current&&(catalog.device_pause?.paused||catalog.busy));
}
function renderPlan(){
  let plan,error;try{plan=phoneTestPlan(selection());}catch(e){error=e.message;}
  const sel=selection(),missing=sel.case_ids.filter(id=>!selectedStart(id));
  $('test-plan').innerHTML=plan?`<strong>${sel.framework_ids.length} 个框架 × ${sel.service_ids.length} 个模型 × ${sel.case_ids.length} 个任务 <span class="plan-total">${plan.count} 个测试单元</span></strong><p class="hint">每单元最多 ${number(limits().max_requests)} 次请求，顺序执行。</p>`:`<p class="hint">${esc(error)}</p>`;
  const reason=error??(missing.length?'任务“'+missing.map(id=>taskById(id)?.name).join('、')+'”尚未配置当前版本的起点，请先到任务中配置。':catalog.device_pause?.paused?'真机操作已暂停。':catalog.active_batch_id?'组合评估尚未结束。':catalog.busy?'手机正被其他测试占用。':busy?'正在处理…':sel.case_ids.some(id=>selectedStart(id)?.builtin)?'将先自动回到当前手机桌面并记录基准，核对通过后才调用模型；请连接并解锁手机。':'将使用任务中配置的起点，可以开始。');
  $('configure-task-start').hidden=!missing.length;$('configure-task-start').dataset.taskId=missing[0]??'';
  $('test-readiness').textContent=reason;$('start-test').disabled=Boolean(error||missing.length||busy||catalog.device_pause?.paused||catalog.busy||catalog.active_batch_id);$('start-test').textContent=mode==='single'?'开始单项测试':`开始组合评估${plan?'（'+plan.count+'项）':''}`;
}
function previewStart(id){const s=catalog.starts.find(s=>s.id===id);if(!s)return;$('start-preview').innerHTML=`<img class="screen" src="/api/phone-lab/starts/${s.id}/assets/${s.asset.id}" alt="已保存的手机起点"><p>${esc(s.name)} · ${esc(date(s.source_captured_at??s.created_at))}</p><p class="hint">${esc(s.environment?.device?.model??'型号未知')} · ${s.asset.width}×${s.asset.height}</p>`;$('start-dialog').showModal();}

function resultOptions(initial=false){
  options('filter-framework',catalog.frameworks.map(f=>[f.id,f.name]),{placeholder:'全部'});
  options('filter-model',[...new Set([...catalog.services.map(s=>s.model),...catalog.runs.map(r=>r.service?.model)].filter(Boolean))].map(m=>[m,m]),{placeholder:'全部'});
  const caseMap=new Map(tasks().map(t=>[t.id,t.name]));for(const r of catalog.runs)if(!caseMap.has(r.case_id??'custom'))caseMap.set(r.case_id??'custom',r.name??'历史自定义任务');options('filter-task',[...caseMap],{placeholder:'全部'});
  options('filter-phone',[...new Set(catalog.runs.map(r=>r.device_info?.model??'unknown'))].map(v=>[v,v==='unknown'?'型号未知':v]),{placeholder:'全部'});
  const scopes=[...(catalog.archive?[[catalog.archive.evaluation_id,'随包历史 · 36项真机矩阵（只读）']]:[]),...(catalog.evaluations??[]).map(e=>[e.id,`${date(e.created_at)} · ${e.status==='assessment_complete'?'分阶段评估':e.status==='stopped_or_blocked'?'起点校准':'分阶段执行'} · ${e.case_ids?.length??0}题×${e.frameworks?.length??0}框架×${e.services?.length??0}模型`]),...catalog.batches.map(b=>[b.id,b.name||date(b.created_at)+' · 组合评估（'+b.case_ids.length*b.combinations.length+'项）']),['historical','历史与独立单项']];options('filter-evaluation',scopes,{placeholder:'全部批次'});
  if(initial){for(const [key,id]of Object.entries(filterIds))if(typeof saved.filters?.[key]==='string')$(id).value=saved.filters[key];if(saved.filters?.evaluation===undefined)$('filter-evaluation').value=catalog.evaluations?.find(e=>e.status==='assessment_complete')?.id??'';if(saved.sort)$('result-sort').value=saved.sort;if(['12','24','50'].includes(saved.pageSize))$('page-size').value=saved.pageSize;}
}
function resultRows(){const rows=filterPhoneRuns(catalog.runs,filters()),sort=$('result-sort').value;return rows.sort((a,b)=>sort==='duration'?(a.result?.duration_ms??Infinity)-(b.result?.duration_ms??Infinity):sort==='requests'?(a.result?.model_usage.requests??Infinity)-(b.result?.model_usage.requests??Infinity):sort==='oldest'?String(a.created_at).localeCompare(String(b.created_at)):String(b.created_at).localeCompare(String(a.created_at)));}
const badge=r=>`<span class="verdict ${esc(r.review?.verdict??'pending_review')}">${esc(verdicts[r.review?.verdict??'pending_review'])}</span>`;
function renderActivity(){
  const b=catalog.batches.find(b=>b.id===catalog.active_batch_id);if(!b){$('batch-activity').innerHTML='';return;}
  const p=b.pending_entry,last=b.entries.filter(e=>e.run_id).at(-1);
  $('batch-activity').innerHTML=`<section class="activity card"><div class="heading"><strong>${esc(b.name||'组合评估')} · ${esc(labels[b.status]??b.status)}</strong><button data-batch-stop="${b.id}">停止整批</button></div><p>已记录 ${b.entries.filter(e=>e.status!=='running').length} / ${b.case_ids.length*b.combinations.length} 项</p>${p?`<p><strong>${esc(p.task_name)}</strong> · ${esc(frameworkName(p.framework_id))} / ${esc(serviceName(p.service_id))}</p><p class="hint">请手动把手机摆回本批基准页面：${esc(p.initial_state)}</p><button class="primary" data-batch-continue="${b.id}" data-token="${p.token}">确认手机起点并继续</button>`:last?`<button data-process-run="${last.run_id}">查看当前执行</button>`:''}</section>`;
}
function renderResults(){
  if(!catalog)return;resultOptions();renderActivity();const rows=resultRows(),total=phoneResultTotals(rows),size=Number($('page-size').value)||12,pages=Math.max(1,Math.ceil(rows.length/size));page=Math.max(0,Math.min(page,pages-1));
  $('result-browser').hidden=Boolean(selectedRun);$('result-detail').hidden=!selectedRun;
  const scope=$('filter-evaluation').value,e=catalog.evaluations?.find(e=>e.id===scope),b=catalog.batches.find(b=>b.id===scope);
  $('evaluation-progress').textContent=scope===catalog.archive?.evaluation_id?'随包历史真机矩阵 · 只读 · 旧协议成绩，用户复核待定':e?`${e.status==='assessment_complete'?'评估已完成':e.status==='stopped_or_blocked'?'已停止或受阻':'评估进行中'} · ${new Set(e.entries.filter(x=>x.run_id&&x.matrix_eligible!==false).map(x=>x.key??x.run_id)).size} / ${(e.case_ids?.length??0)*(e.frameworks?.length??0)*(e.services?.length??0)} 个单元`:b?`${labels[b.status]??b.status} · ${date(b.created_at)}${b.reason?' · '+b.reason:''}`:'按筛选查看真实运行，历史记录与当前任务版本分别保留。';
  $('filter-count').textContent=`显示 ${rows.length} / ${catalog.runs.length} 条运行`;
  $('result-stats').innerHTML=[['当前记录',total.total,''],['通过',total.verdicts.passed,'passed'],['部分完成',total.verdicts.partial,'partial'],['未通过',total.verdicts.failed,'failed'],['待核对',total.verdicts.pending_review,'pending_review'],['模型请求',number(total.requests)+(rows.some(active)?'+':''),null]].map(([label,value,key])=>`<${key===null?'div':'button'} ${key===null?'':`data-verdict="${key}"`} class="stat"><small>${label}</small><strong>${value}</strong></${key===null?'div':'button'}>`).join('');
  $('run-list').innerHTML=rows.length?`<div class="scroll-table"><table class="run-table"><thead><tr><th>测试 / 任务 / 手机</th><th>框架 / 模型</th><th>判定</th><th>耗时 / 请求</th><th class="time-column">时间</th><th></th></tr></thead><tbody>${rows.slice(page*size,(page+1)*size).map(r=>`<tr><td><strong>${esc(r.name)}</strong>${r.name!==runTaskName(r)?`<small>${esc(runTaskName(r))}</small>`:''}<small>${esc(r.device_info?.model??'型号未知')} · 任务版本 ${r.case_revision??'—'}</small>${r.evaluation_exclusion?'<small>接入诊断</small>':''}${r.policy_deviation?'<small class="notice">含权限偏离</small>':''}</td><td>${esc(r.framework?.name??r.framework_id)}<small>${esc(r.service?.model)}</small></td><td>${badge(r)}<small>${esc(labels[r.state?.status]??r.state?.status??'状态未知')}</small>${r.result?.effect_unknown?'<small class="notice">动作效果待核对</small>':''}</td><td>${seconds(r.result?.duration_ms)}<small>${r.result?.model_usage?number(r.result.model_usage.requests)+'次请求':'执行中'}</small></td><td class="time-column">${esc(date(r.created_at))}</td><td><button data-run="${r.id}" aria-label="查看 ${esc(r.name)} ${esc(r.framework?.name)} ${esc(r.service?.model)}">详情</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">没有匹配的记录。可调整筛选，或在测试页启动任务。</div>';
  $('pagination').innerHTML=`<button data-page="${page-1}" ${page===0?'disabled':''}>上一页</button><span>第 ${page+1} / ${pages} 页</span><button data-page="${page+1}" ${page>=pages-1?'disabled':''}>下一页</button>`;
  $('records-view').hidden=resultView!=='records';$('comparison-view').hidden=resultView!=='comparison';document.querySelectorAll('[data-result-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.resultView===resultView)));if(resultView==='comparison')renderComparison(rows);persist();
}
function renderComparison(rows){
  const eligible=rows.filter(r=>!r.evaluation_exclusion),rank=(values,id)=>{const i=values.indexOf(id);return i<0?values.length:i;},taskIds=tasks().map(t=>t.id),frameworkIds=catalog.frameworks.map(f=>f.id),serviceIds=catalog.services.map(s=>s.id),caseIds=[...new Set(eligible.map(r=>r.case_id??'custom'))].sort((a,b)=>rank(taskIds,a)-rank(taskIds,b)),configs=new Map();
  for(const r of [...eligible].sort((a,b)=>rank(frameworkIds,a.framework_id)-rank(frameworkIds,b.framework_id)||rank(serviceIds,a.service_id)-rank(serviceIds,b.service_id))){const key=r.framework_id+'|'+r.service_id;if(!configs.has(key))configs.set(key,r);}
  $('comparison').innerHTML=rows.length?`<div class="scroll-table"><table class="comparison-table"><thead><tr><th>框架 / 模型</th>${caseIds.map(id=>`<th>${esc(runTaskName(eligible.find(r=>(r.case_id??'custom')===id)??{})??id)}</th>`).join('')}</tr></thead><tbody>${[...configs.values()].map(first=>`<tr><th>${esc(first.framework?.name)}<small>${esc(first.service?.model)}</small></th>${caseIds.map(id=>{const cell=eligible.filter(r=>r.framework_id===first.framework_id&&r.service_id===first.service_id&&(r.case_id??'custom')===id),groups=comparablePhoneGroups(cell);return `<td>${!cell.length?'—':!groups.length?'<span class="hint">条件待核对</span>':groups.map((g,n)=>{const t=phoneResultTotals(g),one=g.length===1;return `<button class="comparison-cell ${one?esc(g[0].review?.verdict??''):''}" ${one?`data-run="${g[0].id}"`:`data-cell-framework="${esc(first.framework_id)}" data-cell-model="${esc(first.service.model)}" data-cell-task="${esc(id)}"`} title="${esc(g[0].evaluation_protocol)}">${one?esc(verdicts[g[0].review?.verdict??'pending_review']):t.verdicts.passed+'/'+g.length+'通过'}<small>${one?seconds(g[0].result.duration_ms)+' · '+g[0].result.model_usage.requests+'次':'点击查看'+g.length+'条'}${groups.length>1?' · 条件'+(n+1):''}</small></button>`;}).join('')}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div><p class="hint">一格内不同条件分别列示；不以框架结束或 HTTP 成功代替任务通过。</p>`:'<div class="empty">没有可对比的记录。</div>';
}

function setDetailTab(next){if(reviewEditing&&detailTab==='judgment'&&$('review-note'))reviewDraft={verdict:$('verdict').value,note:$('review-note').value};detailTab=next;for(const id of ['trace','judgment','raw'])$('detail-'+id).hidden=id!==next;document.querySelectorAll('[data-detail-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.detailTab===next)));if(snapshot){if(next==='trace')renderTrace();else if(next==='raw')renderRaw();else renderJudgment();}}
function renderTrace(){if(!snapshot)return;const left=$('trace-view').querySelector('.gallery')?.scrollLeft??0;$('trace-view').innerHTML=renderPhoneTrace(snapshot,{selectedImage,showAllImages:showAllTraceImages});const gallery=$('trace-view').querySelector('.gallery');if(gallery)gallery.scrollLeft=left;}
function renderJudgment(){
  if(!snapshot)return;const r=snapshot,review=r.review;
  $('detail-judgment').innerHTML=`${renderPhoneDevice(r)}<h3>任务与判定要求</h3><p class="readable">${esc(r.instruction)}</p><ul>${(Array.isArray(r.acceptance)?r.acceptance:[r.acceptance]).filter(Boolean).map(a=>`<li>${esc(a)}</li>`).join('')}</ul><h3>独立判定 ${badge(r)}</h3><p class="hint">助手初判：${esc(verdicts[r.assistant_review?.verdict]??"尚无初判")} · 用户审核：${esc(verdicts[r.user_review?.verdict]??"待复核")}</p>${review?`<p class="readable">${esc(review.note)}</p><p class="hint">${review.reviewer==='assistant'?'助手核对':'用户核对'} · ${date(review.at)}</p>`:'<p class="hint">尚未保存独立判定。</p>'}${!active(r)&&!r.read_only?`<button id="edit-review">${review?'修改判定':'添加判定'}</button><form id="review-form" ${reviewEditing?'':'hidden'}><div class="form-grid"><label>判定<select id="verdict">${Object.entries(verdicts).filter(([v])=>v!=='pending_review').map(([v,label])=>`<option value="${v}">${label}</option>`).join('')}</select></label></div><label>结果依据<textarea id="review-note" maxlength="6000" rows="4" required placeholder="依据当前截图及执行过程，说明达到和未达到的条件。"></textarea></label><div class="button-row"><button type="submit" class="primary">保存判定</button><button type="button" id="cancel-review">取消</button></div><p class="hint">保存会关联当前所选真实截图；模型的完成文字不能单独判为通过。</p></form>`:''}`;
  if($('verdict')){$('verdict').value=(reviewEditing?reviewDraft?.verdict:null)??review?.verdict??'cannot_determine';$('review-note').value=(reviewEditing?reviewDraft?.note:null)??review?.note??'';}
}
function renderRaw(){const r=snapshot;if(!r)return;const meta={id:r.id,created_at:r.created_at,evaluation_protocol:r.evaluation_protocol,name:r.name,task_name:runTaskName(r),case_id:r.case_id,case_revision:r.case_revision,instruction:r.instruction,acceptance:r.acceptance,framework:r.framework,service:r.service,limits:r.limits,task:r.task,startpoint_id:r.startpoint_id};$('detail-raw').innerHTML=`<div class="button-row"><a class="button" href="/api/phone-lab/runs/${r.id}/export" download>导出完整 JSON</a>${!active(r)&&!r.read_only?`<a class="button" href="/api/phone-lab/runs/${r.id}/bundle" download>下载含原图证据包</a>`:''}</div><details><summary>执行时的任务输入与限额</summary><pre>${esc(JSON.stringify(meta,null,2))}</pre></details><details><summary>环境、起点核对与源码版本</summary><pre>${esc(JSON.stringify({environment:r.environment,start_check:r.start_check,source_versions:r.source_versions,video_observation_at_start:r.video_observation_at_start},null,2))}</pre></details><details><summary>框架原生结果与用量</summary><pre>${esc(JSON.stringify(r.result,null,2))}</pre></details><details><summary>完整事件 · ${r.events.length} 条</summary><pre>${esc(r.events.map(e=>JSON.stringify(e)).join('\n'))}</pre></details>`;}
function renderDetail(){
  const r=snapshot;if(!r)return;const calls=r.events.filter(e=>e.type==='model_request_start'),responses=r.events.filter(e=>e.type==='model_response'),usage=r.result?.model_usage;
  $('run-title').innerHTML=`<h2>${esc(r.name)}</h2>${r.read_only?'<p class="hint">随包历史真机测试 · 只读 · 旧协议成绩，用户复核待定</p>':''}<p class="hint">${r.name!==runTaskName(r)?esc(runTaskName(r))+' · ':''}${esc(r.framework.name)} / ${esc(r.service.model)} · ${date(r.created_at)} · ${esc(r.device_info?.model??'型号未知')}</p>`;
  $('monitor-actions').innerHTML=active(r)?`<button id="stop-run">停止此项</button>`:badge(r);
  const totalTokens=usage?usage.known_input_tokens+usage.known_output_tokens:responses.reduce((s,e)=>s+(e.usage?.input_tokens??0)+(e.usage?.output_tokens??0),0);
  $('run-metrics').innerHTML=[['业务判定',verdicts[r.review?.verdict??'pending_review']],['模型请求',calls.length+' / '+r.limits.max_requests],['框架动作',r.events.filter(e=>e.type==='action_intent').length],['执行耗时',active(r)?'执行中':seconds(r.result?.duration_ms)],['已知 tokens',number(totalTokens)]].map(([label,value])=>`<div><small>${label}</small><strong>${esc(value)}</strong></div>`).join('');
  const rows=resultRows(),i=rows.findIndex(row=>row.id===r.id);$('previous-run').disabled=i<=0;$('next-run').disabled=i<0||i>=rows.length-1;
  if(!reviewEditing)setDetailTab(detailTab);
}
async function selectRun(id){const r=await api('/runs/'+id);selectedRun=id;snapshot=r;selectedImage=null;showAllTraceImages=false;detailTab='trace';reviewEditing=false;lastDetailSignature='';showTab('results');renderDetail();$('result-detail').scrollIntoView({block:'start'});}
function backResults(){selectedRun=null;snapshot=null;reviewEditing=false;$('trace-view').innerHTML='';$('detail-raw').innerHTML='';renderResults();$('result-browser').scrollIntoView({block:'start'});}

async function refreshCatalog({initial=false}={}){
  catalog=await api();const paused=Boolean(catalog.device_pause?.paused);$('device-status').textContent=paused?'真机已暂停':catalog.busy?'手机执行中':'当前无任务';$('pause-banner').hidden=!paused;$('pause-device').disabled=paused;
  const nextTasks=JSON.stringify(tasks());if(taskSignature!==nextTasks){renderTasks();taskSignature=nextTasks;}
  $('archive-note').hidden=!catalog.archive;$('archive-note').textContent=catalog.archive?`已加载 ${catalog.archive.runs} 项随包历史真机测试。到“结果与对比”查看截图、逐步轨迹与原始回复；历史档案只读，不会启动手机或模型。`:'';syncSelection();resultOptions(initial);renderResults();processPanel.catalogChanged();videoPanel.refresh();
}
async function startTest(){const plan=phoneTestPlan(selection()),name=$('test-name').value;busy=true;renderPlan();try{if(mode==='single'){const started=await api('/runs',{framework_id:plan.framework_ids[0],service_id:plan.service_ids[0],case_id:plan.case_ids[0],limits:limits(),phase_id:'single',name});await refreshCatalog();processPanel.open(started.id);showTab('process');message('已启动单项测试，过程页将跟随当前用例。');}else{const b=await api('/batches',{framework_ids:plan.framework_ids,service_ids:plan.service_ids,case_ids:plan.case_ids,limits:limits(),name});await refreshCatalog();$('filter-evaluation').value=b.id;showTab('process');message('组合评估已启动，共'+plan.count+'项；过程页可查看实时轨迹或停止。');}}finally{busy=false;startsSignature='';renderPreparation();renderPlan();}}

document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  try{
    if(b.dataset.tab)showTab(b.dataset.tab);
    else if(b.id==='new-task')openTask();
    else if(b.dataset.taskOpen)openTask(b.dataset.taskOpen);
    else if(b.id==='copy-task')openTask(b.dataset.source,true);
    else if(b.id==='close-task-editor')closeTask();
    else if(b.dataset.taskTest){$('case').value=b.dataset.taskTest;setMode('single');showTab('test');}
    else if(b.id==='manage-tasks'){closeTask();showTab('tasks');}
    else if(b.id==='configure-task-start')openTask(b.dataset.taskId);
    else if(b.id==='archive-task'){await api('/tasks/'+editingTask.id,{expected_revision:editingTask.revision,archived:!editingTask.archived});await refreshCatalog();closeTask();message('任务状态已更新。');}
    else if(b.dataset.testMode)setMode(b.dataset.testMode);
    else if(b.dataset.axis){const axis=b.dataset.axis,source=axis==='frameworks'?catalog.frameworks.filter(usableFramework):axis==='services'?catalog.services.filter(usableService):availableTasks();multi[axis]=new Set(b.dataset.pick==='all'?source.map(x=>x.id):[]);selectionSignature='';startsSignature='';syncSelection();}
    else if(b.id==='preview-task-start')previewStart($('task-startpoint').value);
    else if(b.id==='close-start-dialog')$('start-dialog').close();
    else if(b.id==='pause-device'){await api('/pause',{reason:'测试者暂停使用手机'});await refreshCatalog();message('真机操作已暂停。');}
    else if(b.id==='resume-device'){await api('/resume',{});await refreshCatalog();message('已恢复测试入口，旧任务不会自动重启。');}
    else if(b.dataset.processRun){processPanel.open(b.dataset.processRun);showTab('process');}
    else if(b.dataset.run)await selectRun(b.dataset.run);
    else if(b.id==='back-results')backResults();
    else if(b.id==='previous-run'||b.id==='next-run'){const rows=resultRows(),i=rows.findIndex(r=>r.id===selectedRun),next=rows[i+(b.id==='next-run'?1:-1)];if(next)await selectRun(next.id);}
    else if(b.dataset.detailTab)setDetailTab(b.dataset.detailTab);
    else if(b.dataset.image){selectedImage=b.dataset.image;const image=snapshot.assets.find(a=>a.id===selectedImage);if(image&&!['initial','after','final'].includes(image.role))showAllTraceImages=true;renderTrace();}
    else if(b.dataset.traceGallery){showAllTraceImages=b.dataset.traceGallery==='all';if(!showAllTraceImages&&!['initial','after','final'].includes(snapshot.assets.find(a=>a.id===selectedImage)?.role))selectedImage=null;renderTrace();}
    else if(b.dataset.resultView){resultView=b.dataset.resultView;renderResults();}
    else if(b.dataset.cellFramework){$('filter-framework').value=b.dataset.cellFramework;$('filter-model').value=b.dataset.cellModel;$('filter-task').value=b.dataset.cellTask;page=0;resultView='records';renderResults();}
    else if(b.dataset.page!==undefined){page=Number(b.dataset.page);renderResults();}
    else if(b.dataset.verdict!==undefined){$('filter-verdict').value=b.dataset.verdict;page=0;renderResults();}
    else if(b.id==='clear-result-filters'){for(const id of Object.values(filterIds))$(id).value='';page=0;renderResults();}
    else if(b.id==='refresh')await refreshCatalog();
    else if(b.id==='stop-run'){await api('/runs/'+selectedRun+'/stop',{});message('已请求停止，不自动续跑。');}
    else if(b.dataset.batchStop){await api('/batches/'+b.dataset.batchStop+'/stop',{});await refreshCatalog();message('已请求停止整批。');}
    else if(b.dataset.batchContinue){b.disabled=true;try{await api('/batches/'+b.dataset.batchContinue+'/continue',{token:b.dataset.token});await refreshCatalog();message('起点核对通过，继续当前单元。');}finally{b.disabled=false;}}
    else if(b.id==='edit-review'){reviewDraft=null;reviewEditing=true;renderJudgment();$('review-note').focus();}
    else if(b.id==='cancel-review'){reviewDraft=null;reviewEditing=false;renderJudgment();}
  }catch(e){message(e.message,true);}
});
document.addEventListener('change',event=>{const el=event.target;if(el.dataset.multiAxis){if(el.checked)multi[el.dataset.multiAxis].add(el.value);else multi[el.dataset.multiAxis].delete(el.value);renderPlan();}else if(['framework','service','case'].includes(el.id)){renderPlan();if(el.id!=='case')persistSelection();}});
for(const type of ['input','change'])$('task-form').addEventListener(type,()=>{startsSignature='';renderPreparation();});
for(const id of ['task-search','task-origin'])$(id).addEventListener(id==='task-search'?'input':'change',renderTasks);
for(const id of [...Object.values(filterIds),'result-sort','page-size'])$(id).addEventListener(id==='filter-search'?'input':'change',()=>{page=0;renderResults();});
for(const id of ['max_requests','max_actions','max_seconds','max_output_tokens'])$(id).addEventListener('input',renderPlan);
$('task-form').onsubmit=async e=>{e.preventDefault();if(busy)return;$('save-task').disabled=true;try{await saveTask();}catch(error){message(error.message,true);}finally{$('save-task').disabled=Boolean(editingTask?.archived);}};
$('test-form').onsubmit=async e=>{e.preventDefault();if(busy)return;try{await startTest();}catch(error){message(error.message,true);}};
document.addEventListener('submit',async e=>{if(e.target.id!=='review-form')return;e.preventDefault();try{const a=snapshot.assets.find(a=>a.id===selectedImage)??snapshot.result?.final_asset;await api('/runs/'+selectedRun+'/review',{verdict:$('verdict').value,note:$('review-note').value,evidence_ids:a?[a.id]:[]});snapshot=await api('/runs/'+selectedRun);reviewEditing=false;renderDetail();await refreshCatalog();message('独立判定已保存。');}catch(error){message(error.message,true);}});
window.addEventListener('hashchange',()=>showTab(location.hash.slice(1),{hash:false}));
try{await refreshCatalog({initial:true});showTab(location.hash.slice(1)||'tasks',{hash:false});}catch(e){message(e.message,true);}
setInterval(async()=>{if(polling)return;polling=true;try{await refreshCatalog();if(selectedRun&&active(snapshot)){const next=await api('/runs/'+selectedRun),signature=JSON.stringify([next.state,next.events.at(-1)?.seq,next.review]);snapshot=next;if(signature!==lastDetailSignature){renderDetail();lastDetailSignature=signature;}}}catch{/* Keep form drafts and existing records visible when the local service is unavailable. */}finally{polling=false;}},3000);
