const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const active=s=>['starting','capturing','stopping'].includes(s);
const names={starting:'正在连接',capturing:'正在抓取',stopping:'正在停止',stopped:'已停止',error:'抓取中断',idle:'未抓取'};
const bytes=n=>n>=1048576?(n/1048576).toFixed(2)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':(n??0)+' B';
const time=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false}):'时间未记录';
const elapsed=n=>{const s=Math.floor(Math.max(0,n??0)/1000);return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
export function renderAutomaticHilog(run){
  const log=run.automatic_hilog;if(!log)return '<p class="hint">此历史记录未附带自动HiLog。</p>';
  const downloadable=!active(log.state)&&log.bytes>0;
  return `<section class="automatic-hilog"><h4>本次测试自动HiLog · ${esc(names[log.state]??'状态待核对')}</h4><p class="hint">${esc(time(log.started_at))} → ${log.finished_at?esc(time(log.finished_at)):active(log.state)?'抓取中':'结束时间未记录'} · ${esc(bytes(log.bytes))} · ${log.parts?.length??0} 个分卷${log.reason?' · '+esc(log.reason):''}</p>${downloadable?`<a class="button" href="/api/phone-lab/runs/${encodeURIComponent(run.id)}/hilog/download" download>下载本次测试HiLog</a>`:active(log.state)?'<p class="hint">测试结束并完成日志收尾后可下载；手动抓取的日志另行保存。</p>':'<p class="hint">未收到日志数据；此状态不代表业务测试通过或失败。</p>'}</section>`;
}
export function createPhoneHilogPanel({api,getCatalog,message}){
  const $=id=>document.getElementById(id);let pending=false,connection=null;
  function render(){
    const catalog=getCatalog(),value=catalog?.hilog,log=value?.current,connected=(connection??catalog?.connection)?.state==='connected';
    $('hilog-start').disabled=pending||!value?.available||!connected||Boolean(log);
    $('hilog-stop').disabled=!log||log.state==='stopping';
    $('hilog-status').textContent=log?(names[log.state]??'状态待核对')+' · '+elapsed(log.duration_ms)+' · '+bytes(log.bytes)+' · '+(log.parts?.length??0)+' 个分卷':'手动抓取未开启；测试会自动保存自己的独立日志。';
    $('hilog-records').innerHTML=(value?.recordings??[]).map(item=>`<div class="hilog-record"><span>${esc(time(item.started_at))} · ${esc(names[item.state]??item.state)} · ${esc(bytes(item.bytes))}${item.reason?' · '+esc(item.reason):''}</span>${!active(item.state)&&item.bytes>0?`<a href="/api/phone-lab/hilog/${encodeURIComponent(item.id)}/download" download>下载手动日志</a>`:''}</div>`).join('')||'<p class="hint">暂无手动日志记录。</p>';
  }
  document.addEventListener('click',async event=>{const id=event.target.closest('button')?.id;if(!['hilog-start','hilog-stop'].includes(id))return;
    pending=true;render();try{const value=await api(id==='hilog-start'?'/hilog/start':'/hilog/stop',{});if(getCatalog())getCatalog().hilog=value;message(id==='hilog-start'?'已请求手动抓取HiLog，与测试自动日志独立。':'手动抓取已停止，测试自动日志保持原状态。');}catch(error){message(error.message,true);}finally{pending=false;render();}
  });
  return {refresh:render,connectionChanged(value){connection=value;render();}};
}
