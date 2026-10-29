// null/0 means no application deadline. Chunk finite waits so Node's 32-bit
// timer range cannot turn a long task into an immediate timeout.
export const limitReached=(count,limit)=>limit!=null&&limit>0&&count>=limit;
export function scheduleDeadline(callback,delayMs,{clock=Date.now,schedule=setTimeout,cancel=clearTimeout}={}){
  if(delayMs==null||delayMs===0)return ()=>{};
  if(!Number.isFinite(delayMs)||delayMs<0)throw Error('Invalid deadline');
  const started=clock();let timer,stopped=false;
  const arm=()=>{if(stopped)return;const remaining=delayMs-(clock()-started);if(remaining<=0){stopped=true;callback();}else timer=schedule(arm,Math.min(remaining,2147483647));};
  arm();return ()=>{stopped=true;if(timer!=null)cancel(timer);};
}
