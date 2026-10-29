import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,realpathSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import path from 'node:path';import os from 'node:os';
import {normalizePhoneLimits} from '../src/phone-lab-catalog.mjs';
import {limitReached,scheduleDeadline} from '../src/phone-execution-limits.mjs';
import {createTrialTransport} from '../src/gui-trial-transport.mjs';
import {createPhoneModelNetwork,controlledModelClient} from '../src/phone-model-network.mjs';
import {phonePython} from '../src/phone-runtime-paths.mjs';
import {ModelSettings} from '../src/model-settings.mjs';
const project=path.resolve(import.meta.dirname,'..'),harmony=path.join(project,'integrations/midscene/node_modules/@midscene/harmony'),installed=existsSync(harmony),python=phonePython(project);
const message=text=>({model:'fixture',messages:[{role:'user',content:[{type:'text',text},{type:'image_url',image_url:{url:'data:image/jpeg;base64,ZmFrZQ=='}}]}]});
const success=()=>JSON.stringify({id:'fixture',object:'chat.completion',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'offline fixture'}}],usage:{prompt_tokens:1,completion_tokens:1}});
const transport=extra=>createTrialTransport({baseUrl:'https://fixture.invalid/v1',model:'fixture',apiKey:'fixture-only',record:async()=>{},saveImage:async()=>({file:'synthetic.jpeg',sha256:'synthetic'}),...extra});
async function temp(t){const root=await mkdtemp(path.join(os.tmpdir(),'phone-long-task-'));t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('phone-long-task-'));await rm(root,{recursive:true,force:true});});return root;}

test('new tests default to unlimited and accept values above every old task ceiling',()=>{
  const defaults=normalizePhoneLimits();for(const k of ['max_requests','max_steps','max_actions','max_repeated_actions','max_seconds','request_timeout_seconds','max_output_tokens','max_payload_bytes','max_text_chars','max_images'])assert.equal(defaults[k],null);
  const large={max_requests:100000,max_steps:100000,max_actions:100000,max_repeated_actions:10000,max_seconds:7776000,request_timeout_seconds:7200,max_output_tokens:262144};
  const value=normalizePhoneLimits(large);for(const k in large)assert.equal(value[k],large[k]);
  assert.equal(normalizePhoneLimits({max_actions:0}).max_actions,null);assert.equal(normalizePhoneLimits({max_actions:''}).max_actions,null);
  for(const value of [-1,1.1,Infinity,'100',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>normalizePhoneLimits({max_actions:value}),/max_actions/);
  assert.equal(limitReached(1000000,null),false);assert.equal(limitReached(9,10),false);assert.equal(limitReached(10,10),true);
});

test('long explicit deadlines use timer chunks while unlimited deadlines never arm a timer',()=>{
  let now=0,next,expired=0;const waits=[],canceled=[];const deps={clock:()=>now,schedule:(fn,ms)=>{next=fn;waits.push(ms);return waits.length;},cancel:id=>canceled.push(id)};
  scheduleDeadline(()=>assert.fail('unlimited expired'),null,deps)();assert.deepEqual(waits,[]);
  const stop=scheduleDeadline(()=>expired++,3000000000,deps);assert.equal(waits[0],2147483647);now=2147483647;next();assert.equal(waits[1],852516353);now=3000000000;next();assert.equal(expired,1);stop();
  assert.ok(waits.every(ms=>ms>0&&ms<=2147483647));
});

test('unlimited transport exceeds 60 requests, 90k context, two images and 2MiB without injecting output caps',async()=>{
  let calls=0;const t=transport({maxRequests:null,maxOutputTokens:null,maxTextChars:null,maxImages:null,maxPayloadBytes:null,requestTimeoutMs:null,fetchImpl:async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(Object.hasOwn(body,'max_tokens'),false);assert.equal(Object.hasOwn(body,'max_completion_tokens'),false);return new Response(success());}});
  for(let i=0;i<65;i++){
    const body=message('request '+i);body.max_tokens=512;body.max_completion_tokens=4096;
    if(i===0){body.messages[0].content[0].text='context '.repeat(15000);const url='data:image/jpeg;base64,'+Buffer.alloc(800000).toString('base64');body.messages[0].content.push(...Array.from({length:2},()=>({type:'image_url',image_url:{url}})));assert.ok(Buffer.byteLength(JSON.stringify(body))>2*1024*1024);}
    await t.fetch('https://fixture.invalid/v1/chat/completions',{method:'POST',body:JSON.stringify(body)});
  }
  assert.equal(calls,65);assert.equal(t.summary().requests,65);
});

