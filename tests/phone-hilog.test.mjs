import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {PhoneHilog,HilogWriter,HILOG_COMMAND} from '../src/phone-hilog.mjs';
import {PhoneLab} from '../src/phone-lab.mjs';import {readDeviceLease,acquireDeviceLease} from '../src/device-lease.mjs';
import {createDebugServer} from '../src/web-server.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const closers=new WeakMap();
const closeAfter=(t,fn)=>closers.get(t).push(fn);
async function waitFor(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Expected state did not arrive');}
async function root(t){const dir=await mkdtemp(path.join(os.tmpdir(),'phone-hilog-'));closers.set(t,[]);t.after(async()=>{for(const close of closers.get(t).reverse())await close();assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('phone-hilog-'));await rm(dir,{recursive:true,force:true});});return dir;}
function driver(options={}){
  const children=[],commands=[];let launched=0;
  const deps={resolve:()=> 'fixture-hdc',run:async(_hdc,args)=>{commands.push(args);return {stdout:args[0]==='list'?(options.targets??'private-device'):'2026-10-29T10:00:00+0800',stderr:''};},launch:(_exe,args)=>{
    launched++;commands.push(args);assert.equal(args[2],'shell');assert.equal(args[3],HILOG_COMMAND);
    const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{if(child.killed)return false;child.killed=true;child.stdout.end();child.stderr.end();setImmediate(()=>child.emit('close',0));return true;};children.push(child);child.stdout.write(Buffer.from('2026-10-29 10:00:00.001+0800 I fixture: 中文日志\n'));return child;
  },writerOptions:{partBytes:32,minFreeBytes:1,freeSpace:async()=>1000000},stopTimeout:100};
  return {deps,children,commands,count:()=>launched};
}
test('writer rotates by bytes, preserves UTF-8 on merge and stops before disk exhaustion without deleting data',async t=>{
  const dir=await root(t),writer=new HilogWriter(dir,{partBytes:9,minFreeBytes:10,freeSpace:async()=>100});const data=Buffer.from('中文\nsecond line\n第三行\n');await writer.append(data.subarray(0,7));await writer.append(data.subarray(7));await writer.close();
  assert.equal(writer.bytes,data.length);assert.ok(writer.parts.length>1);assert.ok(writer.parts.every(p=>p.bytes<=9));assert.deepEqual(Buffer.concat(await Promise.all(writer.parts.map(p=>readFile(path.join(dir,p.file))))),data);
  const low=new HilogWriter(path.join(dir,'low'),{freeSpace:async()=>0,minFreeBytes:1});await assert.rejects(low.append(Buffer.from('no write')),/磁盘可用空间不足/);assert.equal(low.bytes,0);assert.equal(writer.bytes,data.length);
});
test('manual and automatic channels run in parallel and each stop leaves the other channel and test input lease unchanged',async t=>{
  const dir=await root(t),d=driver(),lock=path.join(dir,'device.lock'),lab=new PhoneLab(dir,{lockPath:lock,pausePath:path.join(dir,'pause'),hilogFactory:args=>new PhoneHilog({...args,...d.deps})});
  const release=lab.acquire('synthetic-running-test'),before=readDeviceLease(lock);closeAfter(t,async()=>{await lab.close();release();});
  await Promise.all([lab.hilog.start(),lab.hilog.start()]);const manualId=lab.hilog.status().current.id;assert.equal(d.count(),1);
  const scope=await lab.beginTestLog({id:'fixture',name:'自动测试'});await waitFor(()=>scope.recorder.status().current?.bytes>0);assert.equal(d.count(),2);assert.notEqual(scope.initial.id,manualId);assert.equal(scope.initial.context.mode,'test');
  await lab.hilog.stop();assert.equal(scope.recorder.status().current.state,'capturing');d.children[1].stdout.write('test continues\n');
  await lab.hilog.start();await lab.finishTestLog(scope);assert.equal(lab.hilog.status().current.state,'capturing');assert.deepEqual(readDeviceLease(lock),before);await lab.hilog.stop();assert.deepEqual(readDeviceLease(lock),before);
  assert.equal(d.commands.filter(args=>args[0]==='-t'&&args[3]===HILOG_COMMAND).length,3);assert.ok(!JSON.stringify(lab.hilog.status()).includes('private-device'));
});
test('failed discovery never launches a reader and does not reveal device identifiers',async t=>{
  const dir=await root(t);for(const targets of ['[Empty]','private-device\nother-device']){const d=driver({targets}),log=new PhoneHilog({root:dir,project:dir,acquire:()=>()=>{},...d.deps});await assert.rejects(log.start(),/唯一一台/);assert.equal(d.count(),0);assert.equal(log.status().current,null);await log.close();}
});
test('connection EOF retains partial logs, releases its capture lease and does not automatically restart',async t=>{
  const dir=await root(t),d=driver(),file=path.join(dir,'hilog.lock'),log=new PhoneHilog({root:dir,project:dir,acquire:()=>acquireDeviceLease(file,'fixture'),...d.deps});
  await log.start();await waitFor(()=>log.status().current?.bytes>0);d.children[0].kill();await waitFor(()=>!log.session);const record=log.recordings()[0];assert.equal(record.state,'error');assert.ok(record.bytes>0);assert.equal(readDeviceLease(file),null);assert.equal(d.count(),1);await log.close();
});
test('a running trajectory reports an interrupted automatic log immediately and retains its partial download',async t=>{
  const dir=await root(t),d=driver(),lab=new PhoneLab(dir,{lockPath:path.join(dir,'lock'),pausePath:path.join(dir,'pause'),hilogFactory:args=>new PhoneHilog({...args,...d.deps})});closeAfter(t,()=>lab.close());
  const scope=await lab.beginTestLog({id:'fixture',name:'日志中断示例'});await writeFile(path.join(scope.dir,'input.json'),JSON.stringify({id:scope.id}));
  await waitFor(()=>scope.recorder.status().current?.bytes>0);d.children[0].kill();await waitFor(()=>!scope.recorder.session);
  const detail=lab.summary(scope.id);assert.equal(detail.automatic_hilog.state,'error');assert.ok(detail.automatic_hilog.bytes>0);assert.ok(detail.automatic_hilog.finished_at);assert.equal(lab.testLogs.size,1);
  await lab.finishTestLog(scope);assert.equal(lab.summary(scope.id).automatic_hilog.state,'error');assert.equal(lab.testLogs.size,0);
});
test('HiLog HTTP starts only on explicit same-origin commands and downloads completed parts in order',async t=>{
  const dir=await root(t),d=driver(),app=await createDebugServer({dataRoot:dir,port:0,phoneLabOptions:{lockPath:path.join(dir,'lock'),pausePath:path.join(dir,'pause'),hilogFactory:args=>new PhoneHilog({...args,...d.deps})}});closeAfter(t,()=>app.close());
  const url=app.url+'/api/phone-lab/hilog',headers={'Content-Type':'application/json','X-Simulator-UI':'1'},post=(suffix,body='{}',extra={})=>fetch(url+suffix,{method:'POST',headers:{...headers,...extra},body});
  assert.equal((await fetch(url+'/status')).status,200);assert.equal(d.count(),0);assert.equal((await fetch(app.url+'/phone-image-time.mjs')).status,200);assert.equal((await fetch(app.url+'/phone-hilog-ui.mjs')).status,200);
  assert.equal((await post('/start','{}',{Origin:'https://untrusted.invalid'})).status,403);for(const body of ['null','[]','{"command":"hilog -r"}','{"path":"outside"}'])assert.equal((await post('/start',body)).status,400);assert.equal(d.count(),0);
  const started=await(await post('/start')).json(),id=started.current.id;assert.equal((await fetch(url+'/'+id+'/download')).status,409);
  await waitFor(()=>d.children.length===1);await post('/stop');const status=await(await fetch(url+'/status')).json();assert.ok(status.recordings[0].parts.length>1);
  const downloaded=await fetch(url+'/'+id+'/download');assert.equal(downloaded.status,200);assert.match(downloaded.headers.get('content-disposition'),/attachment/);assert.match(await downloaded.text(),/中文日志/);
  assert.equal((await post('/start','{}',{'X-Simulator-UI':''})).status,403);assert.equal(d.count(),1);
});
test('automatic capture starts before preparation, finishes after the worker, and attaches its log to the run',async t=>{
  const dir=await root(t),d=driver(),lab=new PhoneLab(dir,{lockPath:path.join(dir,'lock'),pausePath:path.join(dir,'pause'),hilogFactory:args=>new PhoneHilog({...args,...d.deps})});closeAfter(t,()=>lab.close());
  const startId='start_00000000-0000-0000-0000-000000000001',startDir=lab.directory('starts',startId);await mkdir(startDir);await writeFile(path.join(startDir,'start.json'),JSON.stringify({id:startId,named:true,contract:{ready:true},environment:{app:null}}));
  let prepared=false;lab.prepareBuiltinStart=async()=>{assert.equal(lab.testLogs.size,1);assert.equal(d.count(),1);prepared=true;return {id:startId};};
  const settings={services:[{id:'fixture',model:'qwen3.7-plus',protocol:'openai-chat'}]},run=await lab.start({framework_id:'midscene',service_id:'fixture',case_id:'HM-CALC-001'},settings);await lab.children.get(run.id).completion;
  const snapshot=lab.snapshot(run.id);assert.equal(prepared,true);assert.equal(snapshot.result.model_usage.requests,0);assert.equal(snapshot.automatic_hilog.state,'stopped');assert.ok(snapshot.automatic_hilog.bytes>0);assert.equal(snapshot.events.at(-1).type,'hilog_capture_end');assert.ok(snapshot.events.some(e=>e.type==='hilog_capture_start'));assert.equal(lab.testLogs.size,0);
  const file=path.join(lab.directory('runs',run.id),'hilog.json');assert.equal(JSON.parse(await readFile(file,'utf8')).context.run_id,run.id);
});

test('a preparation failure keeps its own log and blocked trajectory without dispatching a worker',async t=>{
  const dir=await root(t),d=driver(),lab=new PhoneLab(dir,{lockPath:path.join(dir,'lock'),pausePath:path.join(dir,'pause'),hilogFactory:args=>new PhoneHilog({...args,...d.deps})});closeAfter(t,()=>lab.close());
  lab.prepareBuiltinStart=async()=>{throw Error('fixture start mismatch');};
  await assert.rejects(lab.start({framework_id:'midscene',service_id:'fixture',case_id:'HM-CALC-001'},{services:[{id:'fixture',model:'qwen3.7-plus',protocol:'openai-chat'}]}),/start mismatch/);
  const run=lab.list('runs','input.json')[0],snapshot=lab.snapshot(run.id);assert.equal(snapshot.state.status,'blocked');assert.equal(snapshot.result.model_usage.requests,0);assert.equal(snapshot.automatic_hilog.state,'stopped');assert.ok(snapshot.automatic_hilog.bytes>0);assert.equal(lab.children.size,0);assert.deepEqual(snapshot.events.map(e=>e.type),['hilog_capture_start','hilog_capture_end']);
});
