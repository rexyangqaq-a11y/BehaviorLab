import {instrumentGuiDevice} from '../../src/gui-device-journal.mjs';
import {sleep} from '../../src/phone-device.mjs';
export async function run({project,dir,input,service,key,session,evidence,transport,prompt,control,counter,checkPermissions,repeatGuard,dispatch,deferCleanup}){
    const {HarmonyAgent}=await import(new URL('../midscene/node_modules/@midscene/harmony/dist/es/index.mjs',import.meta.url));
    const device=session.device,nativeActions=device.actionSpace.bind(device);
    const allowed=new Set(['Tap','DoubleClick','LongPress','Input','ClearInput','KeyboardPress','Scroll','Swipe','HarmonyBackButton','HarmonyHomeButton']);
    device.actionSpace=()=>nativeActions().filter(a=>allowed.has(a.name));
    instrumentGuiDevice(device,{capture:async()=>{},intent:async a=>{
      if(control.signal.aborted||counter.value>=input.limits.max_actions)throw Error('动作或时间上限');
      await checkPermissions(a.name,a.param);
      repeatGuard(a);counter.value++;const id='sdk_action_'+counter.value;evidence.actionId=id;await session.capture('before');evidence.record({type:'action_intent',id,name:a.name,param:a.param});session.setActive(true);return id;
    },outcome:async(id,outcome)=>{session.setActive(false);evidence.record({type:outcome.status==='returned'?'action_return':'action_unknown',id,outcome});await sleep(500);await session.capture('after',{final:control.signal.aborted});evidence.actionId=null;if(outcome.status!=='returned')control.abort('unknown_action_effect');}});
    const agent=new HarmonyAgent(device,{generateReport:false,persistExecutionDump:false,autoPrintReportMsg:false,cache:false,replanningCycleLimit:input.limits.max_requests,
      screenshotShrinkFactor:2,waitAfterAction:500,modelConfig:{MIDSCENE_MODEL_NAME:service.model,MIDSCENE_MODEL_API_KEY:key,MIDSCENE_MODEL_BASE_URL:service.base_url,
        MIDSCENE_MODEL_FAMILY:input.service.family,MIDSCENE_MODEL_STREAM_MODE:'non-stream',MIDSCENE_MODEL_RETRY_COUNT:0,MIDSCENE_MODEL_TIMEOUT:30000,MIDSCENE_MODEL_REASONING_ENABLED:'false',
        MIDSCENE_MODEL_EXTRA_BODY_JSON:JSON.stringify({max_tokens:input.limits.max_output_tokens,enable_thinking:false})},
      createOpenAIClient:async client=>client.withOptions({maxRetries:0,timeout:30000,fetch:transport.fetch,logLevel:'off'}),onLLMUsage:usage=>evidence.record({type:'sdk_usage',usage})});
    // HarmonyAgent shares the device session. Preserve its lifetime through
    // worker final observation/persistence, matching the original worker.
    deferCleanup(()=>agent.destroy());
    return await agent.aiAct(prompt,{deepThink:false,abortSignal:control.signal});

}
