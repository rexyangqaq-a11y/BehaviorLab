import test from 'node:test';import assert from 'node:assert/strict';
import {existsSync,realpathSync} from 'node:fs';import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';import {spawn,execFileSync} from 'node:child_process';import {createInterface} from 'node:readline';
import path from 'node:path';import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {groundingIssue,createGroundingRecovery,resizeGroundingImage} from '../src/phone-grounding-recovery.mjs';
import {createTrialTransport} from '../src/gui-trial-transport.mjs';
import {phonePython} from '../src/phone-runtime-paths.mjs';
import {processSteps} from '../web/phone-process.mjs';
import {controlledModelClient} from '../src/phone-model-network.mjs';
const project=path.resolve(import.meta.dirname,'..'),harmony=path.join(project,'integrations/midscene/node_modules/@midscene/harmony'),installed=existsSync(harmony),python=phonePython(project);
const image=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(image);image.writeUInt32BE(1292,16);image.writeUInt32BE(914,20);
const shot='data:image/png;base64,'+image.toString('base64');
const mid=box=>`<planning>offline grounding fixture</planning><action-type>Tap</action-type><action-param-json>${JSON.stringify({locate:{prompt:'fixture target',bbox_2d:box}})}</action-param-json>`;
const mobi=box=>JSON.stringify({reasoning:'offline',action:'click',parameters:{bbox:box}});
const auto=point=>`<think>offline</think><answer>do(action="Tap", element=${JSON.stringify(point)})</answer>`;
const raw=content=>({id:'fixture',choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:3}});
const initial=()=>({method:'POST',body:JSON.stringify({model:'fixture',messages:[{role:'system',content:'Keep task scope'},{role:'user',content:[{type:'text',text:'Task: complete the remaining items; prior steps already executed.'},{type:'image_url',image_url:{url:shot}}]}]})});
function harness({framework='midscene',replies=[mid([230,1050,850,1120]),mid([200,830,800,870])],maxRequests=10,effect=false,fetchImpl,capture,signal}={}){
  const events=[],requests=[],resizeCalls=[];let captures=0;
  const transport=createTrialTransport({baseUrl:'https://fixture.invalid/v1',model:'fixture',apiKey:'offline-only',maxRequests,maxImages:1,signal,record:e=>events.push(e),saveImage:async()=>({file:'synthetic.png',sha256:'fixture'}),fetchImpl:async(u,o)=>{requests.push(JSON.parse(o.body));return fetchImpl?fetchImpl(u,o):new Response(JSON.stringify(raw(replies.shift())));}});
  const session={screenSize:()=>({width:2584,height:1828}),effectState:()=>({effect_unknown:effect,pending_action_ids:[]}),capture:async(...args)=>{captures++;return capture?capture(...args):{bytes:image,width:2584,height:1828,asset:{id:'fresh-fixture'}};}};
  const recover=createGroundingRecovery({framework,transport,session,record:e=>events.push(e),signal,resize:async(b,w,h)=>{resizeCalls.push([w,h]);return b;}});
  return {recover,events,requests,resizeCalls,captures:()=>captures};
}

