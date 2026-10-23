import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import path from 'node:path';
const {values:{id}}=parseArgs({options:{id:{type:'string'}}});
if(!/^evaluation_[a-z0-9_-]+$/.test(id??''))throw Error('Explicit evaluation ID required');
const base='.data/.phone-lab',read=async file=>JSON.parse(await readFile(file,'utf8')),e=await read(`${base}/evaluations/${id}/evaluation.json`);
const req=createRequire(await realpath('integrations/midscene/node_modules/@midscene/harmony/package.json')),shared=createRequire(req.resolve('@midscene/shared/img')),sharp=(await import(pathToFileURL(shared.resolve('sharp')).href)).default;
const rows=[];
for(const entry of e.entries.filter(x=>x.run_id)){
 const dir=`${base}/runs/${entry.run_id}`,issues=[],warnings=[];
 const input=await read(dir+'/input.json'),state=await read(dir+'/state.json'),result=await read(dir+'/result.json');
 for(const file of ['environment.json','source-versions.json','start-check.json'])await read(dir+'/'+file).catch(()=>issues.push('missing_or_invalid:'+file));
 const parseLedger=async file=>{const lines=(await readFile(dir+'/'+file,'utf8')).trim().split('\n').filter(Boolean),out=[];for(let n=0;n<lines.length;n++){try{out.push(JSON.parse(lines[n]));}catch{issues.push(`invalid_jsonl:${file}:${n+1}`);}}return out;};
 const events=await parseLedger('events.jsonl'),calls=await parseLedger('model-calls.jsonl');
 if(events.some((v,n)=>v.seq!==n+1))issues.push('event_sequence_gap');
 if(JSON.stringify(calls)!==JSON.stringify(events.filter(v=>v.type.startsWith('model_'))))issues.push('model_ledger_mismatch');
 const starts=events.filter(v=>v.type==='model_request_start'),responses=events.filter(v=>v.type==='model_response'),actions=events.filter(v=>v.type==='action_intent'),images=events.filter(v=>v.type==='image').map(v=>v.asset);
 for(const s of starts)if(responses.filter(v=>v.id===s.id).length!==1)issues.push('missing_or_duplicate_response:'+s.id);
 if(starts.length!==result.model_usage.requests||actions.length!==result.actions)issues.push('counter_mismatch');
 if(!events.some(v=>v.type==='execution_end'))issues.push('missing_execution_end');
 if(['running','queued','interrupted','stopping'].includes(state.status))issues.push('nonterminal_or_interrupted');
 for(const a of actions)if(!events.some(v=>['action_return','action_unknown'].includes(v.type)&&v.id===a.id))issues.push('missing_action_outcome:'+a.id);
 if(result.effect_unknown||events.some(v=>/unknown/.test(v.type)))warnings.push('unknown_device_effect');
 for(const a of images){try{const file=path.resolve(dir,a.file);if(!file.startsWith(path.resolve(dir)+path.sep))throw Error('outside');const b=await readFile(file);if(createHash('sha256').update(b).digest('hex')!==a.sha256)issues.push('asset_hash:'+a.id);const {info}=await sharp(b,{failOn:'warning'}).raw().toBuffer({resolveWithObject:true});if(info.width!==a.width||info.height!==a.height)issues.push('asset_size:'+a.id);}catch(error){issues.push('asset_decode_or_missing:'+a.id);}}
 const refs=JSON.stringify(starts.map(v=>v.request)).matchAll(/asset:([^"#]+)#sha256=([a-f0-9]{64})/g);for(const [,file,hash]of refs)if(!images.some(v=>v.file===file&&v.sha256===hash))issues.push('missing_submitted_image_reference');
 const ioStops=events.filter(v=>['framework_io_stopped','execution_stopped','model_request_blocked'].includes(v.type)).map(v=>({type:v.type,method:v.method,reason:v.error??v.reason}));
 if(ioStops.some(v=>/payload byte/.test(v.reason??'')))warnings.push('png_payload_limit');
 const inputActions=actions.filter(v=>v.name==='input');
 rows.push({run_id:entry.run_id,case_id:input.case_id,framework_id:input.framework_id,service_id:input.service_id,matrix_eligible:entry.matrix_eligible!==false,status:state.status,images:images.length,requests:starts.length,responses:responses.length,actions:actions.length,issues,warnings,io_stops:ioStops,input_actions:inputActions.map(v=>({seq:v.seq,id:v.id,prior_tap:actions.filter(a=>a.seq<v.seq&&a.name==='tap').at(-1)?.param,after_asset:images.find(a=>a.action_id===v.id&&a.role==='after')?.id})),native_result:input.framework_id==='autoglm'?result.native_result:null});
}
const report={generated_at:new Date().toISOString(),evaluation_id:id,scope:'Byte hashes, full image decoding, JSONL sequence and mirrored model ledger, request/response and action/outcome pairs, input/environment/source/start snapshots; semantic visual review is separate.',runs:rows.length,images:rows.reduce((s,r)=>s+r.images,0),requests:rows.reduce((s,r)=>s+r.requests,0),issue_runs:rows.filter(r=>r.issues.length).length,rows};
await mkdir('docs/evidence/20261022-phone-evaluation',{recursive:true});await writeFile('docs/evidence/20261022-phone-evaluation/record-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:rows.filter(r=>r.issues.length||r.warnings.length||r.input_actions.length)}));
