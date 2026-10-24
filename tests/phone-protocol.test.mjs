import test from 'node:test';import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';import {createInterface} from 'node:readline';
import {phonePython} from '../src/phone-runtime-paths.mjs';
const project=fileURLToPath(new URL('../',import.meta.url)),python=phonePython(project),installed=python&&existsSync(python)&&existsSync(path.join(project,'.runtime/frameworks/Open-AutoGLM/phone_agent/agent.py'));
test('strict protocol validates literal actions without changing native conversion or input messages',{skip:!installed},()=>{
  const script=`import sys;sys.path.insert(0,sys.argv[1]);from phone_protocol import *
messages=[{'role':'system','content':'original'}];out=with_coordinate_contract(messages,'autoglm');assert messages[0]['content']=='original';assert '0–1000' in out[0]['content'];assert with_coordinate_contract(out,'autoglm')==out
parse=lambda text:{'_metadata':'finish' if text.startswith('finish') else 'do'}
for text in ['do(action="Tap", element=[0,999])','finish(message="done")']:validate_autoglm_action(text,parse)
for text in ['Only thinking', 'do(action="Tap", element=[-1,5])', 'do(action="Tap", element=[1500,5])','do(action="Tap", element=[True,5])','finish(message="")','finish(message="done");do(action="Back")']:
 try:validate_autoglm_action(text,parse)
 except ValueError:continue
 raise AssertionError('malformed action accepted')
print('strict protocol passed')`;
  assert.match(execFileSync(python,['-I','-c',script,path.join(project,'integrations')],{windowsHide:true,encoding:'utf8'}),/passed/);
});
for(const [name,reply] of [['thinking_only','<think>Plan to open settings.</think>'],['malformed','do(action="Tap", element=[500,500]'],['wrong_units','do(action="Tap", element=[1500,500])']])test('actual AutoGLM loop rejects '+name+' without synthetic finish or a device action',{skip:!installed},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'phone-protocol-test-'));let child;
  try{
    const image=execFileSync(python,['-I','-c','from PIL import Image;import io,base64;b=io.BytesIO();Image.new("RGB",(64,64)).save(b,format="PNG");print(base64.b64encode(b.getvalue()).decode())'],{windowsHide:true,encoding:'utf8'}).trim();
    child=spawn(python,['-I',path.join(project,'integrations/phone-frameworks.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});child.stderr.resume();let calls=0,actions=0,rejected=0,done;
    const exit=new Promise(resolve=>child.once('exit',resolve)),timer=setTimeout(()=>child.kill(),15000);
    child.stdin.write(JSON.stringify({project,framework:'autoglm',model:'fixture',app:'fixture',task:'protocol fixture',data_dir:dir,max_actions:3,max_output_tokens:128})+'\n');
    for await(const line of createInterface({input:child.stdout})){
      if(line.startsWith('@PHONE_DONE@')){done=JSON.parse(line.slice(12));continue;}if(!line.startsWith('@PHONE_RPC@'))continue;
      const m=JSON.parse(line.slice(11));let result=true;if(m.method==='capture')result={base64:image,width:64,height:64};if(m.method==='current_app')result='fixture';if(m.method==='model'){calls++;result={choices:[{message:{content:reply}}]};}if(m.method==='action')actions++;if(m.method==='protocol_rejected')rejected++;
      child.stdin.write(JSON.stringify({id:m.id,result})+'\n');
    }
    const code=await exit;clearTimeout(timer);assert.equal(code,0);assert.equal(calls,1);assert.equal(actions,0);assert.equal(rejected,1);assert.equal(done.result.native_result.success,false);assert.equal(done.result.native_result.action,null);
  }finally{child?.kill();assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('phone-protocol-test-'));await rm(dir,{recursive:true,force:true});}
});
