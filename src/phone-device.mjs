import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { findHdc,parseHdcTargets } from './hdc-environment.mjs';
import { sha256 } from './phone-evidence.mjs';
import { reconcileScreenshotSize } from './gui-screenshot-coordinates.mjs';
import { imageDimensions } from '../scripts/hdc-device-baseline.mjs';
import {privateScreenRects,maskPrivateScreen} from './phone-image-privacy.mjs';
const project=fileURLToPath(new URL('../',import.meta.url)),exec=promisify(execFile);
export const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
export function layoutNodes(tree) {
  const rows=[]; const walk=node=>{if(node?.attributes){const a=node.attributes;if(a.visible!=='false')rows.push(a);}for(const c of node?.children??[])walk(c);};walk(tree);return rows;
}
export function nodeCenter(node) {const n=node?.bounds?.match(/-?\d+/g)?.map(Number);if(n?.length!==4||n[2]<=n[0]||n[3]<=n[1])throw Error('控件坐标不可读');return [Math.round((n[0]+n[2])/2),Math.round((n[1]+n[3])/2)];}
export async function createPhoneDevice({evidence,signal,limits={max_actions:40}}) {
  const executable=findHdc({localConfigPath:path.join(project,'.runtime/device-tools.json')});if(!executable)throw Error('HDC 未安装');
  let target,physical=0,actionActive=false;
  const command=async (args,{global=false,final=false}={})=>{
    if(signal?.aborted&&!final)throw Error('已停止');
    const shell=args[0]==='shell'?args.slice(1).join(' '):'';
    if(/^uitest uiInput /.test(shell)&&evidence.phase==='execution'){
      if(!actionActive)throw Error('手机动作缺少先落盘的意图');if(physical>=limits.max_actions*4)throw Error('物理输入上限');physical++;
    }
    const id='hdc_'+randomUUID(),beg=Date.now();evidence.record({type:'hdc_intent',id,args,target_sha256:target?sha256(target):null});
    try{
      const r=await exec(executable,[...(!global&&target?['-t',target]:[]),...args],{shell:false,windowsHide:true,timeout:15000,maxBuffer:4*1024*1024,...(signal&&!final?{signal}:{})});
      if(/\[Fail\]|\bfailed\b|error:|Invalid parameters|Please confirm that the coordinate values are correct/i.test(r.stdout+r.stderr))throw Error('HDC 返回失败标记');
      evidence.record({type:'hdc_return',id,duration_ms:Date.now()-beg,stdout:global&&args[0]==='list'?'[target identifiers omitted]':r.stdout,stderr:r.stderr});return r.stdout;
    }catch(error){evidence.record({type:'hdc_failed_or_unknown',id,duration_ms:Date.now()-beg,error:error.message});throw Object.assign(Error('HDC 操作失败，效果可能未知；不自动重放'),{effect_unknown:actionActive});}
  };
  const targets=parseHdcTargets(await command(['list','targets'],{global:true}));if(targets.targets.length!==1)throw Error('需要唯一且已允许调试的设备');target=targets.targets[0];evidence.secrets.push(target);
  const {HarmonyDevice}=await import(new URL('../integrations/midscene/node_modules/@midscene/harmony/dist/es/index.mjs',import.meta.url));
  const device=new HarmonyDevice(target,{hdcPath:executable});const hdc=await device.connect();hdc.exec=(...args)=>command(args);device.describe=()=> '当前本机鸿蒙设备；以实时截图为准。';
  const capture=async (role='observation',{final=false,forModel=false}={})=>{
    const remote=`/data/local/tmp/behaviorlab-${randomUUID()}.jpeg`,local=path.join(evidence.dir,`capture-${randomUUID()}.jpeg`);
    await command(['shell',`snapshot_display -f ${remote}`],{final});await command(['file','recv',remote,local],{final});
    const bytes=await readFile(local),dimensions=imageDimensions(bytes),native=await device.size();
    const mapping=reconcileScreenshotSize(device,dimensions,native);if(mapping.corrected)evidence.record({type:'coordinate_basis_corrected',mapping});
    const asset=await evidence.image(bytes,'image/jpeg',role);let submitted=bytes;
    if(forModel){const view=await layout(),rects=privateScreenRects(view.nodes,target);if(rects.length){submitted=await maskPrivateScreen(bytes,rects);await evidence.image(submitted,'image/jpeg','model-screen-masked');evidence.record({type:'model_image_privacy',policy:'visible-identifiers-v1',rectangles:rects,original_asset:asset.id});}}
    return {asset,bytes:submitted,data:'data:image/jpeg;base64,'+submitted.toString('base64'),...dimensions};
  };
  // Retain every screenshot requested by native frameworks too.
  device.screenshotBase64=async()=> (await capture('sdk-observation',{forModel:true})).data;
  const layout=async()=>{
    const remote=`/data/local/tmp/behaviorlab-layout-${randomUUID()}.json`,local=path.join(evidence.dir,`layout-${randomUUID()}.json`);
    await command(['shell',`uitest dumpLayout -p ${remote}`]);await command(['file','recv',remote,local]);
    const tree=JSON.parse(await readFile(local,'utf8')),nodes=layoutNodes(tree);return {tree,nodes,file:path.basename(local)};
  };
  const environment=async bundle=>{
    const result={node:process.version,platform:process.platform,target_sha256:sha256(target),hdc_version:(await command(['-v'],{global:true})).trim(),device:{},app:null};
    for(const [field,key]of[['model','const.product.model'],['os_fullname','const.ohos.fullname'],['software_version','const.product.software.version'],['api','const.ohos.apiversion']])result.device[field]=(await command(['shell',`param get ${key}`])).trim()||null;
    if(bundle){const raw=await command(['shell',`bm dump -n ${bundle}`]);const j=JSON.parse(raw.slice(raw.indexOf('{')));result.app={bundle,version_name:j.versionName??null,version_code:j.versionCode??null};}return result;
  };
  const atomic=async(name,param,fn)=>{
    const id='action_'+randomUUID();evidence.actionId=id;const before=await capture('before');
    evidence.record({type:'action_intent',id,name,param,before:before.asset.id});actionActive=true;
    try{const r=await fn();evidence.record({type:'action_return',id});return r;}
    catch(error){evidence.record({type:'action_unknown',id,error:error.message});throw Object.assign(error,{effect_unknown:true});}
    finally{actionActive=false;await sleep(500);try{await capture('after',{final:signal?.aborted});}finally{evidence.actionId=null;}}
  };
  const touch={tap:(x,y)=>hdc.click(x,y),back:()=>hdc.keyEvent('Back'),home:()=>hdc.keyEvent('Home'),
    swipe:(x,y,ex,ey)=>hdc.swipe(x,y,ex,ey,1800),longPress:(x,y)=>hdc.longClick(x,y),doubleTap:(x,y)=>hdc.doubleClick(x,y),
    // Python native Type/input means typing into the already focused field.
    // inputText(x,y,...) clicks first; reusing the search-icon point loses focus.
    input:async text=>{if(typeof text!=='string'||text.length>1000||text.includes('\0'))throw Error('输入文本无效');const escaped=text.replace(/'/g,"'\\''");await command(['shell',`uitest uiInput text '${escaped}'`]);},
    clear:()=>hdc.clearTextField(),enter:()=>hdc.keyEvent('2054'),launch:bundle=>device.launch(bundle)};
  return {device,hdc,capture,layout,environment,command,touch,atomic,setActive:value=>{actionActive=value;},targetHash:sha256(target),physicalActions:()=>physical};
}