for(const [framework,bad,good]of [['midscene',mid([230,1050,850,1120]),mid([230,830,850,870])],['autoglm',auto([500,1120]),auto([500,850])],['mobiagent',mobi([230,1050,850,1120]),mobi([230,830,850,870])]]){
  test(framework+' regenerates invalid coordinates before native execution and audits both requests',async()=>{
    const h=harness({framework,replies:[bad,good]}),options=initial(),before=options.body;
    const response=await h.recover.fetch('https://fixture.invalid/v1/chat/completions',options);
    assert.equal((await response.json()).choices[0].message.content,good);assert.equal(options.body,before);
    assert.equal(h.requests.length,2);assert.equal(h.captures(),1);assert.deepEqual(h.resizeCalls,[[1292,914]]);
    assert.equal(h.events.filter(e=>e.type==='model_response').length,2);assert.equal(h.recover.summary().known_input_tokens,4);
    assert.equal(h.recover.summary().grounding_recovery.correction_responses,1);
    const correction=h.requests[1];assert.equal(correction.messages[0].content,'Keep task scope');
    assert.match(JSON.stringify(correction),/prior steps already executed/);assert.match(correction.messages.at(-1).content[0].text,/任何动作都没有执行/);
    assert.equal(JSON.stringify(correction).match(/data:image\//g).length,1);assert.equal(correction.messages.at(-2).content,bad);
    assert.equal(h.events.find(e=>e.type==='grounding_response_rejected').action_not_sent,true);
  });
}
test('two correction requests maximum, never clamp invalid coordinates or report success',async()=>{
  const bad=mid([230,1050,850,1120]),h=harness({replies:[bad,bad,bad]});
  await assert.rejects(h.recover.fetch('https://fixture.invalid/v1/chat/completions',initial()),/最多2次/);
  assert.equal(h.requests.length,3);assert.equal(h.captures(),2);assert.equal(h.recover.summary().grounding_recovery.exhausted_decisions,1);
  assert.equal(h.events.filter(e=>e.type==='grounding_recovery_returned').length,0);
});
test('request budget and unknown action effects prohibit correction',async()=>{
  for(const input of [{maxRequests:1},{effect:true}]){
    const h=harness(input);await assert.rejects(h.recover.fetch('https://fixture.invalid/v1/chat/completions',initial()),input.effect?/效果不确定/:/限额/);
    assert.equal(h.requests.length,1);assert.equal(h.captures(),0);
  }
});
test('HTTP errors, missing usage and network errors are never retried as grounding',async()=>{
  const scenarios=[async()=>new Response(JSON.stringify(raw(mid([0,1100,10,1200]))),{status:429}),async()=>new Response(JSON.stringify({choices:[{message:{content:mid([0,1100,10,1200])}}]})),async()=>{throw Error('network fixture');}];
  for(let i=0;i<scenarios.length;i++){
    const h=harness({fetchImpl:scenarios[i]});
    if(i===0)assert.equal((await h.recover.fetch('https://fixture.invalid/v1/chat/completions',initial())).status,429);
    else await assert.rejects(h.recover.fetch('https://fixture.invalid/v1/chat/completions',initial()));
    assert.equal(h.requests.length,1);assert.equal(h.captures(),0);
  }
});
test('Stop, screenshot failure and orientation changes cannot initiate a correction request',async()=>{
  for(const mode of ['stop','failure','orientation']){
    const control=new AbortController(),h=harness({signal:control.signal,capture:async()=>{
      if(mode==='stop')control.abort(Error('user stop'));if(mode==='failure')throw Error('capture failed');
      return {bytes:image,width:1828,height:2584,asset:{id:'synthetic'}};
    }});
    await assert.rejects(h.recover.fetch('https://fixture.invalid/v1/chat/completions',initial()));assert.equal(h.requests.length,1);
  }
});
test('only declared geometry is interpreted; ordinary text, finish, permissions and malformed XML are left to native code',()=>{
  for(const content of ['<planning>bbox_2d: [0,1050,1,1120]</planning>','<action-param-json>{broken}</action-param-json>','<complete>done</complete>'])assert.equal(groundingIssue('midscene',content),null);
  assert.equal(groundingIssue('autoglm','finish(message="item [1200,1300]")'),null);
  assert.equal(groundingIssue('autoglm',`do(action="Type", text="element=[1500,500], start=[1500,500]")`),null);
  assert.equal(groundingIssue('mobiagent',JSON.stringify({action:'done',parameters:{message:'1050'}})),null);
  assert.equal(groundingIssue('mobiagent',JSON.stringify({action:'input',parameters:{text:'bbox [1050,1200]',bbox:[0,1050,10,1200]}})),null);
  assert.ok(groundingIssue('midscene',mid([850,830,230,870])));assert.ok(groundingIssue('mobiagent',JSON.stringify({action:'swipe',parameters:{start_coords:[500,-2],end_coords:[500,900]}})));
  assert.equal(groundingIssue('midscene',mid([0,0,1000,1000])),null);
});
test('valid reply is returned unchanged without capture, extra requests or recovery',async()=>{
  const good=mid([230,830,850,870]),h=harness({replies:[good]});assert.equal((await(await h.recover.fetch('https://fixture.invalid/v1/chat/completions',initial())).json()).choices[0].message.content,good);
  assert.equal(h.requests.length,1);assert.equal(h.captures(),0);assert.equal(h.recover.summary().grounding_recovery.correction_requests,0);
});
test('recovery diagnostics appear in the process timeline without being counted as device actions',()=>{
  const events=['grounding_response_rejected','grounding_recovery_requested','grounding_recovery_returned','grounding_recovery_exhausted'].map((type,i)=>({type,seq:i+1,reason:'fixture'}));
  const {steps}=processSteps({events});assert.equal(steps.length,4);assert.ok(steps.every(s=>s.kind==='event'));assert.match(steps[1].title,/重新定位/);
});
test('pinned Midscene codec rejects the recorded box and accepts the regenerated box at the unchanged input size',{skip:!installed},()=>{
  const require=createRequire(path.join(realpathSync(harmony),'package.json')),core=path.dirname(require.resolve('@midscene/core'));
  const {createLocateResultCodec}=require(path.join(core,'ai-model/shared/model-locate-result/factory.js'));
  const codec=createLocateResultCodec({coordinates:{shape:'bbox',order:'xy',normalizedBy:1000}}),context={preparedSize:{width:1292,height:914}};
  assert.throws(()=>codec.toPixelResult([230,1050,850,1120],context),/normalized range/);
  const fixed=codec.toPixelResult([230,830,850,870],context);assert.ok(fixed.center[0]<1292&&fixed.center[1]<914);
});

test('actual HarmonyAgent keeps its native planner and executes only the regenerated Tap',{skip:!installed||!existsSync(python),timeout:20000},async()=>{
  const {HarmonyAgent,HarmonyDevice}=await import(pathToFileURL(path.join(harmony,'dist/es/index.mjs')).href);
  const bytes=execFileSync(python,['-I','-c','from PIL import Image;import io,sys;b=io.BytesIO();Image.new("RGB",(64,64)).save(b,format="PNG");sys.stdout.buffer.write(b.getvalue())'],{windowsHide:true});
  const replies=[mid([230,1050,850,1120]),mid([200,200,800,800]),'<planning>fixture complete</planning><complete success="true">offline done</complete>'];
  let calls=0,actions=0,captures=0;const events=[];
  const base=createTrialTransport({baseUrl:'https://fixture.invalid/v1',model:'fixture',apiKey:'fixture',maxRequests:5,record:e=>events.push(e),saveImage:async()=>({file:'synthetic.png',sha256:'fixture'}),fetchImpl:async()=>{calls++;assert.ok(replies.length,'unexpected SDK retry');return new Response(JSON.stringify(raw(replies.shift())),{headers:{'Content-Type':'application/json'}});}});
  const recover=createGroundingRecovery({framework:'midscene',transport:base,record:e=>events.push(e),session:{screenSize:()=>({width:64,height:64}),effectState:()=>({effect_unknown:false}),capture:async()=>{captures++;return {bytes,width:64,height:64,asset:{id:'synthetic'}};}}});
  const device=new HarmonyDevice('offline-fixture-not-connected',{});device.getHdc=async()=>{throw Error('HDC forbidden in offline test');};device.size=async()=>({width:64,height:64});device.describe=()=> 'Offline synthetic screen';device.screenshotBase64=async()=> 'data:image/png;base64,'+bytes.toString('base64');device.destroy=async()=>{};
  device.tapPoint=async point=>{actions++;assert.ok(point.x>=0&&point.x<64&&point.y>=0&&point.y<64);};
  const agent=new HarmonyAgent(device,{generateReport:false,persistExecutionDump:false,autoPrintReportMsg:false,cache:false,replanningCycleLimit:3,waitAfterAction:0,screenshotShrinkFactor:2,
    modelConfig:{MIDSCENE_MODEL_NAME:'fixture',MIDSCENE_MODEL_API_KEY:'fixture',MIDSCENE_MODEL_BASE_URL:'https://fixture.invalid/v1',MIDSCENE_MODEL_FAMILY:'qwen3',MIDSCENE_MODEL_STREAM_MODE:'non-stream',MIDSCENE_MODEL_RETRY_COUNT:0},createOpenAIClient:async client=>controlledModelClient(client,{fetch:recover.fetch})});
  try{await agent.aiAct('Tap the fixture target once and then finish',{deepThink:false});assert.equal(calls,3);assert.equal(actions,1);assert.equal(captures,1);assert.equal(recover.summary().grounding_recovery.correction_responses,1);}finally{await agent.destroy();}
});

for(const framework of ['autoglm','mobiagent'])test('actual '+framework+' native loop executes only regenerated action, not the invalid action',{skip:!existsSync(python)||!existsSync(path.join(project,'.runtime/frameworks/Open-AutoGLM')),timeout:25000},async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'phone-grounding-'));
  t.after(async()=>{assert.ok(path.basename(root).startsWith('phone-grounding-'));assert.equal(path.dirname(root),os.tmpdir());await rm(root,{recursive:true,force:true});});
  const bytes=execFileSync(python,['-I','-c','from PIL import Image;import io,sys;b=io.BytesIO();Image.new("RGB",(64,64)).save(b,format="PNG");sys.stdout.buffer.write(b.getvalue())'],{windowsHide:true});
  const replies=framework==='autoglm'?[auto([500,1120]),auto([500,500]),'finish(message="fixture done")']:[mobi([230,1050,850,1120]),mobi([200,200,800,800]),JSON.stringify({reasoning:'offline fixture complete',action:'done',parameters:{status:'success',message:'fixture done'}})];
  const events=[];let calls=0,actions=0,captures=0,done;
  const base=createTrialTransport({baseUrl:'https://fixture.invalid/v1',model:'fixture',apiKey:'fixture',maxRequests:5,record:e=>events.push(e),saveImage:async()=>({file:'synthetic.png',sha256:'fixture'}),fetchImpl:async()=>{calls++;return new Response(JSON.stringify(raw(replies.shift())));}});
  const recover=createGroundingRecovery({framework,transport:base,record:e=>events.push(e),session:{screenSize:()=>({width:64,height:64}),effectState:()=>({effect_unknown:false}),capture:async()=>{captures++;return {bytes,width:64,height:64,asset:{id:'synthetic'}};}}});
  const child=spawn(python,['-I',path.join(project,'integrations/phone-frameworks.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});child.stderr.resume();t.after(()=>child.kill());const exit=new Promise(resolve=>child.once('exit',resolve));
  child.stdin.write(JSON.stringify({project,framework,model:'fixture',app:'fixture',task:'Offline recovery fixture',data_dir:root,max_actions:3,max_steps:3,max_output_tokens:128})+'\n');
  for await(const line of createInterface({input:child.stdout})){
    if(line.startsWith('@PHONE_DONE@')){done=JSON.parse(line.slice(12));continue;}if(!line.startsWith('@PHONE_RPC@'))continue;
    const m=JSON.parse(line.slice(11));let result=true,error;
    try{
      if(m.method==='capture')result={width:64,height:64,base64:bytes.toString('base64')};if(m.method==='current_app')result='fixture';if(m.method==='layout')result={attributes:{},children:[]};
      if(m.method==='action'){actions++;assert.equal(m.args.name,'tap');assert.ok(m.args.param.x>=0&&m.args.param.x<64);assert.ok(m.args.param.y>=0&&m.args.param.y<64);}
      if(m.method==='model')result=await(await recover.fetch('https://fixture.invalid/v1/chat/completions',{method:'POST',body:JSON.stringify(m.args.body)})).json();
    }catch(e){error=e.message;}
    child.stdin.write(JSON.stringify({id:m.id,result,error})+'\n');
  }
  assert.equal(await exit,0,JSON.stringify(done));assert.equal(done?.error,undefined);assert.equal(calls,3);assert.equal(actions,1);assert.equal(captures,1);
  assert.equal(events.filter(e=>e.type==='grounding_response_rejected').length,1);
});
