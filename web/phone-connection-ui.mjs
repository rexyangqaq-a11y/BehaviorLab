const names={unchecked:'尚未核对',connected:'已连接1台',disconnected:'未连接',multiple:'连接多台，请保留1台',missing_tool:'连接工具未就绪',unverified:'状态未核实',error:'检查失败'};
// Read-only visibility queries continue during testing and pause. Never queue probes.
export function createPhoneConnectionPanel({api,badge,button,onChange=()=>{},document:doc=globalThis.document,schedule=setTimeout,cancel=clearTimeout,clock=Date.now,interval=5000}){
  let value={state:'unchecked',checked_at:null},pending=null,timer=null,running=false,failure=false;
  function render(){
    const stale=value.checked_at&&clock()-Date.parse(value.checked_at)>15000;
    badge.textContent='手机连接：'+(failure?'读取失败':stale?'状态已过期':value.state==='unchecked'&&pending?'检查中':names[value.state]??'状态未核实');
    badge.title=(value.checked_at?'上次检查 '+new Date(value.checked_at).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Hong_Kong'})+'；':'')+(failure?'服务不可用或尚未更新，请检查启动终端。':'页面可见时每5秒更新；连接可见不代表投屏已接通。');
    button.disabled=Boolean(pending);button.textContent=pending?'检查中…':'刷新连接';
  }
  function arm(){if(timer!=null)cancel(timer);timer=null;if(running&&!doc.hidden)timer=schedule(()=>void check(),interval);}
  function check(){
    if(pending)return pending;
    if(timer!=null)cancel(timer);timer=null;
    pending=Promise.resolve().then(async()=>{
      try{value=await api('/connection/check',{});failure=false;}catch{failure=true;}finally{pending=null;render();arm();onChange(failure?{...value,state:'error'}:value);}
      return value;
    });render();return pending;
  }
  const visibility=()=>{if(doc.hidden){if(timer!=null)cancel(timer);timer=null;}else if(running)void check();};
  doc.addEventListener('visibilitychange',visibility);render();
  return {check,start(){running=true;if(!doc.hidden)void check();},stop(){running=false;if(timer!=null)cancel(timer);timer=null;},dispose(){this.stop();doc.removeEventListener('visibilitychange',visibility);}};
}
