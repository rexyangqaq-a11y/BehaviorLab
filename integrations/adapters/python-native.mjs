import {mkdir} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {phonePython} from '../../src/phone-runtime-paths.mjs';
export async function run({project,dir,input,service,key,session,evidence,transport,prompt,control,counter,checkPermissions,repeatGuard,dispatch}){

    const executable=phonePython(project);
    const nativeDir=path.join(dir,'native');await mkdir(nativeDir);
    const python=spawn(executable,['-I',path.join(project,'integrations/phone-frameworks.py')],{cwd:project,windowsHide:true,stdio:['pipe','pipe','pipe']});
    // REVIEW(v0.4): The child receives task/protocol data, never the provider
    // key. Model and device RPCs return through the parent's audited boundary.
    python.stdin.write(JSON.stringify({project,framework:input.framework_id,model:service.model,task:prompt,app:input.app,data_dir:nativeDir,max_actions:input.limits.max_actions,max_steps:Object.hasOwn(input.limits,'max_steps')?input.limits.max_steps:input.limits.max_actions,max_output_tokens:input.limits.max_output_tokens})+'\n');
    python.stderr.on('data',chunk=>appendFileSync(path.join(dir,'native-console.txt'),evidence.clean(chunk.toString())));
    const onAbort=()=>python.kill();control.signal.addEventListener('abort',onAbort,{once:true});
    try{
    let done,exited;python.once('exit',code=>{exited=code;});
    for await(const line of createInterface({input:python.stdout})){
      if(line.startsWith('@PHONE_DONE@')){done=JSON.parse(line.slice(12));continue;}
      if(!line.startsWith('@PHONE_RPC@'))continue;
      const message=JSON.parse(line.slice(11));let value,error;
      try{
        const args=message.args;
        if(message.method==='model'){
          const response=await transport.fetch(service.base_url.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(args.body)});
          value=await response.json();if(!response.ok)throw Error('模型 HTTP '+response.status);
        }else if(message.method==='capture'){
          const s=await session.capture('framework-observation',{forModel:true});value={base64:s.bytes.toString('base64'),width:s.width,height:s.height};
        }else if(message.method==='action')value=await dispatch(args.name,args.param);
        else if(message.method==='layout')value=(await session.layout()).tree;
        else if(message.method==='current_app'){
          const raw=await session.command(['shell','aa','dump','-l']);let current=null,foreground=null;
          for(const line of raw.split('\n')){if(line.includes('Mission ID'))current=null;const match=line.match(/app name \[([^\]]+)\]/);if(match)current=match[1];if(/state #FOREGROUND/i.test(line)&&current){foreground=current;break;}}
          value=foreground===input.bundle?input.app:foreground??'System Home';
        }
        else{evidence.record({type:message.method,...args});value=true;}
      }catch(cause){error=cause.message;evidence.record({type:'framework_io_stopped',method:message.method,error});}
      if(!python.killed)python.stdin.write(JSON.stringify({id:message.id,result:value??null,error})+'\n');
    }
    control.signal.removeEventListener('abort',onAbort);
    if(!done||done.error)throw Error(done?.error??'Python worker exited without a verified result ('+exited+')');
    return done.result;
    }finally{control.signal.removeEventListener('abort',onAbort);python.kill();}
}
