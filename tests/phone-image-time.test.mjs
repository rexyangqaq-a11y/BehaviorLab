import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {phoneImageTime} from '../web/phone-image-time.mjs';
import {renderPhoneTrace} from '../web/phone-trace.mjs';
import {PhoneEvidence,sha256} from '../src/phone-evidence.mjs';
const start={seq:2,type:'execution_start',started_at:'2026-10-29T02:00:00.000Z',at:'2026-10-29T02:00:00.100Z'};
test('image time shows milliseconds and execution offset, with honest preparation and missing-time states',()=>{
  const image={id:'a',at:'2026-10-29T02:00:01.250Z',phase:'execution'},run={events:[start,{seq:3,type:'image',asset:image}]};
  const value=phoneImageTime(run,image);assert.match(value.text,/10:00:01\.250/);assert.equal(value.elapsed_ms,1250);assert.match(value.text,/测试 \+1\.250s/);
  const old={id:'old'},history={events:[start,{type:'image',seq:4,at:'2026-10-29T02:00:02.005Z',asset:old}]};assert.equal(phoneImageTime(history,old).elapsed_ms,2005);
  assert.match(phoneImageTime({events:[{seq:1,type:'image',asset:{id:'p',phase:'preparation',at:'2026-10-29T01:59:59Z'}},start]},{id:'p',phase:'preparation',at:'2026-10-29T01:59:59Z'}).text,/测试准备阶段/);
  assert.match(phoneImageTime({created_at:'2026-10-29T02:00:00Z'},{id:'missing'}).text,/截图时间未记录.*测试用时未记录/);
});
test('trace timestamps appear on every image while original image bytes and hashes remain unchanged',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'phone-image-time-'));try{
    const evidence=new PhoneEvidence(root,{phase:'execution'}),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGDkAAAAASUVORK5CYII=','base64');evidence.testStartedAt=Date.parse(start.started_at);
    const asset=await evidence.image(bytes,'image/png','after',{capturedAt:'2026-10-29T02:00:01.250Z'});assert.equal(asset.test_elapsed_ms,1250);assert.equal(asset.sha256,sha256(bytes));assert.deepEqual(await readFile(path.join(root,asset.file)),bytes);
    const html=renderPhoneTrace({id:'fixture',events:[start,{seq:3,type:'image',asset}]});assert.ok((html.match(/10:00:01\.250/g)??[]).length>=2);assert.match(html,/测试 \+1\.250s/);
  }finally{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('phone-image-time-'));await rm(root,{recursive:true,force:true});}
});
