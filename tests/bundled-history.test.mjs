import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PhoneLab} from '../src/phone-lab.mjs';
import {sha256} from '../src/phone-evidence.mjs';
import {ModelSettings} from '../src/model-settings.mjs';
import {resolvePhoneSelection} from '../web/phone-test-plan.mjs';
import {filterPhoneRuns} from '../web/phone-results.mjs';

test('bundled history is visible with local runs, reads original images and refuses mutations',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'behavior-history-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const archiveRoot=path.join(root,'archive'),id='phone_00000000-0000-0000-0000-000000000001',dir=path.join(archiveRoot,'runs',id);
  await mkdir(path.join(dir,'assets'),{recursive:true});
  const bytes=Buffer.from('fixture-image'),asset={id:'img_fixture',file:'assets/img_fixture.png',format:'png',sha256:sha256(bytes)};
  const put=(name,value)=>writeFile(path.join(dir,name),JSON.stringify(value));
  await writeFile(path.join(archiveRoot,'manifest.json'),JSON.stringify({records:[{run_id:id},{run_id:'../../outside'}],evaluation_id:'old-matrix'}));
  await put('input.json',{id,name:'historical fixture',service:{model:'qwen3.8-flash'},framework_id:'midscene'});
  await put('state.json',{status:'ended'});await put('review.json',{reviewer:'assistant',verdict:'partial'});
  await writeFile(path.join(dir,'events.jsonl'),JSON.stringify({seq:1,type:'image',asset})+'\n');await writeFile(path.join(dir,asset.file),bytes);
  const lab=new PhoneLab(path.join(root,'data'),{archiveRoot,lockPath:path.join(root,'lock'),deviceFactory:()=>{throw Error('No device allowed');}});
  const catalog=await lab.catalog({services:[]});assert.equal(catalog.runs.length,1);assert.equal(catalog.archive.runs,1);
  const snapshot=lab.snapshot(id);assert.equal(snapshot.record_origin,'bundled_history');assert.equal(snapshot.read_only,true);assert.equal(snapshot.review.verdict,'partial');assert.equal(snapshot.assets.length,1);
  assert.deepEqual((await lab.asset('runs',id,asset.id)).bytes,bytes);
  assert.throws(()=>lab.review(id,{verdict:'passed'}),e=>e.status===409);assert.throws(()=>lab.stop(id),e=>e.status===409);await assert.rejects(lab.bundle(id),e=>e.status===409);
  assert.deepEqual(await readdir(path.join(root,'data','.phone-lab','runs')),[]);
  assert.equal(JSON.parse(await readFile(path.join(dir,'review.json'),'utf8')).verdict,'partial');
  const local='phone_00000000-0000-0000-0000-000000000002',localDir=lab.directory('runs',local);await mkdir(localDir);await writeFile(path.join(localDir,'input.json'),JSON.stringify({id:local,name:'new local run'}));
  const all=(await lab.catalog({services:[]})).runs;assert.equal(all.length,2);assert.equal(filterPhoneRuns(all,{origin:'bundled_history'}).length,1);assert.equal(filterPhoneRuns(all,{origin:'local_run'})[0].id,local);
  await writeFile(path.join(dir,asset.file),'modified');await assert.rejects(lab.asset('runs',id,asset.id),e=>e.status===409);
});

test('saving a fresh Bailian service makes it selectable without assigning roles or calling models',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'behavior-service-'));
  const settings=new ModelSettings(root);t.after(async()=>{settings.close();await rm(root,{recursive:true,force:true});});
  const lab=new PhoneLab(root,{archiveRoot:path.join(root,'no-history'),lockPath:path.join(root,'lock')});
  assert.equal((await lab.catalog(settings.read())).services.length,0);
  settings.save({revision:0,bindings:{},services:[{id:'bailian',name:'百炼',provider:'qwen',protocol:'openai-chat',model:'qwen3.8-flash',base_url:'https://example.invalid/v1',auth:'api_key',api_key:'offline-fixture-only',timeout_ms:60000}]});
  const catalog=await lab.catalog(settings.read());assert.equal(catalog.services[0].family,'qwen3');assert.deepEqual(catalog.services[0].missing,[]);assert.equal(resolvePhoneSelection(catalog).service_id,'bailian');assert.ok(!JSON.stringify(catalog).includes('offline-fixture-only'));
});
