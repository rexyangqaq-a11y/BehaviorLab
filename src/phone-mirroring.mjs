import {existsSync,readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';

// Window capture is handled entirely by the browser. This module only opens
// the installed official tool; it never captures frames or operates a phone.
export function createPhoneMirroring(project,{exists=existsSync,launch=spawn}={}){
  let lastOpened=0;
  function executable(){
    let configured;try{configured=JSON.parse(readFileSync(path.join(project,'.runtime/device-tools.json'),'utf8')).testing?.executable;}catch{}
    return [configured,...[process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean).map(dir=>path.join(dir,'DevEco Testing/bin/DevEco Testing.exe'))]
      .find(file=>typeof file==='string'&&path.basename(file).toLowerCase()==='deveco testing.exe'&&exists(file))??null;
  }
  return {
    status(){return {mode:'local_window_video',tool_name:'DevEco Testing',tool_available:Boolean(executable()),window_selection_required:true,audio:false,uploaded:false,recorded:false};},
    async open(){
      const file=executable();if(!file)throw Object.assign(Error('未找到官方投屏工具，请先安装DevEco Testing，或直接接入已有的投屏窗口。'),{status:409});
      if(Date.now()-lastOpened<5000)return {status:'launch_requested',reused:true};
      await new Promise((resolve,reject)=>{const child=launch(file,[],{cwd:path.dirname(file),detached:true,windowsHide:false,stdio:'ignore'});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
      lastOpened=Date.now();return {status:'launch_requested',message:'请在官方工具中选择“实用工具 → 设备投屏”并连接手机，然后接入该窗口。'};
    },
  };
}
