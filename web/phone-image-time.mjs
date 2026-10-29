const valid=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const format=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hourCycle:'h23'});
export function phoneImageTime(run,asset){
  const events=run?.events??[],row=events.find(e=>e.type==='image'&&e.asset?.id===asset?.id),start=events.find(e=>e.type==='execution_start');
  const at=[asset?.captured_at,asset?.at,row?.at].find(valid)??null;
  const phase=asset?.phase??row?.phase;
  let elapsed=Number.isFinite(asset?.test_elapsed_ms)&&asset.test_elapsed_ms>=0?asset.test_elapsed_ms:null;
  const origin=[start?.started_at,start?.at].find(valid);
  if(elapsed==null&&at&&origin&&row&&row.seq>=start.seq&&Date.parse(at)>=Date.parse(origin))elapsed=Date.parse(at)-Date.parse(origin);
  const relative=elapsed!=null?'测试 +'+(elapsed/1000).toFixed(3)+'s':phase==='preparation'||row&&start&&row.seq<start.seq?'测试准备阶段':'测试用时未记录';
  return {at,elapsed_ms:elapsed,text:(at?'截图时间 '+format.format(new Date(at))+'（电脑，UTC+8）':'截图时间未记录')+' · '+relative};
}
