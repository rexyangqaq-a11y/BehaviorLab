import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import {importMigrationKeys,MIGRATION_FILE} from '../src/private-migration.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const {values}=parseArgs({options:{'stdin-password':{type:'boolean'}}});
async function password(){
  if(values['stdin-password']){let input='';for await(const b of process.stdin){input+=b;if(input.length>1024)throw Error('迁移密码过长');}return input.trim();}
  if(!process.stdin.isTTY)throw Error('请在终端运行04_IMPORT_KEYS.cmd，迁移密码不接受命令行参数');
  process.stdout.write('请输入迁移密码（输入不显示）：');process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{let value='';const finish=(error)=>{process.stdin.removeListener('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');if(error)reject(error);else resolve(value);};const read=bytes=>{for(const ch of bytes.toString('utf8')){if(ch==='\r'||ch==='\n'){finish();return;}if(ch==='\x03'){finish(Error('已取消，未导入密钥'));return;}if(ch==='\x7f'||ch==='\b')value=value.slice(0,-1);else if(/[A-Za-z0-9_-]/.test(ch)&&value.length<256)value+=ch;}};process.stdin.on('data',read);});
}
try{if(process.platform!=='win32')throw Error('私人部署版的密钥导入需要Windows');if(!fs.existsSync(path.join(root,MIGRATION_FILE)))throw Error('此包没有待导入密钥，请到模型服务页填写自己的API Key');const result=importMigrationKeys(root,await password());console.log('密钥已加密导入：'+result.credentials+' 个。未调用模型或手机。');}
catch(error){console.error(error.message);process.exitCode=1;}
