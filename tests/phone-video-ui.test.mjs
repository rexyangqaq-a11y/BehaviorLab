import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhoneVideoPanel} from '../web/phone-video-ui.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,{api,catalog={busy:{owner:'synthetic-test'},video:{available:true,state:'streaming'},device_pause:{paused:false}},storage=new Map()}={}){
  const elements=new Map(),listeners=new Map(),window=new EventTarget();
  const video={pause(){},removeAttribute(){},load(){},getVideoPlaybackQuality:()=>({totalVideoFrames:0})};elements.set('live-phone-video',video);
  for(const id of ['live-video-placeholder','live-video-badge','live-video-status','live-video-start','live-video-stop','live-video-fullscreen','test-video-note','live-video-stage','toggle-phone-video'])elements.set(id,{});
  const doc={getElementById:id=>elements.get(id),addEventListener:(name,fn)=>listeners.set(name,fn)};
  const replacement={document:doc,window,MediaSource:function(){},setInterval:()=>0,sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}},original=Object.fromEntries(Object.keys(replacement).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(replacement))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  t.after(()=>{for(const key of Object.keys(original)){if(original[key])Object.defineProperty(globalThis,key,original[key]);else delete globalThis[key];}});
  const panel=createPhoneVideoPanel({api,getCatalog:()=>catalog,message:()=>{}});panel.setVisible(true);
  return {panel,elements,catalog,storage,click:id=>listeners.get('click')({target:{closest:()=>({id})}})};
}

test('restored USB start remains clickable during a test; backend lease errors are shown without disabling retries',async t=>{
  let calls=0;const f=fixture(t,{api:async(route,input)=>{calls++;assert.equal(route,'/video/start');assert.deepEqual(input,{});throw Error('手机正在被测试占用');}});
  assert.equal(f.elements.get('live-video-start').disabled,false);f.click('live-video-start');await tick();
  assert.equal(calls,1);assert.match(f.elements.get('live-video-status').textContent,/手机正在被测试占用/);assert.equal(f.elements.get('live-video-start').disabled,false);
});

test('stopping an in-flight USB start releases the late viewer lease without opening a stream',async t=>{
  let finish;const stops=[];const f=fixture(t,{api:(route,input)=>route==='/video/start'?new Promise(resolve=>finish=resolve):(stops.push({route,input}),Promise.resolve({stopped:true}))});
  f.click('live-video-start');assert.equal(f.elements.get('live-video-stop').disabled,false);f.click('live-video-stop');
  finish({id:'video_fixture',token:'fixture-lease'});await tick();
  assert.deepEqual(stops,[{route:'/video/stop',input:{id:'video_fixture',token:'fixture-lease'}}]);assert.equal(f.elements.get('live-video-start').disabled,false);
});

test('connection automatically starts video during a test, stays across tabs, and manual close survives refresh and reconnect',async t=>{
  const pending=[],stops=[];const f=fixture(t,{api:(route,input)=>route==='/video/start'?new Promise(resolve=>pending.push(resolve)):(stops.push(input),Promise.resolve({stopped:true}))});
  f.panel.connectionChanged({state:'connected'});assert.equal(pending.length,1);assert.equal(f.elements.get('toggle-phone-video').textContent,'关闭投屏');
  f.panel.setVisible(false);f.panel.refresh();assert.equal(pending.length,1);assert.equal(f.elements.get('live-video-badge').textContent,'正在连接');
  f.click('toggle-phone-video');assert.equal(f.storage.get('phone-video-auto'),'off');
  f.panel.refresh();f.panel.connectionChanged({state:'disconnected'});f.panel.connectionChanged({state:'connected'});assert.equal(pending.length,1);
  pending[0]({id:'video_old',token:'old'});await tick();assert.deepEqual(stops,[{id:'video_old',token:'old'}]);
  f.click('toggle-phone-video');assert.equal(pending.length,2);assert.equal(f.storage.get('phone-video-auto'),'on');f.click('toggle-phone-video');pending[1]({id:'video_new',token:'new'});await tick();
});

test('automatic failure attempts once per physical connection; pause and stale/failed checks never launch capture',async t=>{
  let calls=0;const f=fixture(t,{api:async()=>{calls++;throw Error('SDK file send failed');}});
  for(const value of [{state:'unchecked'},{state:'error'},{state:'multiple'},{state:'connected',stale:true}]){f.panel.connectionChanged(value);await tick();}
  assert.equal(calls,0);f.catalog.device_pause.paused=true;f.panel.connectionChanged({state:'connected'});await tick();assert.equal(calls,0);
  f.catalog.device_pause.paused=false;f.panel.refresh();await tick();assert.equal(calls,1);
  for(let i=0;i<4;i++){f.panel.connectionChanged({state:'connected'});f.panel.refresh();await tick();}assert.equal(calls,1);assert.match(f.elements.get('live-video-status').textContent,/file send/);
  f.panel.connectionChanged({state:'error'});f.panel.connectionChanged({state:'connected'});await tick();assert.equal(calls,1);
  f.panel.connectionChanged({state:'disconnected'});f.panel.connectionChanged({state:'connected'});await tick();assert.equal(calls,2);
});

test('stored manual-off preference prevents automatic restart after page reload',async t=>{
  let calls=0;const f=fixture(t,{storage:new Map([['phone-video-auto','off']]),api:async()=>{calls++;throw Error('unused');}});
  f.panel.connectionChanged({state:'connected'});f.panel.refresh();await tick();assert.equal(calls,0);assert.match(f.elements.get('live-video-status').textContent,/自动投屏已关闭/);
});
