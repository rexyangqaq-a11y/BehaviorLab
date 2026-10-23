// Offline verification only. Never invokes HDC, a phone or a model endpoint.
import {readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {phonePython} from '../src/phone-runtime-paths.mjs';
import {FRAMEWORK_REGISTRY} from '../src/phone-framework-registry.mjs';
import {hoscrcpyRuntime} from '../src/phone-video-runtime.mjs';
import {verifyVideoFiles} from './package-phone-video.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const report={checked_at:new Date().toISOString(),real_model_requests:0,real_device_commands:0,checks:[],gui_result:'not_executed'};
try{
  if(Number(process.versions.node.split('.')[0])!==24)throw Error('Node.js 24 required');
  const sdk=JSON.parse(await readFile(path.join(root,'integrations/midscene/node_modules/@midscene/harmony/package.json'),'utf8'));
  if(sdk.version!==FRAMEWORK_REGISTRY[0].version)throw Error('Midscene version mismatch');
  execFileSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('../integrations/midscene/node_modules/@midscene/harmony/dist/es/index.mjs',import.meta.url).href)});`],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
  report.checks.push({name:'Midscene',version:sdk.version,status:'passed'});
  const manifestFile=path.join(root,'.runtime/framework-sources.json');
  if(existsSync(manifestFile)){
    const sources=JSON.parse(await readFile(manifestFile,'utf8'));
    for(const spec of FRAMEWORK_REGISTRY.filter(f=>f.checkout)){
      const source=sources[spec.id];if(source?.commit!==spec.version||!Object.keys(source.files??{}).length)throw Error('Missing pinned source manifest: '+spec.id);
      const base=path.join(root,'.runtime/frameworks',spec.checkout);
      for(const [name,expected]of Object.entries(source.files)){
        const f=path.resolve(base,name),rel=path.relative(base,f);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Source path escapes checkout');
        const actual=createHash('sha256').update(await readFile(f)).digest('hex');if(actual!==expected)throw Error('Source checksum mismatch: '+spec.id+'/'+name);
      }
      report.checks.push({name:spec.id,revision:source.commit,files:Object.keys(source.files).length,status:'passed'});
    }
  }else{
    for(const spec of FRAMEWORK_REGISTRY.filter(f=>f.checkout)){
      const dir=path.join(root,'.runtime/frameworks',spec.checkout);
      const commit=execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
      if(commit!==spec.version)throw Error('Framework revision mismatch: '+spec.id);
      report.checks.push({name:spec.id,revision:commit,status:'passed'});
    }
  }
  report.python=JSON.parse(execFileSync(phonePython(root),['-I','-c','import sys,json,openai,cv2,hmdriver2,uiautomator2,PIL;print(json.dumps({"version":sys.version.split()[0]}))'],{encoding:'utf8',windowsHide:true,timeout:60000}));
  report.native_contracts=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/phone-framework-contract.mjs')],{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024}));
  if(report.native_contracts.some(c=>c.exit||!c.unicode_input_roundtrip||c.jpeg_mime_roundtrip===false))throw Error('Native I/O contract failed');
  const configFile=path.join(root,'.runtime/phone-frameworks.json'),config=JSON.parse(await readFile(configFile,'utf8'));
  delete config.python;config.python_relative=path.relative(root,phonePython(root));for(const f of FRAMEWORK_REGISTRY.filter(f=>f.checkout)){config[f.id]={...config[f.id],contract_passed:true,contract_kind:'offline native loop fixtures only; not GUI success'};}
  await writeFile(configFile,JSON.stringify(config,null,2));
  const tools=JSON.parse(await readFile(path.join(root,'.runtime/device-tools.json'),'utf8'));
  if(!existsSync(path.join(root,'.runtime',tools.hdc.relative_executable)))throw Error('HDC executable missing');
  const videoFiles=path.join(root,'.runtime/phone-video-files.json');
  const portableFile=path.join(root,'portable-manifest.json');
  if(existsSync(portableFile)&&JSON.parse(await readFile(portableFile,'utf8')).phone_video&&!existsSync(videoFiles))throw Error('Bundled video file manifest missing');
  if(existsSync(videoFiles)){
    await verifyVideoFiles(root,JSON.parse(await readFile(videoFiles,'utf8')));
    const video=hoscrcpyRuntime(root,{verify:true});if(!video.available)throw Error('Video runtime missing: '+video.missing.join(', '));
    execFileSync(video.java,['-version'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const checked=execFileSync(video.java,['-Djava.awt.headless=true','-cp',[video.sdk,video.classes].join(path.delimiter),'PhoneVideoBridge','--check'],{windowsHide:true,encoding:'utf8',timeout:30000});
    if(!checked.includes('BEHAVIORLAB_VIDEO:check_ready'))throw Error('Video bridge load check failed');
    report.checks.push({name:'HOScrcpy video',sdk:video.version,status:'passed',kind:'file hashes, bundled Java and SDK class loading only; no device capture'});
  }else report.checks.push({name:'HOScrcpy video',status:'optional_not_bundled'});
  report.status='passed';report.remaining=['Configure your own model services in Settings','Enable USB debugging, connect and authorize this computer','Unlock phone, save a task start point, then explicitly start a real test'];
}catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
await writeFile(path.join(root,'.runtime/phone-doctor.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
