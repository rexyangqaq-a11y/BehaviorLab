import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,appendFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PhoneLab} from '../src/phone-lab.mjs';
import {createDebugServer} from '../src/web-server.mjs';
import {currentProcessRun,mergeProcessSnapshot,processPhase,processSteps,renderProcessStep} from '../web/phone-process.mjs';

const id='phone_00000000-0000-0000-0000-000000000001';
async function setup(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'phone-process-test-'));
  t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('phone-process-test-'));await rm(root,{recursive:true,force:true});});
  const opts={lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause'),deviceFactory:async()=>{throw Error('no hardware is allowed');}};
  const lab=new PhoneLab(root,opts),dir=lab.directory('runs',id);await mkdir(dir);
  const input={id,name:'冻结的测试',instruction:'原始任务要求',acceptance:['目标截图'],limits:{max_requests:15},created_at:'2026-10-23T00:00:00Z'};
  await writeFile(path.join(dir,'input.json'),JSON.stringify(input));await writeFile(path.join(dir,'state.json'),JSON.stringify({status:'running',phase:'execution'}));
  return {root,lab,dir,opts};
}

test('process snapshots follow append-only evidence, tolerate a partial tail and reset stale cursors without operations',async t=>{
  const {lab,dir}=await setup(t),ledger=path.join(dir,'events.jsonl');
  await writeFile(ledger,'{"seq":1,"type":"execution_start"}\n{"seq":2,"type":"model_request_start","id":"m1"}\n{"seq":3');
  const first=lab.processSnapshot(id);assert.equal(first.cursor,2);assert.equal(first.events.length,2);assert.equal(first.instruction,'原始任务要求');assert.equal(first.assets,undefined);
  await appendFile(ledger,',"type":"model_response","id":"m1"}\n');
  const delta=lab.processSnapshot(id,2);assert.deepEqual(delta.events.map(e=>e.seq),[3]);assert.equal(delta.cursor,3);
  const merged=mergeProcessSnapshot(first,delta);assert.deepEqual(merged.events.map(e=>e.seq),[1,2,3]);assert.deepEqual(mergeProcessSnapshot(merged,delta).events,merged.events);
  assert.equal(lab.processSnapshot(id,3).events.length,0);const reset=lab.processSnapshot(id,99);assert.equal(reset.reset,true);assert.equal(mergeProcessSnapshot(merged,reset).events.length,3);
  await writeFile(path.join(dir,'state.json'),JSON.stringify({status:'ended'}));assert.equal(lab.processSnapshot(id,3).state.status,'ended');
  for(const cursor of [-1,1.1,NaN,Infinity])assert.throws(()=>lab.processSnapshot(id,cursor),e=>e.status===400);
});

test('process HTTP is read-only, uncached and validates cursors; withdrawn mirror endpoints are unavailable',async t=>{
  const {root,opts,dir}=await setup(t);await writeFile(path.join(dir,'events.jsonl'),'');
  const app=await createDebugServer({dataRoot:root,port:0,phoneLabOptions:opts});
  try{
    const result=await fetch(app.url+'/api/phone-lab/runs/'+id+'/process');assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
    for(const cursor of ['-1','NaN','1.1','Infinity'])assert.equal((await fetch(app.url+'/api/phone-lab/runs/'+id+'/process?after_seq='+cursor)).status,400);
    assert.equal((await fetch(app.url+'/api/phone-lab/runs/bad/process')).status,400);
    for(const file of ['/phone-process.mjs','/phone-process-ui.mjs'])assert.equal((await fetch(app.url+file)).status,200);
    const html=await(await fetch(app.url+'/phone-lab')).text();assert.ok(!html.includes('phone-video'));assert.ok(!html.includes('mirror-open-tool'));
    const removed=await fetch(app.url+'/api/phone-lab/mirroring/open-tool',{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-UI':'1'},body:'{}'});assert.equal(removed.status,404);
  }finally{await app.close();}
});

test('active case selection follows the lock, holds the completed viewed case and never invents an active history',()=>{
  const old={id:'old',state:{status:'ended'}},running={id:'current',state:{status:'running'}};
  assert.equal(currentProcessRun({runs:[old]}),null);assert.equal(currentProcessRun({runs:[old]},'old'),old);
  assert.equal(currentProcessRun({runs:[old,running]},'old'),running);
  assert.equal(currentProcessRun({runs:[old,running],busy:{owner:'old'}},'current'),old);
  assert.match(processPhase(old),/等待业务核对/);assert.doesNotMatch(processPhase(old),/通过/);
});

test('trajectory preserves pending replies, orphan actions, unknown effects and exact model images as escaped evidence',()=>{
  const hash='ab'.repeat(32),events=[
    {type:'image',asset:{id:'input',file:'assets/input.jpeg',sha256:hash,role:'model_input'}},
    {type:'action_intent',id:'orphan',name:'Home'},
    {type:'action_return',id:'orphan'},
    {type:'model_request_start',id:'m1',request:{messages:[{content:'asset:assets/input.jpeg#sha256='+hash}]}},
    {type:'model_response',id:'m1',response:{choices:[{message:{content:'<planning><script>bad()</script></planning>'}}]}},
    {type:'action_intent',id:'a1',name:'Tap',param:{x:10,y:20}},
    {type:'hdc_intent',id:'h1',args:['shell','uitest','uiInput','click','10','20']},
    {type:'action_unknown',id:'a1',error:'timeout'},
    {type:'model_request_start',id:'m2',request:{}},
  ].map((e,i)=>({...e,seq:i+1}));
  const run={id,state:{status:'running'},events},projection=processSteps(run);
  assert.equal(projection.steps.filter(s=>s.kind==='action').length,2);assert.equal(projection.steps.find(s=>s.id==='model:m2').status,'等待回复');
  assert.equal(projection.steps.find(s=>s.id==='action:a1').status,'效果未知');
  const html=renderProcessStep(run,projection,'action:a1');assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>'));assert.match(html,/hdc_intent/);assert.match(html,/data-process-image="input"/);assert.ok(!html.includes(' data-image='));
  assert.equal(projection.trace.calls[0].submitted_asset_ids[0],'input');
  const ended={...run,state:{status:'ended'},events:events.filter(e=>e.type!=='action_unknown')};assert.equal(processSteps(ended).steps.find(s=>s.id==='action:a1').status,'缺少返回，待核对');
});
