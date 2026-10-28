import {nodeCenter,sleep} from './phone-device.mjs';
import {assessPermissionAction} from './phone-permissions.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// The Luoshu extension and desktop capsule below were observed on HOP-AL10.
// Generic semantic candidates remain for other devices and fail when unknown.
const shown=n=>n.visible!==false&&n.visible!=='false';
const launcher=n=>/^(?:AppIcon_|Container_AppIcon_|AppName_text_|SwiperPage_|recent)/i.test(n.id??'');
const words=n=>[n.text,n.description].filter(Boolean).join(' ').replace(/\s/g,'');
const permission=nodes=>nodes.some(n=>/^permission_dialog_(?:body|title|reason)/.test(n.id??''));
const rect=n=>String(n.bounds??'').match(/-?\d+/g)?.map(Number);
const present=n=>{const r=rect(n);return shown(n)&&r?.length===4&&r[2]>r[0]&&r[3]>r[1];};
function localCalibrations(){return ['../.runtime/phone-companion-calibration.json','../integrations/phone-companion-profiles.json'].flatMap(file=>{try{const c=JSON.parse(readFileSync(fileURLToPath(new URL(file,import.meta.url)),'utf8'));return c.schema_version===1&&Array.isArray(c.profiles)?c.profiles:[];}catch{return [];}});}
export function matchingCompanionCalibration(environment,shot,profiles){
  if(!environment||!shot||!Array.isArray(profiles))return null;
  return profiles.find(p=>{
    if(!p||p.method!=='desktop_native_touch_double_tap_v1')return false;
    if(p.scope==='model_build_screen'){if(p.target_sha256!==undefined)return false;}
    else if(!environment.target_sha256||p.target_sha256!==environment.target_sha256)return false;
    for(const k of ['model','api','os_fullname','software_version'])if(!environment.device?.[k]||p.device?.[k]!==environment.device[k])return false;
    if(p.screen?.width!==shot.width||p.screen?.height!==shot.height)return false;
    const r=p.navigation_bounds;if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite))return false;
    const [x,y,ex,ey]=r,c=p.navigation_center;
    return x>=0&&y>=shot.height*.96&&ex<=shot.width&&ey<=shot.height&&ex>x&&ey>y&&ex-x>=(ey-y)*3&&Array.isArray(c)&&c.length===2&&c.every(Number.isSafeInteger)&&c[0]>=x&&c[0]<=ex&&c[1]>=y&&c[1]<=ey;
  })??null;
}
export function companionTouchCommand(x,y){
  if(![x,y].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=20000))throw Error('伴随态输入坐标无效');
  return ['shell',`uinput -T -d ${x} ${y} -i 80 -u ${x} ${y} -i 120 -d ${x} ${y} -i 80 -u ${x} ${y}`];
}
export function companionState(nodes){
  // Icons, launcher suggestions, voice-assistant pages and inactive navigation
  // hints are not proof of a running system companion.
  const markers=nodes.filter(n=>shown(n)&&n.active!==false&&n.active!=='false'&&!launcher(n)&&(
    /(?:companion|accompany)[_-](?:active|visible|running|minimal)(?:[_-]|$)/i.test(n.id??'')||
    /(?:洛书|小艺)?伴随(?:态|式AI)(?:已开启|运行中)|退出(?:洛书|小艺)?伴随(?:态|式AI)/i.test(words(n))
  ));
  const visible=nodes.filter(present),find=id=>visible.find(n=>n.id===id);
  const extension=visible.filter(n=>['LuoShu_UIExtension','LuoshuUiExt'].includes(n.id)&&n.type==='UIExtensionComponent');
  if(extension.length&&find('LuoShuSuggestView'))markers.push(...extension,find('LuoShuSuggestView'));
  const desktop=find('accompanyUI'),capsule=find('StatusCapsuleWrapper'),color=find('StateNavBarColorView_TEXT');
  if(desktop&&capsule&&color)markers.push(desktop,capsule,color);
  const strip=find('ColorStripWrapper'),aiBar=find('hds_aibar');
  if(desktop&&strip&&aiBar)markers.push(desktop,strip,aiBar);
  return {active:markers.length>0&&!permission(nodes),marker_ids:[...new Set(markers.map(n=>n.id).filter(Boolean))].sort()};
}
export function companionNavigation(nodes,size){
  const candidates=nodes.filter(n=>shown(n)&&n.enabled!==false&&n.enabled!=='false'&&!launcher(n)&&n.id!=='searchResultItem'&&!/^(?:Text|SearchField|TextInput)$/.test(n.type??'')&&(
    /(?:小艺|洛书|系统)导航条|双击.*伴随|伴随.*双击/.test(String(n.description??''))||
    /(?:gesture|system|celia|vassistant|luoshu|xiaoyi)[_-]?(?:navigation|nav)[_-]?(?:bar|handle)/i.test(n.id??'')
  )).filter(n=>{
    const r=String(n.bounds??'').match(/-?\d+/g)?.map(Number);if(r?.length!==4)return false;
    const [x,y,ex,ey]=r,w=ex-x,h=ey-y;
    return w>0&&h>0&&w>=h*3&&x>=0&&y>=0&&ex<=size.width&&ey<=size.height&&h<=size.height*.06&&ey>=size.height*.96;
  });
  const positions=new Map(candidates.map(n=>[nodeCenter(n).join(','),n]));
  if(positions.size!==1)throw Error('无法唯一识别底部伴随态导航条；请确认设备支持并启用“双击导航条触发伴随式AI”。未使用猜测坐标。');
  return [...positions.values()][0];
}
export async function resetCompanionHome(session,{wait=sleep,calibrations}={}){
  const {touch,layout}=session;
  let view=await layout();
  // An active desktop may be reused. Otherwise start with a single Home,
  // including when already on a different desktop page.
  if(!view.nodes.some(n=>n.id==='SCBDesktop_Flex_Desktop')||!companionState(view.nodes).active){
    if(permission(view.nodes))throw Error('伴随态起点出现权限提示，请手动处理后重试；不会自动授权。');
    await touch.home();await wait(700);view=await layout();
  }
  if(permission(view.nodes))throw Error('伴随态起点出现权限提示，请手动处理后重试；不会自动授权。');
  if(!view.nodes.some(n=>n.id==='SCBDesktop_Flex_Desktop'))throw Error('未确认手机桌面，未尝试开启伴随态。');
  if(companionState(view.nodes).active)return view;
  // Screenshots correct the SDK's cached portrait dimensions on this unfolded
  // phone. Never feed a landscape layout into an uncorrected size estimate.
  const shot=session.capture?await session.capture('companion-entry-check'):null;
  let node,nativePoint=null;
  try{node=companionNavigation(view.nodes,shot??await session.device.size());}
  catch(error){
    if(!shot||!session.environment)throw error;
    const environment=await session.environment(null),profiles=calibrations??localCalibrations(),profile=matchingCompanionCalibration(environment,shot,profiles);
    if(!profile)throw Error('当前设备缺少已验证的伴随态导航条标定，请先完成本机起点校验；未使用猜测坐标。');
    // The calibrated gesture runs on the desktop itself. No app is launched.
    const currentShot=await session.capture('companion-anchor');
    if(!matchingCompanionCalibration(environment,currentShot,[profile]))throw Error('伴随态入口方向或尺寸已变化，未执行双击。');
    view=await layout();
    if(permission(view.nodes))throw Error('伴随态入口出现权限提示，未自动授权。');
    if(!view.nodes.some(n=>n.id==='SCBDesktop_Flex_Desktop'))throw Error('伴随态入口已离开手机桌面，未执行双击。');
    if(companionState(view.nodes).active)return view;
    node={id:'verified-system-navigation-calibration',bounds:`[${profile.navigation_bounds[0]},${profile.navigation_bounds[1]}][${profile.navigation_bounds[2]},${profile.navigation_bounds[3]}]`};
    nativePoint=profile.navigation_center;
  }
  const [x,y]=nativePoint??nodeCenter(node);
  if(!assessPermissionAction(view.nodes,'doubleTap',{x,y}).allowed)throw Error('伴随态入口受权限提示阻挡，未执行双击。');
  // One desktop gesture; never launch an app or toggle repeatedly.
  if(nativePoint)await session.command(companionTouchCommand(x,y));else await touch.doubleTap(x,y);
  for(let i=0;i<10;i++){
    await wait(400);view=await layout();
    if(permission(view.nodes))throw Error('开启伴随态需要手动处理权限提示，未自动授权。');
    if(!view.nodes.some(n=>n.id==='SCBDesktop_Flex_Desktop'))throw Error('双击后未保持手机桌面，准备已停止；未打开其他应用或重复触发。');
    if(view.nodes.some(n=>n.id==='SCBDesktop_Flex_Desktop')&&companionState(view.nodes).active)return view;
  }
  throw Error('未确认手机桌面与洛书伴随态同时存在，准备已停止；没有重复触发或调用模型。');
}
