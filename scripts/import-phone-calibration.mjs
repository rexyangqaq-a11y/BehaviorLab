import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {parseArgs} from 'node:util';
import {matchingCompanionCalibration} from '../src/phone-companion-start.mjs';

export function validateCalibration(value){
  if(value?.schema_version!==1||!Array.isArray(value.profiles)||!value.profiles.length||value.profiles.length>20)throw Error('标定格式无效：需要schema_version=1及1–20项已验证记录');
  return {schema_version:1,profiles:value.profiles.map(p=>{
    if(!/^[a-f0-9]{64}$/.test(p?.target_sha256??'')||!['model','api','os_fullname','software_version'].every(k=>typeof p.device?.[k]==='string'&&p.device[k].trim()&&p.device[k].length<=240)||!['width','height'].every(k=>Number.isSafeInteger(p.screen?.[k])&&p.screen[k]>0&&p.screen[k]<=20000)||!matchingCompanionCalibration({target_sha256:p.target_sha256,device:p.device},p.screen,[p]))throw Error('存在未验证或不完整的设备／方向／导航条标定');
    return {target_sha256:p.target_sha256,device:Object.fromEntries(['model','api','os_fullname','software_version'].map(k=>[k,p.device[k]])),screen:{width:p.screen.width,height:p.screen.height},navigation_bounds:[...p.navigation_bounds],navigation_center:[...p.navigation_center],method:p.method};
  })};
}
export async function importCalibration({source,target}){
  const from=path.join(path.resolve(source),'.runtime','phone-companion-calibration.json'),to=path.join(path.resolve(target),'.runtime','phone-companion-calibration.json');
  if(from===to)throw Error('请选择旧程序目录，不能导入到同一位置');
  const value=validateCalibration(JSON.parse(await readFile(from,'utf8')));
  await mkdir(path.dirname(to),{recursive:true});
  await writeFile(to,JSON.stringify(value,null,2)+'\n',{flag:'wx',flush:true});
  return {profiles:value.profiles.length,source_unchanged:true,device_commands:0,model_requests:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const {values}=parseArgs({options:{source:{type:'string'}}});let source=values.source;
  if(!source){const prompt=createInterface({input:process.stdin,output:process.stdout});try{source=(await prompt.question('旧程序根目录（保留原目录不改动）：')).trim().replace(/^"|"$/g,'');}finally{prompt.close();}}
  if(!source){console.error('未提供旧程序目录，未导入');process.exitCode=1;}
  else importCalibration({source,target:fileURLToPath(new URL('../',import.meta.url))}).then(r=>console.log(`已导入${r.profiles}项本机标定；设备、系统或方向变化仍会阻止使用。未操作手机或模型。`)).catch(e=>{console.error(e.code==='EEXIST'?'新包已有标定，未覆盖；请先保留现有文件并人工核对。':e.code==='ENOENT'?'旧目录没有伴随态标定。普通桌面起点不受影响；新设备需单独校验。':e.message);process.exitCode=1;});
}
