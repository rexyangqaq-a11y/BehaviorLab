import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';
const {values:{id}}=parseArgs({options:{id:{type:'string'}}});
if(!/^evaluation_[a-z0-9_-]+$/.test(id??''))throw Error('Explicit evaluation ID required');
const read=async f=>{try{return JSON.parse(await readFile(f,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const base='.data/.phone-lab',evaluation=await read(`${base}/evaluations/${id}/evaluation.json`);if(!evaluation)throw Error('Evaluation missing');
const retests=await read(`${base}/evaluations/${id}/anomaly-retests.json`),audit=await read('docs/evidence/20261022-phone-evaluation/record-audit.json');
const out='docs/evidence/20261022-phone-evaluation';await mkdir(out,{recursive:true});
const category=reason=>!reason?null:/budget|request.limit|max.requests|额度|预算/i.test(reason)?'request_or_resource_limit':/normalized range|coordinates.*exceed/i.test(reason)?'model_coordinates_out_of_range':/Execution source changed/.test(reason)?'source_changed':/起点|设备|屏|HDC|hdc/.test(reason)?'start_or_device':/XML|JSON|parse|action|format/i.test(reason)?'model_or_action_protocol':/fetch|HTTP|network|timeout|timed.out/i.test(reason)?'transport_or_timeout':'other_error';
const rows=[],taskDefinitions=new Map();
for(const entry of evaluation.entries){
 if(!entry.run_id){rows.push({key:entry.key,phase:entry.phase,case_id:entry.case_id,framework_id:entry.framework_id,service_id:entry.service_id,run_id:null,engineering_status:entry.status,verdict:'blocked_before_model',requests:0,failure_category:category(entry.reason)});continue;}
 const p=`${base}/runs/${entry.run_id}`,[input,state,result,review,environment,sources]=await Promise.all(['input','state','result','review','environment','source-versions'].map(n=>read(`${p}/${n}.json`)));
 const events=(await readFile(`${p}/events.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse),starts=events.filter(e=>e.type==='model_request_start'),responses=events.filter(e=>e.type==='model_response');
 taskDefinitions.set(input.case_id,input.task);
 let finalHashVerified=null;if(result?.final_asset){const actual=createHash('sha256').update(await readFile(path.join(p,result.final_asset.file))).digest('hex');finalHashVerified=actual===result.final_asset.sha256;if(!finalHashVerified)throw Error('Final image hash mismatch: '+entry.run_id);}
 rows.push({key:entry.key,phase:entry.phase,case_id:input.case_id,case_revision:input.case_revision,framework_id:input.framework_id,framework_version:input.framework.version,service_id:input.service_id,model:input.service.model,run_id:entry.run_id,protocol:input.evaluation_protocol,matrix_eligible:entry.matrix_eligible!==false,exclusion_reason:entry.exclusion_reason??null,
  engineering_status:state?.status,verdict:review?.verdict??'pending_review',reviewer:review?.reviewer??null,user_review:'pending',permission_policy:result?.permission_policy??null,policy_deviation:entry.policy_deviation??null,retested_for:entry.retested_for??null,same_start:result?.same_start?.same??null,comparison_key:input.startpoint.contract.comparison_key,
  requests:result?.model_usage.requests??starts.length,responses:responses.length,http_status_counts:responses.reduce((a,e)=>(a[e.http_status]=(a[e.http_status]??0)+1,a),{}),retries:result?.model_usage.retries??0,
  sdk_actions:result?.actions??events.filter(e=>e.type==='action_intent').length,physical_inputs:result?.physical_actions??null,duration_ms:result?.duration_ms??null,input_tokens:result?.model_usage.known_input_tokens??responses.reduce((s,e)=>s+(e.usage?.input_tokens??0),0),output_tokens:result?.model_usage.known_output_tokens??responses.reduce((s,e)=>s+(e.usage?.output_tokens??0),0),unknown_usage_requests:result?.model_usage.unknown_usage_requests??starts.length-responses.filter(e=>e.usage?.input_tokens!=null&&e.usage?.output_tokens!=null).length,usage_state:result?'final':'in_progress',
  fees:null,credits:null,effect_unknown:result?.effect_unknown??false,blocked_before_network:result?.model_usage.blocked_before_network??[],failure_category:result?.model_usage.blocked_before_network?.some(b=>/budget|limit/i.test(b.reason))?'request_or_resource_limit':category(result?.reason),
  environment:environment?{node:environment.node,platform:environment.platform,hdc_version:environment.hdc_version,device:environment.device,app:environment.app,screen:environment.screen}:null,
  sources,task_sha256:input.task_sha256,limits:input.limits,final_asset:result?.final_asset?{id:result.final_asset.id,sha256:result.final_asset.sha256,width:result.final_asset.width,height:result.final_asset.height,hash_verified:finalHashVerified}:null});
}
const diagnostics=rows.filter(r=>r.matrix_eligible===false),unique=new Map();for(const row of rows.filter(r=>r.matrix_eligible!==false))if(row.run_id||!unique.has(row.key))unique.set(row.key,row);const cells=[...unique.values()];
const count=(values,key)=>values.reduce((a,r)=>(a[r[key]]=(a[r[key]]??0)+1,a),{});
const summarize=values=>({unique_cells:values.length,real_runs:values.filter(r=>r.run_id).length,started_model_calls:values.reduce((s,r)=>s+r.requests,0),verdicts:count(values,'verdict'),engineering_statuses:count(values,'engineering_status'),known_input_tokens:values.reduce((s,r)=>s+(r.input_tokens??0),0),known_output_tokens:values.reduce((s,r)=>s+(r.output_tokens??0),0),unknown_usage_requests:values.reduce((s,r)=>s+(r.unknown_usage_requests??0),0)});
const group=key=>Object.fromEntries([...new Set(cells.map(r=>r[key]))].map(v=>[v,summarize(cells.filter(r=>r[key]===v))]));
const retained=summarize(rows.filter(r=>r.run_id)),overwritten=(retests?.status==='complete_replaced'?retests.rows:[]).map(r=>r.replaced_usage);
const overwrittenUsage={runs:overwritten.length,requests:overwritten.reduce((s,u)=>s+u.requests,0),known_input_tokens:overwritten.reduce((s,u)=>s+u.known_input_tokens,0),known_output_tokens:overwritten.reduce((s,u)=>s+u.known_output_tokens,0),unknown_usage_requests:overwritten.reduce((s,u)=>s+u.unknown_usage_requests,0)};
const removedDiagnostics=evaluation.removed_integration_diagnostics?.totals,diagnosticTotals=removedDiagnostics??summarize(diagnostics);
const summary={generated_at:new Date().toISOString(),evaluation_id:id,status:evaluation.status,phase:evaluation.phase,planned_unique_cells:evaluation.case_ids.length*evaluation.frameworks.length*evaluation.services.length,selection:evaluation.best_model,final_framework:null,
 policy:{start:'Same phone, launcher page, orientation and usable state; dynamic clock, suggestions and recent-app ordering may vary. Framework opens app and performs every in-task action.',repeated_cells:'Reuse existing identical framework/model/case cell; no automatic retries.',limits:evaluation.limits,batch_total_request_limit:null,judgment:'Real screenshots and actions independently examined; framework finish/HTTP200 is insufficient. User review pending.',sensitive_fields:'No credentials, raw screen text, device serial or account names in this summary.'},
 totals:summarize(cells),integration_diagnostics:{totals:diagnosticTotals,retention:removedDiagnostics?'removed_after_completed_retest_per_user':'retained',rows:diagnostics},retained_attempts:retained,overwritten_abnormal_usage:overwrittenUsage,
 all_current_campaign_attempts:{...retained,verdict_scope:'retained_records_only; abnormal originals removed per user',real_runs:retained.real_runs+overwritten.length+(removedDiagnostics?.real_runs??0),started_model_calls:retained.started_model_calls+overwrittenUsage.requests+(removedDiagnostics?.started_model_calls??0),known_input_tokens:retained.known_input_tokens+overwrittenUsage.known_input_tokens+(removedDiagnostics?.known_input_tokens??0),known_output_tokens:retained.known_output_tokens+overwrittenUsage.known_output_tokens+(removedDiagnostics?.known_output_tokens??0),unknown_usage_requests:retained.unknown_usage_requests+overwrittenUsage.unknown_usage_requests+(removedDiagnostics?.unknown_usage_requests??0)},
 anomaly_retests:evaluation.anomaly_retests??null,record_audit:audit?{generated_at:audit.generated_at,runs:audit.runs,images:audit.images,issue_runs:audit.issue_runs}:null,protocol_amendments:evaluation.protocol_amendments??[],by_framework:group('framework_id'),by_model:group('model'),by_task:group('case_id'),reuse:evaluation.reuse,rows:cells};
await writeFile(`${out}/summary.json`,JSON.stringify(summary,null,2));
await writeFile('docs/reference/PHONE_HOME_EVALUATION_CASES_20261022.json',JSON.stringify({frozen_for_evaluation:id,protocols:[...new Set(cells.map(r=>r.protocol).filter(Boolean))],start_policy:'logical_home_fixed_icon_membership_v3',protocol_amendments:evaluation.protocol_amendments??[],case_ids:evaluation.case_ids,cases:[...taskDefinitions.values()],frameworks:evaluation.frameworks,models:evaluation.services,limits:evaluation.limits,sources:evaluation.sources,final_framework:null},null,2));
const names={'HM-CALC-001':'计算器','HM-STOR-001':'存储','HM-TB-001':'淘宝','HM-XHS-001':'小红书'},verdicts={passed:'通过',partial:'部分完成',failed:'未通过',blocked:'受阻',cannot_determine:'无法确定',pending_review:'待核对',blocked_before_model:'调用前受阻'};
const table=cells.map(r=>`| ${names[r.case_id]??r.case_id} | ${r.framework_id} | ${r.model??r.service_id} | ${verdicts[r.verdict]??r.verdict} / ${r.engineering_status} | ${r.requests} | ${r.duration_ms==null?'—':(r.duration_ms/1000).toFixed(1)} | ${r.input_tokens==null?'—':r.input_tokens+' / '+r.output_tokens} | ${r.run_id??'未创建运行'} |`).join('\n');
const selected=evaluation.best_model?`${evaluation.best_model.model}，只依据一个桌面计算器任务，仍是临时比较模型。`:'尚未完成第二阶段独立判定，不预选新模型。';
const md=`# 四阶段真机评估记录 · 2026-10-22

生成时间：${summary.generated_at}。批次 \`${id}\`，当前阶段 ${evaluation.phase}，状态 \`${evaluation.status}\`。本文件随真实记录更新；[结构化证据](evidence/20261022-phone-evaluation/summary.json)是本轮快照，原图、完整输入、回复与事件留本机。未知值不写成零。

计划为四题 × 三框架 × 三模型，共 **${summary.planned_unique_cells} 个唯一单元**；当前有 **${summary.totals.real_runs} 条矩阵真实运行、${summary.totals.started_model_calls} 次矩阵模型请求**。早期 ${diagnosticTotals.real_runs} 条接入诊断、${diagnosticTotals.started_model_calls} 次请求已在修复后完成替换；本次 ${overwrittenUsage.runs} 条确认异常新增重测后也直接替换。按用户要求，两批异常原记录均不保留在列表或运行目录；其 ${diagnosticTotals.started_model_calls+overwrittenUsage.requests} 次实际消耗只保留汇总，不从用量中抹去。本批累计真实请求 **${summary.all_current_campaign_attempts.started_model_calls} 次**。矩阵判定分布：${JSON.stringify(summary.totals.verdicts)}。每单元最多15次请求，整批无总请求限制，零自动重试；同组合单元跨阶段复用。

## 本次核对与异常重测

全部36个单元已执行并完成助手独立核对，用户审核仍待定；没有把框架ended/HTTP200直接视作业务通过。完整性核验覆盖${audit?.runs??'待更新'}条留存运行的JSONL顺序、镜像模型账本、请求响应/动作返回成对、输入/环境/源码哈希/起点快照，以及全部图片哈希和完整解码。[核验结果](evidence/20261022-phone-evaluation/record-audit.json)：${audit?.images??'待更新'}张图片，${audit?.issue_runs??'待更新'}条存在结构问题的运行。图片可解码不等于图中内容或模型判断正确。

确认并修复了两类本机接入问题：Python原生输入错误复用上次点击坐标，导致聚焦搜索框后又误点相机或提交推荐词；AutoGLM半尺寸PNG在复杂页面超过既有2MiB请求上限，原生循环把模型入口阻断吞成ended。输入已改用设备实际支持的无坐标当前焦点命令，AutoGLM改为相同半尺寸JPEG并纠正MIME，未提高额度或降低分辨率。重测为AutoGLM三模型的小红书和MobiAgent×qwen3.7的小红书，共4条、25请求，全部核对通过；分别7/6/6/6请求、69.431/65.850/68.432/72.830秒。按用户最新指令覆盖旧记录，结果页只有替换后的单元；摘要仍区分重测与原有协议。后续入口还补充了超大请求的调用前阻断记录、原生失败工程状态，成功结果不为日志增强而再跑。

正常执行下的误点、错误查询、格式不兼容、循环及15请求耗尽不重测。具体核对发现：MobiAgent×qwen3.7淘宝实际查询是吸盘手机支架，虽然自报完成仍判部分完成；Midscene×DeepSeek和MobiAgent×qwen3.8小红书先打开了视频，后来读对图文也不满足“不要打开视频”，判部分完成。淘宝分享截屏弹层及其中一次彩色异常预览仍作为环境/画面干扰披露；原文件能完整解码，不能据此认定采集文件损坏，也不能将相关困难全部归因于模型。未在原因未消除时重复消耗额度。一次临时剪贴板授权单列policy_deviation；后续统一约束并在设备入口阻止新增权限。

## 当前方案与判定范围

按照用户顺序：Midscene × qwen3.8-flash 全四题 → Midscene 多模型计算器 → 多框架临时最佳模型计算器 → 全矩阵。已测关于本机保留历史；已完成的计算器同组合不重复。临时模型：${selected}最终框架仍未确认。

四题均从同一手机桌面页面和方向开始，框架自己打开 APP；观察方只做起点准备、留证和最终核对。用户明确“不用完全一致”，时钟、建议内容及最近应用集合/顺序动态记录。准备只停止目标进程并回桌面，不清除账号或数据。起点协议先为v4、后为v5：发现最近应用集合变化导致19项零调用阻断后，仅放宽动态项，仍核对手机、版本、方向、主桌面图标集合和无键盘/输入焦点。基于最初保存布局重核17条已有运行，全部符合放宽后的起点，不重复调用；19条零调用记录保留并补齐实际评估。协议、原始起点、源码和修订历史逐次保存，不宣称整批字节级协议相同。应用内部历史、搜索推荐和动态内容可能变化，本轮不是完整设备镜像还原试验。

输入、任务 revision、源码哈希、型号/系统/应用版本、请求与原始返回、动作、物理输入、截图、耗时及 usage 均保留。原生结束与业务通过分别记录，助手看真实截图核对，用户复核仍待定。调用失败、预算耗尽或部分完成不自动重试。不能以 Mock、HTTP200 或文字自报替代真实 GUI 通过。

Midscene 为原生 HarmonyAgent；MobiAgent 为原生 task_in_app e2e/qwen_json、关闭经验/记忆；Open-AutoGLM 为原生 PhoneAgent.step 和动作解析。后两者以本机RPC连接HDC和统一模型运输，不安装专用模型权重，不宣称复现上游榜单。实际发现Windows默认编码破坏Python桥中文JSON，以及原生AutoGLM客户端遗留answer关闭标签；修复仅在本机桥指定UTF-8和移除包装，原始响应与原生动作解析保留。6条修复前零动作记录单列接入诊断；修订历史和前后源码哈希完整保存。Midscene未执行Python桥，已有7条Midscene记录（含失败）继续复用，未重测成功计算器。三模型分别为已保存的 qwen3.8-flash、qwen3.7-plus、deepseek-v4.1-flash-1017。框架版本和真实环境见结构化证据。

## 逐项结果

| 任务 | 框架 | 模型 | 独立判定 / 工程状态 | 请求 | 执行秒 | 输入 / 输出 tokens | 本机运行 ID |
|---|---|---|---|---:|---:|---:|---|
${table}

耗时是Agent执行段，包含框架启动、本机RPC、截图与记录开销，不含起点准备、预检和最终证据整理，不能当作纯模型推理时延。矩阵已知输入合计 ${summary.totals.known_input_tokens}、输出 ${summary.totals.known_output_tokens} tokens；另有 ${summary.totals.unknown_usage_requests} 次未知 usage。实际费用/Credits、未返回的推理用量保持未知。每个有效单元只取一次，早期接入诊断仅保留用量汇总、已替换旧记录按用户要求移除；存在明确记录的起点协议修订，不据此估计稳定成功率或宣称某框架总体最优。

## 已发现的限制与历史隔离

第一配置存储任务进入存储并读到容量，但随后模型滚动坐标越界；淘宝完成搜索并进商品详情，随后被分享截屏弹层遮挡，模型点击坐标越界，均记部分完成。小红书图文详情包含个人售卖商品卡，判定时记录该条件且检查没有点击商品/互动。不同组合如遇同类问题也单独留证，未由观察方代做或修改结果。

起点校准批次 \`evaluation_20261022_5edcda2b-51d0-4ff2-ae7b-0d12e827454d\` 的计算器13请求/126.205秒成功，以及因动态Dock误判的5项零调用前置阻断，保留为校准记录，不并入本轮矩阵分母。当前计算器14请求的复核在用户提出不再重复前已结束；后续仅复用。2026-10-21关于本机的成功和早期partial也独立保留。

软件回归 **88/88**，两套Python原生离线契约通过，含中文往返与JPEG/MIME核对，均不算真实GUI成绩。结果页支持框架、模型、任务、手机、判定、阶段（含接入异常重测）、批次和文本筛选，组合条件同步影响列表与对比表；原 trace 仍支持每张图的模型回复与动作。

本轮执行、助手核对及4项确认接入异常的重测已完成；正常未通过结果保持原样，没有追加调用。最终选型由用户确认；稳定性重复采样、更多任务/手机、无截图干扰采集仍是后续评估条件，不是已实现结果。源代码、原图、凭据、运行数据库不上传；模型图像请求按用户现有授权及项目用量规则执行。
`;
await writeFile('docs/PHONE_EVALUATION_RESULTS_20261022.md',md);console.log(JSON.stringify({evaluation_id:id,status:summary.status,...summary.totals}));
