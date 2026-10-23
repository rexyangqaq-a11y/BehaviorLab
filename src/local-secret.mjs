import {execFileSync} from 'node:child_process';
const prefix='win-dpapi:v1:';
const entropy='BehaviorLab-local-secret-v1';
function transform(bytes,operation){
  if(process.platform!=='win32')throw Error('此密钥需要在Windows当前账户下导入');
  const method=operation==='protect'?'Protect':'Unprotect';
  const command=`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());$e=[Text.Encoding]::UTF8.GetBytes('${entropy}');try{$v=[Security.Cryptography.ProtectedData]::${method}($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($v))}finally{[Array]::Clear($b,0,$b.Length)}`;
  try{return Buffer.from(execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{input:bytes.toString('base64'),encoding:'utf8',windowsHide:true,timeout:15000,stdio:['pipe','pipe','pipe']}).trim(),'base64');}
  catch{throw Error('Windows密钥保护失败；请使用导入密钥时的Windows账户，或在本机重新导入');}
}
export function protectLocalSecret(value){
  if(typeof value!=='string'||!value)throw Error('密钥格式无效');
  // Existing non-Windows development behavior is retained; portable releases are Windows only.
  if(process.platform!=='win32')return value;
  return prefix+transform(Buffer.from(value,'utf8'),'protect').toString('base64');
}
export function unprotectLocalSecret(value){
  if(!value||!value.startsWith(prefix))return value;
  return transform(Buffer.from(value.slice(prefix.length),'base64'),'unprotect').toString('utf8');
}
