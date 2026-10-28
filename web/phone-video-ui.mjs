import './vendor/jmuxer.min.js';
import {VideoPacketReader,annexBUnits} from './phone-video-protocol.mjs';
const $=id=>document.getElementById(id);

export function createPhoneVideoPanel({api,getCatalog,message}){
  const video=$('live-phone-video');let visible=false,epoch=0,state='idle',lease=null,controller=null,muxer=null,error='',device=null,packets=0,bytes=0,frames=0,lastReceived=0,lastVcl=0;
  let connection=null,attempted=false,automatic=true;
  try{automatic=globalThis.sessionStorage?.getItem('phone-video-auto')!=='off';}catch{}
  const supported=Boolean(globalThis.MediaSource&&globalThis.JMuxer);
  const connectionValue=()=>connection??getCatalog()?.connection;
  const connected=()=>{const value=connectionValue();return value?.state==='connected'&&!value.stale&&(!value.checked_at||Date.now()-Date.parse(value.checked_at)<=15000);};
  function preference(value){automatic=value;try{globalThis.sessionStorage?.setItem('phone-video-auto',value?'on':'off');}catch{}}
  function render(){
    const status=getCatalog()?.video,paused=getCatalog()?.device_pause?.paused;
    const decoded=video.getVideoPlaybackQuality?.().totalVideoFrames??0;if(decoded>frames)frames=decoded;
    const playing=frames>0&&state==='streaming';
    $('live-video-placeholder').hidden=playing;video.hidden=!['starting','streaming'].includes(state);
    $('live-video-badge').textContent=playing?'H.264 连续视频':state==='starting'?'正在连接':state==='streaming'?'等待解码':state==='error'?'连接中断':'未连接';
    $('live-video-status').textContent=error||(!supported?'当前浏览器不支持视频解码，请使用Edge或Chrome。':playing?`${device?.model??'当前手机'} · ${video.videoWidth}×${video.videoHeight} · 已解码 ${frames.toLocaleString()} 帧${lastReceived&&Date.now()-lastReceived>5000?' · 画面暂无变化':''}`:state==='starting'?'后台正在连接手机采集服务，通常需要数秒。':state==='streaming'?'已收到视频数据，等待浏览器解码首帧。':!status?.available?'视频组件未就绪，请先完成本机视频组件安装。':!automatic?'自动投屏已关闭；点击开始投屏可重新开启。':paused?'真机操作已暂停，恢复后可自动投屏。':'手机连接后自动投屏，可手动关闭。');
    $('live-video-start').disabled=!visible||!supported||!status?.available||paused||status?.state==='stopping'||['starting','streaming','stopping'].includes(state);
    $('live-video-stop').disabled=!['starting','streaming'].includes(state);$('live-video-fullscreen').disabled=!playing;
    $('test-video-note').hidden=!['starting','streaming'].includes(state);
    const toggle=$('toggle-phone-video');if(toggle){const active=['starting','streaming'].includes(state);toggle.textContent=active?'关闭投屏':state==='error'?'重试投屏':'开启投屏';toggle.disabled=!active&&(!supported||!status?.available||paused||status?.state==='stopping'||!connected());toggle.title=error||'手机连接后默认开启；手动关闭后本页签保持关闭。';}
  }
  async function release(value){if(value)try{await api('/video/stop',{id:value.id,token:value.token});}catch{}}
  function stop({manual=true,releaseLease=true}={}){
    if(manual)preference(false);
    ++epoch;controller?.abort();controller=null;const old=lease;lease=null;
    try{muxer?.destroy();}catch{}muxer=null;video.pause();video.removeAttribute('src');video.load();
    frames=0;state='idle';error='';render();if(releaseLease)void release(old);
  }
  async function start({manual=true}={}){
    if(['starting','streaming'].includes(state))return;
    if(manual)preference(true);attempted=true;
    const current=++epoch;state='starting';error='';packets=0;bytes=0;frames=0;lastReceived=0;lastVcl=0;render();
    try{
      const started=await api('/video/start',{});
      if(current!==epoch){await release(started);return;}
      lease=started;device=started.device;controller=new AbortController();
      const ready=new Promise((resolve,reject)=>{
        muxer=new globalThis.JMuxer({node:video,mode:'video',fps:15,flushingTime:200,maxDelay:600,clearBuffer:true,debug:false,onReady:resolve,onUnsupportedCodec:()=>reject(Error('浏览器不支持手机返回的视频编码，请使用Edge或Chrome。')),onError:()=>{if(current===epoch){stop({manual:false});state='error';error='浏览器视频解码失败，请断开后重新连接。';render();}}});
      });
      let readyTimer;try{await Promise.race([ready,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(Error('浏览器视频组件启动超时，请重新连接。')),8000);})]);}finally{clearTimeout(readyTimer);}
      if(current!==epoch)return;
      const response=await fetch('/api/phone-lab/video/'+lease.id+'/stream',{headers:{'X-Phone-Video-Token':lease.token},signal:controller.signal});
      if(!response.ok){const value=await response.json();throw Error(value.error??'视频连接失败');}
      state='streaming';video.hidden=false;render();
      const reader=response.body.getReader(),parser=new VideoPacketReader(data=>{
        if(!data.length)return;packets++;bytes+=data.length;lastReceived=Date.now();
        const hasVcl=annexBUnits(data).some(u=>u.type===1||u.type===5),duration=hasVcl?Math.max(1,Math.min(2000,lastVcl?Date.now()-lastVcl:67)):undefined;
        if(hasVcl)lastVcl=Date.now();muxer?.feed({video:data,...(duration?{duration}:{})});
        video.play().catch(()=>{});
      });
      while(current===epoch){const chunk=await reader.read();if(chunk.done){parser.end();throw Error('手机视频流已结束，请检查USB连接和手机解锁状态后重新连接。');}parser.feed(chunk.value);render();}
    }catch(cause){if(current!==epoch)return;stop({manual:false});state='error';error=cause.message;render();}
  }
  function refresh(){
    const value=connectionValue(),paused=getCatalog()?.device_pause?.paused;
    if(paused||['disconnected','multiple','missing_tool'].includes(value?.state)){
      attempted=false;if(['starting','streaming'].includes(state))stop({manual:false});
    }
    render();
    if(automatic&&!attempted&&!document.hidden&&connected()&&!paused&&supported&&getCatalog()?.video?.available&&getCatalog()?.video?.state!=='stopping')void start({manual:false});
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.id==='live-video-start')void start();
    else if(button.id==='live-video-stop'||button.id==='test-video-stop')stop();
    else if(button.id==='toggle-phone-video'){if(['starting','streaming'].includes(state))stop();else void start();}
    else if(button.id==='live-video-fullscreen')$('live-video-stage').requestFullscreen().catch(e=>message(e.message,true));
  });
  window.addEventListener('pagehide',()=>{
    const old=lease;stop({manual:false,releaseLease:false});
    if(old)void fetch('/api/phone-lab/video/stop',{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-UI':'1'},body:JSON.stringify({id:old.id,token:old.token}),keepalive:true}).catch(()=>{});
  });
  window.addEventListener('pageshow',event=>{if(event.persisted){attempted=false;refresh();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(()=>{if(visible)render();},1000);
  return {setVisible(value,{keepAlive=true}={}){visible=value;if(!value&&!keepAlive&&state!=='idle')stop({manual:false});refresh();},connectionChanged(value){connection=value;refresh();},refresh};
}
