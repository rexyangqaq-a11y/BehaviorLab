import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {seedBundledPhoneTasks} from '../src/phone-bundled-tasks.mjs';import {PhoneLab} from '../src/phone-lab.mjs';import {createDebugServer} from '../src/web-server.mjs';
async function temporary(t){const dir=await mkdtemp(path.join(os.tmpdir(),'bundled-phone-task-'));t.after(async()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('bundled-phone-task-'));await rm(dir,{recursive:true,force:true});});return dir;}
test('clean install seeds the exact editable user task and generic Luoshu start without device or model calls',async t=>{
  const root=await temporary(t),result=seedBundledPhoneTasks(root);assert.equal(result.created.length,1);
  const lab=new PhoneLab(root,{deviceFactory:()=>{assert.fail('No device during seed');}});try{
    const task=lab.listTasks().find(x=>x.id===result.created[0]);assert.equal(task.name,'淘宝-浏览50个商品');assert.equal(task.revision,3);assert.equal(task.app,'淘宝');assert.equal(task.bundle,'com.taobao.taobao4hmos');assert.equal(task.startpoint_id,'builtin_home_luoshu');assert.equal(task.read_only,false);
    assert.deepEqual(lab.list('runs','input.json'),[]);assert.equal(seedBundledPhoneTasks(root).created.length,0);
  }finally{await lab.close();}
});
test('upgrade preserves edited or archived tasks and user-selected start binding byte-for-byte',async t=>{
  const root=await temporary(t),{created:[id]}=seedBundledPhoneTasks(root),file=path.join(root,'.phone-lab/tasks',id+'.json'),binding=path.join(root,'.phone-lab/task-startpoints.json');
  const task=JSON.parse(await readFile(file,'utf8'));task.instruction='user edited';task.revision=9;task.archived=true;await writeFile(file,JSON.stringify(task));await writeFile(binding,JSON.stringify({[id]:{startpoint_id:null,case_revision:9}}));
  const before=await readFile(file),prior=await readFile(binding);assert.deepEqual(seedBundledPhoneTasks(root).preserved,[id]);assert.deepEqual(await readFile(file),before);assert.deepEqual(await readFile(binding),prior);
});
test('unsafe IDs, private start snapshots and invalid bundle definitions fail before seeding a task',async t=>{
  const root=await temporary(t),bundle=JSON.parse(await readFile(new URL('../examples/bundled-phone-tasks.json',import.meta.url),'utf8')),manifest=path.join(root,'bundle.json');
  for(const change of [b=>b.entries[0].task.id='../bad',b=>b.entries[0].startpoint_id='start_private',b=>b.entries[0].task.bundle='bad; command']){
    const bad=structuredClone(bundle);change(bad);await writeFile(manifest,JSON.stringify(bad));assert.throws(()=>seedBundledPhoneTasks(root,manifest));
  }
});
test('interactive server startup exposes bundled task through real catalog API while library calls remain opt-in',async t=>{
  const root=await temporary(t),pausePath=path.join(root,'paused.json');await writeFile(pausePath,JSON.stringify({paused:true}));
  const app=await createDebugServer({port:0,dataRoot:root,seedBundledTasks:true,phoneLabOptions:{pausePath,deviceFactory:()=>assert.fail('No phone'),connectionFactory:()=>({status:()=>({state:'disconnected',count:0}),check:()=>assert.fail('No connection check')})}});
  try{const value=await(await fetch(app.url+'/api/phone-lab')).json();const task=value.tasks.find(x=>x.name==='淘宝-浏览50个商品');assert.equal(task.startpoint_id,'builtin_home_luoshu');assert.equal(value.runs.filter(r=>!r.read_only).length,0);assert.equal(value.services.length,0);}finally{await app.close();}
});
