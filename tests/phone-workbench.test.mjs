import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PhoneTasks} from '../src/phone-tasks.mjs';
import {PhoneLab} from '../src/phone-lab.mjs';
import {startContract} from '../src/phone-startpoints.mjs';
import {phoneTestPlan,resolvePhoneSelection} from '../web/phone-test-plan.mjs';
import {PHONE_SELECTION_POLICY} from '../src/phone-framework-registry.mjs';
import {filterPhoneRuns,comparablePhoneGroups,phoneResultTotals} from '../web/phone-results.mjs';
import {createDebugServer} from '../src/web-server.mjs';
import {PhoneEvidence,sha256} from '../src/phone-evidence.mjs';
import {namedStartContract} from '../src/phone-startpoints.mjs';

const definition={name:'测试任务',app:'当前应用',instruction:'打开页面并读取标题',acceptance:'打开目标页\n标题有真实截图依据',initial_state:'同一手机桌面，无键盘',forbidden:'不修改账号',reset:'home'};
test('recommended defaults preserve user combinations and handle missing or disabled services',()=>{
  const catalog={selection_policy:PHONE_SELECTION_POLICY,frameworks:[{id:'autoglm',available:true},{id:'midscene',available:true},{id:'mobiagent',available:true}],services:[{id:'flash',model:'qwen3.8-flash',protocol:'openai-chat',family:'qwen'},{id:'plus',model:'qwen3.7-plus',protocol:'openai-chat',family:'qwen'}]};
  assert.deepEqual(resolvePhoneSelection(catalog),{framework_id:'midscene',service_id:'plus'});
  assert.deepEqual(resolvePhoneSelection(catalog,{framework_id:'mobiagent',service_id:'flash'}),{framework_id:'mobiagent',service_id:'flash'});
  catalog.services[1].missing=['API Key'];catalog.frameworks[1].available=false;
  assert.deepEqual(resolvePhoneSelection(catalog,{framework_id:'midscene',service_id:'plus'}),{framework_id:'autoglm',service_id:'flash'});
  catalog.services=[];assert.equal(resolvePhoneSelection(catalog).service_id,'');
});
const settings={services:[{id:'a',protocol:'openai-chat',model:'qwen3.8-flash'},{id:'b',protocol:'openai-chat',model:'qwen3.7-plus'}]};
async function temporary(t){const root=await mkdtemp(path.join(os.tmpdir(),'phone-workbench-test-'));t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('phone-workbench-test-'));await rm(root,{recursive:true,force:true});});return root;}
async function baseline(lab,task,key='original',id='start_00000000-0000-0000-0000-000000000001'){
  const dir=lab.directory('starts',id);await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'start.json'),JSON.stringify({id,created_at:id.endsWith('2')?'2026-10-23':'2026-10-22',case_id:task.id,environment:{device:{model:'fixture'},app:null},contract:{ready:true,case_revision:task.revision,comparison_key:key}}));return id;
}
function fixtureLab(root){let deviceCalls=0;const lab=new PhoneLab(root,{lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause.json'),deviceFactory:async()=>{deviceCalls++;throw Error('fixture must never access hardware');}});return {lab,calls:()=>deviceCalls};}

test('named task library persists edits, protects builtins and detects stale revisions',async t=>{
  const root=await temporary(t),tasks=new PhoneTasks(root);assert.equal(tasks.list().length,5);
  const created=tasks.save({...definition,name:'自定义 <标题>'});assert.equal(created.revision,1);assert.deepEqual(created.acceptance,['打开目标页','标题有真实截图依据']);
  const reopened=new PhoneTasks(root);assert.equal(reopened.get(created.id).name,'自定义 <标题>');
  const edited=reopened.save({name:'新名称',expected_revision:1},created.id);assert.equal(edited.revision,2);assert.equal(created.name,'自定义 <标题>');
  assert.throws(()=>tasks.save({name:'冲突',expected_revision:1},created.id),e=>e.status===409);
  assert.throws(()=>tasks.save({name:'不能改',expected_revision:3},'HM-CALC-001'),e=>e.status===409);
  const known=tasks.save({...definition,app:'淘宝'});assert.equal(known.bundle,'com.taobao.taobao4hmos');const switched=tasks.save({expected_revision:1,app:'其他应用'},known.id);assert.equal(switched.bundle,null);
});

test('task archive is reversible and validation rejects unsafe package names and empty criteria',async t=>{
  const root=await temporary(t),tasks=new PhoneTasks(root),task=tasks.save(definition);
  tasks.save({expected_revision:1,archived:true},task.id);assert.throws(()=>tasks.get(task.id),e=>e.status===404);
  const restored=tasks.save({expected_revision:2,archived:false},task.id);assert.equal(restored.revision,3);assert.equal(tasks.get(task.id).archived,false);
  for(const input of [{bundle:'com.example; exit'},{acceptance:[]},{name:' '},{reset:'shell'},{initial_state:''}])assert.throws(()=>tasks.save({...definition,...input}),e=>e.status===400);
});

test('single and matrix plans enforce all three axes and produce the full Cartesian product',()=>{
  assert.equal(phoneTestPlan({framework_ids:['f'],service_ids:['s'],case_ids:['t']}).count,1);
  const plan=phoneTestPlan({mode:'matrix',framework_ids:['f1','f2'],service_ids:['s1','s2'],case_ids:['t1','t2','t3']});
  assert.equal(plan.count,12);assert.deepEqual(plan.combinations,[{framework_id:'f1',service_id:'s1'},{framework_id:'f1',service_id:'s2'},{framework_id:'f2',service_id:'s1'},{framework_id:'f2',service_id:'s2'}]);
  for(const change of [{framework_ids:[]},{service_ids:['s','s']},{case_ids:['a','b']},{mode:'bad'},{service_ids:null}])assert.throws(()=>phoneTestPlan({framework_ids:['f'],service_ids:['s'],case_ids:['t'],...change}));
  assert.throws(()=>phoneTestPlan({mode:'matrix',framework_ids:['f'],service_ids:['s'],case_ids:Array.from({length:151},(_,i)=>'t'+i)}),/150/);
});

test('task HTTP create and edit work while paused without touching a phone or model',async t=>{
  const root=await temporary(t);let devices=0;const app=await createDebugServer({dataRoot:root,port:0,phoneLabOptions:{lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause.json'),deviceFactory:async()=>{devices++;throw Error('not allowed');}}});
  try{
    const post=async(route,data)=>fetch(app.url+'/api/phone-lab'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-UI':'1'},body:JSON.stringify(data)});
    await post('/pause',{});const res=await post('/tasks',definition);assert.equal(res.status,201);const task=await res.json();
    const edited=await post('/tasks/'+task.id,{name:'改名任务',expected_revision:1});assert.equal(edited.status,200);
    const catalog=await(await fetch(app.url+'/api/phone-lab')).json();assert.equal(catalog.tasks.length,6);assert.equal(catalog.tasks.at(-1).name,'改名任务');assert.equal(catalog.device_pause.paused,true);
    assert.equal(catalog.selection_policy.mode,'user_configurable');assert.equal(catalog.selection_policy.status,'confirmed');assert.equal(catalog.frameworks.length,3);
    assert.equal((await post('/tasks/'+task.id,{name:'过期',expected_revision:1})).status,409);
    assert.equal((await fetch(app.url+'/phone-test-plan.mjs')).status,200);assert.equal(devices,0);assert.equal(catalog.runs.length,0);
  }finally{await app.close();}
});

test('a revised task cannot reuse its old baseline, and invalid preparations never access hardware',async t=>{
  const root=await temporary(t),{lab,calls}=fixtureLab(root),task=lab.tasks.save({...definition,reset:'manual'});await baseline(lab,task);
  await assert.rejects(lab.captureStart({case_id:task.id,reset:true}),e=>e.status===400);
  await assert.rejects(lab.captureStart({}),e=>e.status===400);
  lab.tasks.save({expected_revision:1,name:'第二版'},task.id);
  await assert.rejects(lab.start({framework_id:'midscene',service_id:'a',case_id:task.id,startpoint_id:'start_00000000-0000-0000-0000-000000000001'},settings),e=>e.status===409);
  await assert.rejects(lab.batch({framework_ids:['midscene'],service_ids:['a'],case_ids:[task.id]},settings),e=>e.status===409);assert.equal(calls(),0);assert.equal(lab.activeBatch,undefined);
});

test('manual matrix waits per cell, rejects drift, freezes task content and supports cancellation',async t=>{
  const root=await temporary(t),{lab,calls}=fixtureLab(root),task=lab.tasks.save({...definition,reset:'manual'});await baseline(lab,task);
  let captures=0,launches=0,key='drift';const frozen=[];
  lab.captureStart=async(input,{taskSnapshot})=>{captures++;frozen.push(taskSnapshot);return {id:'fixture-current',contract:{ready:true,comparison_key:key}};};
  lab.start=async(input,services,{taskSnapshot})=>{launches++;assert.equal(taskSnapshot.revision,1);assert.equal(input.phase_id,'matrix');return {id:'fixture-run'};};lab.summary=()=>({state:{status:'ended'}});
  const batch=await lab.batch({framework_ids:['midscene'],service_ids:['a','b'],case_ids:[task.id]},settings);assert.equal(batch.status,'waiting_for_start');assert.equal(captures,0);assert.equal(launches,0);
  const firstToken=batch.pending_entry.token;
  await assert.rejects(lab.continueBatch(batch.id,{token:'stale'}),e=>e.status===409);assert.equal(captures,0);
  await assert.rejects(lab.continueBatch(batch.id,{token:firstToken}),e=>e.status===409);assert.equal(launches,0);assert.equal(batch.status,'waiting_for_start');
  lab.tasks.save({expected_revision:1,instruction:'新内容仅用于后续批次'},task.id);key='original';await lab.continueBatch(batch.id,{token:firstToken});
  for(let i=0;i<10&&!batch.pending_entry;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(launches,1);assert.equal(batch.status,'waiting_for_start');assert.notEqual(batch.pending_entry.token,firstToken);assert.equal(frozen.at(-1).instruction,definition.instruction);
  lab.stopBatch(batch.id);await lab.batchCompletion;assert.equal(batch.status,'stopped');assert.equal(lab.activeBatch,null);assert.equal(lab.waitingBatches.size,0);assert.equal(calls(),0);
});

test('closing a batch waiting for a manual start does not leave an unresolved queue',async t=>{
  const root=await temporary(t),{lab}=fixtureLab(root),task=lab.tasks.save({...definition,reset:'manual'});await baseline(lab,task);
  const batch=await lab.batch({framework_ids:['midscene'],service_ids:['a'],case_ids:[task.id]},settings);await lab.close();assert.equal(batch.status,'stopped');assert.equal(lab.waitingBatches.size,0);
});

test('custom home baselines need no target package, while manual starts compare actual page content',()=>{
  const environment={target_sha256:'fixture-device',device:{model:'fixture'},app:null},shot={width:100,height:200},task={...definition,id:'task_fixture',revision:1},nodes=[{id:'SCBDesktop_Flex_Desktop'},{id:'AppIcon_Image_calculator_1_0'}];
  const home=startContract({environment,shot,nodes,task});assert.equal(home.ready,true);assert.equal(home.preparation_policy,'home_twice_no_app_stop_v1');
  const manual=()=>startContract({environment,shot,nodes:[{id:'title',text:'页面A'}],task:{...task,reset:'manual'},manual:true});const first=manual();assert.equal(first.ready,true);assert.equal(first.assertions.length,0);
  const other=startContract({environment,shot,nodes:[{id:'title',text:'页面B'}],task:{...task,reset:'manual'},manual:true});assert.notEqual(first.comparison_key,other.comparison_key);assert.equal(first.comparison_key,manual().comparison_key);
});

test('results support new batch scopes and keep protocols, revisions and limits in separate comparison groups',()=>{
  const run={id:'r1',batch_id:'b1',case_id:'t',case_revision:1,instruction:'task',framework_id:'f',framework:{version:'v'},service_id:'s',service:{model:'m'},evaluation_protocol:'v8',source_versions:{source:'a'},startpoint:{contract:{comparison_key:'same'}},limits:{max_requests:15},result:{same_start:{same:true},model_usage:{requests:2,known_input_tokens:10,known_output_tokens:3,unknown_usage_requests:1}},review:{verdict:'partial'}};
  const rows=[run,{...run,id:'r2'},{...run,id:'r3',evaluation_protocol:'v7'},{...run,id:'r4',case_revision:2},{...run,id:'r5',limits:{max_requests:20}},{...run,id:'diagnostic',evaluation_exclusion:'bridge'}];
  assert.equal(filterPhoneRuns(rows,{evaluation:'b1'}).length,6);assert.equal(filterPhoneRuns(rows,{evaluation:'historical'}).length,0);
  const groups=comparablePhoneGroups(rows);assert.equal(groups.length,4);assert.equal(groups[0].length,2);assert.equal(groups.flat().length,5);
  assert.equal(comparablePhoneGroups([{...run,result:{...run.result,same_start:{same:false}}}]).length,0);
  const totals=phoneResultTotals(rows.slice(0,2));assert.equal(totals.verdicts.partial,2);assert.equal(totals.requests,4);assert.equal(totals.knownTokens,26);assert.equal(totals.unknown,2);
  assert.equal(comparablePhoneGroups([{...run,device_info:{app:{version_name:'1'}}},{...run,device_info:{app:{version_name:'2'}}}]).length,2);
});

test('task startpoint configuration persists independently and is frozen for a batch without a test-page override',async t=>{
  const root=await temporary(t),{lab,calls}=fixtureLab(root),task=lab.tasks.save({...definition,reset:'manual'}),first=await baseline(lab,task);
  assert.equal(lab.taskStart(task).id,first); // Existing valid captures remain usable.
  lab.configureTaskStart(task.id,{expected_revision:1,startpoint_id:first});
  const newer=await baseline(lab,task,'newer','start_00000000-0000-0000-0000-000000000002');
  const reopened=fixtureLab(root).lab;assert.equal(reopened.listTasks().find(t=>t.id===task.id).startpoint_id,first);assert.equal(reopened.tasks.get(task.id).revision,1);
  const batch=await lab.batch({framework_ids:['midscene'],service_ids:['a'],case_ids:[task.id]},settings);assert.equal(batch.baselines[task.id].id,first);lab.stopBatch(batch.id);await lab.batchCompletion;
  lab.configureTaskStart(task.id,{expected_revision:1,startpoint_id:null});assert.equal(lab.taskStart(task),null);
  await assert.rejects(lab.batch({framework_ids:['midscene'],service_ids:['a'],case_ids:[task.id]},settings),e=>e.status===409);
  lab.configureTaskStart(task.id,{expected_revision:1,startpoint_id:newer});assert.equal(lab.taskStart(task).id,newer);assert.equal(calls(),0);
});

test('a task rejects another task baseline, stale task revisions and stale configured startpoints',async t=>{
  const root=await temporary(t),{lab,calls}=fixtureLab(root),task=lab.tasks.save(definition),other=lab.tasks.save({...definition,name:'另一个任务'}),id=await baseline(lab,task);
  assert.throws(()=>lab.configureTaskStart(other.id,{expected_revision:1,startpoint_id:id}),e=>e.status===409);
  assert.throws(()=>lab.configureTaskStart(task.id,{expected_revision:0,startpoint_id:id}),e=>e.status===409);
  assert.throws(()=>lab.configureTaskStart(task.id,{expected_revision:1}),e=>e.status===400);
  lab.configureTaskStart(task.id,{expected_revision:1,startpoint_id:id});const edited=lab.tasks.save({expected_revision:1,name:'第二版'},task.id);
  assert.equal(lab.taskStart(edited),null);assert.throws(()=>lab.configureTaskStart(task.id,{expected_revision:2,startpoint_id:id}),e=>e.status===409);assert.equal(calls(),0);
});

test('single-run names and task names are frozen separately, and configured starts are resolved on the server',async t=>{
  const root=await temporary(t),{lab,calls}=fixtureLab(root),task=lab.tasks.save(definition),id=await baseline(lab,task);lab.configureTaskStart(task.id,{expected_revision:1,startpoint_id:id});
  const input={framework_id:'midscene',service_id:'a',case_id:task.id,name:'  首次计算器对比  '};
  await assert.rejects(lab.start({...input,name:'a'.repeat(121)},settings),e=>e.status===400);
  // This isolated root deliberately has no model settings DB or credentials.
  // The actual worker must stop before creating a device session or transport.
  const run=await lab.start(input,settings);await lab.children.get(run.id)?.completion;
  const snapshot=lab.snapshot(run.id);assert.equal(snapshot.name,'首次计算器对比');assert.equal(snapshot.task_name,task.name);assert.equal(snapshot.task.name,task.name);assert.equal(snapshot.startpoint_id,id);
  assert.equal(snapshot.state.status,'blocked');assert.equal(snapshot.result.model_usage.requests,0);assert.equal(snapshot.result.physical_actions,0);assert.equal(calls(),0);
  assert.equal(filterPhoneRuns([snapshot],{search:task.name}).length,1);assert.equal(filterPhoneRuns([snapshot],{search:'首次计算器对比'}).length,1);
  const unnamed=await lab.start({...input,name:' '},settings);await lab.children.get(unnamed.id)?.completion;assert.equal(lab.summary(unnamed.id).name,task.name);await lab.close();
});

test('task baseline API can select existing evidence while paused and never calls the phone',async t=>{
  const root=await temporary(t),{lab,calls}=fixtureLab(root),task=lab.tasks.get('HM-CALC-001'),id=await baseline(lab,task);
  const app=await createDebugServer({dataRoot:root,port:0,phoneLabOptions:{lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause.json'),deviceFactory:async()=>{throw Error('no hardware');}}});
  try{
    const post=async(route,data)=>fetch(app.url+'/api/phone-lab'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-UI':'1'},body:JSON.stringify(data)});await post('/pause',{});
    const selected=await post('/tasks/'+task.id+'/startpoint',{expected_revision:3,startpoint_id:id});assert.equal(selected.status,200);
    const tasks=await(await fetch(app.url+'/api/phone-lab/tasks')).json();assert.equal(tasks.find(t=>t.id===task.id).startpoint_id,id);assert.equal(tasks.find(t=>t.id===task.id).revision,3);
    assert.equal((await post('/tasks/'+task.id+'/startpoint',{expected_revision:2,startpoint_id:id})).status,409);assert.equal(calls(),0);
  }finally{await app.close();}
});

const startPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX8cAAAAASUVORK5CYII=','base64');
const homeTree={attributes:{id:'SCBDesktop_Flex_Desktop'},children:[{attributes:{id:'AppIcon_Image_settings_0_0',bounds:'[0,0][1,1]'}}]};
function captureFixture(lab,tree=homeTree){
  let resets=0,environments=0,captures=0;
  const nodes=(function walk(node){return [node.attributes,...(node.children??[]).flatMap(walk)];})(tree);
  lab.deviceFactory=async({evidence})=>({layout:async()=>{await writeFile(path.join(evidence.dir,'fixture-layout.json'),JSON.stringify(tree));return {nodes,tree,file:'fixture-layout.json'};},environment:async bundle=>{assert.equal(bundle,null);environments++;return {target_sha256:'fixture-device',device:{model:'fixture'},app:null};},capture:async()=>{captures++;return {asset:await evidence.image(startPng,'image/png','start'),width:1,height:1};},touch:{home:async()=>{resets++;}},command:async()=>{resets++;}});
  return ()=>({resets,environments,captures});
}

test('a current-state start only needs a name and never resets or launches an app',async t=>{
  const root=await temporary(t),{lab}=fixtureLab(root),counts=captureFixture(lab);
  for(const name of ['', ' ', 'a'.repeat(121)])await assert.rejects(lab.captureStart({named:true,name}),e=>e.status===400);
  await assert.rejects(lab.captureStart({named:true,name:'首页',reset:true}),e=>e.status===400);assert.deepEqual(counts(),{resets:0,environments:0,captures:0});
  const point=await lab.captureStart({named:true,name:'  手机首页  '});assert.equal(point.name,'手机首页');assert.equal(point.case_id,null);assert.equal(point.named,true);assert.equal(point.contract.ready,true);assert.equal(point.contract.named_start,true);assert.equal(point.contract.reset,'home');assert.deepEqual(counts(),{resets:0,environments:1,captures:1});
  const task=lab.tasks.save({name:'新的任务',instruction:'读取页面标题',acceptance:'真实截图有依据'});assert.equal(task.reset,'manual');
  lab.configureTaskStart(task.id,{expected_revision:1,startpoint_id:point.id});const edited=lab.tasks.save({expected_revision:1,name:'改名'},task.id);assert.equal(lab.taskStart(edited).id,point.id);
  const second=lab.tasks.save({name:'另一个任务',instruction:'读取标题',acceptance:'有图'});lab.configureTaskStart(second.id,{expected_revision:1,startpoint_id:point.id});assert.equal(lab.taskStart(second).id,point.id);
});

test('an old start can be reused by a different task without hardware or rewriting the original evidence',async t=>{
  const root=await temporary(t),{lab,calls}=fixtureLab(root),sourceTask=lab.tasks.get('HM-CALC-001'),id=await baseline(lab,sourceTask),dir=lab.directory('starts',id),evidence=new PhoneEvidence(dir);
  const source=JSON.parse(await readFile(path.join(dir,'start.json'),'utf8'));source.name='以前的手机首页';source.asset=await evidence.image(startPng,'image/png','start');source.layout_file='layout.json';source.contract.width=1;source.contract.height=1;await writeFile(path.join(dir,'layout.json'),JSON.stringify(homeTree));await writeFile(path.join(dir,'start.json'),JSON.stringify(source));
  const original=await readFile(path.join(dir,'start.json')),task=lab.tasks.save({name:'新任务',app:'淘宝',instruction:'打开淘宝读取标题',acceptance:'有真实依据'});
  const settings=await lab.selectTaskStart(task.id,{expected_revision:1,startpoint_id:id,reuse:true});assert.notEqual(settings.startpoint_id,id);
  const reused=lab.taskStart(task);assert.equal(reused.named,true);assert.equal(reused.name,source.name);assert.equal(reused.source_startpoint_id,id);assert.equal(reused.asset.sha256,source.asset.sha256);assert.equal(sha256((await lab.asset('starts',reused.id,reused.asset.id)).bytes),source.asset.sha256);assert.equal(reused.environment.app,null);
  assert.deepEqual(await readFile(path.join(dir,'start.json')),original);assert.equal(calls(),0);
});

test('named page comparison records actual metadata while detecting page changes',()=>{
  const args={environment:{target_sha256:'same-device',device:{model:'fixture'},app:{bundle:'original.app',version_name:'1'}},shot:{width:1,height:1},nodes:[{id:'title',text:'当前页',bounds:'[0,0][1,1]'}]};
  const first=namedStartContract(args),same=namedStartContract({...args,environment:{...args.environment,app:{bundle:'other.app',version_name:'2'}}}),other=namedStartContract({...args,nodes:[{id:'title',text:'另一个页面',bounds:'[0,0][1,1]'}]});
  assert.equal(first.comparison_key,same.comparison_key);assert.notEqual(first.comparison_key,other.comparison_key);assert.equal(first.manual,true);assert.equal(first.app,null);
});

test('named starts are checked automatically in a matrix and drift blocks without repeated operator configuration',async t=>{
  const root=await temporary(t),{lab}=fixtureLab(root);captureFixture(lab,{attributes:{id:'title',text:'起始页',bounds:'[0,0][1,1]'}});
  const point=await lab.captureStart({named:true,name:'应用起始页'}),task=lab.tasks.save({name:'任务',instruction:'读取标题',acceptance:'有依据'});lab.configureTaskStart(task.id,{expected_revision:1,startpoint_id:point.id});
  let checks=0,launches=0;lab.captureStart=async(input)=>{assert.equal(input.named,true);assert.equal(input.reset,false);checks++;return {id:'fixture-current',contract:{ready:true,comparison_key:checks===1?point.contract.comparison_key:'drift'}};};
  lab.start=async()=>{launches++;return {id:'fixture-run'};};lab.summary=()=>({state:{status:'ended'}});
  const batch=await lab.batch({framework_ids:['midscene'],service_ids:['a','b'],case_ids:[task.id]},settings);await lab.batchCompletion;
  assert.equal(checks,2);assert.equal(launches,1);assert.equal(lab.waitingBatches.size,0);assert.equal(batch.status,'blocked');assert.equal(batch.entries[1].status,'blocked_before_model');assert.equal(batch.pending_entry,undefined);
});