test('actual model client accepts a response after 31 seconds despite the SDK timeout being 1ms',{skip:!installed,timeout:45000},async()=>{
  const require=createRequire(path.join(realpathSync(harmony),'package.json')),OpenAI=require('openai').default;
  let calls=0;const server=createServer((req,res)=>{calls++;req.resume();const timer=setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(success());},31050);res.once('close',()=>clearTimeout(timer));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl='http://127.0.0.1:'+server.address().port+'/v1',network=createPhoneModelNetwork(project),events=[],control=new AbortController();
  try{
    const t=transport({baseUrl,signal:control.signal,requestTimeoutMs:null,maxRequests:null,fetchImpl:network.fetch,record:async e=>events.push(e)});
    const client=controlledModelClient(new OpenAI({baseURL:baseUrl,apiKey:'offline-fixture-only',timeout:1}),{fetch:t.fetch,signal:control.signal});
    const started=Date.now(),reply=await client.chat.completions.create(message('slow fixture'));
    assert.equal(reply.choices[0].message.content,'offline fixture');assert.ok(Date.now()-started>=31000);assert.equal(calls,1);assert.equal(events.at(-1).type,'model_response');
  }finally{await network.close();await new Promise(resolve=>server.close(resolve));}
});

test('finite request deadlines cover the body and manual Stop still cancels an unlimited wait',{skip:!installed},async()=>{
  let calls=0;const server=createServer((req,res)=>{calls++;req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();const timer=setTimeout(()=>res.end(success()),1000);res.once('close',()=>clearTimeout(timer));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl='http://127.0.0.1:'+server.address().port+'/v1',network=createPhoneModelNetwork(project);
  try{for(const limited of [true,false]){
    const control=new AbortController(),t=transport({baseUrl,requestTimeoutMs:limited?30:null,signal:control.signal,fetchImpl:network.fetch});
    const pending=t.fetch(baseUrl+'/chat/completions',{method:'POST',body:JSON.stringify(message('cancel '+limited))});
    const timer=!limited?setTimeout(()=>control.abort('user_stop'),30):null;
    try{await assert.rejects(pending,/Model transport stopped/);assert.equal(t.summary().requests,1);assert.equal(t.summary().unknown_usage_requests,1);}finally{clearTimeout(timer);}
  }assert.equal(calls,2);}finally{await network.close();await new Promise(resolve=>server.close(resolve));}
});

test('model timeout accepts unlimited and more than five minutes without modifying stored credentials',async t=>{
  const root=await temp(t),settings=new ModelSettings(root);try{
    const service={id:'fixture',name:'Fixture',provider:'custom',protocol:'openai-chat',model:'fixture',base_url:'https://fixture.invalid/v1',auth:'api_key',api_key:'offline-only-key',timeout_ms:0};
    settings.save({revision:0,services:[service],bindings:{}});const encrypted=settings.db.prepare('SELECT api_key FROM model_credentials').get().api_key;
    delete service.api_key;service.timeout_ms=7200000;const saved=settings.save({revision:1,services:[service],bindings:{}});assert.equal(saved.services[0].timeout_ms,7200000);assert.equal(settings.db.prepare('SELECT api_key FROM model_credentials').get().api_key,encrypted);
  }finally{settings.close();}
});

for(const [framework,steps]of [['autoglm',101],['mobiagent',61]])test('actual '+framework+' loop exceeds its native step default with unlimited settings',{skip:!existsSync(python)||!existsSync(path.join(project,'.runtime/frameworks/Open-AutoGLM')),timeout:60000},async t=>{
  const root=await temp(t),image=execFileSync(python,['-I','-c','from PIL import Image;import io,base64;b=io.BytesIO();Image.new("RGB",(64,64)).save(b,format="PNG");print(base64.b64encode(b.getvalue()).decode())'],{windowsHide:true,encoding:'utf8'}).trim();
  const child=spawn(python,['-I',path.join(project,'integrations/phone-frameworks.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});child.stderr.resume();t.after(()=>child.kill());let calls=0,actions=0,done;
  const exited=new Promise(resolve=>child.once('exit',resolve)),timer=setTimeout(()=>child.kill(),55000);
  child.stdin.write(JSON.stringify({project,framework,model:'fixture',app:'fixture',task:'Long offline contract only',data_dir:root,max_actions:null,max_steps:null,max_output_tokens:null})+'\n');
  try{for await(const line of createInterface({input:child.stdout})){
    if(line.startsWith('@PHONE_DONE@')){done=JSON.parse(line.slice(12));continue;}if(!line.startsWith('@PHONE_RPC@'))continue;
    const m=JSON.parse(line.slice(11));let result=true;
    if(m.method==='capture')result={width:64,height:64,base64:image};if(m.method==='current_app')result='fixture';if(m.method==='layout')result={attributes:{},children:[]};if(m.method==='action')actions++;
    if(m.method==='model'){
      assert.equal(Object.hasOwn(m.args.body,'max_tokens'),false);const finish=calls++>=steps;
      const content=framework==='autoglm'?(finish?'finish(message="long fixture done")':'do(action="Tap", element=[500,500])'):JSON.stringify({reasoning:'offline',action:finish?'done':'click',parameters:finish?{status:'success',message:'done'}:{bbox:[100,100,200,200]}});
      result={choices:[{message:{content}}]};
    }
    child.stdin.write(JSON.stringify({id:m.id,result})+'\n');
  }
  assert.equal(await exited,0);assert.equal(done?.error,undefined);assert.equal(calls,steps+1);assert.equal(actions,steps);
  }finally{clearTimeout(timer);child.kill();}
});
