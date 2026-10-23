import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PhoneLab} from '../src/phone-lab.mjs';
import {createDebugServer} from '../src/web-server.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX8cAAAAASUVORK5CYII=','base64');
async function setup(t){const root=await mkdtemp(path.join(os.tmpdir(),'phone-lab-test-'));t.after(async()=>{const relative=path.relative(os.tmpdir(),path.resolve(root));assert.ok(relative.startsWith('phone-lab-test-')&&!relative.includes(path.sep));await rm(root,{recursive:true,force:true});});return root;}
test('persistent pause blocks capture, run and batch before any physical or model call; configuration stays readable',async t=>{
  const root=await setup(t);let devices=0;
  const opts={lockPath:path.join(root,'device.lock'),pausePath:path.join(root,'pause.json'),deviceFactory:async()=>{devices++;throw Error('must not run');}};
  const lab=new PhoneLab(root,opts);lab.pause('fixture user pause');
  await assert.rejects(lab.captureStart({}),e=>e.status===423);await assert.rejects(lab.start({},{}),e=>e.status===423);await assert.rejects(lab.batch({},{}),e=>e.status===423);
  const second=new PhoneLab(root,opts);assert.equal((await second.catalog({services:[]})).device_pause.paused,true);assert.equal(devices,0);
  second.resume();assert.equal((await second.catalog({services:[]})).device_pause.paused,false);
});
test('shared lock rejects a second operation; real evidence references detect tampering',async t=>{
  const root=await setup(t),opts={lockPath:path.join(root,'device.lock'),pausePath:path.join(root,'pause.json')};
  const lab=new PhoneLab(root,opts),other=new PhoneLab(root,opts);const release=lab.acquire('fixture');assert.throws(()=>other.acquire('other'),e=>e.status===409);release();other.acquire('other')();
  lab.deviceFactory=async({evidence})=>({layout:async()=>({nodes:[{text:'settings'},{id:'query',text:'',type:'TextInput'}],file:'fixture.json'}),environment:async()=>({target_sha256:'fixture',device:{model:'fixture'},app:null}),capture:async()=>({asset:await evidence.image(png,'image/png','start'),width:1,height:1})});
  const start=await lab.captureStart({description:'fixture manual page'});assert.equal(start.contract.ready,true);
  assert.equal((await lab.asset('starts',start.id,start.asset.id)).bytes.length,png.length);
  await writeFile(path.join(lab.base,'starts',start.id,start.asset.file),'tampered');await assert.rejects(lab.asset('starts',start.id,start.asset.id),e=>e.status===409);
});
test('phone interface and read-only catalog require no device; paused HTTP requests return 423 and never call hardware',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'phone-lab-test-'));let devices=0;
  const app=await createDebugServer({dataRoot:root,port:0,phoneLabOptions:{lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause.json'),deviceFactory:async()=>{devices++;throw Error('must not run');}}});
  t.after(async()=>{await app.close();const relative=path.relative(os.tmpdir(),path.resolve(root));assert.ok(relative.startsWith('phone-lab-test-')&&!relative.includes(path.sep));await rm(root,{recursive:true,force:true});});
  const post=async(route,data={})=>fetch(app.url+'/api/phone-lab'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-UI':'1'},body:JSON.stringify(data)});
  assert.equal((await fetch(app.url+'/phone-lab')).status,200);
  assert.equal((await fetch(app.url+'/phone-trace.mjs')).status,200);
  assert.equal((await fetch(app.url+'/phone-results.mjs')).status,200);
  assert.equal((await post('/pause')).status,200);
  for(const route of ['/starts','/runs','/batches'])assert.equal((await post(route)).status,423);
  const c=await(await fetch(app.url+'/api/phone-lab')).json();assert.equal(c.cases.length,5);assert.equal(c.default_limits.max_requests,15);assert.equal(c.batch_request_limit,null);assert.equal(c.device_pause.paused,true);assert.equal(devices,0);
  assert.equal((await post('/resume')).status,200);assert.equal(devices,0);
});

test('integration diagnostics remain readable with actual calls and source versions but are explicitly excluded from matrix scoring',async t=>{
 const root=await setup(t),lab=new PhoneLab(root,{lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause.json')}),id='phone_00000000-0000-0000-0000-000000000099',dir=lab.directory('runs',id);
 await mkdir(dir);const input={id,created_at:'2026-10-22',framework_id:'mobiagent',evaluation_id:'evaluation_fixture'};
 await writeFile(path.join(dir,'input.json'),JSON.stringify(input));await writeFile(path.join(dir,'result.json'),JSON.stringify({model_usage:{requests:1},actions:0}));await writeFile(path.join(dir,'source-versions.json'),JSON.stringify({'bridge.py':'old-hash'}));
 const evalDir=path.join(lab.base,'evaluations','evaluation_fixture');await mkdir(evalDir);await writeFile(path.join(evalDir,'evaluation.json'),JSON.stringify({id:'evaluation_fixture',entries:[{run_id:id,matrix_eligible:false,exclusion_reason:'unicode_bridge_v1'}]}));
 const row=(await lab.catalog({services:[]})).runs.find(r=>r.id===id);
 assert.equal(row.evaluation_exclusion,'unicode_bridge_v1');assert.equal(row.result.model_usage.requests,1);assert.equal(row.source_versions['bridge.py'],'old-hash');assert.equal(lab.snapshot(id).evaluation_exclusion,undefined);assert.equal(lab.summary(id).evaluation_id,input.evaluation_id);
});

test('a batch freezes its original reference and invalid limits cannot leave a batch active',async t=>{
  const root=await setup(t),lab=new PhoneLab(root,{lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause.json')});
  const id='start_00000000-0000-0000-0000-000000000001',dir=lab.directory('starts',id);await mkdir(dir);
  await writeFile(path.join(dir,'start.json'),JSON.stringify({id,created_at:'2026-10-21',case_id:'HM-SYS-001',contract:{ready:true,case_revision:2,comparison_key:'original'}}));
  const input={case_ids:['HM-SYS-001'],combinations:[{framework_id:'midscene',service_id:'fixture-a'},{framework_id:'mobiagent',service_id:'fixture-b'}]};
  const settings={services:[{id:'fixture-a',protocol:'openai-chat',model:'qwen3.8-flash'},{id:'fixture-b',protocol:'openai-chat',model:'qwen3.7-plus'}]};
  await assert.rejects(lab.batch({...input,limits:{max_requests:0}},settings));assert.equal(lab.activeBatch,undefined);
  let captures=0,launches=0;lab.captureStart=async()=>({id:'fixture-current',contract:{ready:true,comparison_key:++captures===1?'original':'drifted'}});
  lab.start=async()=>{launches++;return {id:'fixture-run'};};lab.summary=()=>({state:{status:'ended'}});
  const batch=await lab.batch(input,settings);await lab.batchCompletion;
  assert.equal(batch.baselines['HM-SYS-001'].id,id);assert.equal(captures,2);assert.equal(launches,1);
  assert.equal(batch.entries[1].status,'blocked_before_model');assert.equal(lab.activeBatch,null);
});

test('every run reports its frozen execution phone, with explicitly labelled baseline and unknown fallbacks',async t=>{
  const root=await setup(t),lab=new PhoneLab(root,{lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause.json')});
  const ids=['phone_00000000-0000-0000-0000-000000000001','phone_00000000-0000-0000-0000-000000000002','phone_00000000-0000-0000-0000-000000000003'];
  for(const [i,id]of ids.entries()){
    const dir=lab.directory('runs',id);await mkdir(dir);
    await writeFile(path.join(dir,'input.json'),JSON.stringify({id,created_at:'2026-10-22',startpoint:i<2?{environment:{device:{model:'baseline-phone',api:'25'}},contract:{width:100,height:200}}:null}));
    if(i===0)await writeFile(path.join(dir,'environment.json'),JSON.stringify({device:{model:'executed-phone',api:'26',software_version:'frozen-version'},screen:{width:300,height:400}}));
  }
  const list=await lab.catalog({services:[]}),byId=id=>list.runs.find(r=>r.id===id).device_info;
  assert.equal(byId(ids[0]).model,'executed-phone');assert.equal(byId(ids[0]).source,'execution_environment');assert.equal(byId(ids[0]).software_version,'frozen-version');
  assert.equal(byId(ids[1]).model,'baseline-phone');assert.equal(byId(ids[1]).source,'saved_startpoint');
  assert.equal(byId(ids[2]).model,null);assert.equal(byId(ids[2]).source,'not_recorded');
  assert.deepEqual(lab.snapshot(ids[0]).device_info,byId(ids[0]));
});
