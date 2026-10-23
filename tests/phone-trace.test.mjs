import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPhoneTrace,renderPhoneTrace} from '../web/phone-trace.mjs';
const hash='ab'.repeat(32);
const image=(id,role,action_id=null)=>({type:'image',asset:{id,file:'assets/'+id+'.jpeg',sha256:hash,width:100,height:200,role,action_id}});
const request=(id,assetId)=>({type:'model_request_start',id,request:{messages:[{role:'user',content:[{type:'image_url',image_url:{url:'asset:assets/'+assetId+'.jpeg#sha256='+hash}}]}]}});
const response=(id,content)=>({type:'model_response',id,http_status:200,usage:{input_tokens:20,output_tokens:10},response:{choices:[{message:{content}}]}});
const ordered=rows=>rows.map((e,i)=>({...e,seq:i+1}));

test('exact asset references distinguish duplicate images; before/after and pending replies remain separate',()=>{
  const es=ordered([image('initial','initial'),image('input1','model_input'),request('model_1','input1'),response('model_1','<planning>scroll the list</planning><log>scroll</log>'),image('before1','before','action_1'),{type:'action_intent',id:'action_1',name:'Scroll'},image('after1','after','action_1'),image('input2','model_input'),request('model_2','input2')]);
  const original=structuredClone(es),t=buildPhoneTrace(es),get=id=>t.images.find(i=>i.asset.id===id);
  assert.deepEqual(t.calls[0].submitted_asset_ids,['input1']);assert.deepEqual(t.calls[1].submitted_asset_ids,['input2']);
  assert.deepEqual(get('input2').links,[{call_id:'model_2',kind:'submitted'}]);assert.equal(t.calls[1].response,null);assert.deepEqual(t.calls[1].judgment,[]);
  assert.deepEqual(get('before1').links,[{call_id:'model_1',kind:'action_basis'}]);
  assert.ok(get('after1').links.some(l=>l.call_id==='model_1'&&l.kind==='action_basis'));
  assert.ok(get('after1').links.some(l=>l.call_id==='model_2'&&l.kind==='following_decision'));
  assert.deepEqual(es,original,'ledger is immutable');
});

test('no-action planning and completion replies are preserved and a final capture is never claimed as model input',()=>{
  const t=buildPhoneTrace(ordered([image('initial','initial'),image('input1','model_input'),request('model_1','input1'),response('model_1','<planning>replan</planning>'),image('input2','model_input'),request('model_2','input2'),response('model_2','<planning>completed</planning><action-type>Finished</action-type>'),image('final','final')]));
  assert.equal(t.calls.length,2);assert.equal(t.calls[0].actions.length,0);assert.equal(t.calls[1].actions.length,0);
  assert.equal(t.calls[1].judgment[0].text,'completed');
  assert.deepEqual(t.images.at(-1).links,[{call_id:'model_2',kind:'previous_response'}]);
  assert.ok(t.images[0].links.some(l=>l.call_id==='model_1'&&l.kind==='following_decision'));
});

test('unsubmitted inputs, preparation-only captures and missing replies never receive invented judgments',()=>{
  const t=buildPhoneTrace(ordered([image('initial','initial'),image('orphan','model_input')]));
  assert.equal(t.calls.length,0);assert.equal(t.images[0].links.length,0);assert.equal(t.images[1].links.length,0);
  assert.match(t.images[0].empty_reason,/没有模型请求/);
  const broken=buildPhoneTrace(ordered([image('input','model_input'),request('model_1','input-not-recorded'),response('model_1','done')]));
  assert.deepEqual(broken.calls[0].submitted_asset_ids,[]);assert.deepEqual(broken.images[0].links,[]);
});

test('explicit action linkage wins over temporal order and structured model fields retain their actual wording',()=>{
  const t=buildPhoneTrace(ordered([request('model_1','missing'),response('model_1','{"thought":"tap target","action":"tap"}'),request('model_2','missing'),response('model_2','other reply'),{type:'parsed',action:'tap',thinking:'actual parser output'},{type:'action_intent',id:'action_1',name:'Tap',model_request_id:'model_1'},image('after','after','action_1')]));
  assert.equal(t.calls[0].judgment[0].text,'tap target');assert.equal(t.calls[0].actions[0].association,'explicit');
  assert.equal(t.calls[1].actions.length,0);assert.equal(t.calls[1].parsed.length,1);
  assert.deepEqual(t.images[0].links,[{call_id:'model_1',kind:'action_basis'}]);
});

test('rendering keeps service content as inert text and makes complete replies and all-image navigation accessible',()=>{
  const run={id:'fixture',result:{final_asset:{id:'input'}},events:ordered([image('input','model_input'),request('model_1','input'),response('model_1','<planning><img src=x onerror=alert(1)></planning>')])};
  const html=renderPhoneTrace(run,{showAllImages:true});
  assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.match(html,/完整模型回复原文/);assert.match(html,/本图实际随该请求提交/);assert.match(html,/全部图像 1/);
});
