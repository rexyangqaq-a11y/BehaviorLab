import './vendor/jmuxer.min.js';
import {VideoPacketReader,annexBUnits} from './phone-video-protocol.mjs';
const $=id=>document.getElementById(id);

export function createPhoneVideoPanel({api,getCatalog,message}){
  const video=$('live-phone-video');let visible=false,epoch=0,state='idle',lease=null,controller=null,muxer=null,error='',device=null,packets=0,bytes=0,frames=0,lastReceived=0,lastVcl=0;
  const supported=Boolean(globalThis.MediaSource&&globalThis.JMuxer);
  function render(){
    const status=getCatalog()?.video,paused=getCatalog()?.device_pause?.paused,busy=getCatalog()?.busy;
    const decoded=video.getVideoPlaybackQuality?.().totalVideoFrames??0;if(decoded>frames)frames=decoded;
    const playing=frames>0&&state==='streaming';
    $('live-video-placeholder').hidden=playing;video.hidden=!['starting','streaming'].includes(state);
    $('live-video-badge').textContent=playing?'H.264 连续视频':state==='starting'?'正在连接':state==='streaming'?'等待解码':state==='error'?'连接中断':'未连接';
    $('live-video-status').textContent=error||(!supported?'当前浏览器不支持视频解码，请使用Edge或Chrome。':playing?`${device?.model??'当前手机'} · ${video.videoWidth}×${video.videoHeight} · 已解码 ${frames.toLocaleString()} 帧${lastReceived&&Date.now()-lastReceived>5000?' · 画面暂无变化':''}`:state==='starting'?'后台正在连接手机采集服务，通常需要数秒。':state==='streaming'?'已收到视频数据，等待浏览器解码首帧。':!status?.available?'视频组件未就绪，请先完成本机视频组件安装。':'通过USB直接接入，无需打开其他窗口。');
    $('live-video-start').disabled=!visible||!supported||!status?.available||paused||status?.state==='stopping'||['starting','streaming','stopping'].includes(state)||Boolean(busy);
    $('live-video-stop').disabled=!['starting','streaming'].includes(state);$('live-video-fullscreen').disabled=!playing;
    $('test-video-note').hidden=!['starting','streaming'].includes(state);
  }
  async function release(value){if(value)try{await api('/video/stop',{id:value.id,token:value.token});}catch{}}
  function stop(){
    ++epoch;controller?.abort();controller=null;const old=lease;lease=null;
    try{muxer?.destroy();}catch{}muxer=null;video.pause();video.removeAttribute('src');video.load();
    frames=0;state='idle';error='';render();void release(old);
  }
  async function start(){
    if(['starting','streaming'].includes(state))return;
    const current=++epoch;state='starting';error='';packets=0;bytes=0;frames=0;lastReceived=0;lastVcl=0;render();
    try{
      const started=await api('/video/start',{});
      if(current!==epoch){await release(started);return;}
      lease=started;device=started.device;controller=new AbortController();
      const ready=new Promise((resolve,reject)=>{
        muxer=new globalThis.JMuxer({node:video,mode:'video',fps:15,flushingTime:200,maxDelay:600,clearBuffer:true,debug:false,onReady:resolve,onUnsupportedCodec:()=>reject(Error('浏览器不支持手机返回的视频编码，请使用Edge或Chrome。')),onError:()=>{if(current===epoch){stop();state='error';error='浏览器视频解码失败，请断开后重新连接。';render();}}});
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
    }catch(cause){if(current!==epoch)return;stop();state='error';error=cause.message;render();}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.id==='live-video-start')void start();
    else if(button.id==='live-video-stop'||button.id==='test-video-stop')stop();
    else if(button.id==='live-video-fullscreen')$('live-video-stage').requestFullscreen().catch(e=>message(e.message,true));
  });
  window.addEventListener('pagehide',()=>{
    ++epoch;controller?.abort();
    if(lease)void fetch('/api/phone-lab/video/stop',{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-UI':'1'},body:JSON.stringify({id:lease.id,token:lease.token}),keepalive:true});
  });
  setInterval(()=>{if(visible)render();},1000);
  return {setVisible(value,{keepAlive=false}={}){visible=value;if(!value&&!keepAlive&&state!=='idle')stop();render();},refresh:render};
}
