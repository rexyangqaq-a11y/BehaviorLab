import test from 'node:test';
import {syntheticHilog} from './helpers/phone-hilog-fixture.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PhoneLab} from '../src/phone-lab.mjs';
import {BUILTIN_HOME_START} from '../src/phone-startpoints.mjs';

async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'behavior-home-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const lab=new PhoneLab(root,{hilogFactory:syntheticHilog,lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause.json'),deviceFactory:async()=>{throw Error('No real phone allowed');}});
  return {root,lab};
}
const settings={services:[{id:'fixture',model:'qwen3.8-flash',protocol:'openai-chat'}]};
test('clean installation supplies a home recipe, not a fake verified screenshot; saving it while paused does not access hardware',async t=>{
  const {lab}=await fixture(t);lab.pause();
  const catalog=await lab.catalog({services:[]}),home=catalog.starts.find(s=>s.id===BUILTIN_HOME_START.id);
  assert.equal(home.builtin,true);assert.equal(home.contract.ready,false);assert.equal(home.asset,undefined);
  assert.equal(catalog.tasks.find(t=>t.id==='HM-CALC-001').startpoint_id,home.id);
  const task=lab.tasks.save({name:'custom',app:'当前应用',instruction:'观察页面',acceptance:'看见内容'});
  await lab.selectTaskStart(task.id,{expected_revision:1,startpoint_id:home.id,reuse:true});
  assert.equal(lab.listTasks().find(t=>t.id===task.id).startpoint_id,home.id);
  await assert.rejects(lab.batch({case_ids:[task.id],combinations:[{framework_id:'midscene',service_id:'fixture'}]},settings),e=>e.status===423);
});
test('a matrix captures the current phone once and resets before each unit; drift blocks remaining units before model dispatch',async t=>{
  const {lab}=await fixture(t);let captures=0,launches=0;
  const contracts=[];
  lab.captureStart=async(input,{taskSnapshot})=>{
    assert.equal(input.reset,true);assert.equal(input.named,true);assert.equal(taskSnapshot.reset,'home');assert.equal(taskSnapshot.bundle,null);
    const contract={ready:true,reset:'home',comparison_key:++captures===1?'current-device-home':'changed-device-or-home'};contracts.push(contract);
    return {id:'start_00000000-0000-0000-0000-000000000001',named:true,contract};
  };
  lab.start=async()=>{launches++;return {id:'fake-run'};};lab.summary=()=>({state:{status:'ended'}});
  const batch=await lab.batch({case_ids:['HM-CALC-001'],combinations:[{framework_id:'midscene',service_id:'fixture'},{framework_id:'autoglm',service_id:'fixture'}]},settings);await lab.batchCompletion;
  assert.equal(captures,2);assert.equal(launches,1);assert.equal(batch.status,'blocked');assert.equal(batch.baselines['HM-CALC-001'].contract.comparison_key,'current-device-home');assert.equal(batch.entries[1].status,'blocked_before_model');
});
test('single test with a home recipe refuses an unverified desktop before creating a worker',async t=>{
  const {lab}=await fixture(t);let calls=0;
  lab.captureStart=async()=>{calls++;return {contract:{ready:false,reset:'home'}};};
  await assert.rejects(lab.start({framework_id:'midscene',service_id:'fixture',case_id:'HM-CALC-001'},settings),e=>e.status===409);
  assert.equal(calls,1);assert.equal(lab.children.size,0);
});
