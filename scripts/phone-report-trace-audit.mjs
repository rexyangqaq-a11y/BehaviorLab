// Read-only report analysis. Never opens a device or sends model requests.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'.build/report_explained_20261023');
await mkdir(out,{recursive:true});
const summary=JSON.parse(await readFile(path.join(root,'docs/evidence/20261022-phone-evaluation/summary.json'),'utf8'));
const rows=[];
for(const row of summary.rows){
 const dir=path.join(root,'.data/.phone-lab/runs',row.run_id),raw=await readFile(path.join(dir,'events.jsonl'),'utf8'),events=raw.trim().split('\n').map(JSON.parse);
 const requests=events.filter(e=>e.type==='model_request_start'),responses=events.filter(e=>e.type==='model_response');
 if(requests.length!==row.requests||responses.length!==row.requests)throw Error('Incomplete request/response evidence: '+row.run_id);
 if(responses.reduce((a,e)=>a+e.usage.input_tokens,0)!==row.input_tokens||responses.reduce((a,e)=>a+e.usage.output_tokens,0)!==row.output_tokens)throw Error('Token ledger mismatch: '+row.run_id);
 const modelMs=responses.reduce((a,e)=>a+(e.duration_ms??0),0);
 const actions=events.filter(e=>e.type==='action_intent').map(e=>({seq:e.seq,name:e.name,param:e.param}));
 const imageRoles={};for(const e of events.filter(e=>e.type==='image'))imageRoles[e.asset.role]=(imageRoles[e.asset.role]??0)+1;
 const textChars=requests.map(e=>e.text_chars),systemChars=requests.map(e=>e.request.messages.filter(m=>m.role==='system').reduce((n,m)=>n+(typeof m.content==='string'?m.content.length:JSON.stringify(m.content).length),0));
 const modelImages=requests.reduce((a,e)=>a+e.images,0);
 const review=JSON.parse(await readFile(path.join(dir,'review.json'),'utf8'));
 rows.push({run_id:row.run_id,case_id:row.case_id,framework:row.framework_id,model:row.model,verdict:row.verdict,event_sha256:createHash('sha256').update(raw).digest('hex'),duration_ms:row.duration_ms,requests:requests.length,input_tokens:row.input_tokens,output_tokens:row.output_tokens,model_http_ms:modelMs,other_elapsed_ms:row.duration_ms-modelMs,action_count:actions.length,image_count:Object.values(imageRoles).reduce((a,b)=>a+b,0),image_roles:imageRoles,text_chars:textChars,system_chars:systemChars,model_images:modelImages,
  steps:responses.map((e,i)=>({id:e.id,duration_ms:e.duration_ms,input_tokens:e.usage?.input_tokens,reply:e.response?.choices?.[0]?.message?.content,actions:actions.filter(a=>a.seq>e.seq&&a.seq<(requests[i+1]?.seq??Infinity))})),review:review.note});
}
const totals={};for(const f of ['midscene','mobiagent','autoglm']){const rs=rows.filter(r=>r.framework===f),n=rs.reduce((a,r)=>a+r.requests,0);totals[f]={runs:rs.length,requests:n,input_tokens:rs.reduce((a,r)=>a+r.input_tokens,0),average_input_tokens:rs.reduce((a,r)=>a+r.input_tokens,0)/n,average_text_chars:rs.flatMap(r=>r.text_chars).reduce((a,b)=>a+b,0)/n,average_system_chars:rs.flatMap(r=>r.system_chars).reduce((a,b)=>a+b,0)/n,images_per_request:rs.reduce((a,r)=>a+r.model_images,0)/n};}
const payload={source:'Retained 36 records after abnormal replacement',real_model_requests:0,real_device_commands:0,totals,rows};
await writeFile(path.join(out,'trace-audit-private.json'),JSON.stringify(payload,null,2));
const evidenceDir=path.join(root,'docs/evidence/20261023-ppt-explained');await mkdir(evidenceDir,{recursive:true});
const publicRows=rows.map(({steps,review,...r})=>r),publicData={generated_at:new Date().toISOString(),source:payload.source,real_model_requests:0,real_device_commands:0,verified_request_response_and_usage_pairs:331,totals,samples:publicRows.filter(r=>r.model==='qwen3.7-plus'&&['HM-STOR-001','HM-XHS-001'].includes(r.case_id)),source_events:rows.map(r=>({run_id:r.run_id,event_sha256:r.event_sha256})),boundaries:['HTTP duration includes interface/network round trip; not pure inference time','Other elapsed is total execution minus non-overlapping HTTP calls; no per-component attribution','Image event count includes copies and model input assets; not capture command count','Single-run exploratory comparison, historical starts/protocols changed','Private raw model replies and account-related screenshot text are excluded']};
await writeFile(path.join(evidenceDir,'trace-analysis.json'),JSON.stringify(publicData,null,2));
console.log(JSON.stringify({checked:rows.length,requests:331,totals,evidence:'docs/evidence/20261023-ppt-explained/trace-analysis.json'},null,2));
