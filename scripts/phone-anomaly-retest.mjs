import {readFile,writeFile,access,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {compareStart} from '../src/phone-startpoints.mjs';
const evaluationId='evaluation_20261022_b14102b7-e102-4744-b9a3-bc1d99ef014b',base=path.resolve('.data/.phone-lab'),dir=path.join(base,'evaluations',evaluationId),file=path.join(dir,'anomaly-retests.json');
const originals=[['phone_7671b50d-7e56-4966-9042-7eb8abe12404','PNG model payload exceeded existing 2 MiB ceiling after only four requests'],['phone_ab96bc35-afe0-498f-974a-94ff6424a472','Stale input coordinate clicked camera instead of focused search field; PNG payload ceiling stopped run'],['phone_b8183b69-1379-45cb-974d-4a7cf7cf7f38','Stale input coordinate changed focus and submitted suggested search rather than requested text'],['phone_4aa98236-0f1f-4b7c-be34-24889ac63073','Stale input coordinate changed focus and submitted suggested search before recovery']];
const read=async f=>JSON.parse(await readFile(f,'utf8')),exists=async f=>{try{await access(f);return true;}catch{return false;}},sleep=ms=>new Promise(r=>setTimeout(r,ms)),hash=b=>createHash('sha256').update(b).digest('hex');
const files=['src/phone-device.mjs','integrations/phone-frameworks.py','scripts/phone-lab-worker.mjs','src/phone-permissions.mjs','src/phone-startpoints.mjs','src/gui-trial-transport.mjs','src/phone-lab.mjs'];
const sources=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(f))])));
const api=async(route='',body)=>{const response=await fetch('http://127.0.0.1:4317/api/phone-lab'+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-UI':'1'},body:JSON.stringify(body)});const j=await response.json();if(!response.ok)throw Error(j.error??'HTTP '+response.status);return j;};
let plan=await exists(file)?await read(file):{evaluation_id:evaluationId,created_at:new Date().toISOString(),status:'prepared',sources:await sources(),overwrite_authorization:'User explicitly requested replacing old abnormal records after retesting on 2026-10-22',limits:{max_requests:15,automatic_retries:0,batch_total_request_limit:null},rows:[]};
const save=()=>writeFile(file,JSON.stringify(plan,null,2),{flush:true});
if(plan.status==='complete_replaced'&&!process.argv.includes('--finalize')){console.log(JSON.stringify({status:plan.status,message:'Already replaced; no duplicate phone/model execution'}));process.exit(0);}
if(process.argv.includes('--finalize')){
 if(plan.rows.length!==originals.length)throw Error('Retest plan incomplete');
 const evaluation=await read(path.join(dir,'evaluation.json'));
 for(const row of plan.rows){
  const s=await api('/runs/'+row.run_id);if(['running','queued','stopping','interrupted'].includes(s.state.status)||!s.review||s.result?.effect_unknown||!s.result?.final_asset)throw Error('Retest has not completed independent review: '+row.run_id);
  const bytes=await readFile(path.join(base,'runs',row.run_id,s.result.final_asset.file));if(hash(bytes)!==s.result.final_asset.sha256)throw Error('Final evidence hash mismatch');
 }
 // Validate every explicit deletion target before changing the canonical list.
 const targets=plan.rows.map(row=>{if(!originals.some(([id])=>id===row.original_run_id))throw Error('Original not authorized');const target=path.resolve(base,'runs',row.original_run_id);if(path.dirname(target)!==path.join(base,'runs')||!/^phone_[a-f0-9-]{36}$/.test(path.basename(target)))throw Error('Unsafe removal target');return target;});
 for(const row of plan.rows){const entry=evaluation.entries.find(e=>e.run_id===row.original_run_id)??evaluation.entries.find(e=>e.run_id===row.run_id);if(!entry)throw Error('Canonical cell missing');const s=await api('/runs/'+row.run_id);Object.assign(entry,{run_id:row.run_id,status:s.state.status,requests:s.result.model_usage.requests,duration_ms:s.result.duration_ms,finished_at:s.result.finished_at,retested_for:row.reason,retest_protocol:s.evaluation_protocol});for(const reuse of evaluation.reuse??[])if(reuse.run_id===row.original_run_id)reuse.run_id=row.run_id;row.verdict=s.review.verdict;}
 evaluation.anomaly_retests={status:'complete',count:plan.rows.length,policy:'Original abnormal run directories replaced after independent review per user instruction',at:new Date().toISOString()};
 await writeFile(path.join(dir,'evaluation.json'),JSON.stringify(evaluation,null,2),{flush:true});
 for(const target of targets)await rm(target,{recursive:true,force:true});
 plan.status='complete_replaced';plan.finished_at=new Date().toISOString();await save();console.log(JSON.stringify({status:plan.status,replaced:targets.length}));
}else{
 try{
  const evaluation=await read(path.join(dir,'evaluation.json'));await save();
  for(const [originalId,reason]of originals){
   if(plan.rows.some(r=>r.original_run_id===originalId))continue;
   if(JSON.stringify(await sources())!==JSON.stringify(plan.sources))throw Error('Retest sources changed');
   const catalog=await api();if(catalog.busy||catalog.device_pause?.paused)throw Error('Device busy or paused');
   const original=await api('/runs/'+originalId),start=await api('/starts',{case_id:original.case_id,reset:true,name:'异常重测 · 桌面起点'}),same=compareStart(evaluation.baselines[original.case_id].contract,start.contract);if(!same.same)throw Error(same.reasons.join(';'));
   const run=await api('/runs',{case_id:original.case_id,framework_id:original.framework_id,service_id:original.service_id,startpoint_id:start.id,limits:original.limits,evaluation_id:evaluationId,phase_id:'anomaly_retest'});
   const row={original_run_id:originalId,reason,run_id:run.id,case_id:original.case_id,framework_id:original.framework_id,service_id:original.service_id,status:'running',replaced_usage:original.result.model_usage};plan.rows.push(row);plan.status='running';await save();console.log(JSON.stringify(row));
   let finished;do{await sleep(1500);finished=await api('/runs/'+run.id);}while(['running','queued','stopping'].includes(finished.state.status));
   row.status=finished.state.status;row.requests=finished.result?.model_usage.requests??0;row.duration_ms=finished.result?.duration_ms;await save();console.log(JSON.stringify({run_id:run.id,status:row.status,requests:row.requests}));if(finished.result?.effect_unknown||row.status==='interrupted')throw Error('Unknown action effect requires review');
  }
  plan.status='execution_complete_pending_review';await save();console.log(JSON.stringify({status:plan.status}));
 }catch(error){plan.status='blocked';plan.reason=error.message;await save();console.error(error.message);process.exitCode=1;}
}
