/** Durable intent/outcome projection. An SDK return is not business verification. */
export function actionEffects(events=[]){
  const pending=new Set(),unknown=new Set();
  for(const e of events){
    if(e.type==='action_intent'&&e.id)pending.add(e.id);
    if(['action_return','action_rejected'].includes(e.type))pending.delete(e.id);
    if(['action_unknown','action_observation_failed'].includes(e.type)){pending.delete(e.id);unknown.add(e.id??e.action_id??'unidentified_action');}
    if(e.type==='hdc_failed_or_unknown'&&e.effect_unknown)unknown.add(e.action_id??e.id);
    if(e.type==='evidence_ledger_invalid')unknown.add('incomplete_ledger');
  }
  return {effect_unknown:Boolean(pending.size||unknown.size),pending_action_ids:[...pending],unknown_action_ids:[...unknown],automatic_replay:false};
}

export function unexpectedWorkerState(previous,events,error=null){
  const effects=actionEffects(events);
  return {...previous,status:effects.effect_unknown?'needs_attention':error?'blocked':'interrupted',effect_unknown:effects.effect_unknown,action_effects:effects,reason:error?.message??'Worker exited; effects require review, no resume/replay',finished_at:new Date().toISOString()};
}

export function validatePhysicalAction(name,param,screen){
  const points=['tap','doubleTap','longPress'].includes(name)?[['x','y']]:name==='swipe'?[['x','y'],['ex','ey']]:[];
  for(const [x,y] of points){
    if(!screen||!Number.isFinite(screen.width)||!Number.isFinite(screen.height))throw Object.assign(Error('缺少已观察的屏幕尺寸，未发送动作'),{action_not_sent:true,effect_unknown:false});
    if(!Number.isFinite(param[x])||!Number.isFinite(param[y])||param[x]<0||param[y]<0||param[x]>=screen.width||param[y]>=screen.height)throw Object.assign(Error('动作坐标超出已观察屏幕，未发送动作'),{action_not_sent:true,effect_unknown:false});
  }
}

/** Preserve the primary error when observation or journal cleanup also fails. */
export async function observedAction({id,record,perform,after}){
  let value,primary,observation;
  try{value=await perform();record({type:'action_return',id});}
  catch(error){primary=error;try{record({type:error.action_not_sent?'action_rejected':'action_unknown',id,error:error.message});}catch{} }
  try{await after();}catch(error){observation=error;try{record({type:'action_observation_failed',id,error:error.message});}catch{} }
  if(primary)throw Object.assign(primary,{effect_unknown:!primary.action_not_sent,observation_error:observation?.message});
  if(observation)throw Object.assign(Error('动作已返回，但后续观察失败，需核对实际结果',{cause:observation}),{effect_unknown:true});
  return value;
}
