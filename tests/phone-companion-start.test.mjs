import test from 'node:test';
import {syntheticHilog} from './helpers/phone-hilog-fixture.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {companionState,companionNavigation,resetCompanionHome,matchingCompanionCalibration,companionTouchCommand} from '../src/phone-companion-start.mjs';
import {BUILTIN_COMPANION_START,BUILTIN_HOME_START,namedStartContract,compareStart} from '../src/phone-startpoints.mjs';
import {PhoneLab} from '../src/phone-lab.mjs';
import {createDebugServer} from '../src/web-server.mjs';

// Synthetic accessibility fixtures. These are not observed phone selectors.
const desktop=[{id:'SCBDesktop_Flex_Desktop'},{id:'AppIcon_Image_fixture',bounds:'[20,20][80,80]'}];
const nav={id:'system_navigation_bar',description:'小艺导航条',bounds:'[350,1950][650,1980]'};
const active={id:'system_companion_active_overlay',description:'小艺伴随式AI已开启',bounds:'[350,1900][650,1940]'};
const size={width:1000,height:2000},environment={target_sha256:'synthetic',device:{model:'fixture'},app:null},shot={width:1000,height:2000};
const make=nodes=>namedStartContract({environment,shot,nodes,recipeId:BUILTIN_COMPANION_START.id});
const noWait=async()=>{};
function device({already=false,activate=true,permission=false,extra=[]}={}){
  const actions=[];let enabled=already,panel=false;
  const layout=async()=>({nodes:[...(panel?[]:desktop),nav,...(enabled?[active]:[]),...(permission?[{id:'permission_dialog_title',text:'请求权限'}]:[]),...extra]});
  return {actions,session:{layout,device:{size:async()=>size},command:()=>assert.fail('no guessed shell/Ability command'),touch:{home:async()=>{actions.push('home');panel=false;},doubleTap:async(x,y)=>{actions.push(['doubleTap',x,y]);enabled=activate;}}}};
}
async function labFixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'behavior-companion-'));
  const lab=new PhoneLab(root,{hilogFactory:syntheticHilog,lockPath:path.join(root,'lock'),pausePath:path.join(root,'pause'),deviceFactory:async()=>assert.fail('No real phone allowed')});
  t.after(async()=>{await lab.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('behavior-companion-'));await rm(root,{recursive:true,force:true});});
  return {root,lab};
}
const settings={services:[{id:'fixture',model:'qwen3.8-flash',protocol:'openai-chat'}]};

const observed=ids=>ids.map(id=>({id,bounds:'[10,10][90,40]',type:id==='LuoshuUiExt'?'UIExtensionComponent':'Column'}));
test('observed Luoshu extension, capsule and collapsed color strip require complete visible groups',()=>{
  for(const ids of [['LuoshuUiExt','LuoShuSuggestView'],['accompanyUI','StatusCapsuleWrapper','StateNavBarColorView_TEXT'],['accompanyUI','ColorStripWrapper','hds_aibar']]){
    const nodes=observed(ids);assert.equal(companionState(nodes).active,true);
    for(let i=0;i<nodes.length;i++)assert.equal(companionState(nodes.filter((_,j)=>i!==j)).active,false);
    assert.equal(companionState(nodes.map(n=>({...n,visible:false}))).active,false);
  }
  assert.equal(companionState(observed(['LuoShu-Settings'])).active,false);
  assert.throws(()=>companionNavigation([{...nav,id:'searchResultItem',type:'Text',description:'双击导航条触发伴随式 AI'}],size),/无法唯一识别/);
});

const calibratedEnvironment={target_sha256:'fixture-device',device:{model:'fixture-fold',api:'26',os_fullname:'fixture-os',software_version:'fixture-build'}};
const calibratedShot={width:2584,height:1828};
const calibration={target_sha256:'fixture-device',device:{...calibratedEnvironment.device},screen:calibratedShot,navigation_bounds:[926,1798,1656,1813],navigation_center:[1291,1805],method:'desktop_native_touch_double_tap_v1'};

