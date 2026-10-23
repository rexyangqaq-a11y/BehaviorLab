import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PhoneVideo} from '../src/phone-video.mjs';
import {createDebugServer} from '../src/web-server.mjs';
import {videoPacket,VideoPacketReader,annexBUnits,MAX_VIDEO_PACKET} from '../web/phone-video-protocol.mjs';
import {comparablePhoneGroups} from '../web/phone-results.mjs';

const frame=Uint8Array.from([0,0,0,1,0x67,1,0,0,1,0x68,2,0,0,0,1,0x65,3]);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,options={}){
  const project=await mkdtemp(path.join(os.tmpdir(),'phone-video-test-'));
  let acquired=0,released=0,launched=0,enabled=true,locked=false;const children=[];
  const runtime=()=>({available:true,missing:[],java:'fixture-java',sdk:'fixture-sdk',classes:'fixture-classes',root:project});
  const launch=()=>{
    launched++;const child=new EventEmitter();Object.assign(child,{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough()});children.push(child);
    child.stdin.on('finish',()=>setImmediate(()=>child.emit('exit',0)));child.kill=()=>{setImmediate(()=>child.emit('exit',1));};
    if(options.frames!==false)setImmediate(()=>child.stdout.write(videoPacket(frame)));
    return child;
  };
  const video=new PhoneVideo({project,runtime,launch,hdcResolver:()=> 'fixture-hdc',targets:async()=>['private-target'],command:async()=>({stdout:'fixture environment'}),assertEnabled:()=>{if(!enabled)throw Error('paused');},acquire:()=>{if(locked)throw Error('busy');acquired++;locked=true;return()=>{released++;locked=false;};},startTimeout:40,stopTimeout:40,...options});
  t.after(async()=>{await video.close();assert.equal(path.dirname(project),os.tmpdir());assert.ok(path.basename(project).startsWith('phone-video-test-'));await rm(project,{recursive:true,force:true});});
  return {project,video,children,setEnabled:v=>{enabled=v;},setLocked:v=>{locked=v;},counts:()=>({acquired,released,launched})};
}
function response(){const r=new EventEmitter();r.writableLength=0;r.chunks=[];r.writeHead=(...args)=>{r.headers=args;};r.write=data=>{r.chunks.push(data);return true;};r.end=()=>{r.ended=true;r.emit('close');};return r;}

test('video framing handles split/coalesced packets, heartbeats and malformed stream boundaries',()=>{
  const packets=[],reader=new VideoPacketReader(data=>packets.push([...data]));
  const bytes=Buffer.concat([videoPacket(frame),videoPacket(new Uint8Array()),videoPacket(Uint8Array.of(4,5))]);
  for(const b of bytes)reader.feed(Uint8Array.of(b));reader.end();assert.deepEqual(packets,[[...frame],[],[4,5]]);
  const all=[];new VideoPacketReader(data=>all.push(data)).feed(bytes);assert.equal(all.length,3);
  const bad=new Uint8Array(4);new DataView(bad.buffer).setUint32(0,MAX_VIDEO_PACKET+1);assert.throws(()=>reader.feed(bad),/长度无效/);
  const truncated=new VideoPacketReader(()=>{});truncated.feed(Uint8Array.of(0,0,0));assert.throws(()=>truncated.end(),/中间断开/);
  assert.deepEqual(annexBUnits(frame).map(u=>u.type),[7,8,5]);assert.equal(annexBUnits(Uint8Array.of(1,2,3)).length,0);
});

test('status never launches hardware; viewers share one encoder, authenticate and stop on the last release',async t=>{
  const f=await fixture(t),v=f.video;assert.equal(v.status().state,'idle');assert.equal(f.counts().launched,0);
  const [a,b]=await Promise.all([v.start(),v.start()]);assert.equal(a.id,b.id);assert.notEqual(a.token,b.token);assert.equal(f.counts().launched,1);assert.equal(f.counts().acquired,f.counts().released);
  const c=await v.start(),d=await v.start();await assert.rejects(v.start(),/最多/);v.stop(c);v.stop(d);
  assert.equal(v.observation().enabled,true);assert.ok(!JSON.stringify(v.status()).includes('private-target'));assert.ok(!JSON.stringify(v.status()).includes(a.token));
  assert.throws(()=>v.attach(a.id,'wrong',response()),e=>e.status===403);
  const ra=response(),rb=response();v.attach(a.id,a.token,ra);v.attach(b.id,b.token,rb);assert.equal(ra.headers[0],200);assert.ok(ra.chunks.length>0);
  assert.throws(()=>v.attach(a.id,a.token,response()),e=>e.status===403);
  ra.emit('close');assert.equal(v.status().viewers,1);assert.equal(v.status().state,'streaming');
  v.stop(b);await v.stopAll();assert.equal(v.status().state,'idle');assert.equal(f.counts().acquired,f.counts().released);
  const report=JSON.parse(await readFile(path.join(f.project,'.runtime/hoscrcpy/sessions',a.id+'.json')));assert.equal(report.cleanup,'sdk_stopped');assert.equal(report.packets,1);
});

