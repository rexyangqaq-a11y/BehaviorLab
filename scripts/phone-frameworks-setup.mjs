import {phonePython} from '../src/phone-runtime-paths.mjs';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {FRAMEWORK_REGISTRY,frameworkSpec} from '../src/phone-framework-registry.mjs';
const exec=promisify(execFile),project=fileURLToPath(new URL('../',import.meta.url));
const {values}=parseArgs({options:{install:{type:'boolean'},python:{type:'string'},out:{type:'string'}}});
const runtime=path.join(project,'.runtime'),python=phonePython(project);
await mkdir(path.join(runtime,'frameworks'),{recursive:true});
const commands=[];
const run=async(file,args)=>{commands.push({executable:path.basename(file),args:args.map(a=>a.startsWith(project)?path.relative(project,a):a)});return exec(file,args,{cwd:project,windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});};
if(values.install){
  for(const f of FRAMEWORK_REGISTRY.filter(f=>f.checkout)){
    const dir=path.join(runtime,'frameworks',f.checkout);
    if(!existsSync(dir))await run('git',['clone','--no-checkout',f.source+'.git',dir]);
    const remote=(await run('git',['-C',dir,'remote','get-url','origin'])).stdout.trim().replace(/\.git$/,'');
    if(remote!==f.source)throw Error('Refuse changing an unrelated source directory');
    try{await run('git',['-C',dir,'cat-file','-e',f.version+'^{commit}']);}catch{await run('git',['-C',dir,'fetch','origin',f.version]);}
    const dirty=(await run('git',['-C',dir,'status','--porcelain'])).stdout.trim();if(dirty)throw Error('Framework checkout has local edits; preserve and inspect it first');
    await run('git',['-C',dir,'checkout','--detach',f.version]);
  }
  if(!existsSync(python)){
    const base=values.python;
    if(!base||!existsSync(base))throw Error('Supply --python with a working Python 3.12 executable');
    await run(base,['-m','venv',path.join(runtime,'python-phone')]);
  }
  await run(python,['-m','pip','install','-r',path.join(project,'integrations/phone-frameworks-requirements.txt'),'--disable-pip-version-check']);
}
const sdk=JSON.parse(await readFile(path.join(project,'integrations/midscene/node_modules/@midscene/harmony/package.json'),'utf8'));
if(sdk.version!==frameworkSpec('midscene').version)throw Error('Installed Midscene differs from pinned version');
const py=JSON.parse((await run(python,['-c','import sys,json,importlib.metadata as m;import openai,cv2,hmdriver2,uiautomator2;print(json.dumps({"python":sys.version,"packages":{k:m.version(k) for k in ["openai","httpx","Pillow","hmdriver2","uiautomator2","opencv-python-headless"]}}))'])).stdout.trim());
const sources={};for(const f of FRAMEWORK_REGISTRY.filter(f=>f.checkout)){
  const dir=path.join(runtime,'frameworks',f.checkout);
  const commit=(await run('git',['-C',dir,'rev-parse','HEAD'])).stdout.trim();if(commit!==f.version)throw Error('Framework revision changed: '+f.id);
  sources[f.id]={commit,source:f.source,source_pinned:true};
}
const contract=JSON.parse((await run(process.execPath,[path.join(project,'scripts/phone-framework-contract.mjs')])).stdout.trim());
if(contract.some(c=>c.exit||c.fixture_model_responses!==5||c.fixture_device_actions<4))throw Error('Native framework I/O contract failed');
await writeFile(path.join(runtime,'phone-frameworks.json'),JSON.stringify({python_relative:path.relative(project,python),...Object.fromEntries(Object.entries(sources).map(([id,s])=>[id,{...s,contract_passed:true,contract_kind:'native loop with injected fixture model/device RPC; not real GUI pass'}]))},null,2));
const report={checked_at:new Date().toISOString(),status:'deployment_verified',sdk:{package:sdk.name,version:sdk.version},python:py,sources,native_contracts:contract,real_device_commands:0,real_model_requests:0,model_weights_downloaded:false,memory_service_enabled:false,final_framework:null,
  limitations:['This command only verifies deployment and offline fixtures; historical real results are recorded separately','Optional MobiAgent experience import disabled; native task_in_app e2e is used instead of auto-launch/stop dispatcher','Model/action compatibility remains per-combination evaluation'],commands};
const output=values.out??path.join(project,'output/phone-framework-deployment-20261021.json');await writeFile(output,JSON.stringify(report,null,2),{flag:'wx',flush:true});
console.log(JSON.stringify({status:report.status,output,frameworks:3,real_model_requests:0,real_device_commands:0}));
