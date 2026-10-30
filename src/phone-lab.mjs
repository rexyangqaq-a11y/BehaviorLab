import {phonePython} from './phone-runtime-paths.mjs';
import {PHONE_SELECTION_POLICY} from './phone-framework-registry.mjs';
import {unexpectedWorkerState} from './phone-action-effects.mjs';
import {mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync,unlinkSync,renameSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {fork,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PHONE_CASES,PHONE_FRAMEWORKS,PHONE_LAB_VERSION,normalizePhoneLimits,phoneModelFamily} from './phone-lab-catalog.mjs';
import {PhoneEvidence,sha256} from './phone-evidence.mjs';
import {createPhoneDevice,layoutNodes} from './phone-device.mjs';
import {BUILTIN_HOME_START,BUILTIN_COMPANION_START,BUILTIN_STARTS,builtinStart,startContract,namedStartContract,compareStart,resetPhoneStart} from './phone-startpoints.mjs';
import {PhoneTasks} from './phone-tasks.mjs';
import {PhoneVideo} from './phone-video.mjs';
import {phoneTestPlan} from '../web/phone-test-plan.mjs';
import {acquireDeviceLease} from './device-lease.mjs';
import {PhoneConnection} from './phone-connection.mjs';
import {PhoneHilog} from './phone-hilog.mjs';
const project=fileURLToPath(new URL('../',import.meta.url)),now=()=>new Date().toISOString();
const fail=(status,message)=>Object.assign(Error(message),{status});
const read=file=>{try{return JSON.parse(readFileSync(file,'utf8'));}catch{return null;}};
const save=(file,value)=>writeFileSync(file,JSON.stringify(value,null,2),{flush:true});
const eventsAt=dir=>{try{return readFileSync(path.join(dir,'events.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return {type:'evidence_ledger_invalid'};}});}catch(error){return error.code==='ENOENT'?[]:[{type:'evidence_ledger_invalid'}];}};
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const exec=promisify(execFile);
export function phoneRunDeviceInfo(input,environment){
  const baseline=input?.startpoint?.environment,actual=environment?.device?environment:null,record=actual??baseline;
  return {model:record?.device?.model??null,os_fullname:record?.device?.os_fullname??null,software_version:record?.device?.software_version??null,api:record?.device?.api??null,
    screen:record?.screen??(!actual&&input?.startpoint?.contract?{width:input.startpoint.contract.width,height:input.startpoint.contract.height}:null),
    app:record?.app??null,source:actual?'execution_environment':baseline?'saved_startpoint':'not_recorded'};
}
// REVIEW(v0.4): Application service for one task/run/batch. Framework decisions
// stay in adapters; physical I/O stays in the worker's device session. An ended
// worker is an execution outcome, not an independent business pass verdict.
export class PhoneLab {
  constructor(root,{deviceFactory=createPhoneDevice,lockPath=path.join(project,'.runtime/phone-lab-device.lock'),pausePath=path.join(project,'.runtime/phone-lab-pause.json'),archiveRoot=null,connectionFactory=()=>new PhoneConnection({configPath:path.join(project,'.runtime/device-tools.json')}),videoFactory=options=>new PhoneVideo(options),hilogFactory=options=>new PhoneHilog(options)}={}){
    this.archiveRoot=archiveRoot;this.archiveManifest=archiveRoot?read(path.join(archiveRoot,'manifest.json')):null;
    this.archiveIds=new Set((this.archiveManifest?.records??[]).map(r=>r.run_id).filter(id=>/^phone_[a-f0-9-]{36}$/.test(id)));
    this.root=root;this.base=path.join(root,'.phone-lab');this.deviceFactory=deviceFactory;this.lockPath=lockPath;this.pausePath=pausePath;this.children=new Map();this.waitingBatches=new Map();this.closing=false;
    for(const dir of ['starts','runs','batches','evaluations'])mkdirSync(path.join(this.base,dir),{recursive:true});mkdirSync(path.dirname(lockPath),{recursive:true});
    this.tasks=new PhoneTasks(path.join(this.base,'tasks'));
    this.connection=connectionFactory();
    // Observation owns a separate lease for the encoder's entire lifetime.
    // Never make video setup/teardown compete with the phone input lease.
    this.video=videoFactory({project,assertEnabled:()=>this.assertDeviceEnabled(),acquire:()=>acquireDeviceLease(this.lockPath+'.video','phone_video')});
    this.hilogFactory=hilogFactory;this.testLogs=new Map();
    this.hilog=hilogFactory({root,project,context:{mode:'manual'},acquire:()=>acquireDeviceLease(this.lockPath+'.hilog.manual','phone_hilog_manual')});
  }
  async beginTestLog(task){
    const id='phone_'+randomUUID(),dir=this.directory('runs',id),scope={id,dir};
    scope.recorder=this.hilogFactory({root:this.root,project,base:path.join(dir,'hilog'),context:{mode:'test',run_id:id,case_id:task?.id??null,task_name:task?.name??'自定义任务'},acquire:()=>acquireDeviceLease(this.lockPath+'.hilog.test','phone_hilog_test')});
    this.testLogs.set(id,scope);try{const state=await scope.recorder.start();scope.initial=state.current??state.recordings?.[0]??null;}catch(error){scope.initial={state:'error',reason:error.message,started_at:now(),bytes:0,parts:[]};}
    mkdirSync(dir,{recursive:true});save(path.join(dir,'hilog.json'),scope.initial);new PhoneEvidence(dir,{phase:'preparation'}).record({type:'hilog_capture_start',recording:scope.initial});return scope;
  }
  async finishTestLog(scope,reason='测试结束'){
    if(scope.finishing)return scope.finishing;
    scope.finishing=(async()=>{let metadata;try{const state=await scope.recorder.stop(reason);metadata=state.recordings?.[0]??scope.initial;}catch(error){metadata={...scope.initial,state:'error',reason:error.message};}
      save(path.join(scope.dir,'hilog.json'),metadata);this.testLogs.delete(scope.id);
      const evidence=new PhoneEvidence(scope.dir,{phase:'diagnostics'});evidence.record({type:'hilog_capture_end',recording:metadata,attachment:'hilog.json'});
      return metadata;
    })();return scope.finishing;
  }
  recordPreparationFailure(scope,{task,framework,service,name,instruction,limits,startpointId=null,batchId=null,error}){
    const {id,dir}=scope;if(existsSync(path.join(dir,'input.json')))return;
    save(path.join(dir,'input.json'),{id,name:name??task?.name??'起点准备',created_at:scope.initial?.started_at??now(),framework_id:framework?.id,framework,service_id:service?.id,service:{model:service?.model,name:service?.name},case_id:task?.id??null,case_revision:task?.revision??null,task_name:task?.name??name,instruction:instruction??task?.instruction,acceptance:task?.acceptance??[],task,limits,source:'real_device',preparation_only:true,startpoint_id:startpointId,batch_id:batchId});
    save(path.join(dir,'state.json'),{status:'blocked',finished_at:now(),reason:error.message});save(path.join(dir,'result.json'),{status:'blocked',reason:error.message,preparation_only:true,same_start:{same:false,reasons:[error.message]},model_usage:{requests:0,known_input_tokens:0,known_output_tokens:0,unknown_usage_requests:0}});
  }
  testHilog(id){if(!/^phone_[a-f0-9-]{36}$/.test(id))throw fail(400,'测试记录ID无效');const dir=this.runDirectory(id);if(!existsSync(path.join(dir,'hilog.json')))throw fail(404,'该测试没有HiLog附件');return this.testLogs.get(id)?.recorder??this.hilogFactory({root:this.root,project,base:path.join(dir,'hilog'),context:{mode:'test',run_id:id},acquire:()=>{throw Error('只读日志入口');}});}
  directory(kind,id){if(!/^(start|phone|batch)_[a-f0-9-]{36}$/.test(id))throw fail(400,'记录 ID 无效');return path.join(this.base,kind,id);}
  runDirectory(id){const live=this.directory('runs',id);return existsSync(path.join(live,'input.json'))?live:this.archiveIds.has(id)?path.join(this.archiveRoot,'runs',id):live;}
  archived(id){return this.archiveIds.has(id)&&this.runDirectory(id)===path.join(this.archiveRoot,'runs',id);}
  assertWritableRun(id){if(this.archived(id))throw fail(409,'随包历史测试为只读档案，不修改历史判定或重新执行。');}
  list(kind,file){return readdirSync(path.join(this.base,kind)).map(id=>read(path.join(this.base,kind,id,file))).filter(Boolean).sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??''));}
  // REVIEW(v0.4): This legacy input lock checks the parent PID only. Do not
  // assume it protects a surviving worker after a parent crash. R01 in the
  // source review tracks the missing worker ownership check; it is not fixed here.
  acquire(owner){const token=randomUUID();if(existsSync(this.lockPath)){const old=read(this.lockPath);if(old&&alive(old.pid))throw fail(409,'手机正在被另一项真机准备或测试占用');unlinkSync(this.lockPath);}writeFileSync(this.lockPath,JSON.stringify({token,pid:process.pid,owner}),{flag:'wx',flush:true});return ()=>{if(read(this.lockPath)?.token===token)unlinkSync(this.lockPath);};}
  assertDeviceEnabled(){if(read(this.pausePath)?.paused)throw fail(423,'真机测试已暂停；查看与编辑界面不受影响。手机可用后由测试者恢复。');}
  pause(reason='手机暂供日常使用'){save(this.pausePath,{paused:true,at:now(),reason});for(const id of this.children.keys())this.stop(id);if(this.activeBatch)this.stopBatch(this.activeBatch);void this.video.stopAll('真机操作已暂停');return read(this.pausePath);}
  resume(){save(this.pausePath,{paused:false,at:now(),reason:'测试者在界面恢复'});return read(this.pausePath);}
  taskStart(task,{startpointId,starts=this.list('starts','start.json')}={}){
    const configured=read(path.join(this.base,'task-startpoints.json'))?.[task.id];
    const chosen=startpointId!==undefined?startpointId:configured?configured.startpoint_id:undefined;
    if(chosen===null)return null;
    if(builtinStart(chosen))return structuredClone(builtinStart(chosen));
    return starts.find(s=>(chosen===undefined||s.id===chosen)&&(s.named&&chosen!==undefined||s.case_id===task.id&&s.contract?.case_revision===task.revision)&&s.contract.ready)??(chosen===undefined&&task.read_only&&task.reset==='home'?structuredClone(BUILTIN_HOME_START):null);
  }
  listTasks(starts=this.list('starts','start.json')){return this.tasks.list().map(task=>{const start=this.taskStart(task,{starts});return {...task,startpoint_id:start?.id??null,startpoint_name:start?.name??null};});}
  async selectTaskStart(id,input){
    const task=this.tasks.get(id);if(input.expected_revision!==task.revision)throw fail(409,'任务版本已更新，请重新打开任务设置');
    if(builtinStart(input.startpoint_id))return this.configureTaskStart(id,input);
    if(input.reuse&&input.startpoint_id){
      const source=read(path.join(this.directory('starts',input.startpoint_id),'start.json'));if(!source?.contract?.ready)throw fail(409,'所选起点不可用');
      if(!source.named){
        const sourceDir=this.directory('starts',source.id),layoutPath=path.resolve(sourceDir,source.layout_file??'');
        if(!layoutPath.startsWith(sourceDir+path.sep))throw fail(409,'历史起点缺少页面记录，请记录当前状态');
        const tree=read(layoutPath);if(!tree)throw fail(409,'历史起点缺少页面记录，请记录当前状态');
        const bytes=(await this.asset('starts',source.id,source.asset.id)).bytes,environment={...source.environment,app:null};
        const contract=namedStartContract({environment,shot:{width:source.contract.width,height:source.contract.height},nodes:layoutNodes(tree)});
        if(!contract.ready)throw fail(409,'历史起点不满足可执行条件，请记录当前状态');
        const newId='start_'+randomUUID(),dir=this.directory('starts',newId),evidence=new PhoneEvidence(dir),asset=await evidence.image(bytes,source.asset.format==='jpeg'?'image/jpeg':'image/png','start');
        evidence.save('layout.json',tree);const start={id:newId,created_at:now(),name:source.name,named:true,case_id:null,description:source.description??source.name,environment,contract,asset,layout_file:'layout.json',source_startpoint_id:source.id,source_captured_at:source.created_at,reset_available:contract.reset==='home'};
        evidence.record({type:'saved_startpoint_reused',source_startpoint_id:source.id,source_image_sha256:source.asset.sha256});evidence.save('start.json',start);input={...input,startpoint_id:newId};
      }
    }
    return this.configureTaskStart(id,input);
  }
  configureTaskStart(id,input){
    const task=this.tasks.get(id);if(input.expected_revision!==task.revision)throw fail(409,'任务版本已更新，请重新打开任务配置起点');
    if(input.startpoint_id!==null&&typeof input.startpoint_id!=='string')throw fail(400,'请选择任务的基准起点');
    const start=this.taskStart(task,{startpointId:input.startpoint_id});
    if(input.startpoint_id!==null&&!start)throw fail(409,'起点必须属于当前任务版本，且已通过起点检查');
    const file=path.join(this.base,'task-startpoints.json'),settings=read(file)??{},value={case_id:id,case_revision:task.revision,startpoint_id:start?.id??null,updated_at:now()};
    settings[id]=value;const temporary=file+'.'+randomUUID()+'.tmp';save(temporary,settings);renameSync(temporary,file);return value;
  }
  async catalog(settings){
    let installed=read(path.join(project,'.runtime/phone-frameworks.json'))??{};
    const frameworks=PHONE_FRAMEWORKS.map(f=>({...f,available:f.id==='midscene'?existsSync(path.join(project,'integrations/midscene/node_modules/@midscene/harmony/package.json')):Boolean(installed[f.id]?.contract_passed),installation:installed[f.id]??null}));
    const services=settings.services.map(s=>({...s,family:phoneModelFamily(s.model),vision_status:phoneModelFamily(s.model)?'documented_protocol_pending_per_combination':'unknown',api_key:undefined}));
    const evaluations=this.list('evaluations','evaluation.json'),excluded=new Map(evaluations.flatMap(e=>(e.entries??[]).filter(x=>x.run_id&&x.matrix_eligible===false).map(x=>[x.run_id,x.exclusion_reason??'integration_diagnostic'])));
    const deviations=new Map(evaluations.flatMap(e=>(e.entries??[]).filter(x=>x.run_id&&x.policy_deviation).map(x=>[x.run_id,x.policy_deviation])));
    const starts=this.list('starts','start.json'),tasks=this.listTasks(starts);
    return {version:PHONE_LAB_VERSION,final_framework:null,selection_policy:PHONE_SELECTION_POLICY,frameworks,services,tasks,cases:tasks.filter(t=>!t.archived),default_limits:normalizePhoneLimits(),batch_request_limit:null,active_batch_id:this.activeBatch??null,
      connection:this.connection.status(),archive:this.archiveManifest?{runs:this.archiveIds.size,evaluation_id:this.archiveManifest.evaluation_id,read_only:true}:null,
      starts:[...BUILTIN_STARTS.map(s=>structuredClone(s)),...starts],runs:[...new Set([...this.list('runs','input.json').map(i=>i.id),...this.archiveIds])].map(id=>({...this.summary(id),evaluation_exclusion:excluded.get(id)??null,policy_deviation:deviations.get(id)??null})),batches:this.list('batches','batch.json'),evaluations,busy:read(this.lockPath),device_pause:read(this.pausePath)??{paused:false},video:this.video.status(),hilog:this.hilog.status()};
  }
  async prepareBuiltinHome(task){return this.prepareBuiltinStart(task,BUILTIN_HOME_START.id);}
  async prepareBuiltinStart(task,recipeId){
    const recipe=builtinStart(recipeId);if(!recipe)throw fail(400,'未知的内置起点');
    const companion=recipeId===BUILTIN_COMPANION_START.id;
    const start=await this.captureStart({named:true,name:companion?'手机桌面＋洛书伴随态 · 本机自动基准':'手机桌面 · 本机自动基准',description:recipe.description,library_visible:false,reset:true},{taskSnapshot:{...task,reset:recipe.contract.reset,bundle:null},startRecipeId:companion?recipeId:null});
    if(!start.contract?.ready||start.contract.reset!==recipe.contract.reset)throw fail(409,companion?'未确认手机桌面与洛书伴随态同时存在，准备已停止；未调用模型。':'无法核对手机桌面起点，请解锁并检查桌面布局后重试；未调用模型。');
    return start;
  }
  async captureStart(input={}, {taskSnapshot=null,startRecipeId=null}={}){
    this.assertDeviceEnabled();
    if(input.named&&(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>120))throw fail(400,'请为当前状态填写1–120字的起点名称');
    if(input.named&&input.reset&&!taskSnapshot)throw fail(400,'记录当前状态不会执行复位');
    const task=taskSnapshot??(input.case_id?this.tasks.get(input.case_id):null);
    if(input.reset&&(!task||task.reset==='manual'))throw fail(400,'手动起点请摆好手机后记录当前起点');
    if(!input.named&&!task&&!input.description?.trim())throw fail(400,'自定义起点请填写页面状态说明');
    const release=this.acquire('capture_start'),id='start_'+randomUUID(),dir=this.directory('starts',id);mkdirSync(dir);
    const evidence=new PhoneEvidence(dir);
    try{
      const session=await this.deviceFactory({evidence});
      const before=await session.layout();if(before.nodes.some(n=>/ScreenLock|keyguard/i.test(n.id??'')))throw fail(409,'手机已锁屏，请手动解锁后重新记录');
      if(input.reset)await resetPhoneStart(session,task);
      const environment=await session.environment(input.named?null:task?.bundle??input.bundle??null),shot=await session.capture('start'),view=await session.layout();
      const contract=input.named?namedStartContract({environment,shot,nodes:view.nodes,recipeId:startRecipeId}):startContract({environment,shot,nodes:view.nodes,task,manual:!task||task.reset==='manual'});
      const start={id,created_at:now(),name:input.name?.trim().slice(0,120)||task?.name||'自定义起点',named:Boolean(input.named),library_visible:input.library_visible!==false,case_id:input.named?null:task?.id??null,
        description:input.description||task?.initial_state||input.name,environment,contract,asset:shot.asset,layout_file:view.file,reset_available:input.named?['home','home_companion'].includes(contract.reset):Boolean(task&&task.reset!=='manual')};
      evidence.save('start.json',start);return start;
    }catch(error){evidence.record({type:'preparation_blocked',error:error.message});throw error;}
    finally{release();}
  }
  async start(input,settings,{batchId=null,taskSnapshot=null,logScope=null}={}){
    this.assertDeviceEnabled();
    if(this.closing)throw fail(503,'真机测试服务正在关闭');
    if(this.activeBatch&&batchId!==this.activeBatch)throw fail(409,'组合评估尚未结束，请先停止或等待完成');
    const framework=PHONE_FRAMEWORKS.find(f=>f.id===input.framework_id),service=settings.services.find(s=>s.id===input.service_id);
    if(!framework||!service||service.missing?.length||!phoneModelFamily(service.model)||service.protocol!=='openai-chat')throw fail(400,'请选择可用框架与已保存的图片模型服务');
    if(framework.id!=='midscene'&&!read(path.join(project,'.runtime/phone-frameworks.json'))?.[framework.id]?.contract_passed)throw fail(400,'该框架环境尚未接通');
    const task=taskSnapshot??(input.case_id?this.tasks.get(input.case_id):null);
    let startpointId=input.startpoint_id??(task?this.taskStart(task)?.id:null);
    if(!startpointId)throw fail(409,'请先在任务中配置当前版本的基准起点');
    const instruction=(input.instruction??task?.instruction??'').trim();if(!instruction||instruction.length>8000)throw fail(400,'任务文本需为 1–8000 字符');
    if(input.name!=null&&(typeof input.name!=='string'||input.name.trim().length>120))throw fail(400,'测试名称最多120字');
    const name=input.name?.trim()||task?.name||'自定义测试',limits=normalizePhoneLimits(input.limits);
    const scope=logScope??await this.beginTestLog(task),id=scope.id,dir=scope.dir;let release,handedOff=false;
    try{
    if(builtinStart(startpointId)){
      startpointId=(await this.prepareBuiltinStart(task,startpointId)).id;
    }
    const start=read(path.join(this.directory('starts',startpointId),'start.json'));
    if(!start)throw fail(404,'起点记录不存在');
    if(!start.named&&(task?.id??null)!==start.case_id)throw fail(400,'所选用例与起点不匹配');
    if(!start.contract.ready)throw fail(409,'起点条件尚未通过，请重新准备');
    if(!start.named&&task&&task.revision!==start.contract.case_revision)throw fail(409,'任务版本已更新，请为当前版本重新记录起点');
    if(this.closing)throw fail(503,'真机测试服务正在关闭');release=this.acquire(id);
      mkdirSync(dir,{recursive:true});
      const frozen={id,created_at:now(),evaluation_protocol:'phone-lab-v13-timestamped-evidence-and-hilog-v1',permission_policy:'deny_new_system_permissions_v1',framework_id:framework.id,framework,service_id:service.id,
        evaluation_id:typeof input.evaluation_id==='string'?input.evaluation_id.slice(0,100):null,phase_id:typeof input.phase_id==='string'?input.phase_id.slice(0,60):null,
        service:{id:service.id,name:service.name,model:service.model,base_url:service.base_url,protocol:service.protocol,timeout_ms:service.timeout_ms,family:phoneModelFamily(service.model)},
        settings_revision:settings.revision,case_id:task?.id??null,case_revision:task?.revision??null,name,task_name:task?.name??'自定义任务',
        instruction,task_sha256:sha256(instruction),instruction_overridden:Boolean(task&&instruction!==task.instruction),acceptance:task?.acceptance??(input.acceptance??'').slice(0,4000),app:task?.app??input.app??'当前应用',bundle:task?.bundle??start.environment.app?.bundle??null,
        task:task??null,startpoint_id:start.id,startpoint:start,limits,batch_id:batchId,source:'real_device',mode:'real',video_observation_at_start:this.video.observation(),automatic_hilog:scope.initial,final_framework:null};
      save(path.join(dir,'input.json'),frozen);save(path.join(dir,'state.json'),{status:'queued',created_at:now()});
      const child=fork(path.join(project,'scripts/phone-lab-worker.mjs'),['--root',this.root,'--id',id],{cwd:project,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
      const completion=new Promise(resolve=>{let settled=false;const finish=async error=>{if(settled)return;settled=true;try{const state=read(path.join(dir,'state.json'));if(error||['running','queued','stopping'].includes(state?.status))save(path.join(dir,'state.json'),unexpectedWorkerState(state,eventsAt(dir),error));await this.finishTestLog(scope);}finally{this.children.delete(id);release();resolve();}};child.once('error',error=>void finish(error));child.once('exit',()=>void finish());});
      // Worker logs are not streamed to the browser. The durable sanitized ledger
      // is the source of UI information; no provider credential is in argv/stdin.
      child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
      this.children.set(id,{child,completion});handedOff=true;scope.handedOff=true;return {id,status:'queued'};
    }catch(error){
      this.recordPreparationFailure(scope,{task,framework,service,name,instruction,limits,startpointId,batchId,error});
      throw error;
    }finally{if(!handedOff){try{await this.finishTestLog(scope,'测试未进入执行');}finally{release?.();}}}
  }
  summary(id){const dir=this.runDirectory(id),input=read(path.join(dir,'input.json'));if(!input)throw fail(404,'执行记录不存在');const legacy=read(path.join(dir,'review.json')),assistant_review=read(path.join(dir,'assistant-review.json'))??(legacy?.reviewer==='assistant'?legacy:null),user_review=read(path.join(dir,'user-review.json'))??(legacy&&legacy.reviewer!=='assistant'?legacy:null);return {...input,read_only:this.archived(id),record_origin:this.archived(id)?'bundled_history':'local_run',automatic_hilog:(()=>{const log=this.testLogs.get(id)?.recorder.status();return log?.current??log?.recordings?.[0]??read(path.join(dir,'hilog.json'));})(),device_info:phoneRunDeviceInfo(input,read(path.join(dir,'environment.json'))),source_versions:read(path.join(dir,'source-versions.json')),state:read(path.join(dir,'state.json')),result:read(path.join(dir,'result.json')),assistant_review,user_review,review:user_review??assistant_review??legacy};}
  // REVIEW(v0.4): This is a complete in-memory projection, not an indexed read.
  // Malformed rows currently disappear from this projection (R02). A partial
  // trace shown by this method must not be treated as proof of ledger integrity.
  snapshot(id){const result=this.summary(id),dir=this.runDirectory(id);let events=[];try{events=readFileSync(path.join(dir,'events.jsonl'),'utf8').trim().split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});}catch{}return {...result,environment:read(path.join(dir,'environment.json')),start_check:read(path.join(dir,'start-check.json')),source_versions:read(path.join(dir,'source-versions.json')),events,assets:events.filter(e=>e.type==='image').map(e=>e.asset)};}
  processSnapshot(id,after=0){
    if(!Number.isSafeInteger(after)||after<0)throw fail(400,'执行轨迹游标无效');
    const run=this.snapshot(id),latest=run.events.reduce((n,e)=>Math.max(n,Number.isSafeInteger(e.seq)?e.seq:0),0),reset=after>latest;
    const {source_versions,start_check,...result}=run;
    return {...result,events:run.events.filter(e=>reset||e.seq>after),assets:undefined,cursor:latest,reset,observed_at:now()};
  }
  async asset(kind,id,assetId){
    const dir=kind==='runs'?this.runDirectory(id):this.directory(kind,id);let assets;
    if(kind==='starts')assets=[read(path.join(dir,'start.json'))?.asset];else assets=this.snapshot(id).assets;
    const asset=assets.find(a=>a?.id===assetId);if(!asset)throw fail(404,'图像不存在');
    const file=path.resolve(dir,asset.file);if(!file.startsWith(dir+path.sep))throw fail(400,'图像路径无效');
    const bytes=await readFile(file);if(sha256(bytes)!==asset.sha256)throw fail(409,'截图哈希核对失败');return {bytes,type:asset.format==='jpeg'?'image/jpeg':'image/png'};
  }
  async bundle(id){
    this.assertWritableRun(id);
    if(this.children.has(id)||this.testLogs.has(id))throw fail(409,'请等待测试与自动日志收尾后再导出完整证据包');
    const s=this.summary(id);if(['queued','running','stopping'].includes(s.state.status))throw fail(409,'请在执行结束或停止后导出完整证据包');
    const dir=this.directory('runs',id),file=path.join(dir,'evidence.zip'),python=phonePython(project);
    if(!python)throw fail(409,'证据包工具未安装；可先下载 JSON 与截图');
    await exec(python,['-c','import sys,pathlib,zipfile;root=pathlib.Path(sys.argv[1]);dest=pathlib.Path(sys.argv[2]);files=[p for p in root.rglob("*") if p.is_file() and p.suffix in (".json",".jsonl",".txt",".log",".jpeg",".png",".jpg") and not p.name.startswith("capture-")];z=zipfile.ZipFile(dest,"w",zipfile.ZIP_DEFLATED);[(z.write(p,p.relative_to(root))) for p in files];z.close()',dir,file],{windowsHide:true,timeout:30000});
    return readFile(file);
  }
  stop(id){this.assertWritableRun(id);const dir=this.directory('runs',id),s=this.summary(id);if(!['running','queued','stopping'].includes(s.state.status))return s;save(path.join(dir,'stop.json'),{at:now(),reason:'user_stop'});this.children.get(id)?.child.send({type:'stop'});return {id,status:'stopping'};}
  review(id,input){
    this.assertWritableRun(id);
    const s=this.snapshot(id);if(['running','queued','stopping'].includes(s.state.status))throw fail(409,'请等待执行结束后判定');
    if(!['passed','partial','failed','blocked','cannot_determine'].includes(input.verdict))throw fail(400,'判定状态无效');
    if(typeof input.note!=='string'||!input.note.trim()||input.note.length>6000)throw fail(400,'请填写结果依据');
    const evidenceIds=input.evidence_ids??[];if(!Array.isArray(evidenceIds)||evidenceIds.some(id=>!s.assets.some(a=>a.id===id)))throw fail(400,'证据引用无效');
    if(input.verdict==='passed'&&!evidenceIds.length)throw fail(400,'通过判定需关联实际截图');
    const row={at:now(),reviewer:input.reviewer==='assistant'?'assistant':'user',verdict:input.verdict,note:input.note,evidence_ids:evidenceIds};
    const dir=this.directory('runs',id);new PhoneEvidence(dir).record({type:'independent_review',review:row});save(path.join(dir,row.reviewer==='assistant'?'assistant-review.json':'user-review.json'),row);save(path.join(dir,'review.json'),row.reviewer==='user'?row:s.user_review??row);return row;
  }
  async batch(input,settings){
    this.assertDeviceEnabled();
    if(this.activeBatch)throw fail(409,'已有整批评估正在执行，请先停止或等待结束');
    if(!input.combinations){let plan;try{plan=phoneTestPlan({...input,mode:'matrix'});}catch(e){throw fail(400,e.message);}input={...input,combinations:plan.combinations};}
    if(!Array.isArray(input.combinations)||!input.combinations.length||input.combinations.length>30||!Array.isArray(input.case_ids)||!input.case_ids.length||input.case_ids.length>50||input.case_ids.length*input.combinations.length>150)throw fail(400,'请选择组合与任务，一批最多150个测试单元');
    if(new Set(input.case_ids).size!==input.case_ids.length||new Set(input.combinations.map(c=>c.framework_id+'|'+c.service_id)).size!==input.combinations.length)throw fail(400,'测试单元不能重复');
    const tasks=Object.fromEntries(input.case_ids.map(id=>[id,this.tasks.get(id)]));
    for(const combo of input.combinations){const service=settings.services?.find(s=>s.id===combo.service_id);if(!PHONE_FRAMEWORKS.some(f=>f.id===combo.framework_id)||!service||service.protocol!=='openai-chat'||!phoneModelFamily(service.model)||service.missing?.length)throw fail(400,'框架或模型服务不可用');}
    const limits=normalizePhoneLimits(input.limits),starts=this.list('starts','start.json');
    // Freeze references once for the whole batch. Later reset captures must
    // never become the reference for the next combination.
    const baselines=Object.fromEntries(input.case_ids.map(caseId=>{const s=this.taskStart(tasks[caseId],{startpointId:input.startpoint_ids?.[caseId],starts});return [caseId,s?{id:s.id,contract:s.contract,named:Boolean(s.named),builtin:Boolean(s.builtin)}:null];}));
    if(Object.values(baselines).some(s=>!s))throw fail(409,'请先在任务中配置每个所选任务当前版本的基准起点');
    const id='batch_'+randomUUID(),dir=this.directory('batches',id);mkdirSync(dir);
    this.activeBatch=id;
    const batch={id,name:typeof input.name==='string'?input.name.trim().slice(0,120):'',created_at:now(),status:'running',limits,baselines,tasks,total_request_limit:null,
      combinations:input.combinations,case_ids:input.case_ids,entries:[],stop_requested:false};save(path.join(dir,'batch.json'),batch);
    const write=()=>save(path.join(dir,'batch.json'),batch);
    const run=async()=>{
      // Interleave combinations within each task. Every entry gets a fresh
      // verified reset, optional budgets and its own automatic log attachment.
      for(const caseId of batch.case_ids)for(const combo of batch.combinations){
        if(this.closing||read(path.join(dir,'stop.json'))){batch.status='stopped';write();return;}
        let logScope;
        try{
          let prior=batch.baselines[caseId];
          if(!prior)throw Error('该用例尚无已核对基准起点');
          const task=tasks[caseId];let current;
          logScope=await this.beginTestLog(task);
          if(this.closing||read(path.join(dir,'stop.json'))){batch.status='stopped';write();return;}
          if(prior.builtin){
            current=await this.prepareBuiltinStart(task,prior.id);prior={id:current.id,contract:current.contract,named:true,builtin:false};batch.baselines[caseId]=prior;write();
          }else if(prior.named){
            const recipe=prior.contract.recipe_id?builtinStart(prior.contract.recipe_id):null;if(prior.contract.recipe_id&&!recipe)throw Error('起点配方不可用');const home=prior.contract.reset==='home',automatic=home||Boolean(recipe);current=await this.captureStart({named:true,name:'执行起点核对',library_visible:false,reset:automatic},{taskSnapshot:{...task,reset:recipe?.contract.reset??(home?'home':'manual'),bundle:null},startRecipeId:recipe?.id??null});
          }else if(task.reset==='manual'){
            const token=randomUUID();batch.status='waiting_for_start';batch.pending_entry={case_id:caseId,...combo,token,task_name:task.name,initial_state:task.initial_state};write();
            current=await new Promise(resolve=>this.waitingBatches.set(id,{token,task,prior,resolve}));
            if(!current){batch.status='stopped';batch.pending_entry=null;write();return;}
            batch.status='running';batch.pending_entry=null;write();
          }else current=await this.captureStart({case_id:caseId,reset:true,name:'整批复位 · '+task.name},{taskSnapshot:task});
          const comparison=compareStart(prior.contract,current.contract);if(!comparison.same)throw Error(comparison.reasons.join('；'));
          if(this.closing||read(path.join(dir,'stop.json'))){batch.status='stopped';write();return;}
          const started=await this.start({...combo,case_id:caseId,startpoint_id:current.id,limits:batch.limits,phase_id:'matrix'},settings,{batchId:id,taskSnapshot:task,logScope});
          batch.entries.push({case_id:caseId,...combo,run_id:started.id,status:'running',same_start:comparison});write();
          await this.children.get(started.id)?.completion;
          const finished=this.summary(started.id);batch.entries.at(-1).status=finished.state.status;write();
          if(finished.result?.effect_unknown||finished.state.status==='interrupted'){batch.status='blocked';batch.reason='动作效果未知，停止后续单元并等待核对';write();return;}
        }catch(error){if(logScope)this.recordPreparationFailure(logScope,{task:tasks[caseId],framework:PHONE_FRAMEWORKS.find(f=>f.id===combo.framework_id),service:settings.services.find(s=>s.id===combo.service_id),limits:batch.limits,batchId:id,error});batch.entries.push({case_id:caseId,...combo,run_id:logScope?.id??null,status:'blocked_before_model',reason:error.message,hilog_run_id:logScope?.id??null});if(batch.baselines[caseId]?.named){batch.status='blocked';batch.reason=error.message;write();return;}write();}
        finally{if(logScope&&!logScope.handedOff){const detail=await this.finishTestLog(logScope,'组合单元准备结束'),entry=batch.entries.find(e=>e.hilog_run_id===logScope.id);if(entry){entry.hilog=detail;write();}}}
      }
      batch.status='ended';batch.finished_at=now();write();
    };
    this.batchCompletion=run().catch(error=>{batch.status='blocked';batch.reason=error.message;write();}).finally(()=>{this.activeBatch=null;});return batch;
  }
  async continueBatch(id,input){
    this.assertDeviceEnabled();const waiter=this.waitingBatches.get(id);if(!waiter||input.token!==waiter.token)throw fail(409,'该起点确认已失效，请刷新批次');
    const current=await this.captureStart({case_id:waiter.task.id,description:waiter.task.initial_state,reset:false,name:'组合评估 · 手动起点确认'},{taskSnapshot:waiter.task});
    const comparison=compareStart(waiter.prior.contract,current.contract);if(!comparison.same)throw fail(409,'起点与本批基准不符，请重新摆好后确认：'+comparison.reasons.join('；'));
    if(this.waitingBatches.get(id)!==waiter||read(path.join(this.directory('batches',id),'stop.json')))throw fail(409,'批次已停止');
    this.waitingBatches.delete(id);waiter.resolve(current);return {id,status:'running'};
  }
  stopBatch(id){const dir=this.directory('batches',id),b=read(path.join(dir,'batch.json'));if(!b)throw fail(404,'批次不存在');save(path.join(dir,'stop.json'),{at:now()});const waiter=this.waitingBatches.get(id);if(waiter){this.waitingBatches.delete(id);waiter.resolve(null);}for(const e of b.entries)if(e.run_id&&this.children.has(e.run_id))this.stop(e.run_id);return {id,status:'stopping'};}
  async close(){this.closing=true;if(this.activeBatch)this.stopBatch(this.activeBatch);for(const id of this.children.keys())this.stop(id);await Promise.allSettled([...this.children.values()].map(c=>c.completion));await this.batchCompletion;await Promise.allSettled([...this.testLogs.values()].map(s=>this.finishTestLog(s,'服务关闭')));await this.video.close();await this.hilog.close();}
}
