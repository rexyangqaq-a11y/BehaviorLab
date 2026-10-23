import {readFile,writeFile,mkdir,cp,readdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {HOSCRCPY,hoscrcpyRuntime} from '../src/phone-video-runtime.mjs';
import {phonePython} from '../src/phone-runtime-paths.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const VIDEO_JRE={version:'21.0.8+9',archive:'OpenJDK21U-jre_x64_windows_hotspot_21.0.8_9.zip',sha256:'238d74ec4ec9422d416fa98805ba375eecd8bc8f971bd0c61a21051a4fe42db8',url:'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jre_x64_windows_hotspot_21.0.8_9.zip'};
export async function verifyVideoFiles(root,files){
  if(!files||Array.isArray(files)||!Object.keys(files).length)throw Error('Video file manifest missing');
  for(const [name,expected]of Object.entries(files)){
    const file=path.resolve(root,name),rel=path.relative(root,file);
    if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||!/^\.runtime\/(?:java-video|hoscrcpy)\//.test(name))throw Error('Video manifest path escapes runtime');
    const actualRelative=path.relative(await realpath(root),await realpath(file));
    if(actualRelative.startsWith('..')||path.isAbsolute(actualRelative)||!(await lstat(file)).isFile()||sha(await readFile(file))!==expected)throw Error('Video file checksum differs: '+name);
  }
}
export async function packagePhoneVideo(root,target,archive){
  if(sha(await readFile(archive))!==VIDEO_JRE.sha256)throw Error('Official JRE archive checksum differs');
  const installed=hoscrcpyRuntime(root,{verify:true});if(!installed.available)throw Error('Build computer video SDK/bridge must be installed');
  const javaRoot=path.join(target,'.runtime/java-video'),base=path.join(target,'.runtime/hoscrcpy');
  const javaFiles=JSON.parse(execFileSync(phonePython(root),[path.join(root,'scripts/package-video-jre.py'),path.resolve(archive),javaRoot],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024}));
  await mkdir(path.join(base,'sdk'),{recursive:true});await mkdir(path.join(base,'classes'));await mkdir(path.join(base,'licenses'));
  const sdk=path.join(base,'sdk',path.basename(installed.sdk));await cp(installed.sdk,sdk);
  await cp(path.join(root,'integrations/hoscrcpy/UPSTREAM_LICENSE'),path.join(base,'licenses/HOScrcpy-LICENSE'));
  const source=path.join(target,'integrations/hoscrcpy/PhoneVideoBridge.java'),compiler=path.join(path.dirname(installed.java),'javac.exe');
  execFileSync(compiler,['--release','17','-encoding','UTF-8','-cp',sdk,'-d',path.join(base,'classes'),source],{windowsHide:true,stdio:'pipe'});
  const config={schema_version:1,sdk_version:HOSCRCPY.version,release:HOSCRCPY.release,download_url:HOSCRCPY.url,sha256:HOSCRCPY.sha256,bytes:HOSCRCPY.bytes,bridge_sha256:sha(await readFile(source)),java_relative:'.runtime/java-video/bin/java.exe',jre:VIDEO_JRE};
  await writeFile(path.join(base,'install.json'),JSON.stringify(config,null,2));
  const files=Object.fromEntries(Object.entries(javaFiles).map(([name,hash])=>['.runtime/java-video/'+name,hash]));
  async function collect(dir){for(const item of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await collect(file);else if(item.isFile())files[path.relative(target,file).replaceAll('\\','/')]=sha(await readFile(file));else throw Error('Unexpected video runtime link');}}await collect(base);
  await verifyVideoFiles(target,files);await writeFile(path.join(target,'.runtime/phone-video-files.json'),JSON.stringify(files,null,2));
  return {backend:'HOScrcpy',sdk:HOSCRCPY,jre:VIDEO_JRE,files:Object.keys(files).length,paths:'project relative only',model_requests:0,device_commands:0};
}