test('bundled measured model calibration works for another unit of the same build and orientation only',async()=>{
  const {readFile}=await import('node:fs/promises');
  const profile=JSON.parse(await readFile(new URL('../integrations/phone-companion-profiles.json',import.meta.url),'utf8')).profiles[0];
  assert.equal(profile.scope,'model_build_screen');assert.equal(profile.target_sha256,undefined);
  assert.deepEqual(profile.navigation_center,[1291,1805]);assert.equal(profile.method,'desktop_native_touch_double_tap_v1');
  const env={target_sha256:'another-unit',device:{...profile.device}};
  assert.equal(matchingCompanionCalibration(env,profile.screen,[profile]),profile);
  for(const key of ['model','api','software_version','os_fullname'])assert.equal(matchingCompanionCalibration({...env,device:{...env.device,[key]:'different'}},profile.screen,[profile]),null);
  assert.equal(matchingCompanionCalibration(env,{width:1828,height:2584},[profile]),null);
});
test('native touch calibration binds exact device, build and screenshot orientation with fixed command syntax',()=>{
  assert.equal(matchingCompanionCalibration(calibratedEnvironment,calibratedShot,[null,calibration]),calibration);
  for(const profile of [{...calibration,target_sha256:'other'},{...calibration,device:{...calibration.device,software_version:'other'}},{...calibration,navigation_center:[1,1]},{...calibration,method:'settings_native_touch_double_tap_v1'}])assert.equal(matchingCompanionCalibration(calibratedEnvironment,calibratedShot,[profile]),null);
  assert.equal(matchingCompanionCalibration(calibratedEnvironment,{width:1828,height:2584},[calibration]),null);
  assert.equal(matchingCompanionCalibration(null,null,null),null);
  assert.deepEqual(companionTouchCommand(1291,1805),['shell','uinput -T -d 1291 1805 -i 80 -u 1291 1805 -i 120 -d 1291 1805 -i 80 -u 1291 1805']);
  for(const value of [NaN,1.5,-1,'1; command'])assert.throws(()=>companionTouchCommand(value,1805),/坐标无效/);
});

test('calibrated cold preparation returns home, double-taps there once and refuses rotation without launching apps',async()=>{
  for(const rotated of [false,true]){
    let state='app',polls=0,captures=0;const actions=[];
    const session={layout:async()=>({nodes:state==='app'?[]:[...desktop,...(state==='waiting'&&++polls>=3?observed(['accompanyUI','ColorStripWrapper','hds_aibar']):[])]}),environment:async()=>calibratedEnvironment,capture:async()=>rotated&&++captures===2?{width:1828,height:2584}:calibratedShot,device:{launch:async()=>assert.fail('must not launch any app'),size:async()=>assert.fail('screenshot supplies dimensions')},command:async argv=>{actions.push(argv);state='waiting';},touch:{home:async()=>{actions.push('home');state='home';},doubleTap:async()=>assert.fail('native calibrated route required')}};
    if(rotated){await assert.rejects(resetCompanionHome(session,{wait:noWait,calibrations:[calibration]}),/方向或尺寸已变化/);assert.deepEqual(actions,['home']);}
    else{const view=await resetCompanionHome(session,{wait:noWait,calibrations:[calibration]});assert.equal(companionState(view.nodes).active,true);assert.deepEqual(actions,['home',companionTouchCommand(1291,1805)]);assert.equal(polls,3);}
  }
});

