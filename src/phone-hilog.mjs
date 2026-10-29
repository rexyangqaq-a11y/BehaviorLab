import fs from 'node:fs';
import {mkdir,open,writeFile,rename,readdir,readFile,realpath,statfs} from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {findHdc,parseHdcTargets} from './hdc-environment.mjs';
const command=promisify(execFile),fail=(status,message)=>Object.assign(Error(message),{status});
const active=state=>['starting','capturing','stopping'].includes(state);
const validId=id=>typeof id==='string'&&/^hilog_[a-f0-9-]{36}$/.test(id);
export const HILOG_COMMAND='hilog -v time -v year -v msec -v zone';

export class HilogWriter{
  constructor(dir,{partBytes=32*1024*1024,minFreeBytes=256*1024*1024,freeSpace=async()=>{const s=await statfs(dir);return s.bavail*s.bsize;}}={}){
    Object.assign(this,{dir,partBytes,minFreeBytes,freeSpace});this.parts=[];this.bytes=0;this.lastSpaceCheck=0;
  }
  async append(buffer){
    if(Date.now()-this.lastSpaceCheck>1000){if(await this.freeSpace()<this.minFreeBytes)throw Error('磁盘可用空间不足，已停止抓取并保留已有日志');this.lastSpaceCheck=Date.now();}
    let offset=0;
    while(offset<buffer.length){
      if(!this.handle){const file='part-'+String(this.parts.length+1).padStart(6,'0')+'.log';this.handle=await open(path.join(this.dir,file),'wx');this.parts.push({file,bytes:0});}
      const part=this.parts.at(-1),length=Math.min(this.partBytes-part.bytes,buffer.length-offset);
      const {bytesWritten}=await this.handle.write(buffer,offset,length);if(!bytesWritten)throw Error('日志写入失败');
      part.bytes+=bytesWritten;this.bytes+=bytesWritten;offset+=bytesWritten;
      if(part.bytes===this.partBytes)await this.close();
    }
  }
  async close(){const handle=this.handle;this.handle=null;if(handle){try{await handle.sync();}finally{await handle.close();}}}
}

