import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareStart} from '../src/phone-startpoints.mjs';
import {HOME_EVALUATION_CASES,EVALUATION_REPRESENTATIVE_CASE,assessmentKey,findReusableAssessment,selectEvaluationModel} from '../src/phone-evaluation-plan.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),{values}=parseArgs({options:{id:{type:'string'},url:{type:'string',default:'http://127.0.0.1:4317'}}});
const id=values.id??'evaluation_20261022_'+randomUUID();if(!/^evaluation_[a-z0-9_-]+$/.test(id))throw Error('Invalid evaluation ID');
const dir=path.join(root,'.data/.phone-lab/evaluations',id),file=path.join(dir,'evaluation.json');await mkdir(dir,{recursive:true});
const read=async f=>JSON.parse(await readFile(f,'utf8')),exists=async f=>{try{await access(f);return true;}catch{return false;}},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const api=async(route='',body)=>{const r=await fetch(values.url+'/api/phone-lab'+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-UI':'1'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error??'HTTP '+r.status);return j;};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=['scripts/phone-lab-worker.mjs','src/phone-framework-registry.mjs','src/phone-runtime-paths.mjs','integrations/adapters/midscene.mjs','integrations/adapters/python-native.mjs','src/phone-device.mjs','src/phone-startpoints.mjs','src/phone-lab-catalog.mjs','src/phone-image-privacy.mjs','src/gui-trial-transport.mjs','integrations/phone-frameworks.py','src/phone-permissions.mjs'];
const sourceSnapshot=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,hash(await readFile(path.join(root,f)))])));
let evaluation;
if(await exists(file))evaluation=await read(file);
else{
 const c=await api(),baseline=c.services.find(s=>s.model==='qwen3.8-flash');if(!baseline)throw Error('Verified baseline model is missing');
 evaluation={id,created_at:new Date().toISOString(),status:'preparing',phase:'stage1',case_ids:HOME_EVALUATION_CASES,representative_case:EVALUATION_REPRESENTATIVE_CASE,
  frameworks:c.frameworks.map(f=>f.id),services:c.services.map(s=>({id:s.id,model:s.model})),baseline_service_id:baseline.id,limits:c.default_limits,total_request_limit:null,
  sources:await sourceSnapshot(),baselines:{},entries:[],reuse:[],phase_history:[],best_model:null,final_framework:null,
  policy:'All four remaining tasks start at verified same phone home page. Framework alone opens and operates apps. No in-task operator assistance. Reuse only identical current-campaign cells; prior About task is excluded.'};
}
const save=()=>writeFile(file,JSON.stringify(evaluation,null,2),{flush:true});
const log=value=>console.log(JSON.stringify({evaluation_id:id,...value}));
const check=async()=>{if(await exists(path.join(dir,'stop.json')))throw Error('Evaluation stopped by operator');const c=await api();if(c.device_pause?.paused)throw Error('Phone testing paused by user');if(JSON.stringify(await sourceSnapshot())!==JSON.stringify(evaluation.sources))throw Error('Execution source changed; stop instead of mixing protocols');};
const waitForReview=async runId=>{for(;;){await check();const r=await api('/runs/'+runId);if(r.review)return r; evaluation.status='waiting_for_independent_review';await save();await sleep(2000);}};
async function assess(phase,caseId,frameworkId,serviceId){
 await check();const key=assessmentKey(caseId,frameworkId,serviceId),prior=findReusableAssessment(evaluation.entries,key);
 if(prior){const r=await api('/runs/'+prior.run_id);if(['queued','running','stopping'].includes(r.state.status))throw Error('Prior cell still active; do not duplicate or replay');evaluation.reuse.push({phase,key,run_id:r.id});await save();return r;}
 evaluation.phase=phase;evaluation.status='running';await save();
 const entry={phase,key,case_id:caseId,framework_id:frameworkId,service_id:serviceId,status:'preparing',created_at:new Date().toISOString()};evaluation.entries.push(entry);await save();
 try{
  const start=await api('/starts',{case_id:caseId,reset:true,name:'自动评估桌面起点 · '+caseId});
  const same=compareStart(evaluation.baselines[caseId].contract,start.contract);entry.same_start=same;if(!same.same)throw Error(same.reasons.join(';'));
  const r=await api('/runs',{case_id:caseId,framework_id:frameworkId,service_id:serviceId,startpoint_id:start.id,limits:evaluation.limits,evaluation_id:id,phase_id:phase});
  entry.run_id=r.id;entry.status='running';evaluation.current_run_id=r.id;await save();log({phase,case_id:caseId,framework_id:frameworkId,service_id:serviceId,run_id:r.id,status:'started'});
  let finished;for(;;){await sleep(1500);finished=await api('/runs/'+r.id);if(!['queued','running','stopping'].includes(finished.state.status))break;}
  entry.status=finished.state.status;entry.requests=finished.result?.model_usage.requests??0;entry.duration_ms=finished.result?.duration_ms??null;entry.finished_at=new Date().toISOString();evaluation.current_run_id=null;await save();
  log({phase,case_id:caseId,run_id:r.id,status:entry.status,requests:entry.requests,duration_ms:entry.duration_ms});
  if(finished.result?.effect_unknown)await waitForReview(r.id);
  return finished;
 }catch(error){entry.status=entry.run_id?'interrupted_requires_review':'blocked_before_model';entry.reason=error.message;await save();log({phase,case_id:caseId,status:entry.status,reason:entry.reason});if(entry.run_id)throw error;return null;}
}
async function phase(name,cells){evaluation.phase=name;evaluation.status='running';evaluation.phase_history.push({phase:name,started_at:new Date().toISOString()});await save();for(const cell of cells)await assess(name,...cell);evaluation.phase_history.at(-1).finished_at=new Date().toISOString();await save();log({phase:name,status:'phase_ended'});}
try{
 await check();await save();
 for(const caseId of evaluation.case_ids)if(!evaluation.baselines[caseId]){const s=await api('/starts',{case_id:caseId,reset:true,name:'冻结桌面基准 · '+caseId});if(!s.contract.ready)throw Error('Home starting conditions are not ready: '+caseId);evaluation.baselines[caseId]={id:s.id,contract:s.contract};await save();}
 if(new Set(Object.values(evaluation.baselines).map(s=>s.contract.home_page_signature)).size!==1)throw Error('Four tasks do not share the same home icon layout');
 await phase('stage1',evaluation.case_ids.map(c=>[c,'midscene',evaluation.baseline_service_id]));
 await phase('stage2',evaluation.services.map(s=>[evaluation.representative_case,'midscene',s.id]));
 const modelTrials=evaluation.entries.filter(e=>e.case_id===evaluation.representative_case&&e.framework_id==='midscene'&&e.run_id&&e.matrix_eligible!==false);
 const reviewed=[];for(const trial of modelTrials)reviewed.push(await waitForReview(trial.run_id));
 if(reviewed.length!==evaluation.services.length)throw Error('Model comparison has blocked cells; keep their missing conditions instead of selecting a fabricated winner');
 evaluation.best_model=selectEvaluationModel(reviewed,evaluation.baseline_service_id);await save();log({status:'model_selected',...evaluation.best_model});
 await phase('stage3',evaluation.frameworks.map(f=>[evaluation.representative_case,f,evaluation.best_model.service_id]));
 for(const framework of evaluation.frameworks){const trial=evaluation.entries.find(e=>e.case_id===evaluation.representative_case&&e.framework_id===framework&&e.service_id===evaluation.best_model.service_id&&e.run_id&&e.matrix_eligible!==false);if(trial)await waitForReview(trial.run_id);}
 await phase('stage4',evaluation.case_ids.flatMap(c=>evaluation.frameworks.flatMap(f=>evaluation.services.map(s=>[c,f,s.id]))));
 evaluation.status='execution_complete_pending_judgment';evaluation.phase='stage4';evaluation.finished_at=new Date().toISOString();await save();log({status:evaluation.status,unique_runs:evaluation.entries.filter(e=>e.run_id).length,blocked:evaluation.entries.filter(e=>!e.run_id).length});
}catch(error){evaluation.status='stopped_or_blocked';evaluation.reason=error.message;await save();log({status:evaluation.status,reason:error.message});process.exitCode=1;}
