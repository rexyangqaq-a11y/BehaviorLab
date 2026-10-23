import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {exportPrivateMigration} from '../src/private-migration.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const {values}=parseArgs({options:{target:{type:'string'},'password-directory':{type:'string'}}});
if(!values.target||!values['password-directory'])throw Error('--target and --password-directory required');
const target=path.resolve(values.target),passwordDirectory=path.resolve(values['password-directory']);
if(passwordDirectory===target||passwordDirectory.startsWith(target+path.sep))throw Error('密码查看文件必须存放在ZIP目录之外');
let desktop;try{desktop=JSON.parse(fs.readFileSync(path.join(root,'.runtime/desktop.json'),'utf8'));}catch{}
if(desktop?.pid){let active=false;try{process.kill(desktop.pid,0);active=true;}catch{}if(active)throw Error('请先正常停止原后台，确保一致快照；本脚本不自动中断任务');}
const report=exportPrivateMigration({source:root,target,passwordDirectory});
const command="$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;$s=[IO.File]::ReadAllText($env:BEHAVIORLAB_MIGRATION_PASSWORD_FILE).Trim();if(-not $s.StartsWith('win-dpapi:v1:')){throw 'Invalid protected password'};$b=[Convert]::FromBase64String($s.Substring(13));$e=[Text.Encoding]::UTF8.GetBytes('BehaviorLab-local-secret-v1');$v=[Security.Cryptography.ProtectedData]::Unprotect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser);try{Write-Host 'Migration password (keep private):';Write-Host ([Text.Encoding]::UTF8.GetString($v))}finally{[Array]::Clear($v,0,$v.Length)}";
const viewer='@echo off\r\nsetlocal\r\nset "BEHAVIORLAB_MIGRATION_PASSWORD_FILE=%~dp0migration-password.dpapi"\r\npowershell.exe -NoLogo -NoProfile -Command "'+command+'"\r\npause\r\n';
fs.writeFileSync(path.join(passwordDirectory,'查看迁移密码.cmd'),viewer);
fs.writeFileSync(path.join(passwordDirectory,'先在原电脑查看.txt'),'请在原电脑、同一Windows账户下双击“查看迁移密码.cmd”。将显示的密码记下，在新电脑运行04_IMPORT_KEYS.cmd时输入。密码文件受Windows账户保护，不能靠复制此目录在其他电脑解密。不要把密码发到聊天或与ZIP公开分享。\r\n');
const manifestFile=path.join(target,'portable-manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));manifest.contents='private-phone-history-and-model-configuration';manifest.omitted=(manifest.omitted||[]).filter(item=>!['model service settings and credentials','GUI lab experiment records and assets'].includes(item));manifest.omitted.push('clear API keys and migration password','main simulation private users and runs');manifest.private_migration={...report,password_helper_in_archive:false};fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));
console.log(JSON.stringify(report));
