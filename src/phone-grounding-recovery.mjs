import {createRequire} from 'node:module';
import {realpath} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {imageDimensions} from '../scripts/hdc-device-baseline.mjs';

function keywordArguments(call){
  const source=call.slice(call.indexOf('(')+1,-1),parts=[];let start=0,depth=0,quote=null,escaped=false;
  for(let i=0;i<source.length;i++){
    const c=source[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if('[({'.includes(c))depth++;else if('])}'.includes(c))depth--;
    else if(c===','&&depth===0){parts.push(source.slice(start,i));start=i+1;}
  }
  if(quote||depth!==0)return [];parts.push(source.slice(start));return parts;
}

// Recognize explicit coordinates in the pinned protocols only. Other parse
// errors still belong to the native parser; never guess units or repair values.
export function groundingIssue(framework,content){
  if(typeof content!=='string')return null;
  const points=[];
  const add=(field,value,size)=>points.push({field,value,size});
  const walk=value=>{
    if(!value||typeof value!=='object')return;
    for(const [key,item]of Object.entries(value)){
      if(key==='bbox_2d'&&item!=null)add(key,item,4);else walk(item);
    }
  };
  if(framework==='midscene'){
    for(const match of content.matchAll(/<action-param-json>\s*([\s\S]*?)\s*<\/action-param-json>/g)){
      try{walk(JSON.parse(match[1]));}catch{return null;}
    }
  }else if(framework==='mobiagent'){
    let action;try{action=JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{return null;}
    const p=action?.parameters;if(!p||typeof p!=='object'||!['click','click_input','long_press','swipe'].includes(action.action))return null;
    // The pinned Qwen JSON adapter uses normalized boxes/points, not pixels.
    for(const key of ['bbox','coords','start_coords','end_coords'])if(p[key]!=null)add(key,p[key],key==='bbox'?4:2);
  }else if(framework==='autoglm'){
    const answer=content.match(/<answer>([\s\S]*?)<\/answer>/)?.[1]??content.replace(/<think>[\s\S]*?<\/think>/g,'');
    const call=answer.trim();if(!/^do\s*\([\s\S]*\)$/.test(call))return null;
    for(const argument of keywordArguments(call)){
      const m=argument.match(/^\s*(element|start|end)\s*=\s*(\[[\s\S]*\])\s*$/);if(!m)continue;
      try{add(m[1],JSON.parse(m[2]),2);}catch{return null;}
    }
  }else throw Error('未知的定位协议');
  for(const {field,value,size}of points){
    if(!Array.isArray(value)||value.length!==size||value.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1000))return {field,reason:`${field}必须是${size}个0–1000范围内的有限数值`,coordinates:value};
    if(size===4&&(value[2]<=value[0]||value[3]<=value[1]))return {field,reason:`${field}矩形必须满足左<右、上<下`,coordinates:value};
  }
  return null;
}

let sharp;
export async function resizeGroundingImage(bytes,width,height){
  if(!sharp){
    const require=createRequire(await realpath(new URL('../integrations/midscene/node_modules/@midscene/harmony/package.json',import.meta.url)));
    const shared=createRequire(require.resolve('@midscene/shared/img'));
    sharp=(await import(pathToFileURL(shared.resolve('sharp')).href)).default;
  }
  return sharp(bytes).resize(width,height,{fit:'fill'}).jpeg({quality:90}).toBuffer();
}

const localImage=item=>item?.type==='image_url'&&/^data:image\/(?:png|jpeg);base64,/.test(item.image_url?.url??'');
function latestImage(body){
  for(const message of [...(body.messages??[])].reverse())if(message.role==='user'&&Array.isArray(message.content)){
    const found=[...message.content].reverse().find(localImage);if(found)return found;
  }
  throw Error('重新定位缺少原模型输入截图，停止核对');
}
function correctionBody(original,content,reason,image,attempt){
  const body=structuredClone(original);
  // Retain task/history text but remove stale images. The final image is the
  // only current observation, preserving finite image-count budgets as well.
  body.messages=body.messages.map(m=>Array.isArray(m.content)?{...m,content:m.content.filter(i=>i.type!=='image_url')}:m).filter(m=>!Array.isArray(m.content)||m.content.length);
  body.messages.push({role:'assistant',content},{role:'user',content:[
    {type:'text',text:`[BehaviorLab grounding correction ${attempt}/2] 上个响应的定位坐标无效：${reason}。该响应尚未交给框架，其中任何动作都没有执行，不要把它记为已完成。请依据下面刚采集的当前截图重新决定接下来的一步；坐标必须相对于整张截图归一化到0–1000，不能使用像素、沿用历史坐标、猜测缩放或裁剪越界值。目标未充分可见时可选择小范围滚动或如实说明无法定位。保留原任务、禁止操作与原生回复格式，不重放已完成的步骤。`},
    {type:'image_url',image_url:{url:'data:image/jpeg;base64,'+image.toString('base64'),detail:'high'}}
  ]});
  return body;
}

/** Correction requests are new audited requests, never retries of device I/O. */
export function createGroundingRecovery({framework,transport,session,record,signal,resize=resizeGroundingImage}){
  const screen={...session.screenSize()};
  let attempts=0,corrected=0,exhausted=0,active=false;
  const safe=()=>{
    signal?.throwIfAborted();const state=session.effectState();
    if(state.effect_unknown||state.pending_action_ids?.length||state.unknown_action_ids?.length)throw Object.assign(Error('动作效果不确定，禁止自动重新定位'),{effect_unknown:true});
  };
  return {
    async fetch(url,options){
      if(active)throw Error('不允许并行模型定位请求');active=true;
      try{
        const original=JSON.parse(options.body);let current=options,corrections=0;
        for(;;){
          signal?.throwIfAborted();options.signal?.throwIfAborted();
          const response=await transport.fetch(url,current);
          if(!response.ok)return response;
          let data;try{data=await response.clone().json();}catch{return response;}
          // Multiple-choice or unknown reply formats remain native-parser errors.
          if(data.choices?.length!==1)return response;
          const content=data.choices[0]?.message?.content,issue=groundingIssue(framework,content);
          if(!issue){if(corrections){corrected++;await record({type:'grounding_recovery_returned',framework,corrections,reason:'已收到重新定位回复，未发现可识别的坐标越界；继续原生框架解析，不代表业务成功'});}return response;}
          await record({type:'grounding_response_rejected',framework,correction:corrections,...issue,action_not_sent:true,effect_unknown:false});
          // REVIEW(v0.4): Recovery is allowed only before dispatch and with
          // known usage/effects. It cannot repair an already executed action.
          safe();options.signal?.throwIfAborted();
          if(transport.summary().unknown_usage_requests)throw Error('定位回复用量未确认，不自动重新请求');
          if(corrections>=2){exhausted++;await record({type:'grounding_recovery_exhausted',framework,corrections,reason:'连续重新定位仍无效，已停止；未发送无效动作'});throw Error('坐标定位无效，最多2次重新定位仍未通过；未发送该动作');}
          const budget=transport.canRequest?.();if(budget===false)throw Error('模型请求限额已用完，未继续重新定位');
          const originalImage=latestImage(original),dims=imageDimensions(Buffer.from(originalImage.image_url.url.split(',')[1],'base64'));
          const shot=await session.capture('grounding-recovery',{forModel:true});safe();options.signal?.throwIfAborted();
          if(shot.width!==screen.width||shot.height!==screen.height)throw Error('重新定位期间屏幕尺寸或方向变化，请核对起点');
          const image=await resize(shot.bytes,dims.width,dims.height);safe();options.signal?.throwIfAborted();
          current={...options,body:JSON.stringify(correctionBody(original,content,issue.reason,image,++corrections))};attempts++;
          await record({type:'grounding_recovery_requested',framework,attempt:corrections,max_corrections:2,source_asset_id:shot.asset?.id,reason:'重新截图后请求重新定位；计入模型请求限额，不重放旧动作',action_not_sent:true});
        }
      }finally{active=false;}
    },
    summary:()=>({...transport.summary(),grounding_recovery:{correction_requests:attempts,correction_responses:corrected,exhausted_decisions:exhausted,max_corrections_per_decision:2}})
  };
}
