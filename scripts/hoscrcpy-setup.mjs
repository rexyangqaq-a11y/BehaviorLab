import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {HOSCRCPY,hoscrcpyRuntime} from '../src/phone-video-runtime.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const {values}=parseArgs({options:{install:{type:'boolean'},java:{type:'string'}}});
if(values.install){
  const root=path.join(project,'.runtime/hoscrcpy'),sdk=path.join(root,'sdk/hosScrcpy-1.0.18-beta.jar');
  fs.mkdirSync(path.dirname(sdk),{recursive:true});
  if(!fs.existsSync(sdk)){
    const response=await fetch(HOSCRCPY.url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('SDK下载失败：HTTP '+response.status);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length!==HOSCRCPY.bytes||createHash('sha256').update(bytes).digest('hex')!==HOSCRCPY.sha256)throw Error('SDK下载完整性不符');
    fs.writeFileSync(sdk,bytes,{flag:'wx'});
  }
  if(createHash('sha256').update(fs.readFileSync(sdk)).digest('hex')!==HOSCRCPY.sha256)throw Error('现有SDK完整性不符');
  let previous={};try{previous=JSON.parse(fs.readFileSync(path.join(root,'install.json'),'utf8'));}catch{}
  const java=values.java?path.resolve(values.java):process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):previous.java_relative?path.resolve(project,previous.java_relative):previous.java;
  if(!java||!fs.existsSync(java))throw Error('请通过--java指定JDK17或更高版本的java可执行文件');
  const compiler=path.join(path.dirname(java),process.platform==='win32'?'javac.exe':'javac');
  if(!fs.existsSync(compiler))throw Error('安装桥接程序需要JDK中的javac');
  const source=path.join(project,'integrations/hoscrcpy/PhoneVideoBridge.java'),classes=path.join(root,'classes');fs.mkdirSync(classes,{recursive:true});
  execFileSync(compiler,['--release','17','-encoding','UTF-8','-cp',sdk,'-d',classes,source],{windowsHide:true,stdio:'pipe'});
  execFileSync(java,['-version'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const relative=path.relative(project,java),portable=!relative.startsWith('..')&&!path.isAbsolute(relative);
  fs.writeFileSync(path.join(root,'install.json'),JSON.stringify({schema_version:1,sdk_version:HOSCRCPY.version,release:HOSCRCPY.release,download_url:HOSCRCPY.url,sha256:HOSCRCPY.sha256,bytes:HOSCRCPY.bytes,bridge_sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),...(portable?{java_relative:relative.replaceAll('\\','/')}:{java}),installed_at:new Date().toISOString()},null,2));
}
const runtime=hoscrcpyRuntime(project,{verify:true});
console.log(JSON.stringify({available:runtime.available,sdk_version:runtime.version,missing:runtime.missing,device_commands:0,model_requests:0}));
if(!runtime.available)process.exitCode=1;
