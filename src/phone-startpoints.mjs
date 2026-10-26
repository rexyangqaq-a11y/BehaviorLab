import {nodeCenter,sleep} from './phone-device.mjs';
import {sha256} from './phone-evidence.mjs';
// A preparation recipe, never a captured or verified device baseline.
export const BUILTIN_HOME_START={id:'builtin_home',name:'手机桌面（内置，测试前自动复原）',named:true,builtin:true,prepare_on_start:true,contract:{ready:false,reset:'home'}};
export function namedStartContract({environment,shot,nodes}){
  const home=nodes.some(n=>n.id==='SCBDesktop_Flex_Desktop');
  return {...startContract({environment:{...environment,app:null},shot,nodes,task:home?{id:null,revision:null,reset:'home',bundle:null}:null,manual:!home}),named_start:true};
}
export function startContract({environment,shot,nodes,task,manual=false}) {
  const text=nodes.map(n=>n.text||n.description||'').filter(Boolean);
  if(nodes.some(n=>/ScreenLock|keyguard/i.test(n.id??'')))throw Error('手机已锁屏，请手动解锁');
  const contract={schema_version:1,case_id:task?.id??null,case_revision:task?.revision??null,target_sha256:environment.target_sha256,
    device:environment.device,app:environment.app,width:shot.width,height:shot.height,reset:task?.reset??'manual',
    preparation_only:true,manual,assertions:[],texts:text};
  if(manual)contract.manual_page_signature=sha256(JSON.stringify(nodes.filter(n=>!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(n.text??'')).map(n=>({id:n.id,type:n.type,text:n.text,description:n.description,bounds:n.bounds,selected:n.selected,checked:n.checked})).filter(n=>n.text||n.description||n.selected==='true'||/TextInput|TextField|EditText/.test(n.type??''))));
  if(task?.reset==='home'){
    const icons=nodes.filter(n=>/^AppIcon_Image_/.test(n.id??'')).map(n=>({id:n.id,bounds:n.bounds}));
    // User permits dynamic launcher differences. Identify the main home page
    // by its fixed app icons; retain recent apps, positions and suggestions as
    // evidence without requiring the recent-app set or order to stay unchanged.
    const recent=icons.filter(n=>/_\d+_1$/.test(n.id)),fixed=icons.filter(n=>!/_\d+_(?:1|undefined)$/.test(n.id)).sort((a,b)=>a.id.localeCompare(b.id));
    contract.recent_dock_order=recent;
    contract.home_page_signature=sha256(JSON.stringify({fixed_ids:fixed.map(n=>n.id)}));
    contract.home_comparison_policy='logical_home_fixed_icon_membership_v3';
    contract.preparation_policy=task.bundle?'stop_target_process_no_data_clear_then_home_twice_v1':'home_twice_no_app_stop_v1';
    contract.assertions=[{id:'system-home',passed:nodes.some(n=>n.id==='SCBDesktop_Flex_Desktop')},{id:'home-icons',passed:icons.length>0},
      {id:'no-focused-input',passed:!nodes.some(n=>/TextInput|EditText|SearchField/.test(n.type??'')&&(n.focused==='true'||n.focused===true))},
      {id:'keyboard-closed',passed:!nodes.some(n=>/KeyCanvasKeyboard|KeyboardCanvas/.test(n.id??''))}];
  }else if(task?.reset==='settings'){
    contract.assertions=[{id:'settings-home',passed:text.includes('设置')},{id:'bluetooth-category',passed:text.filter(t=>t==='星闪和蓝牙').length>=2},
      {id:'navigation-at-top',passed:text.some(t=>/^WLAN$/i.test(t))},{id:'about-not-open',passed:!text.some(t=>t==='关于本机'||t==='关于手机')}];
  }else if(task?.reset==='calculator'){
    // A numeric keypad's zero is not evidence that the expression is clear.
    // Unknown device layouts fail closed until their actual display is mapped.
    const displays=nodes.filter(n=>/display|result|expression|formula|显示|结果|算式/i.test([n.id,n.description].join(' '))&&!/Button/i.test(n.type??''));
    contract.assertions=[{id:'calculator-display-zero',passed:displays.some(n=>/^0(?:\.0)?$/.test(n.text??''))},
      {id:'calculator-expression-empty',passed:displays.some(n=>/expression|formula|算式/i.test([n.id,n.description].join(' '))&&!n.text)},
      {id:'calculator-keypad',passed:text.includes('1')&&text.includes('9')}];
  }else if(task&&!manual){
    const edits=nodes.filter(n=>/TextInput|EditText|TextField|SearchField/.test(n.type??''));
    const search=edits.filter(n=>/search|搜索/i.test([n.id,n.description,n.hint,n.placeholder].join(' ')));
    contract.assertions=[{id:'empty-search-input',passed:search.some(n=>!n.text||n.text===n.hint)},
      {id:'search-input-focused',passed:search.some(n=>n.focused===true||n.focused==='true')},
      {id:'keyboard-visible',passed:nodes.some(n=>/InputMethod|Keyboard|输入法|键盘/i.test([n.id,n.type,n.description].join(' ')))},
      {id:'search-control',passed:text.some(t=>/搜索/.test(t))},{id:'not-login-screen',passed:!text.some(t=>/^(登录|短信验证码|输入验证码)$/.test(t))}];
  }
  contract.ready=manual||contract.assertions.every(a=>a.passed);
  // Only invariant starting-state fields form the comparison key. Clock/status,
  // Bluetooth neighbours and suggested searches are retained, not hashed in.
  const invariant={case_id:contract.case_id,case_revision:contract.case_revision,target_sha256:contract.target_sha256,
    device:contract.device,app:contract.app,width:contract.width,height:contract.height,reset:contract.reset,assertions:contract.assertions,manual_page_signature:contract.manual_page_signature??null,home_page_signature:contract.home_page_signature??null,home_comparison_policy:contract.home_comparison_policy??null,preparation_policy:contract.preparation_policy??null};
  contract.comparison_key=sha256(JSON.stringify(invariant));return contract;
}
export function compareStart(reference,current){
  const reasons=[];
  if(!current.ready)reasons.push('起点条件未全部满足');
  if(reference.comparison_key!==current.comparison_key)reasons.push('设备、版本、方向或起点条件与基准不一致');
  return {same:!reasons.length,reasons,reference_key:reference.comparison_key,current_key:current.comparison_key,
    basis:current.named_start?'saved_named_page_and_device_metadata':current.manual?'operator_confirmed_manual_start':'device_metadata_and_start_state_assertions',pixel_identical:false};
}
export async function resetPhoneStart(session,task){
  if(!task)throw Error('自定义起点由测试者手动摆好，系统不自动猜测复位操作');
  const {touch,layout,device}=session;
  if(task.reset==='home'){
    if(task.bundle)await session.command(['shell','aa','force-stop',task.bundle]);
    await touch.home();await sleep(500);await touch.home();await sleep(900);
    return layout();
  }
  await device.launch(task.bundle);await sleep(700);
  const clickText=async patterns=>{
    const view=await layout();for(const p of patterns){const n=view.nodes.find(n=>p.test(n.text||n.description||'')&&n.enabled!=='false');if(n){await touch.tap(...nodeCenter(n));await sleep(400);return true;}}return false;
  };
  if(task.reset==='settings'){
    const size=await device.size();for(let i=0;i<3;i++)await touch.swipe(Math.round(size.width*.20),Math.round(size.height*.30),Math.round(size.width*.20),Math.round(size.height*.85));
    if(!await clickText([/^星闪和蓝牙$/]))throw Error('设置起点复位未找到星闪和蓝牙导航');
  }else if(task.reset==='calculator'){
    await clickText([/^(AC|C|清空|全部清除)$/]);
  }else{
    // Search pages are app/version-specific; navigation uses inspected UI labels,
    // never a model. Any unverified route pauses the comparison before billing.
    for(let i=0;i<3;i++){
      const v=await layout(),edits=v.nodes.filter(n=>/TextInput|EditText|TextField|SearchField/.test(n.type??''));
      if(edits.length){await touch.tap(...nodeCenter(edits[0]));await touch.clear();break;}
      if(await clickText([/^搜索$/,/搜索你感兴趣的/,/搜索商品/,/搜索笔记/]))continue;
      await touch.back();await sleep(300);
    }
  }
  await sleep(600);return layout();
}