/** Read-only log observer. No input lease, clearing, privilege or device setting changes. */
export class PhoneHilog{
  constructor({root,base=null,context={mode:'manual'},project,acquire,resolve=()=>findHdc({localConfigPath:path.join(project,'.runtime/device-tools.json')}),run=command,launch=spawn,writerOptions={},stopTimeout=10000}={}){
    Object.assign(this,{project,context,acquire,resolve,run,launch,writerOptions,stopTimeout});this.base=base??path.join(root,'.phone-lab','hilog');fs.mkdirSync(this.base,{recursive:true});
  }
  snapshot(s){return {schema_version:1,id:s.id,state:s.state,context:this.context,command:HILOG_COMMAND,started_at:s.started_at,finished_at:s.finished_at??null,duration_ms:Math.max(0,(s.finished_at?Date.parse(s.finished_at):Date.now())-s.startedMs),device_time:s.deviceTime??null,bytes:s.writer?.bytes??0,parts:s.writer?.parts.map(p=>({...p}))??[],reason:s.reason??null,includes_available_buffer:true,clock_basis:'log lines: phone; capture metadata: computer'};}
  recordings(){let files;try{files=fs.readdirSync(this.base);}catch{return [];}return files.filter(validId).map(id=>{try{return {...JSON.parse(fs.readFileSync(path.join(this.base,id,'capture.json'),'utf8')),id};}catch{return null;}}).filter(Boolean).sort((a,b)=>(b.started_at??'').localeCompare(a.started_at??'')).slice(0,20);}
  status(){const current=this.session?this.snapshot(this.session):null,records=this.recordings().filter(r=>r.id!==current?.id);if(current)records.unshift(current);return {available:Boolean(this.resolve()),state:this.session?.state??'idle',current,recordings:records,part_bytes:32*1024*1024,min_free_bytes:256*1024*1024};}
  async persist(s){if(!s.dir)return;const file=path.join(s.dir,'capture.json'),temp=file+'.tmp';await writeFile(temp,JSON.stringify(this.snapshot(s),null,2),{flush:true});await rename(temp,file);}
  async start(){
    if(this.closing)throw fail(409,'工作台正在关闭');if(this.pending)return this.pending;if(this.session)return this.status();
    const s={id:'hilog_'+randomUUID(),state:'starting',started_at:new Date().toISOString(),startedMs:Date.now(),controller:new AbortController()};this.session=s;
    this.pending=this.prepare(s).then(()=>this.status()).catch(async error=>{s.reason=error.hilogReason??(s.stopRequested?'已停止抓取':'HiLog启动失败，请检查手机连接和日志读取权限');await this.finish(s,s.stopRequested?'stopped':'error');throw fail(409,s.reason);}).finally(()=>{this.pending=null;});
    return this.pending;
  }
  async prepare(s){
    try{s.release=this.acquire();}catch{throw Object.assign(Error(),{hilogReason:'另一个HiLog抓取进程正在运行或其占用状态需检查'});}
    const hdc=this.resolve();if(!hdc)throw Object.assign(Error(),{hilogReason:'HDC连接工具未就绪'});
    const output=await this.run(hdc,['list','targets'],{windowsHide:true,shell:false,timeout:7000,signal:s.controller.signal});
    const {targets}=parseHdcTargets(output.stdout,output.stderr);if(targets.length!==1)throw Object.assign(Error(),{hilogReason:'请连接唯一一台已允许HDC连接的手机'});
    if(s.stopRequested)throw Error('Stopped');const target=targets[0];
    try{const time=await this.run(hdc,['-t',target,'shell',"date '+%Y-%m-%dT%H:%M:%S%z'"],{windowsHide:true,shell:false,timeout:5000,signal:s.controller.signal});if(/^\d{4}-\d{2}-\d{2}T/.test(time.stdout.trim()))s.deviceTime=time.stdout.trim().slice(0,60);}catch{/* Time correlation is optional; never change either clock. */}
    if(s.stopRequested)throw Error('Stopped');s.dir=path.join(this.base,s.id);await mkdir(s.dir);s.writer=new HilogWriter(s.dir,this.writerOptions);await this.persist(s);
    const child=this.launch(hdc,['-t',target,'shell',HILOG_COMMAND],{cwd:this.project,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});s.child=child;
    s.exit=new Promise(resolve=>{child.once('error',()=>{s.reason='HiLog进程无法启动';resolve(-1);});child.once('close',resolve);});
    try{if(Number.isSafeInteger(child.pid))s.release.registerWorker?.(child.pid);}catch(error){child.kill();await s.exit;throw error;}
    let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString().split(target).join('[device]')).slice(-65536);});
    s.reader=(async()=>{try{for await(const chunk of child.stdout){if(!s.writer.bytes&&/^\s*\[(?:Fail|Error)\]/i.test(chunk.toString()))throw Error('HDC日志通道返回失败');await s.writer.append(chunk);if(!s.stopRequested)s.state='capturing';}}catch(error){s.reason=error.message.startsWith('磁盘')?error.message:'HiLog读取或写入中断，已有日志已保留';child.kill();}})();
    s.done=(async()=>{const code=await s.exit;await s.reader;if(stderr)await writeFile(path.join(s.dir,'diagnostic.txt'),stderr).catch(()=>{});if(!s.stopRequested&&!s.reason)s.reason=code===0?'日志通道已结束，可能已断开连接':'日志连接中断或读取权限不足';await this.finish(s,s.reason&&!s.stopRequested?'error':'stopped');})();
    s.done.catch(()=>{});
  }
  async finish(s,state){
    if(s.finishing)return s.finishing;
    s.finishing=(async()=>{try{await s.writer?.close();}catch{s.reason='日志文件关闭异常，已写入部分保留';state='error';}
      s.state=state;s.finished_at=new Date().toISOString();try{await this.persist(s);}finally{try{s.release?.();}finally{s.release=null;if(this.session===s)this.session=null;}}})();return s.finishing;
  }
  async stop(reason='用户停止'){
    const s=this.session;if(!s)return this.status();s.stopRequested=true;s.reason=reason;s.state='stopping';s.controller.abort();s.child?.kill();
    await this.pending?.catch(()=>{});s.child?.kill();
    if(s.done){let timer;const done=await Promise.race([s.done.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),this.stopTimeout);})]);clearTimeout(timer);if(!done)throw fail(409,'HiLog进程仍在退出，已有文件保留，请稍后检查');}
    else await this.finish(s,'stopped');return this.status();
  }
  async download(id,response){
    if(!validId(id))throw fail(400,'日志记录ID无效');if(this.session?.id===id)throw fail(409,'请先停止抓取，再下载完整日志');
    const base=await realpath(this.base);let dir,record;try{dir=await realpath(path.join(base,id));if(!dir.startsWith(base+path.sep))throw Error();record=JSON.parse(await readFile(path.join(dir,'capture.json'),'utf8'));}catch{throw fail(404,'日志记录不存在');}
    if(active(record.state))throw fail(409,'日志记录的结束状态尚未确认');
    const files=[];for(const part of record.parts??[]){if(!/^part-\d{6,}\.log$/.test(part.file))throw fail(409,'日志分卷信息无效');const file=await realpath(path.join(dir,part.file));if(!file.startsWith(dir+path.sep))throw fail(403,'日志路径无效');files.push(file);}
    response.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="${id}.log"`,'Cache-Control':'no-store'});
    await pipeline(Readable.from((async function*(){for(const file of files)for await(const chunk of fs.createReadStream(file))yield chunk;})()),response);
  }
  async close(){this.closing=true;await this.stop('服务关闭');}
}
