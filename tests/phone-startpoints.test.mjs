import test from 'node:test';
import assert from 'node:assert/strict';
import {startContract,compareStart,resetPhoneStart} from '../src/phone-startpoints.mjs';
import {PHONE_CASES,normalizePhoneLimits} from '../src/phone-lab-catalog.mjs';
const environment={target_sha256:'fixture-device',device:{model:'fixture',api:'26'},app:{bundle:'fixture',version_name:'1'}};
const settings=()=>startContract({environment,shot:{width:2584,height:1828},nodes:['设置','星闪和蓝牙','WLAN','星闪和蓝牙'].map(text=>({text})),task:PHONE_CASES[0]});
test('suite contains five complete tasks and optional unlimited execution limits',()=>{
  assert.equal(PHONE_CASES.length,5);assert.equal(PHONE_CASES.filter(c=>/HM-(TB|XHS)/.test(c.id)).length,2);
  assert.equal(normalizePhoneLimits().max_requests,null);assert.equal(normalizePhoneLimits().automatic_retries,0);
  assert.equal(normalizePhoneLimits({max_requests:1000000}).max_requests,1000000);
  assert.throws(()=>normalizePhoneLimits({max_requests:-1}),/max_requests/);
});
test('starting-state comparison refuses a different device, version, rotation or unmet page condition',()=>{
  const a=settings();assert.equal(a.ready,true);assert.equal(compareStart(a,settings()).same,true);
  for(const altered of [{...a,comparison_key:'different-version'},{...a,ready:false}])assert.equal(compareStart(a,altered).same,false);
  const b=startContract({environment,shot:{width:1828,height:2584},nodes:[{text:'设置'}],task:PHONE_CASES[0]});
  assert.equal(compareStart(a,b).same,false);
});
test('manual start records a page signature; a changed query cannot masquerade as the same starting state',()=>{
  const make=text=>startContract({environment,shot:{width:100,height:200},nodes:[{id:'query',type:'TextInput',text,bounds:'[0,0][100,30]'}],manual:true});
  assert.equal(compareStart(make(''),make('different')).same,false);
  assert.throws(()=>startContract({environment,shot:{width:100,height:200},nodes:[{id:'ScreenLockRootComponent'}],manual:true}),/锁屏/);
});

test('calculator keypad zero and an unfocused empty app field cannot falsely pass the starting-state contract',()=>{
  const make=(id,nodes)=>startContract({environment,shot:{width:100,height:200},nodes,task:{...PHONE_CASES.find(c=>c.id===id),reset:id==='HM-CALC-001'?'calculator':'taobao_search'}});
  assert.equal(make('HM-CALC-001',['0','1','9'].map(text=>({type:'Button',text}))).ready,false);
  assert.equal(make('HM-CALC-001',[{id:'result',type:'Text',text:'0'},{id:'expression',type:'Text',text:''},{text:'1'},{text:'9'}]).ready,true);
  assert.equal(make('HM-TB-001',[{id:'search',type:'TextInput',text:'',focused:'false'},{text:'搜索'}]).ready,false);
});

test('all four remaining tasks start on the same home page; changed icons or a foreground input fail comparison',()=>{
  const task=PHONE_CASES.find(c=>c.id==='HM-CALC-001'),nodes=[{id:'SCBDesktop_Flex_Desktop'},{id:'AppIcon_Image_fixture',bounds:'[1,2][30,40]'}];
  const make=n=>startContract({environment,shot:{width:2584,height:1828},nodes:n,task});
  assert.equal(PHONE_CASES.filter(c=>c.reset==='home').length,4);assert.equal(make(nodes).ready,true);
  assert.equal(compareStart(make(nodes),make([{id:'SCBDesktop_Flex_Desktop'},{id:'AppIcon_Image_other',bounds:'[1,2][30,40]'}])).same,false);
  assert.equal(make([...nodes,{type:'TextInput',focused:'true'}]).ready,false);
});

test('home preparation stops only the target process and returns home; it never opens or completes the task app',async()=>{
  const actions=[],task=PHONE_CASES.find(c=>c.id==='HM-TB-001');
  const session={command:async args=>actions.push(args),touch:{home:async()=>actions.push('home')},device:{launch:()=>{throw Error('must not launch target app');}},layout:async()=>({nodes:[]})};
  await resetPhoneStart(session,task);assert.deepEqual(actions,[['shell','aa','force-stop',task.bundle],'home','home']);
});

test('logical home preserves recent-app changes as evidence and checks the main page rather than exact icon positions',()=>{
  const task=PHONE_CASES.find(c=>c.id==='HM-TB-001'),fixed=[{id:'SCBDesktop_Flex_Desktop'},{id:'AppIcon_Image_fixed',bounds:'[1,2][30,40]'}];
  const recent=(id,x)=>({id:'AppIcon_Image_'+id+'_123_1',bounds:`[${x},100][${x+20},120]`});
  const make=nodes=>startContract({environment,shot:{width:2584,height:1828},nodes,task});
  const a=make([...fixed,recent('a',10),recent('b',40)]),b=make([...fixed,recent('b',10),recent('a',40),{id:'AppIcon_Image_suggestion_999_undefined',bounds:'[0,0][10,10]'}]);
  assert.equal(compareStart(a,b).same,true);assert.notDeepEqual(a.recent_dock_order,b.recent_dock_order);
  assert.equal(compareStart(a,make([...fixed,recent('a',10),recent('other',40)])).same,true);
  assert.equal(compareStart(a,make([{id:'SCBDesktop_Flex_Desktop'},{id:'AppIcon_Image_fixed',bounds:'[10,20][40,60]'},recent('new',40)])).same,true);
  assert.equal(compareStart(a,make([{id:'SCBDesktop_Flex_Desktop'},{id:'AppIcon_Image_different_page',bounds:'[10,20][40,60]'}])).same,false);
});
