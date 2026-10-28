import test from 'node:test';
import assert from 'node:assert/strict';
import {PhoneConnection} from '../src/phone-connection.mjs';
import {createDebugServer} from '../src/web-server.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('connection is cached, explicit, deduplicated and never reveals target identifiers',async()=>{
  let calls=0,now=100000,finish;
  const connection=new PhoneConnection({resolve:()=> 'fixture-hdc',clock:()=>now,run:async(file,args,options)=>{calls++;assert.deepEqual(args,['list','targets']);assert.equal(options.shell,false);await new Promise(resolve=>finish=resolve);return {stdout:'private-device',stderr:''};}});
  assert.equal(connection.status().state,'unchecked');assert.equal(calls,0);
  const first=connection.check(),second=connection.check();finish();const [a,b]=await Promise.all([first,second]);
  assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.state,'connected');assert.equal(a.control,'unverified');assert.ok(!JSON.stringify(a).includes('private-device'));
  now+=16000;assert.equal(connection.status().stale,true);
});

test('empty, multiple, failed and unavailable transport states stay distinct from control permissions',async()=>{
  for(const [stdout,state] of [['[Empty]','disconnected'],['one\ntwo','multiple'],['','unverified'],['[Fail] access denied','unverified']]){
    const connection=new PhoneConnection({resolve:()=> 'fixture',run:async()=>({stdout,stderr:''})});
    assert.equal((await connection.check()).state,state);assert.equal(connection.status().control,'unverified');
  }
  assert.equal((await new PhoneConnection({resolve:()=>null}).check()).state,'missing_tool');
  assert.equal((await new PhoneConnection({resolve:()=> 'fixture',run:async()=>{throw Error('private-device');}}).check()).state,'error');
});

test('connection HTTP requires explicit empty same-origin POST and status GET never probes',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'behavior-connection-'));let calls=0;
  const connection=new PhoneConnection({resolve:()=> 'fixture',run:async()=>{calls++;return {stdout:'private-device',stderr:''};}});
  const app=await createDebugServer({dataRoot:root,port:0,phoneLabOptions:{connectionFactory:()=>connection,lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause'),deviceFactory:()=>{throw Error('No device actions allowed');}}});
  t.after(async()=>{await app.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('behavior-connection-'));await rm(root,{recursive:true,force:true});});
  const url=app.url+'/api/phone-lab',headers={'Content-Type':'application/json','X-Simulator-UI':'1'};
  assert.equal((await(await fetch(url)).json()).connection.state,'unchecked');assert.equal(calls,0);
  for(const body of ['null','[]','{"command":"anything"}'])assert.equal((await fetch(url+'/connection/check',{method:'POST',headers,body})).status,400);
  assert.equal((await fetch(url+'/connection/check',{method:'POST',body:'{}'})).status,403);assert.equal(calls,0);
  const response=await fetch(url+'/connection/check',{method:'POST',headers,body:'{}'});assert.equal(response.status,200);assert.equal((await response.json()).state,'connected');assert.equal(calls,1);
  assert.ok(!JSON.stringify((await(await fetch(url)).json()).connection).includes('private-device'));assert.equal(calls,1);
});