test('pause, missing runtime and an occupied device prevent starting; startup timeout releases its lock',async t=>{
  const f=await fixture(t,{frames:false});f.setEnabled(false);await assert.rejects(f.video.start(),/paused/);f.setEnabled(true);
  f.setLocked(true);await assert.rejects(f.video.start(),/busy/);f.setLocked(false);
  await assert.rejects(f.video.start(),/尚未收到/);assert.equal(f.video.status().viewers,0);assert.equal(f.counts().acquired,f.counts().released);
  const unavailable=await fixture(t,{runtime:()=>({available:false,missing:['SDK']})});await assert.rejects(unavailable.video.start(),/SDK/);assert.equal(unavailable.counts().launched,0);
  const badCommand=await fixture(t,{command:async()=>{throw Error('hdc -t private-target failed');}});await assert.rejects(badCommand.video.start(),/USB授权/);assert.ok(!JSON.stringify(badCommand.video.status()).includes('private-target'));
});

test('fragmented SDK failure ends viewers, redacts device logs and a fresh session clears the old error',async t=>{
  const f=await fixture(t);const lease=await f.video.start(),r=response();f.video.attach(lease.id,lease.token,r);
  f.children[0].stderr.write('private-');f.children[0].stderr.write('target\nBEHAVIORLAB_VID');f.children[0].stderr.write('EO:error:Network\n');await tick();await f.video.stopAll(f.video.session?.error);
  assert.equal(r.ended,true);assert.match(f.video.status().error,/采集失败/);
  assert.ok(!(await readFile(path.join(f.project,'.runtime/hoscrcpy/sessions',lease.id+'.log'),'utf8')).includes('private-target'));
  const next=await f.video.start();assert.equal(f.video.status().error,null);f.video.stop(next);await f.video.stopAll();
  const incomplete=await f.video.start();f.children.at(-1).stderr.write('BEHAVIORLAB_VIDEO:stop_error:CleanupFailure\n');f.video.stop(incomplete);await f.video.stopAll();assert.equal(f.video.status().state,'error');assert.match(f.video.status().error,/清理状态待核对/);
});

test('slow viewers are disconnected; cancellation during preparation does not spawn a video process',async t=>{
  const f=await fixture(t),a=await f.video.start(),r=response();f.video.attach(a.id,a.token,r);r.writableLength=3*1024*1024;
  f.children[0].stdout.write(videoPacket(frame));await f.video.stopAll();assert.equal(r.ended,true);assert.equal(f.video.status().state,'idle');
  let resolveTargets;const g=await fixture(t,{targets:()=>new Promise(resolve=>{resolveTargets=resolve;})});const starting=g.video.start();await g.video.stopAll();resolveTargets(['private-target']);await assert.rejects(starting,/取消/);assert.equal(g.counts().launched,0);assert.equal(g.counts().acquired,g.counts().released);
});

test('video HTTP requires explicit same-origin POST and a header lease; static/status GET never starts capture',async t=>{
  const f=await fixture(t);let starts=0;const realStart=f.video.start.bind(f.video);f.video.start=()=>{starts++;return realStart();};
  const app=await createDebugServer({dataRoot:f.project,port:0,phoneLabOptions:{videoFactory:()=>f.video,lockPath:path.join(f.project,'lock'),pausePath:path.join(f.project,'pause'),deviceFactory:()=>{throw Error('no hardware');}}});
  try{const base=app.url+'/api/phone-lab/video',headers={'Content-Type':'application/json','X-Simulator-UI':'1'};
  for(const route of ['/phone-video-ui.mjs','/phone-video-protocol.mjs','/vendor/jmuxer.min.js'])assert.equal((await fetch(app.url+route)).status,200);
  const status=await fetch(base+'/status');assert.equal(status.headers.get('cache-control'),'no-store');assert.match(status.headers.get('content-security-policy'),/media-src 'self' blob:/);assert.equal(starts,0);
  assert.equal((await fetch(base+'/start')).status,404);assert.equal((await fetch(base+'/start',{method:'POST',body:'{}'})).status,403);
  for(const body of ['null','[]','true','1','""','{"path":"arbitrary"}'])assert.equal((await fetch(base+'/start',{method:'POST',headers,body})).status,400);
  const lease=await(await fetch(base+'/start',{method:'POST',headers,body:'{}'})).json();assert.equal(starts,1);
  const stream=base+'/'+lease.id+'/stream';assert.equal((await fetch(stream+'?token='+lease.token)).status,403);
  assert.equal((await fetch(stream,{headers:{Origin:'https://other.invalid','X-Phone-Video-Token':lease.token}})).status,403);
  const controller=new AbortController(),opened=await fetch(stream,{headers:{'X-Phone-Video-Token':lease.token},signal:controller.signal});assert.equal(opened.status,200);assert.equal(opened.headers.get('content-type'),'application/octet-stream');
  await opened.body.getReader().read();controller.abort();await f.video.stopAll();
  }finally{await app.close();}
});

test('runs with video observation form a separate comparison group, while historical and disabled runs stay together',()=>{
  const r={evaluation_protocol:'v9',result:{model_usage:{requests:1},same_start:{same:true}}};
  const groups=comparablePhoneGroups([r,{...r,video_observation_at_start:{enabled:false}},{...r,video_observation_at_start:{enabled:true,backend:'hoscrcpy'}}]);assert.deepEqual(groups.map(g=>g.length),[2,1]);
});
