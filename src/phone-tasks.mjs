import {mkdirSync,readdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {PHONE_CASES} from './phone-lab-catalog.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const field=(value,label,max,required=false)=>{if(typeof value!=='string'||value.trim().length>max||required&&!value.trim())throw fail(400,`${label}${required?'不能为空，且':''}最多${max}字`);return value.trim();};
export class PhoneTasks {
  constructor(directory){this.directory=directory;mkdirSync(directory,{recursive:true});}
  list(){const custom=readdirSync(this.directory).filter(f=>/^task_[a-f0-9-]{36}\.json$/.test(f)).map(f=>JSON.parse(readFileSync(path.join(this.directory,f),'utf8'))).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));return [...PHONE_CASES.map(t=>({...structuredClone(t),read_only:true,archived:false})),...custom];}
  get(id,{includeArchived=false}={}){const task=this.list().find(t=>t.id===id&&(includeArchived||!t.archived));if(!task)throw fail(404,'任务不存在或已停用');return task;}
  save(input,id=null){
    const previous=id?this.get(id,{includeArchived:true}):null;if(previous?.read_only)throw fail(409,'内置任务请复制为自定义任务后编辑');
    if(previous&&input.expected_revision!==previous.revision)throw fail(409,'任务已更新，请重新打开后编辑');
    const value={...previous,...input},name=field(value.name,'任务名称',120,true),instruction=field(value.instruction,'任务说明',8000,true),app=field(value.app??'当前应用','应用名称',80,true);
    const bundle=field((Object.hasOwn(input,'bundle')?input.bundle:previous?.app===app?previous.bundle:PHONE_CASES.find(t=>t.app===app)?.bundle)??'','应用包名',160);
    if(bundle&&!/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/.test(bundle))throw fail(400,'应用包名格式无效');
    if(!['home','manual'].includes(value.reset??'manual'))throw fail(400,'起点复位策略无效');
    const acceptance=Array.isArray(value.acceptance)?value.acceptance.join('\n'):value.acceptance??'';
    const task={id:previous?.id??'task_'+randomUUID(),revision:(previous?.revision??0)+1,name,instruction,app,bundle:bundle||null,
      acceptance:field(acceptance,'判定要求',4000,true).split(/\r?\n/).filter(Boolean),initial_state:field(value.initial_state??'使用任务设置中保存的起点','起点说明',2000,true),
      forbidden:field(value.forbidden??'','禁止操作',2000),reset:value.reset??'manual',expected:[],origin:'user_defined',read_only:false,archived:value.archived===true,
      created_at:previous?.created_at??new Date().toISOString(),updated_at:new Date().toISOString()};
    const dest=path.join(this.directory,task.id+'.json'),temp=dest+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(task,null,2),{flag:'wx',flush:true});renameSync(temp,dest);return task;
  }
}
