import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {findHdc,parseHdcTargets} from './hdc-environment.mjs';
const command=promisify(execFile);
/** Cached HDC visibility, independent from execution/pause and video state. */
export class PhoneConnection {
  constructor({configPath,resolve=()=>findHdc({localConfigPath:configPath}),run=command,clock=Date.now}={}){Object.assign(this,{resolve,run,clock});this.value={state:'unchecked',count:null,checked_at:null,control:'unverified'};}
  status(){return {...this.value,stale:this.value.checked_at!=null&&this.clock()-Date.parse(this.value.checked_at)>15000};}
  async check(){
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      let state='unverified',count=null;
      try{const executable=this.resolve();if(!executable)state='missing_tool';else{
        const output=await this.run(executable,['list','targets'],{shell:false,windowsHide:true,timeout:5000,maxBuffer:65536});
        const parsed=parseHdcTargets(output.stdout,output.stderr);count=parsed.targets.length;
        state=parsed.status==='empty'?'disconnected':parsed.status==='targets'?(count===1?'connected':'multiple'):'unverified';
      }}catch{state='error';}
      this.value={state,count,checked_at:new Date(this.clock()).toISOString(),control:'unverified'};
      return this.status();
    })();
    try{return await this.pending;}finally{this.pending=null;}
  }
}
