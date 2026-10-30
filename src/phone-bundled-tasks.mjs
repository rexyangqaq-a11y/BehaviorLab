import {readFileSync,existsSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';import path from 'node:path';
const defaultBundle=new URL('../examples/bundled-phone-tasks.json',import.meta.url);
// Called by interactive launchers only. No device, model, queue or credentials.
export function seedBundledPhoneTasks(root,bundlePath=defaultBundle){
  if(!existsSync(bundlePath))return {created:[],preserved:[]};
  const bundle=JSON.parse(readFileSync(bundlePath,'utf8'));if(bundle.schema_version!==1||!Array.isArray(bundle.entries))throw Error('随包任务格式无效');
  const dir=path.join(root,'.phone-lab/tasks'),bindingFile=path.join(root,'.phone-lab/task-startpoints.json');mkdirSync(dir,{recursive:true});
  const bindings=existsSync(bindingFile)?JSON.parse(readFileSync(bindingFile,'utf8')):{};
  const created=[],preserved=[],pending=[];
  for(const entry of bundle.entries){
    const t=entry.task;
    if(!t||!/^task_[a-f0-9-]{36}$/.test(t.id)||!Number.isSafeInteger(t.revision)||t.revision<1||!['builtin_home','builtin_home_luoshu'].includes(entry.startpoint_id))throw Error('随包任务标识或起点无效');
    for(const [key,max]of [['name',120],['instruction',8000],['app',80],['initial_state',2000]])if(typeof t[key]!=='string'||!t[key].trim()||t[key].length>max)throw Error('随包任务字段无效：'+key);
    if(!/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/.test(t.bundle??'')||!Array.isArray(t.acceptance)||!t.acceptance.length||t.acceptance.some(s=>typeof s!=='string'||!s.trim())||!['home','manual'].includes(t.reset))throw Error('随包任务配置无效');
    const file=path.join(dir,t.id+'.json');if(existsSync(file)){preserved.push(t.id);continue;}
    const fields=['id','revision','name','instruction','app','bundle','acceptance','initial_state','forbidden','reset','expected','created_at','updated_at'];
    const task={...Object.fromEntries(fields.map(k=>[k,t[k]])),origin:'user_defined',read_only:false,archived:false};pending.push({file,task});
    if(!Object.hasOwn(bindings,t.id))bindings[t.id]={case_id:t.id,case_revision:t.revision,startpoint_id:entry.startpoint_id,updated_at:new Date().toISOString(),source:'bundled_task'};
  }
  if(pending.length){
    // Save bindings first: an interrupted task write can be retried next launch.
    const temp=bindingFile+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(bindings,null,2),{flag:'wx',flush:true});renameSync(temp,bindingFile);
    for(const {file,task}of pending){try{writeFileSync(file,JSON.stringify(task,null,2),{flag:'wx',flush:true});created.push(task.id);}catch(e){if(e.code!=='EEXIST')throw e;preserved.push(task.id);}}
  }
  return {created,preserved};
}
