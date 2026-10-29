import {readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PhoneEvidence,sha256} from '../src/phone-evidence.mjs';
import {createPhoneDevice} from '../src/phone-device.mjs';
import {startContract,namedStartContract,compareStart} from '../src/phone-startpoints.mjs';
import {createTrialTransport} from '../src/gui-trial-transport.mjs';
import {frameworkSpec} from '../src/phone-framework-registry.mjs';
import {createRepeatedActionGuard} from '../src/gui-trial-action-limits.mjs';
import {assessPermissionAction} from '../src/phone-permissions.mjs';
import {unprotectLocalSecret} from '../src/local-secret.mjs';
import {validatePhysicalAction} from '../src/phone-action-effects.mjs';
import {limitReached,scheduleDeadline} from '../src/phone-execution-limits.mjs';
import {createPhoneModelNetwork} from '../src/phone-model-network.mjs';
const {values}=parseArgs({options:{root:{type:'string'},id:{type:'string'}}});
if(!/^phone_[a-f0-9-]{36}$/.test(values.id??''))throw Error('Invalid run ID');
const project=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(path.resolve(values.root),'.phone-lab/runs',values.id);
const input=JSON.parse(await readFile(path.join(dir,'input.json'),'utf8'));
const control=new AbortController();let evidence,session,transport,timer,watcher,counter={value:0},executionStarted,permissionBlocks=0,permissionChecks=0;
const cleanup=[],deferCleanup=fn=>cleanup.push(fn);
const state=value=>writeFile(path.join(dir,'state.json'),JSON.stringify(value,null,2),{flush:true});
let result={id:input.id,source:'real_device',status:'blocked',business_result:'pending_review',gui_passed:null,user_review:'pending',model_usage:{requests:0,known_input_tokens:0,known_output_tokens:0,unknown_usage_requests:0},actions:0,physical_actions:0};
process.on('message',message=>{if(message?.type==='stop')control.abort('user_stop');});
process.on('disconnect',()=>control.abort('server_disconnected'));
try{
  if(existsSync(path.join(project,'.runtime/phone-lab-pause.json'))&&JSON.parse(await readFile(path.join(project,'.runtime/phone-lab-pause.json'),'utf8')).paused)throw Error('用户已暂停真机测试，未操作设备或调用模型');
  let db,service,key;
  try{db=new DatabaseSync(path.join(values.root,'.model-services.sqlite'),{readOnly:true});const row=db.prepare('SELECT document FROM model_settings WHERE id=1').get();service=JSON.parse(row.document).services.find(s=>s.id===input.service_id);key=db.prepare('SELECT api_key FROM model_credentials WHERE service_id=?').get(input.service_id)?.api_key;}
  finally{db?.close();}
  key=unprotectLocalSecret(key);
  if(!service||service.model!==input.service.model||service.base_url!==input.service.base_url||!key)throw Error('模型配置已改变或凭据不存在，请新建测试');
  evidence=new PhoneEvidence(dir,{secrets:[key]});
  process.env.MIDSCENE_RUN_DIR=path.join(dir,'sdk-local');process.env.MIDSCENE_LANGSMITH_DEBUG='false';process.env.MIDSCENE_LANGFUSE_DEBUG='false';process.env.MIDSCENE_RECORD_MODEL_CALL='false';process.env.DEBUG='';
  await state({status:'running',phase:'checking_start',started_at:new Date().toISOString()});
  session=await createPhoneDevice({evidence,signal:control.signal,limits:input.limits});
  const environment=await session.environment(input.bundle),initial=await session.capture('initial'),layout=await session.layout();
  const current=input.startpoint.named?namedStartContract({environment,shot:initial,nodes:layout.nodes,recipeId:input.startpoint.contract.recipe_id}):startContract({environment,shot:initial,nodes:layout.nodes,task:input.task,manual:!input.task||input.task.reset==='manual'});
  const same=compareStart(input.startpoint.contract,current);result.same_start=same;evidence.save('environment.json',{...environment,screen:{width:initial.width,height:initial.height},framework:input.framework,model:input.service.model});
  evidence.save('start-check.json',{reference:input.startpoint.contract,current,comparison:same,initial_asset:initial.asset});
  if(!same.same)throw Error('执行前起点发生变化：'+same.reasons.join('；'));
  const files=['scripts/phone-lab-worker.mjs','src/phone-lab.mjs','src/phone-tasks.mjs','src/phone-lab-catalog.mjs','web/phone-test-plan.mjs','src/phone-device.mjs','src/phone-evidence.mjs','src/phone-image-privacy.mjs','src/phone-permissions.mjs','src/phone-startpoints.mjs','src/phone-companion-start.mjs','integrations/phone-companion-profiles.json','src/gui-trial-transport.mjs','integrations/phone-frameworks.py'];
  files.push('src/phone-hilog.mjs','web/phone-image-time.mjs','src/phone-execution-limits.mjs','src/phone-model-network.mjs','src/local-secret.mjs','src/phone-action-effects.mjs','src/phone-framework-registry.mjs','src/phone-runtime-paths.mjs','src/device-lease.mjs','integrations/phone_protocol.py','integrations/adapters/'+frameworkSpec(input.framework_id).adapter+'.mjs',...frameworkSpec(input.framework_id).sourceFiles);
  evidence.save('source-versions.json',Object.fromEntries(await Promise.all(files.map(async file=>[file,sha256(await readFile(path.join(project,file)))]))));
  executionStarted=Date.now();evidence.testStartedAt=executionStarted;evidence.phase='execution';
  await state({status:'running',phase:'execution',started_at:new Date(executionStarted).toISOString()});
  timer=scheduleDeadline(()=>control.abort('time_limit'),input.limits.max_seconds==null?null:input.limits.max_seconds*1000);
  watcher=setInterval(()=>{if(existsSync(path.join(dir,'stop.json')))control.abort('user_stop');},250);
  const network=createPhoneModelNetwork(project);deferCleanup(()=>network.close());
  const requestTimeout=input.limits.request_timeout_seconds===undefined?(input.service.timeout_ms??service.timeout_ms??30000):input.limits.request_timeout_seconds==null?null:input.limits.request_timeout_seconds*1000;
  transport=createTrialTransport({baseUrl:service.base_url,model:service.model,apiKey:key,signal:control.signal,fetchImpl:network.fetch,requestTimeoutMs:requestTimeout,
    record:evidence.record,saveImage:evidence.image,maxRequests:input.limits.max_requests,maxOutputTokens:input.limits.max_output_tokens,
    maxTextChars:input.limits.max_text_chars,maxImages:input.limits.max_images,maxPayloadBytes:input.limits.max_payload_bytes});
  const taskRules=input.task?.origin==='user_defined'?'\n\n判定要求：'+input.task.acceptance.join('；')+(input.task.forbidden?'\n禁止操作：'+input.task.forbidden:''):'';
  const prompt=input.instruction+taskRules+'\n\n操作约束：只在当前指定应用完成任务；依据当前真实截图选择入口，不套用其他手机布局。不修改账号，不执行任务未要求的交易、点赞、收藏、关注、发布或删除。不操作支付/验证码/密码页面。系统权限、剪贴板读取等新增权限弹窗一律选择“不允许/拒绝”，禁止选择“本次使用允许/始终允许”等授权按钮；本任务不需要新增权限。无法拒绝或需要人工处理时停止说明。完成后报告可见事实，不把猜测或文字答案代替界面实际结果。';
  const checkPermissions=async(name,param)=>{
    if(/^(?:back|home|HarmonyBackButton|HarmonyHomeButton|Scroll|Swipe)$/i.test(name))return;
    const began=Date.now(),view=await session.layout(),decision=assessPermissionAction(view.nodes,name,param);permissionChecks++;
    evidence.record({type:'permission_policy_check',policy:'deny_new_system_permissions_v1',action:name,duration_ms:Date.now()-began,...decision});
    if(!decision.allowed){permissionBlocks++;throw Object.assign(Error(decision.reason),{policy_blocked:true,effect_unknown:false});}
  };
  const repeatGuard=createRepeatedActionGuard(Object.hasOwn(input.limits,'max_repeated_actions')?input.limits.max_repeated_actions??Infinity:3);
  const action=async(name,param,operation)=>{
    if(control.signal.aborted)throw Error('已停止');if(limitReached(counter.value,input.limits.max_actions))throw Error('动作次数上限');
    repeatGuard({name,param});counter.value++;return session.atomic(name,param,operation);
  };
  const dispatch=async(name,p={})=>{validatePhysicalAction(name,p,session.screenSize());await checkPermissions(name,p);return action(name,p,async()=>{
    const touch=session.touch;
    for(const k of ['x','y','ex','ey'])if(p[k]!==undefined&&(!Number.isFinite(p[k])||p[k]<0))throw Error('动作坐标无效');
    if(name==='tap'||name==='doubleTap'||name==='longPress')return touch[name](p.x,p.y);
    if(name==='swipe')return touch.swipe(p.x,p.y,p.ex,p.ey);
    if(['back','home','clear','enter'].includes(name))return touch[name]();
    if(name==='input')return touch.input(p.text);
    if(name==='launch'){
      if(!input.bundle||![input.bundle,input.app].includes(p.app))throw Error('启动了任务范围外的应用');return touch.launch(input.bundle);
    }
    throw Error('动作不在已接通能力中：'+name);
  });};
  evidence.record({type:'execution_start',started_at:new Date(executionStarted).toISOString(),instruction:prompt,limits:input.limits});
  let nativeResult;
  const adapter=await import('../integrations/adapters/'+frameworkSpec(input.framework_id).adapter+'.mjs');
  nativeResult=await adapter.run({project,dir,input,service,key,session,evidence,transport,prompt,control,counter,checkPermissions,repeatGuard,dispatch,deferCleanup});
  const nativeFailure=nativeResult?.native_result?.success===false?nativeResult.native_result.message??'原生框架返回失败':null;
  result.status=permissionBlocks?'blocked':nativeFailure?'failed':'ended';result.native_result=nativeResult??null;if(permissionBlocks)result.reason='未授权的权限操作在设备执行前被拦截';else if(nativeFailure)result.reason=nativeFailure;evidence.record({type:'framework_return',native_result:nativeResult??null});
}catch(error){
  result.status=permissionBlocks?'blocked':control.signal.aborted?'stopped':executionStarted?'failed':'blocked';result.reason=error.message;result.effect_unknown=permissionBlocks?false:error.effect_unknown??false;
  evidence?.record({type:'execution_stopped',reason:error.message,effect_unknown:result.effect_unknown});
}finally{
  timer?.();clearInterval(watcher);
  result.action_effects=session?.effectState()??{effect_unknown:false,unknown_action_ids:[],pending_action_ids:[]};
  result.effect_unknown=Boolean(result.effect_unknown||result.action_effects.effect_unknown);
  if(result.effect_unknown){result.status='needs_attention';result.reason=result.reason??'动作效果存在不确定，需人工核对；禁止自动重放';}
  result.duration_ms=executionStarted?Date.now()-executionStarted:null;result.finished_at=new Date().toISOString();result.actions=counter.value;result.physical_actions=session?.physicalActions()??0;
  result.model_usage=transport?.summary()??result.model_usage;
  result.permission_policy={policy:'deny_new_system_permissions_v1',checks:permissionChecks,blocked_actions:permissionBlocks};
  if(evidence){evidence.phase='final_observation';try{result.final_asset=(await session.capture('final',{final:true})).asset;}catch(error){result.final_observation_error=error.message;}
    if(!control.signal.aborted)try{const view=await session.layout();evidence.save('final-layout.json',view.tree);result.final_texts=view.nodes.map(n=>n.text).filter(Boolean);}catch(error){result.final_layout_error=error.message;}
    evidence.save('result.json',result);evidence.record({type:'execution_end',status:result.status,usage:result.model_usage,actions:result.actions});
  }else await writeFile(path.join(dir,'result.json'),JSON.stringify(result,null,2),{flag:'wx',flush:true});
  await state({status:result.status,finished_at:result.finished_at,business_result:'pending_review',reason:result.reason??null});
  for(const close of cleanup.reverse())try{await close();}catch{}
  process.disconnect?.();
}
