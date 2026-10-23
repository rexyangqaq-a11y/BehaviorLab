import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,randomBytes} from 'node:crypto';
import {findHdc,parseHdcTargets} from './hdc-environment.mjs';
import {hoscrcpyRuntime} from './phone-video-runtime.mjs';
import {VideoPacketReader,videoPacket,annexBUnits} from '../web/phone-video-protocol.mjs';
const exec=promisify(execFile),fail=(status,message)=>Object.assign(Error(message),{status});
const CONFIG={backend:'hoscrcpy',sdk_version:'1.0.18-beta',scale:2,max_fps:15,bitrate_mbps:4,system_extension:true};

/** A single headless encoder session with short-lived, same-origin viewer leases. */
export class PhoneVideo {
  constructor({project,assertEnabled,acquire,runtime=hoscrcpyRuntime,launch=spawn,targets=null,command=exec,hdcResolver=null,startTimeout=30000,stopTimeout=10000}={}){
    Object.assign(this,{project,assertEnabled,acquire,runtime,launch,targets,command,hdcResolver,startTimeout,stopTimeout});this.session=null;this.last=null;this.closing=false;
  }
  status(){const installed=this.runtime(this.project);const s=this.session;return {available:installed.available,missing:installed.missing,...CONFIG,state:s?.state??this.last?.state??'idle',error:s?s.error??null:this.last?.error??null,packets:s?.packets??0,bytes:s?.bytes??0,viewers:s?.leases.size??0,last_frame_at:s?.lastFrame??null};}
  observation(){return {enabled:this.session?.state==='streaming',...CONFIG};}
  async start(){
    this.assertEnabled();if(this.closing)throw fail(409,'工作台正在关闭');
    let s=this.session;
    if(s?.state==='stopping')throw fail(409,'上次投屏正在释放，请稍后再试');
    if(!s){
      const runtime=this.runtime(this.project,{verify:true});if(!runtime.available)throw fail(409,'视频组件未安装：'+runtime.missing.join('、'));
      const release=this.acquire();s={id:'video_'+randomUUID(),state:'starting',created_at:new Date().toISOString(),leases:new Map(),packets:0,bytes:0,headers:new Map(),gop:[],gopBytes:0,log:'',release};this.session=s;
      s.started=this.open(s,runtime).finally(()=>{s.release?.();s.release=null;});
    }
    await s.started;
    if(this.session!==s||s.state!=='streaming')throw fail(409,'投屏已停止');
    if(s.leases.size>=4)throw fail(409,'最多同时打开4个投屏查看页');
    const token=randomBytes(32).toString('hex'),lease={token,response:null,expires:Date.now()+15000};s.leases.set(token,lease);
    return {id:s.id,token,device:s.device,...CONFIG};
  }
  async open(s,runtime){
    try{
      const hdc=this.hdcResolver?this.hdcResolver():findHdc({localConfigPath:path.join(this.project,'.runtime/device-tools.json')});if(!hdc)throw Error('HDC未安装');
      const targets=this.targets?await this.targets(hdc):parseHdcTargets((await this.command(hdc,['list','targets'],{windowsHide:true,timeout:8000})).stdout).targets;
      if(targets.length!==1)throw Error('需要唯一且已允许调试的USB手机');s.target=targets[0];
      s.device={};for(const [field,key]of [['model','const.product.model'],['os','const.ohos.fullname'],['api','const.ohos.apiversion']])s.device[field]=(await this.command(hdc,['-t',s.target,'shell','param get '+key],{windowsHide:true,timeout:8000})).stdout.trim();
      if(this.session!==s||s.state!=='starting')throw Error('投屏已取消');
      const child=this.launch(runtime.java,['-Djava.awt.headless=true','-cp',[runtime.sdk,runtime.classes].join(path.delimiter),'PhoneVideoBridge'],{cwd:runtime.root,windowsHide:true,stdio:['pipe','pipe','pipe']});s.child=child;
      s.exited=new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('exit',code=>resolve(code));});
      let resolveFirst,rejectFirst;const first=new Promise((resolve,reject)=>{resolveFirst=resolve;rejectFirst=reject;});
      s.rejectFirst=rejectFirst;
      const reader=new VideoPacketReader(bytes=>{
        if(!bytes.length||s.state==='stopping')return;
        const units=annexBUnits(bytes);if(!units.length)throw Error('SDK返回的不是Annex-B视频流');
        for(const u of units)if(u.type===7||u.type===8)s.headers.set(u.type,u.bytes);
        if(units.some(u=>u.type===5)){s.gop=[...s.headers.values()].map(b=>videoPacket(b));s.gopBytes=s.gop.reduce((n,b)=>n+b.length,0);}
        const packet=videoPacket(bytes);if(s.gopBytes+packet.length<4*1024*1024){s.gop.push(packet);s.gopBytes+=packet.length;}else{s.gop=[];s.gopBytes=0;}
        s.packets++;s.bytes+=bytes.length;s.lastFrame=new Date().toISOString();
        if(s.state==='starting'){s.state='streaming';resolveFirst();}
        for(const lease of [...s.leases.values()])if(lease.response){if(lease.response.writableLength>2*1024*1024)this.release(s,lease.token);else lease.response.write(packet);}
      });
      child.stdout.on('data',bytes=>{try{reader.feed(bytes);}catch(error){rejectFirst(error);s.error='视频数据格式异常';void this.stopAll(s.error);}});
      child.stderr.on('data',bytes=>{
        const text=bytes.toString().split(s.target).join('[device]');s.log=(s.log+text).slice(-32768);
        s.statusTail=(s.statusTail??'')+text;const lines=s.statusTail.split(/\r?\n/);s.statusTail=lines.pop().slice(-2000);
        if(lines.some(line=>line.startsWith('BEHAVIORLAB_VIDEO:stop_error:')))s.cleanupFailed=true;
        if(s.state!=='stopping'&&lines.some(line=>line.startsWith('BEHAVIORLAB_VIDEO:error:'))){rejectFirst(Error('手机视频采集失败，请检查USB连接和手机解锁状态'));s.error='手机视频采集失败，请检查USB连接和手机解锁状态';void this.stopAll(s.error);}
      });
      child.stdin.on('error',()=>{});child.stdin.write(s.target+'\n'+hdc+'\n5861\n');
      s.exited.then(code=>{
        s.exitCode=code;rejectFirst(Error('视频后台已退出'));
        if(s.state!=='stopping'){s.error='视频后台已退出，请重新连接';void this.stopAll(s.error);}
      });
      const timer=setTimeout(()=>rejectFirst(Error('尚未收到手机视频帧，请保持手机解锁后重试')),this.startTimeout);
      try{await first;}finally{clearTimeout(timer);}
      s.timer=setInterval(()=>{
        for(const lease of [...s.leases.values()]){
          if(lease.response){if(lease.response.writableLength>2*1024*1024)this.release(s,lease.token);else lease.response.write(videoPacket(new Uint8Array(0)));}
          else if(Date.now()>lease.expires)this.release(s,lease.token);
        }
      },3000);s.timer.unref?.();
    }catch(error){
      s.log=(s.log+'\n[bridge] '+String(error.message).split(s.target??'\0').join('[device]')).slice(-32768);
      s.error=/^(HDC未安装|需要唯一|投屏已取消|SDK返回|尚未收到|手机视频|视频后台|投屏已停止)/.test(error.message)?error.message:'手机视频连接失败，请检查HDC、USB授权和手机解锁状态';
      await this.stopAll(s.error);throw fail(409,s.error);
    }
  }
  attach(id,token,response){
    const s=this.session,lease=s?.id===id&&typeof token==='string'?s.leases.get(token):null;
    if(!lease||s.state!=='streaming'||lease.response)throw fail(403,'投屏查看会话无效或已结束');
    lease.response=response;response.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    for(const packet of s.gop)response.write(packet);
    response.once('close',()=>this.release(s,token));
    s.child?.stdin.write('idr\n');
  }
  release(s,token){
    const lease=s.leases.get(token);if(!lease)return;s.leases.delete(token);lease.response?.end();
    if(!s.leases.size&&s.state==='streaming')void this.stopAll();
  }
  stop(input){const s=this.session;if(!s)return {stopped:true};if(input.id!==s.id||!s.leases.has(input.token))throw fail(403,'投屏查看会话无效');this.release(s,input.token);return {stopped:true};}
  async stopAll(reason=null){
    const s=this.session;if(!s)return;if(s.stopping)return s.stopping;
    s.state='stopping';s.rejectFirst?.(Error(reason??'投屏已停止'));clearInterval(s.timer);
    s.stopping=(async()=>{
      let teardownRelease;try{if(!s.release)teardownRelease=this.acquire();}catch{/* An active task already holds the device lock; retain its ownership. */}
      for(const lease of s.leases.values())lease.response?.end();s.leases.clear();
      let cleanup='not_started';
      try{if(s.child){
        if(s.exitCode===undefined){s.child.stdin.end('stop\n');let timer;
          const code=await Promise.race([s.exited,new Promise(resolve=>{timer=setTimeout(()=>resolve('timeout'),this.stopTimeout);})]);clearTimeout(timer);
          if(code==='timeout'){s.child.kill();cleanup='requires_check';}else cleanup=code===0?'sdk_stopped':'requires_check';
        }else cleanup=s.exitCode===0?'sdk_stopped':'requires_check';
      }}catch{cleanup='requires_check';s.child?.kill();}
      finally{s.release?.();s.release=null;teardownRelease?.();}
      if(s.cleanupFailed)cleanup='requires_check';
      this.last={state:reason||cleanup==='requires_check'?'error':'idle',error:reason??(cleanup==='requires_check'?'视频进程已停止，设备端清理状态待核对':null)};
      const report={id:s.id,created_at:s.created_at,finished_at:new Date().toISOString(),...CONFIG,packets:s.packets,bytes:s.bytes,cleanup,error:this.last.error};
      try{const dir=path.join(this.project,'.runtime/hoscrcpy/sessions');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,s.id+'.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(dir,s.id+'.log'),s.target?s.log.split(s.target).join('[device]'):s.log);}catch{}
      if(this.session===s)this.session=null;
    })();return s.stopping;
  }
  async close(){this.closing=true;await this.stopAll();}
}
