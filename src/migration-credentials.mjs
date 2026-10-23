import {createCipheriv,createDecipheriv,randomBytes,scryptSync,createHash} from 'node:crypto';
const aad=Buffer.from('BehaviorLab-model-credentials-v1');
const key=(password,salt)=>scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
export function configurationFingerprint(row){return createHash('sha256').update(row.revision+'\n'+row.document).digest('hex');}
export function encryptMigration(payload,password){
  if(typeof password!=='string'||password.length<16)throw Error('迁移密码至少16个字符');
  const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(password,salt),iv);cipher.setAAD(aad);
  const data=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return {format:'BehaviorLab-model-credentials',version:1,kdf:'scrypt-32768-8-1',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function decryptMigration(envelope,password){
  if(envelope?.format!=='BehaviorLab-model-credentials'||envelope.version!==1||envelope.kdf!=='scrypt-32768-8-1'||typeof password!=='string')throw Error('迁移文件格式无效');
  for(const [field,size]of [['salt',16],['iv',12],['tag',16]])if(typeof envelope[field]!=='string'||Buffer.from(envelope[field],'base64').length!==size)throw Error('迁移文件格式无效');
  if(typeof envelope.data!=='string'||envelope.data.length>256*1024)throw Error('迁移文件过大或无效');
  try{const decipher=createDecipheriv('aes-256-gcm',key(password,Buffer.from(envelope.salt,'base64')),Buffer.from(envelope.iv,'base64'));decipher.setAAD(aad);decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString('utf8'));}
  catch{throw Error('迁移密码不正确或文件已损坏；尚未修改模型配置');}
}
