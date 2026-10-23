import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {phonePython} from '../src/phone-runtime-paths.mjs';
import {FRAMEWORK_REGISTRY} from '../src/phone-framework-registry.mjs';
import {materializeNodePackages} from './materialize-node-packages.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function packagePhoneRuntime(root,target){
  const runtime=path.join(target,'.runtime');await mkdir(runtime,{recursive:true});
  await mkdir(path.join(target,'integrations/midscene'),{recursive:true});
  for(const name of ['package.json','pnpm-lock.yaml','probe.mjs','real-trial.mjs'])await cp(path.join(root,'integrations/midscene',name),path.join(target,'integrations/midscene',name));
  const nodePackages=await materializeNodePackages(path.join(root,'integrations/midscene/node_modules'),path.join(target,'integrations/midscene/node_modules'),['@midscene/harmony']);
  const python=JSON.parse(execFileSync(phonePython(root),[path.join(root,'scripts/package-phone-python.py'),path.join(runtime,'python-phone')],{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024}));
  const sources={};
  for(const spec of FRAMEWORK_REGISTRY.filter(f=>f.checkout)){
    const from=path.join(root,'.runtime/frameworks',spec.checkout),to=path.join(runtime,'frameworks',spec.checkout);
    const commit=execFileSync('git',['-C',from,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
    if(commit!==spec.version)throw Error('Pinned revision differs: '+spec.id);
    const dirty=execFileSync('git',['-C',from,'status','--porcelain','--untracked-files=no'],{encoding:'utf8',windowsHide:true}).trim();
    if(dirty)throw Error('Framework tracked source changed: '+spec.id);
    const names=spec.id==='mobiagent'?['runner','utils','prompts','LICENSE','README.md','README_zh.md']:['phone_agent','LICENSE','README.md','README_en.md','requirements.txt'];
    const tracked=execFileSync('git',['-C',from,'ls-files','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);
    await mkdir(to,{recursive:true});for(const name of tracked){
      if(!names.includes(name.split('/')[0])||name.split('/').includes('.env'))continue;
      const destination=path.join(to,name);await mkdir(path.dirname(destination),{recursive:true});await cp(path.join(from,name),destination);
    }
    const files={};async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())await walk(f);else files[path.relative(to,f).replaceAll('\\','/')]=sha(await readFile(f));}}await walk(to);
    sources[spec.id]={commit,source:spec.source,files};
  }
  await writeFile(path.join(runtime,'framework-sources.json'),JSON.stringify(sources,null,2));
  const local=JSON.parse(await readFile(path.join(root,'.runtime/device-tools.json'),'utf8'));
  const toolSource=path.dirname(path.join(root,'.runtime',local.hdc.relative_executable)),toolTarget=path.join(runtime,'hdc');await mkdir(toolTarget);
  const hdcFiles={};for(const name of ['hdc.exe','libusb_shared.dll','NOTICE.txt','oh-uni-package.json']){const bytes=await readFile(path.join(toolSource,name));await writeFile(path.join(toolTarget,name),bytes);hdcFiles[name]=sha(bytes);}
  await writeFile(path.join(runtime,'device-tools.json'),JSON.stringify({schema_version:1,hdc:{...local.hdc,relative_executable:'hdc/hdc.exe'}},null,2));
  await writeFile(path.join(runtime,'phone-frameworks.json'),JSON.stringify({python_relative:'.runtime/python-phone/python.exe',...Object.fromEntries(Object.entries(sources).map(([id,s])=>[id,{commit:s.commit,source:s.source,source_pinned:true,contract_passed:false,contract_kind:'Run 03_CHECK.cmd on this computer before real testing'}]))},null,2));
  return {python,nodePackages,hdc:{version:local.hdc.version,files:hdcFiles,official_package_checksum_verified:local.hdc.official_package_checksum_verified},sources:Object.fromEntries(Object.entries(sources).map(([id,s])=>[id,{commit:s.commit,files:Object.keys(s.files).length}])),font:'MobiAgent uses this Windows installation font; no Microsoft font redistributed',model_weights:false,model_requests:0,device_commands:0};
}
