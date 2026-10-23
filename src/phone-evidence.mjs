import { appendFileSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { imageDimensions } from '../scripts/hdc-device-baseline.mjs';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export class PhoneEvidence {
  constructor(dir, { secrets = [], phase = 'preparation' } = {}) {
    this.dir = dir; this.secrets = secrets.filter(Boolean); this.phase = phase; this.started = Date.now(); this.seq = 0;
    mkdirSync(path.join(dir, 'assets'), {recursive:true});
    try { const lines=readFileSync(path.join(dir,'events.jsonl'),'utf8').trim().split('\n'); this.seq=JSON.parse(lines.at(-1)).seq; } catch { /* new ledger */ }
  }
  clean(value) {
    let text=JSON.stringify(value ?? null);
    for(const secret of this.secrets)text=text.split(secret).join('[redacted]');
    return JSON.parse(text);
  }
  record = event => {
    const row=this.clean({seq:++this.seq,at:new Date().toISOString(),elapsed_ms:Date.now()-this.started,phase:this.phase,...event});
    appendFileSync(path.join(this.dir,'events.jsonl'),JSON.stringify(row)+'\n',{flush:true});
    if(event.type?.startsWith('model_'))appendFileSync(path.join(this.dir,'model-calls.jsonl'),JSON.stringify(row)+'\n',{flush:true});
    return row;
  };
  save(file,value,{replace=false}={}) { writeFileSync(path.join(this.dir,file),JSON.stringify(this.clean(value),null,2),{flag:replace?'w':'wx',flush:true}); }
  image = async (bytes,mime,role) => {
    const dimensions=imageDimensions(bytes), id='img_'+randomUUID(),file=`assets/${id}.${dimensions.format==='jpeg'?'jpeg':'png'}`;
    writeFileSync(path.join(this.dir,file),bytes,{flag:'wx',flush:true});
    const asset={id,file,sha256:sha256(bytes),bytes:bytes.length,...dimensions,role,action_id:this.actionId??null,at:new Date().toISOString()};
    this.record({type:'image',asset}); return asset;
  };
}
