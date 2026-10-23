import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const HOSCRCPY={version:'1.0.18-beta',release:'v1.0.16-beta',bytes:18442278,sha256:'2ce60b1893cc2be471a8cd7eab7e4127e41921f1f89a32a134c730ba15c8c0fd',url:'https://gitcode.com/OpenHarmonyToolkitsPlaza/HOScrcpy/releases/download/v1.0.16-beta/hosScrcpy-1.0.18-beta.jar'};
export function hoscrcpyRuntime(project,{verify=false}={}){
  const root=path.join(project,'.runtime/hoscrcpy'),sdk=path.join(root,'sdk/hosScrcpy-1.0.18-beta.jar'),classes=path.join(root,'classes');
  let config={};try{config=JSON.parse(fs.readFileSync(path.join(root,'install.json'),'utf8'));}catch{}
  const java=config.java_relative?path.resolve(project,config.java_relative):config.java;
  const missing=[];if(!java||!fs.existsSync(java))missing.push('Java运行环境');
  if(!fs.existsSync(sdk)||fs.statSync(sdk).size!==HOSCRCPY.bytes)missing.push('HOScrcpy SDK');
  const source=path.join(project,'integrations/hoscrcpy/PhoneVideoBridge.java'),compiled=path.join(classes,'PhoneVideoBridge.class');
  if(!fs.existsSync(compiled)||config.bridge_sha256!==createHash('sha256').update(fs.readFileSync(source)).digest('hex'))missing.push('视频桥接程序需安装或更新');
  if(verify&&!missing.length&&createHash('sha256').update(fs.readFileSync(sdk)).digest('hex')!==HOSCRCPY.sha256)throw Error('HOScrcpy SDK完整性不符，请重新安装视频组件');
  return {available:!missing.length,missing,java,sdk,classes,root,version:HOSCRCPY.version};
}