test('icons, assistant pages and navigation hints never count as active companion evidence',()=>{
  for(const node of [nav,{id:'AppIcon_Image_companion_active',text:'洛书'},{id:'VoiceAbility',text:'小艺'},{id:'companion_panel'},{id:'title',text:'伴随式AI'},{...active,visible:'false'},{...active,active:false}])assert.equal(companionState([node]).active,false);
  assert.equal(companionState([active]).active,true);assert.equal(companionState([active,{id:'permission_dialog_title'}]).active,false);
  assert.equal(companionNavigation([nav,{...nav,id:'same-center'}],size).id,'same-center');
  for(const nodes of [[],[{...nav,bounds:'[0,0][1000,2000]'}],[nav,{...nav,bounds:'[100,1950][250,1980]'}]])assert.throws(()=>companionNavigation(nodes,size),/无法唯一识别/);
});

test('an already active companion survives reset without being toggled or launched again',async()=>{
  const f=device({already:true}),view=await resetCompanionHome(f.session,{wait:noWait});
  assert.equal(companionState(view.nodes).active,true);assert.deepEqual(f.actions,[]);
});

test('inactive companion uses one observed navigation double-tap and returns to coexisting desktop state',async()=>{
  const f=device(),view=await resetCompanionHome(f.session,{wait:noWait});
  assert.deepEqual(f.actions,['home',['doubleTap',500,1965]]);assert.equal(make(view.nodes).ready,true);
});

test('unknown activation and permission prompts block preparation without repeated gestures or grants',async()=>{
  const timeout=device({activate:false});await assert.rejects(resetCompanionHome(timeout.session,{wait:noWait}),/未确认手机桌面与洛书/);
  assert.equal(timeout.actions.filter(a=>Array.isArray(a)).length,1);
  const denied=device({permission:true});await assert.rejects(resetCompanionHome(denied.session,{wait:noWait}),/不会自动授权/);assert.deepEqual(denied.actions,[]);
  const missing=device({extra:[{...nav,bounds:'[100,1950][250,1980]'}]});await assert.rejects(resetCompanionHome(missing.session,{wait:noWait}),/无法唯一识别/);assert.deepEqual(missing.actions,['home']);
});

test('a companion panel outside desktop fails rather than opening apps or adding a return-home action',async()=>{
  const f=device();let tapped=false;f.session.layout=async()=>({nodes:tapped?observed(['LuoshuUiExt','LuoShuSuggestView']):[...desktop,nav]});
  f.session.touch.doubleTap=async(x,y)=>{f.actions.push(['doubleTap',x,y]);tapped=true;};
  await assert.rejects(resetCompanionHome(f.session,{wait:noWait}),/双击后未保持手机桌面/);
  assert.deepEqual(f.actions,['home',['doubleTap',500,1965]]);
});

test('desktop plus companion has a separate invariant contract and ignores dynamic greetings',()=>{
  const a=make([...desktop,active,{id:'greeting',text:'合成问候1'}]),b=make([...desktop,{...active,id:'companion_minimal'},{id:'greeting',text:'合成问候2'}]);
  assert.equal(a.ready,true);assert.equal(a.recipe_id,BUILTIN_COMPANION_START.id);assert.equal(compareStart(a,b).same,true);
  assert.equal(make(desktop).ready,false);assert.equal(make([active]).ready,false);assert.equal(make([...desktop,active,{id:'KeyCanvasKeyboard'}]).ready,false);
  const home=namedStartContract({environment,shot,nodes:desktop});assert.equal(compareStart(home,a).same,false);assert.equal(home.recipe_id,undefined);
});

