import {currentProcessRun,mergeProcessSnapshot,processActive,processPhase,processSteps,renderProcessSteps,renderProcessStep,WindowVideoSession} from './phone-process.mjs';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const count=v=>Number(v??0).toLocaleString('zh-CN');

// UI-only observer. Polling reads the existing ledger; it never calls the
// model, captures device screenshots, or supplies actions to the framework.
export function createProcessPanel({api,getCatalog,openResults,message}){
  let visible=false,heldId=null,run=null,generation=0,inflight=false,follow=true,selected=null,signature='',detailHTML='',lastObserved=0,lastError='';
  let videoState='idle',videoError='',frameAt=0,frameCount=0,frameHandle=null,frameGeneration=0,videoSource='';
  const video=$('phone-video');
  const session=new WindowVideoSession({
    capture:navigator.mediaDevices?.getDisplayMedia?options=>navigator.mediaDevices.getDisplayMedia(options):null,
    onChange(state,stream,error){
      videoState=state;videoError=error??'';
      if(state==='connected'&&stream){
        video.srcObject=stream;frameAt=0;frameCount=0;
        const settings=stream.getVideoTracks()[0]?.getSettings?.()??{};
        videoSource=settings.displaySurface==='window'?'窗口':settings.displaySurface==='browser'?'浏览器标签页':'共享来源';
        const epoch=++frameGeneration;
        const observe=(_time,metadata)=>{if(epoch!==frameGeneration||!session.stream)return;frameAt=Date.now();frameCount=Math.max(frameCount,metadata?.presentedFrames??frameCount+1);renderVideo();frameHandle=video.requestVideoFrameCallback(observe);};
        if(video.requestVideoFrameCallback)frameHandle=video.requestVideoFrameCallback(observe);
        video.play().catch(error=>{videoError='视频播放未开始：'+error.message;renderVideo();});
      }else if(!['connected','muted'].includes(state)){
        frameGeneration++;if(frameHandle!=null&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(frameHandle);
        frameHandle=null;video.pause();video.srcObject=null;frameAt=0;frameCount=0;
      }
      renderVideo();
    },
  });
  function renderVideo(){
    const supported=Boolean(session.capture),stream=Boolean(session.stream);
    if(stream){const frames=video.getVideoPlaybackQuality?.().totalVideoFrames??0;if(frames>frameCount){frameCount=frames;frameAt=Date.now();}}
    const stale=stream&&frameAt>0&&Date.now()-frameAt>6000,playing=stream&&frameAt>0&&!stale&&videoState!=='muted';
    $('mirror-badge').textContent=playing?'连续视频':videoState==='selecting'?'选择窗口中':stream?'等待画面':'未接入';
    // Keep playback mounted while waiting: display:none can suppress browser
    // frame callbacks. The placeholder covers unavailable or stale pictures.
    video.hidden=!stream;$('mirror-placeholder').hidden=playing;
    $('mirror-placeholder').firstElementChild.textContent=stream?'等待新的视频帧':'连接官方投屏窗口';
    $('mirror-status').textContent=!supported?'当前浏览器不支持窗口共享。请在 Edge 或 Chrome 打开本机工作台。':videoError||(
      videoState==='selecting'?'请在浏览器弹窗中选择官方投屏窗口。':videoState==='muted'?'共享窗口暂时没有画面，请恢复投屏窗口。':stale?'视频暂未收到新帧，请检查投屏窗口。':playing?`${videoSource}视频 · ${video.videoWidth}×${video.videoHeight} · 已接收 ${count(frameCount)} 帧；请核对窗口内手机状态。`:stream?'共享已建立，等待实际视频帧。':videoState==='ended'?'窗口共享已结束。':videoState==='left'?'已离开过程页，共享已断开。':'尚未共享窗口。');
    $('mirror-connect').disabled=!supported||stream||videoState==='selecting';$('mirror-stop').disabled=!stream&&videoState!=='selecting';$('mirror-fullscreen').disabled=!playing;
    $('mirror-open-tool').disabled=!getCatalog()?.mirroring?.tool_available;
    $('mirror-open-tool').title=getCatalog()?.mirroring?.tool_available?'打开本机已安装的 DevEco Testing':'未检测到 DevEco Testing，可直接接入已打开的投屏窗口';
  }
  function reset(id){heldId=id;run=null;generation++;selected=null;follow=true;signature='';detailHTML='';lastObserved=0;lastError='';}
  function render(){
    if(!visible)return;
    $('process-empty').hidden=Boolean(run);$('process-case').hidden=!run;
    $('process-stop').hidden=!processActive(run);$('process-results').hidden=!run;
    if(!run){
      const batch=getCatalog()?.batches?.find(b=>b.id===getCatalog().active_batch_id);
      $('process-status').textContent=batch?'组合评估进行中，等待当前用例启动。':'当前没有正在执行的测试';
      $('process-steps').innerHTML='';$('process-step-detail').innerHTML='<div class="empty">开始执行后可查看模型回复、动作与对应截图。</div>';
      $('process-ledger-status').textContent=lastError||'尚无执行记录';renderVideo();return;
    }
    const projection=processSteps(run),requests=projection.trace.calls.length,actions=projection.steps.filter(s=>s.kind==='action').length,responses=projection.trace.calls.filter(c=>c.response),usage=run.result?.model_usage;
    const tokens=usage?Number(usage.known_input_tokens??0)+Number(usage.known_output_tokens??0):responses.reduce((n,c)=>n+Number(c.response.usage?.input_tokens??0)+Number(c.response.usage?.output_tokens??0),0);
    const unknown=usage?.unknown_usage_requests??responses.filter(c=>!c.response.usage).length;
    const duration=run.result?.duration_ms??(processActive(run)?Math.max(0,Date.now()-Date.parse(run.state?.started_at??run.created_at)):null);
    $('process-status').textContent=processPhase(run)+(lastError?' · '+lastError:lastObserved&&Date.now()-lastObserved>6000?' · 更新延迟，请检查本机服务':' · 每秒读取现有记录');
    $('process-case-summary').innerHTML=`<div class="heading"><div><span class="tag">${processActive(run)?'当前用例':'本页最后查看的用例'}</span><h3>${esc(run.name)}</h3><p class="hint">${esc(run.task_name??run.task?.name??run.name)} · 任务版本 ${esc(run.case_revision??'未知')} · ${esc(run.framework?.name??run.framework_id)} / ${esc(run.service?.model)}</p></div><div class="process-phone"><strong>${esc(run.device_info?.model??'手机型号待记录')}</strong><small>${esc(run.device_info?.os_fullname??'系统版本待记录')}</small><small>起点：${esc(run.startpoint?.name??'已冻结起点')}</small></div></div>`;
    $('process-metrics').innerHTML=[['模型请求',requests+' / '+(run.limits?.max_requests??'—')],['框架动作',actions+' / '+(run.limits?.max_actions??'—')],['执行耗时',Number.isFinite(duration)?(duration/1000).toFixed(1)+'s':'未记录'],['已知 tokens',count(tokens)+(unknown?' · '+unknown+'次未知':'')],['轨迹事件',count(run.events.length)]].map(([name,value])=>`<div><small>${name}</small><strong>${esc(value)}</strong></div>`).join('');
    // Keep the requirement disclosure and selected-step reading position stable.
    const nextSignature=JSON.stringify([run.id,run.cursor,run.state,run.result]);
    if(signature!==nextSignature){
      const requirements=Array.isArray(run.acceptance)?run.acceptance:[run.acceptance];
      $('process-case-input').innerHTML=`<p class="readable">${esc(run.instruction)}</p><h4>判定要求</h4><ul>${requirements.filter(Boolean).map(s=>`<li>${esc(s)}</li>`).join('')}</ul><h4>禁止操作</h4><p class="readable">${esc(run.task?.forbidden??'以本次冻结任务为准')}</p><p class="hint">本次最多 ${esc(run.limits?.max_requests)} 请求 / ${esc(run.limits?.max_actions)} 动作 / ${esc(run.limits?.max_seconds)} 秒。框架返回、动作返回都不代表任务通过，结束后到结果页核对。</p>`;
      if(follow||!projection.steps.some(s=>s.id===selected))selected=projection.steps.at(-1)?.id??null;
      drawSteps(projection);signature=nextSignature;
    }
    $('process-ledger-status').textContent=`${lastObserved?new Date(lastObserved).toLocaleTimeString('zh-CN',{hour12:false}):'—'} 更新 · ${run.events.length} 条事件 · ${follow?'自动跟随':'已暂停跟随，可查看旧步骤'}`;
    $('process-follow').setAttribute('aria-pressed',String(follow));renderVideo();
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
      if(b.id==='mirror-connect')await session.start();
      else if(b.id==='mirror-stop')session.stop();
      else if(b.id==='mirror-open-tool'){b.disabled=true;try{const result=await api('/mirroring/open-tool',{});message(result.message??'已请求打开官方工具，请打开设备投屏后接入窗口。');}finally{renderVideo();}}
      else if(b.id==='mirror-fullscreen')await $('mirror-stage').requestFullscreen();
      else if(b.id==='process-follow'&&run){follow=true;selected=processSteps(run).steps.at(-1)?.id??null;drawSteps();render();}
      else if(b.dataset.processStep&&run){follow=false;selected=b.dataset.processStep;drawSteps();render();}
      else if(b.id==='process-results'&&run)await openResults(run.id);
      else if(b.id==='process-stop'&&run){await api('/runs/'+run.id+'/stop',{});message('已请求停止当前测试，不自动续跑。');await refresh();}
      else if(b.dataset.processImage&&run){const asset=run.assets.find(a=>a.id===b.dataset.processImage);if(asset){$('process-image').src='/api/phone-lab/runs/'+encodeURIComponent(run.id)+'/assets/'+encodeURIComponent(asset.id);$('process-image-caption').textContent=asset.role+' · SHA-256 '+asset.sha256;$('process-image-dialog').showModal();}}
      else if(b.id==='close-process-image')$('process-image-dialog').close();
    }catch(error){message(error.message,true);}
  });
  window.addEventListener('pagehide',()=>session.stop('left'));
  const timer=setInterval(()=>{if(visible){void refresh();renderVideo();}},1000);
  return {
    setVisible(value){visible=value;if(!value){if(session.pending||session.stream)session.stop('left');return;}void refresh();},
    catalogChanged(){if(visible)void refresh();},
    open(id){if(id!==heldId)reset(id);void refresh();},
    dispose(){clearInterval(timer);session.stop();},
  };
}
