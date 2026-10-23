import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {ModelSettings} from './model-settings.mjs';
import {protectLocalSecret,unprotectLocalSecret} from './local-secret.mjs';
import {configurationFingerprint,encryptMigration,decryptMigration} from './migration-credentials.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const MIGRATION_FILE='.runtime/migration/model-credentials.enc.json';
function walk(root){const files=[];function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('迁移数据不允许包含目录链接');if(e.isDirectory())visit(file);else if(e.isFile())files.push(file);else throw Error('迁移数据包含未知文件类型');}}visit(root);return files.sort();}
function modelSnapshot(source){const db=new DatabaseSync(path.join(source,'.data/.model-services.sqlite'),{readOnly:true});try{db.exec('BEGIN');const row=db.prepare('SELECT revision,document FROM model_settings WHERE id=1').get(),credentials=db.prepare('SELECT service_id,api_key FROM model_credentials').all().map(r=>({id:r.service_id,key:unprotectLocalSecret(r.api_key)}));db.exec('COMMIT');return {row,credentials};}finally{db.close();}}
export function exportPrivateMigration({source,target,passwordDirectory,protect=protectLocalSecret}){
  const data=path.join(target,'.data');fs.mkdirSync(data,{recursive:true});
  if(fs.existsSync(path.join(data,'.phone-lab'))||fs.existsSync(path.join(data,'.model-services.sqlite')))throw Error('私人迁移仅写入新的干净包，不覆盖已有数据');
  const snapshot=modelSnapshot(source),phoneSource=path.join(source,'.data/.phone-lab'),files=walk(phoneSource),manifest=[];
  const password=randomBytes(24).toString('base64url'),id='migration_'+randomUUID();
  const envelope=encryptMigration({id,fingerprint:configurationFingerprint(snapshot.row),credentials:snapshot.credentials},password);
  // Only the password's DPAPI ciphertext is persisted outside the archive.
  fs.mkdirSync(passwordDirectory,{recursive:true});fs.writeFileSync(path.join(passwordDirectory,'migration-password.dpapi'),protect(password),{flag:'wx'});
  const sourceMetadata=[];
  for(const file of files){const name=path.relative(phoneSource,file),bytes=fs.readFileSync(file);
    if(/\.(json|jsonl|txt|log|html|mjs|py)$/i.test(name)&&snapshot.credentials.some(c=>c.key&&bytes.includes(Buffer.from(c.key))))throw Error('历史文本发现未脱敏密钥，已停止打包');
    const digest=hash(bytes),destination=path.join(data,'.phone-lab',name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes,{flag:'wx'});manifest.push({file:name.replaceAll('\\','/'),bytes:bytes.length,sha256:digest});
    if(/\.(json|jsonl)$/i.test(name))sourceMetadata.push({file,sha256:digest});
  }
  for(const r of sourceMetadata)if(hash(fs.readFileSync(r.file))!==r.sha256)throw Error('原工作台记录在快照期间改变，请空闲时重新打包');
  const settings=new ModelSettings(data);try{settings.db.prepare('UPDATE model_settings SET revision=?,document=? WHERE id=1').run(snapshot.row.revision,snapshot.row.document);settings.db.exec('PRAGMA wal_checkpoint(TRUNCATE);PRAGMA journal_mode=DELETE');}finally{settings.close();}
  const current=modelSnapshot(source);if(configurationFingerprint(current.row)!==configurationFingerprint(snapshot.row)||JSON.stringify(current.credentials)!==JSON.stringify(snapshot.credentials))throw Error('模型配置在快照期间改变，请重新打包');
  const directory=path.join(target,'.runtime/migration');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(target,MIGRATION_FILE),JSON.stringify(envelope,null,2));
  fs.writeFileSync(path.join(directory,'history-files.json'),JSON.stringify(manifest,null,2));
  const report={id,created_at:new Date().toISOString(),phone_files:manifest.length,phone_bytes:manifest.reduce((n,r)=>n+r.bytes,0),runs:fs.readdirSync(path.join(phoneSource,'runs')).length,starts:fs.readdirSync(path.join(phoneSource,'starts')).length,model_services:JSON.parse(snapshot.row.document).services.length,encrypted_credentials:snapshot.credentials.length,credentials_imported:false,password_storage:'Windows CurrentUser DPAPI outside ZIP',credential_encryption:'scrypt + AES-256-GCM; imported keys use destination Windows DPAPI',source_unchanged:true,model_requests:0,device_commands:0};
  fs.writeFileSync(path.join(directory,'snapshot.json'),JSON.stringify(report,null,2));return report;
}
export function importMigrationKeys(project,password,{protect=protectLocalSecret}={}){
  const encryptedFile=path.join(project,MIGRATION_FILE),payload=decryptMigration(JSON.parse(fs.readFileSync(encryptedFile,'utf8')),password);
  if(!payload||typeof payload.id!=='string'||!Array.isArray(payload.credentials)||payload.credentials.length>20)throw Error('迁移密钥内容无效');
  const file=path.join(project,'.data/.model-services.sqlite');if(!fs.existsSync(file))throw Error('部署包缺少模型配置数据库');
  const db=new DatabaseSync(file);try{
    const row=db.prepare('SELECT revision,document FROM model_settings WHERE id=1').get();if(configurationFingerprint(row)!==payload.fingerprint)throw Error('模型配置已改变，拒绝将旧密钥导入到不同配置');
    if(db.prepare('SELECT COUNT(*) n FROM model_credentials').get().n)throw Error('本机已有密钥，未覆盖；请使用新的解压目录导入');
    const services=JSON.parse(row.document).services,seen=new Set();
    const protectedKeys=payload.credentials.map(c=>{if(typeof c.id!=='string'||seen.has(c.id)||!services.some(s=>s.id===c.id&&s.auth==='api_key')||typeof c.key!=='string'||!c.key||c.key.length>4096||/[\r\n\0]/.test(c.key))throw Error('迁移密钥与配置不一致');seen.add(c.id);return {id:c.id,key:protect(c.key)};});
    db.exec('BEGIN IMMEDIATE');try{if(configurationFingerprint(db.prepare('SELECT revision,document FROM model_settings WHERE id=1').get())!==payload.fingerprint||db.prepare('SELECT COUNT(*) n FROM model_credentials').get().n)throw Error('导入期间配置已改变，未覆盖');for(const c of protectedKeys)db.prepare('INSERT INTO model_credentials VALUES(?,?)').run(c.id,c.key);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    const receipt={id:payload.id,imported_at:new Date().toISOString(),credentials:protectedKeys.length,protection:'Windows CurrentUser DPAPI',model_requests:0,device_commands:0};fs.writeFileSync(path.join(project,'.runtime/migration/imported.json'),JSON.stringify(receipt,null,2));return receipt;
  }finally{db.close();}
}