test('new builtin can be selected and persisted while paused without changing existing task defaults',async t=>{
  const {root,lab}=await labFixture(t);lab.pause();const catalog=await lab.catalog({services:[]});
  assert.ok(catalog.starts.some(s=>s.id===BUILTIN_COMPANION_START.id&&s.builtin&&!s.contract.ready&&!s.asset));assert.equal(lab.listTasks().find(t=>t.id==='HM-CALC-001').startpoint_id,BUILTIN_HOME_START.id);
  const app=await createDebugServer({dataRoot:root,port:0,phoneLabOptions:{lockPath:path.join(root,'other-lock'),pausePath:path.join(root,'pause'),deviceFactory:()=>assert.fail('no hardware')}});
  try{const response=await fetch(app.url+'/api/phone-lab/tasks/HM-CALC-001/startpoint',{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-UI':'1'},body:JSON.stringify({expected_revision:3,startpoint_id:BUILTIN_COMPANION_START.id,reuse:true})});assert.equal(response.status,200);
    assert.equal((await(await fetch(app.url+'/api/phone-lab')).json()).tasks.find(t=>t.id==='HM-CALC-001').startpoint_id,BUILTIN_COMPANION_START.id);
  }finally{await app.close();}
  assert.equal(lab.taskStart(lab.tasks.get('HM-CALC-001')).id,BUILTIN_COMPANION_START.id);
});

test('unverified companion blocks a single run before worker/model dispatch',async t=>{
  const {lab}=await labFixture(t);await lab.selectTaskStart('HM-CALC-001',{expected_revision:3,startpoint_id:BUILTIN_COMPANION_START.id});
  let captures=0;lab.captureStart=async(input,options)=>{captures++;assert.equal(input.reset,true);assert.equal(options.taskSnapshot.reset,'home_companion');assert.equal(options.startRecipeId,BUILTIN_COMPANION_START.id);return {contract:{ready:false,reset:'home_companion'}};};
  await assert.rejects(lab.start({case_id:'HM-CALC-001',framework_id:'midscene',service_id:'fixture'},settings),/未确认手机桌面与洛书/);assert.equal(captures,1);assert.equal(lab.children.size,0);
});

test('every matrix unit preserves the companion recipe and checks against the first baseline',async t=>{
  const {lab}=await labFixture(t);await lab.selectTaskStart('HM-CALC-001',{expected_revision:3,startpoint_id:BUILTIN_COMPANION_START.id});
  let captures=0,starts=0;
  lab.captureStart=async(input,options)=>{assert.equal(input.reset,true);assert.equal(options.taskSnapshot.reset,'home_companion');assert.equal(options.startRecipeId,BUILTIN_COMPANION_START.id);return {id:'start_00000000-0000-0000-0000-000000000001',named:true,contract:{...make([...desktop,active]),comparison_key:++captures===1?'frozen-companion':'drift'}};};
  lab.start=async()=>{starts++;return {id:'synthetic-run'};};lab.summary=()=>({state:{status:'ended'}});
  const batch=await lab.batch({case_ids:['HM-CALC-001'],combinations:[{framework_id:'midscene',service_id:'fixture'},{framework_id:'autoglm',service_id:'fixture'}]},settings);await lab.batchCompletion;
  assert.equal(captures,2);assert.equal(starts,1);assert.equal(batch.status,'blocked');assert.equal(batch.baselines['HM-CALC-001'].contract.comparison_key,'frozen-companion');
});

test('capture pipeline persists the companion recipe for the worker to recheck, not plain home',async t=>{
  const {lab}=await labFixture(t),f=device({already:true});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGDkAAAAASUVORK5CYII=','base64');
  lab.deviceFactory=async({evidence})=>({...f.session,layout:async()=>{const view=await f.session.layout();await writeFile(path.join(evidence.dir,'fixture-layout.json'),JSON.stringify({synthetic:true}));return {...view,file:'fixture-layout.json'};},environment:async bundle=>{assert.equal(bundle,null);return environment;},capture:async()=>({asset:await evidence.image(png,'image/png','start'),...shot})});
  const point=await lab.prepareBuiltinStart(lab.tasks.get('HM-CALC-001'),BUILTIN_COMPANION_START.id);
  assert.equal(point.contract.recipe_id,BUILTIN_COMPANION_START.id);assert.equal(point.contract.reset,'home_companion');assert.equal(point.contract.ready,true);assert.equal(point.reset_available,true);assert.equal(point.library_visible,false);assert.equal(point.contract.named_start,true);
});
