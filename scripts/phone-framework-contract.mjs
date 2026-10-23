import {phonePython} from '../src/phone-runtime-paths.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url));
await mkdir(path.join(project,'output'),{recursive:true});
const python=phonePython(project);
const fixtureImage=execFileSync(python,['-I','-c','from PIL import Image;import io,base64; b=io.BytesIO();Image.new("RGB",(64,64),"white").save(b,format="PNG");print(base64.b64encode(b.getvalue()).decode())'],{windowsHide:true,encoding:'utf8'}).trim();
const results=[];
// Exercise each actual installed native loop once with a synthetic image and an
// injected provider completion. No model/network/physical device is invoked.
for(const framework of ['autoglm','mobiagent']){
  const dir=await mkdtemp(path.join(os.tmpdir(),'phone-native-contract-'));
  const child=spawn(python,['-I',path.join(project,'integrations/phone-frameworks.py')],{cwd:project,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stderr='',done,calls=0,actions=0,jpegMime=true;const actionRecords=[];child.stderr.setEncoding('utf8');child.stderr.on('data',b=>{stderr+=b;});
  const code=new Promise(resolve=>child.once('exit',resolve));
  child.stdin.write(JSON.stringify({project,framework,model:'fixture',app:'离线测试应用',task:'离线中文传输检查：不连接手机或模型。',data_dir:dir,max_actions:8,max_output_tokens:512})+'\n');
  for await(const line of createInterface({input:child.stdout})){
    if(line.startsWith('@PHONE_DONE@')){done=JSON.parse(line.slice(12));continue;}
    if(!line.startsWith('@PHONE_RPC@'))continue;
    const message=JSON.parse(line.slice(11));let result=true;
    if(message.method==='capture')result={width:64,height:64,base64:fixtureImage};
    if(message.method==='model'){
      if(framework==='autoglm')for(const m of message.args.body.messages)if(Array.isArray(m.content))for(const part of m.content)if(part.type==='image_url')jpegMime&&=/^data:image\/jpeg;base64,\/9j\//.test(part.image_url.url);
      const auto=['do(action="Tap", element=[500,500])','do(action="Type", text="原生中文输入")','do(action="Swipe", start=[500,800], end=[500,200])','do(action="Back")','finish(message="离线完成")'];
      const mobi=[{action:'click',parameters:{bbox:[100,100,200,200]}},{action:'input',parameters:{text:'原生中文输入'}},{action:'swipe',parameters:{direction:'UP',start_coords:[500,800],end_coords:[500,200]}},{action:'press_back',parameters:{}},{action:'done',parameters:{status:'success',message:'离线完成'}}];
      const content=framework==='autoglm'?'<think>根据测试图执行中文离线动作。</think>\n<answer>'+auto[calls]+'</answer>':JSON.stringify({reasoning:'根据当前图选择动作，保留中文和引号。',...mobi[calls]},null,2);calls++;result={choices:[{message:{content}}],fixture_metadata:'中文：完整JSON元数据'};
    }
    if(message.method==='layout')result={attributes:{},children:[]};
    if(message.method==='current_app')result='系统桌面';
    if(message.method==='action'){actions++;actionRecords.push(message.args);}
    child.stdin.write(JSON.stringify({id:message.id,result})+'\n');
  }
  const exit=await code;
  const entry={framework,exit,native_loop:done?.error?'failed':'passed',fixture_model_responses:calls,fixture_device_actions:actions,
    unicode_input_roundtrip:actionRecords.some(a=>a.name==='input'&&a.param.text==='原生中文输入'),jpeg_mime_roundtrip:framework==='autoglm'?jpegMime:null,real_model_requests:0,real_device_actions:0,gui_task_result:'not_executed',error:done?.error??null};
  results.push(entry);await writeFile(path.join(project,'output',`phone-contract-${framework}.txt`),stderr);
  const checked=path.resolve(dir),relative=path.relative(os.tmpdir(),checked);
  if(!relative.startsWith('phone-native-contract-')||relative.includes(path.sep))throw Error('Unsafe temp cleanup');
  await rm(checked,{recursive:true,force:true});
}
console.log(JSON.stringify(results));if(results.some(r=>r.exit||r.fixture_model_responses!==5||r.fixture_device_actions<4||!r.unicode_input_roundtrip||r.jpeg_mime_roundtrip===false))process.exitCode=1;
