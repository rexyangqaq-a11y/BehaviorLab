import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {encryptMigration,decryptMigration} from '../src/migration-credentials.mjs';
import {protectLocalSecret} from '../src/local-secret.mjs';
import {exportPrivateMigration,importMigrationKeys,MIGRATION_FILE} from '../src/private-migration.mjs';
import {ModelSettings} from '../src/model-settings.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'private-phone-migration-'));t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('private-phone-migration-'));fs.rmSync(root,{recursive:true,force:true});});const source=path.join(root,'source'),target=path.join(root,'target'),passwordDirectory=path.join(root,'password');fs.mkdirSync(path.join(source,'.data'),{recursive:true});for(const name of ['runs','starts','tasks','batches','evaluations'])fs.mkdirSync(path.join(source,'.data/.phone-lab',name),{recursive:true});fs.mkdirSync(path.join(source,'.data/.phone-lab/runs/fixture'));fs.writeFileSync(path.join(source,'.data/.phone-lab/runs/fixture/input.json'),'{}');
const store=new ModelSettings(path.join(source,'.data'));store.save({revision:0,bindings:{},services:[{id:'fixture',name:'Fixture service',provider:'custom',protocol:'openai-chat',base_url:'https://example.invalid/v1',model:'fixture',auth:'api_key',timeout_ms:60000,api_key:'fixture-private-key-no-provider'}]});store.close();let password;const exportPackage=()=>exportPrivateMigration({source,target,passwordDirectory,protect:v=>{password=v;return protectLocalSecret(v);}});return {source,target,passwordDirectory,exportPackage,password:()=>password};}

test('migration encryption authenticates contents; wrong passwords and modified files never produce credentials',()=>{
  const password='fixture-password-32-characters-long',envelope=encryptMigration({credentials:[{key:'fixture-private-key'}]},password);assert.ok(!JSON.stringify(envelope).includes('fixture-private-key'));assert.equal(decryptMigration(envelope,password).credentials[0].key,'fixture-private-key');assert.throws(()=>decryptMigration(envelope,'wrong-password'),/尚未修改/);assert.throws(()=>decryptMigration({...envelope,tag:Buffer.alloc(16).toString('base64')},password),/尚未修改/);
});
test('private package preserves history and public configuration while keys require authenticated import and remain encrypted on Windows',t=>{
  const f=fixture(t),report=f.exportPackage();assert.equal(report.runs,1);assert.equal(report.encrypted_credentials,1);assert.equal(fs.readFileSync(path.join(f.target,'.data/.phone-lab/runs/fixture/input.json'),'utf8'),'{}');let store=new ModelSettings(path.join(f.target,'.data'));assert.equal(store.read().services[0].has_api_key,false);store.close();
  assert.throws(()=>importMigrationKeys(f.target,'incorrect-password'),/尚未修改/);store=new ModelSettings(path.join(f.target,'.data'));assert.equal(store.db.prepare('SELECT COUNT(*) n FROM model_credentials').get().n,0);store.close();
  assert.equal(importMigrationKeys(f.target,f.password()).credentials,1);store=new ModelSettings(path.join(f.target,'.data'));try{assert.equal(store.credential('fixture'),'fixture-private-key-no-provider');if(process.platform==='win32')assert.ok(store.db.prepare('SELECT api_key FROM model_credentials').get().api_key.startsWith('win-dpapi:v1:'));}finally{store.close();}
  assert.throws(()=>importMigrationKeys(f.target,f.password()),/未覆盖/);assert.ok(!fs.readFileSync(path.join(f.target,MIGRATION_FILE),'utf8').includes('fixture-private-key'));if(process.platform==='win32')assert.ok(fs.readFileSync(path.join(f.passwordDirectory,'migration-password.dpapi'),'utf8').startsWith('win-dpapi:v1:'));
});
test('changed model configuration blocks an old credential import without writing keys',t=>{
  const f=fixture(t);f.exportPackage();const store=new ModelSettings(path.join(f.target,'.data'));store.save({...store.read(),services:store.read().services.map(s=>({...s,model:'changed-model'}))});store.close();assert.throws(()=>importMigrationKeys(f.target,f.password()),/模型配置已改变/);const reopened=new ModelSettings(path.join(f.target,'.data'));assert.equal(reopened.db.prepare('SELECT COUNT(*) n FROM model_credentials').get().n,0);reopened.close();
});
test('private export rejects existing targets and any unredacted credential in historical text',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.source,'.data/.phone-lab/runs/fixture/unsafe.json'),'fixture-private-key-no-provider');assert.throws(()=>f.exportPackage(),/未脱敏密钥/);assert.equal(fs.readFileSync(path.join(f.source,'.data/.phone-lab/runs/fixture/unsafe.json'),'utf8'),'fixture-private-key-no-provider');
  const g=fixture(t);fs.mkdirSync(path.join(g.target,'.data/.phone-lab'),{recursive:true});assert.throws(()=>g.exportPackage(),/不覆盖/);
});
