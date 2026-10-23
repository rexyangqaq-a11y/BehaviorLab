// Read-only forensic extraction from retained evidence. No phone/model access.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),target=path.join(root,'docs/evidence/20261022-report-release');
await mkdir(target,{recursive:true});
const id='phone_75847d01-7eb6-4447-ac76-b66bbf8fbc19',dir=path.join(root,'.data/.phone-lab/runs',id);
const bytes=await readFile(path.join(dir,'events.jsonl')),events=bytes.toString('utf8').trim().split('\n').map(JSON.parse);
const response=events.find(e=>e.type==='model_response');
const request=events.find(e=>e.type==='model_request_start');
const firstAction=events.find(e=>e.type==='action_intent');
const image=events.find(e=>e.type==='image'&&e.asset.role==='model_input');
const commands=events.filter(e=>e.type==='hdc_intent'&&e.args.some(a=>String(a).includes('1911'))).map(e=>({seq:e.seq,args:e.args}));
const system=request.request.messages.find(m=>m.role==='system').content;
const summary=JSON.parse(await readFile(path.join(root,'docs/evidence/20261022-phone-evaluation/summary.json'),'utf8'));
const result={generated_at:new Date().toISOString(),source:{run_id:id,event_sha256:createHash('sha256').update(bytes).digest('hex')},real_model_requests:0,real_device_commands:0,
 campaign:{id:summary.evaluation_id,totals:summary.totals,final_framework:summary.final_framework},
 coordinate_case:{screen:{width:2584,height:1828},model_image:{width:image.asset.width,height:image.asset.height,sha256:image.asset.sha256},model_reply:response.response.choices[0].message.content,system_prompt_declares_coordinate_range:/0\s*[-–]\s*1000|normalized|normalised/i.test(system),model_bbox:[700,855,780,935],normalized_bbox_conversion:{x:Math.floor((Math.floor(.700*2584)+Math.floor(.780*2584))/2),y:Math.floor((Math.floor(.855*1828)+Math.floor(.935*1828))/2)},actual_action:{seq:firstAction.seq,name:firstAction.name,param:firstAction.param},matching_physical_commands:commands,observed_result:'Phone remained on launcher. Calculator icon is left of the actual target. Native conversion agrees with its 0–1000 contract; model response units/grounding remain ambiguous.',inference:'Missing explicit coordinate units may contribute. Current evidence does not establish a physical executor failure or justify automatic unit guessing.'}};
await writeFile(path.join(target,'failure-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output:path.relative(root,target),conversion:result.coordinate_case.normalized_bbox_conversion,action:firstAction.param,physical_commands:commands.length,requests:0,device_commands:0}));
