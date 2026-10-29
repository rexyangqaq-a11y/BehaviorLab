import {currentProcessRun,mergeProcessSnapshot,processActive,processPhase,processSteps,renderProcessSteps,renderProcessStep} from './phone-process.mjs';
import {phoneImageTime} from './phone-image-time.mjs';
import {renderAutomaticHilog} from './phone-hilog-ui.mjs';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const count=v=>Number(v??0).toLocaleString('zh-CN');
const limit=v=>v==null?'不限':count(v);

// UI-only observer. Polling reads the existing ledger; it never calls the
// model, captures device screenshots, or supplies actions to the framework.
export function createProcessPanel({api,getCatalog,openResults,message}){
  let visible=false,heldId=null,run=null,generation=0,inflight=false,follow=true,selected=null,signature='',detailHTML='',lastObserved=0,lastError='';
  function reset(id){heldId=id;run=null;generation++;selected=null;follow=true;signature='';detailHTML='';lastObserved=0;lastError='';}
  function render(){
    if(!visible)return;
    $('process-empty').hidden=Boolean(run);$('process-case').hidden=!run;
    $('process-stop').hidden=!processActive(run);$('process-results').hidden=!run;
    if(!run){
      const batch=getCatalog()?.batches?.find(b=>b.id===getCatalog().active_batch_id);
      $('process-status').textContent=batch?'组合评估进行中，等待当前用例启动。':'当前没有正在执行的测试';
      $('process-steps').innerHTML='';$('process-step-detail').innerHTML='<div class="empty">开始执行后可查看模型回复、动作与对应截图。</div>';
      $('process-ledger-status').textContent=lastError||'尚无执行记录';return;
    }
    const projection=processSteps(run),requests=projection.trace.calls.length,actions=projection.steps.filter(s=>s.kind==='action').length,responses=projection.trace.calls.filter(c=>c.response),usage=run.result?.model_usage;
    const tokens=usage?Number(usage.known_input_tokens??0)+Number(usage.known_output_tokens??0):responses.reduce((n,c)=>n+Number(c.response.usage?.input_tokens??0)+Number(c.response.usage?.output_tokens??0),0);
    const unknown=usage?.unknown_usage_requests??responses.filter(c=>!c.response.usage).length;
    const duration=run.result?.duration_ms??(processActive(run)?Math.max(0,Date.now()-Date.parse(run.state?.started_at??run.created_at)):null);
    $('process-status').textContent=processPhase(run)+(lastError?' · '+lastError:lastObserved&&Date.now()-lastObserved>6000?' · 更新延迟，请检查本机服务':' · 每秒读取现有记录');
    $('process-case-summary').innerHTML=`<div class="heading"><div><span class="tag">${processActive(run)?'当前用例':'本页最后查看的用例'}</span><h3>${esc(run.name)}</h3><p class="hint">${esc(run.task_name??run.task?.name??run.name)} · 任务版本 ${esc(run.case_revision??'未知')} · ${esc(run.framework?.name??run.framework_id)} / ${esc(run.service?.model)}</p></div><div class="process-phone"><strong>${esc(run.device_info?.model??'手机型号待记录')}</strong><small>${esc(run.device_info?.os_fullname??'系统版本待记录')}</small><small>起点：${esc(run.startpoint?.name??'已冻结起点')}</small></div></div>`;
    $('process-metrics').innerHTML=[['模型请求',requests+' / '+limit(run.limits?.max_requests)],['框架动作',actions+' / '+limit(run.limits?.max_actions)],['执行耗时',Number.isFinite(duration)?(duration/1000).toFixed(1)+'s':'未记录'],['已知 tokens',count(tokens)+(unknown?' · '+unknown+'次未知':'')],['轨迹事件',count(run.events.length)]].map(([name,value])=>`<div><small>${name}</small><strong>${esc(value)}</strong></div>`).join('');
    // Keep the requirement disclosure and selected-step reading position stable.
    const nextSignature=JSON.stringify([run.id,run.cursor,run.state,run.result,run.automatic_hilog]);
    if(signature!==nextSignature){
      const requirements=Array.isArray(run.acceptance)?run.acceptance:[run.acceptance];
      $('process-case-input').innerHTML=`<p class="readable">${esc(run.instruction)}</p>${renderAutomaticHilog(run)}<h4>判定要求</h4><ul>${requirements.filter(Boolean).map(s=>`<li>${esc(s)}</li>`).join('')}</ul><h4>禁止操作</h4><p class="readable">${esc(run.task?.forbidden??'以本次冻结任务为准')}</p><p class="hint">本次限额：请求 ${limit(run.limits?.max_requests)} / 步数 ${limit(run.limits?.max_steps)} / 动作 ${limit(run.limits?.max_actions)} / 总时长 ${limit(run.limits?.max_seconds)} 秒 / 单次模型等待 ${limit(run.limits?.request_timeout_seconds)} 秒。框架返回、动作返回都不代表任务通过，结束后到结果页核对。</p>`;
      if(follow||!projection.steps.some(s=>s.id===selected))selected=projection.steps.at(-1)?.id??null;
      drawSteps(projection);signature=nextSignature;
    }
    $('process-ledger-status').textContent=`${lastObserved?new Date(lastObserved).toLocaleTimeString('zh-CN',{hour12:false}):'—'} 更新 · ${run.events.length} 条事件 · ${follow?'自动跟随':'已暂停跟随，可查看旧步骤'}`;
    $('process-follow').setAttribute('aria-pressed',String(follow));
  }
  function drawSteps(projection=processSteps(run)){
    const list=$('process-steps'),detail=$('process-step-detail'),scroll=list.scrollTop,detailScroll=detail.scrollTop;
    list.innerHTML=renderProcessSteps(projection.steps,selected);const html=renderProcessStep(run,projection,selected);if(html!==detailHTML){detail.innerHTML=html;detailHTML=html;}
    list.scrollTop=follow?list.scrollHeight:scroll;if(!follow)detail.scrollTop=detailScroll;
  }
  async function refresh(){
    if(!visible||document.hidden)return;
    const next=currentProcessRun(getCatalog(),heldId);
    if(next&&next.id!==heldId)reset(next.id);
    if(!heldId){render();return;}
    if(inflight){render();return;}inflight=true;const epoch=generation,id=heldId;
    try{
      const update=await api('/runs/'+encodeURIComponent(id)+'/process?after_seq='+(run?.cursor??0));
      if(epoch!==generation)return;
      run=mergeProcessSnapshot(run,update);lastObserved=Date.now();lastError='';render();
    }catch(error){if(epoch===generation){lastError='轨迹暂未更新：'+error.message;render();}}
    finally{inflight=false;}
  }
  document.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b)return;
    try{
      if(b.id==='process-follow'&&run){follow=true;selected=processSteps(run).steps.at(-1)?.id??null;drawSteps();render();}
      else if(b.dataset.processStep&&run){follow=false;selected=b.dataset.processStep;drawSteps();render();}
      else if(b.id==='process-results'&&run)await openResults(run.id);
      else if(b.id==='process-stop'&&run){await api('/runs/'+run.id+'/stop',{});message('已请求停止当前测试，不自动续跑。');await refresh();}
      else if(b.dataset.processImage&&run){const asset=run.assets.find(a=>a.id===b.dataset.processImage);if(asset){$('process-image').src='/api/phone-lab/runs/'+encodeURIComponent(run.id)+'/assets/'+encodeURIComponent(asset.id);$('process-image-caption').textContent=asset.role+' · '+phoneImageTime(run,asset).text+' · SHA-256 '+asset.sha256;$('process-image-dialog').showModal();}}
      else if(b.id==='close-process-image')$('process-image-dialog').close();
    }catch(error){message(error.message,true);}
  });
  const timer=setInterval(()=>{if(visible){void refresh();}},1000);
  return {
    setVisible(value){visible=value;if(value)void refresh();},
    catalogChanged(){if(visible)void refresh();},
    open(id){if(id!==heldId)reset(id);void refresh();},
    dispose(){clearInterval(timer);},
  };
}
