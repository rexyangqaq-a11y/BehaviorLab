import {randomUUID} from 'node:crypto';
// Inject explicitly into device-free workbench fixtures. Never query real HDC.
export function syntheticHilog({context}={}){
  let current=null,last=null;
  const status=()=>({available:false,state:current?'capturing':'idle',current,recordings:last?[last]:[]});
  return {status,recordings:()=>last?[last]:[],async start(){current={id:'hilog_'+randomUUID(),state:'capturing',context,started_at:new Date().toISOString(),bytes:0,parts:[],synthetic:true};return status();},async stop(reason){if(current){last={...current,state:'stopped',reason,finished_at:new Date().toISOString()};current=null;}return status();},async close(){await this.stop('fixture close');}};
}
