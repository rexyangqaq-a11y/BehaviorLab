import test from 'node:test';import assert from 'node:assert/strict';
import {HOME_EVALUATION_CASES,selectEvaluationModel,findReusableAssessment} from '../src/phone-evaluation-plan.mjs';
import {filterPhoneRuns} from '../web/phone-results.mjs';
test('staged evaluation excludes the already tested About task and selects only independently passed model results',()=>{
 assert.equal(HOME_EVALUATION_CASES.length,4);assert.ok(!HOME_EVALUATION_CASES.includes('HM-SYS-001'));
 const make=(id,verdict,requests)=>({id,service_id:id,service:{model:id},state:{status:'ended'},review:verdict?{verdict}:null,result:{model_usage:{requests},duration_ms:100}});
 const rows=[make('baseline','passed',10),make('fast-but-failed','failed',1),make('better','passed',6)];
 assert.equal(selectEvaluationModel(rows,'baseline').service_id,'better');assert.equal(selectEvaluationModel([...rows,make('pending',null,1)],'baseline'),null);
});
test('when no new single-task model passes, selection explicitly retains the verified baseline without inventing a winner',()=>{
 const r={id:'run',service_id:'baseline',service:{model:'qwen'},review:{verdict:'partial'}};
 const selected=selectEvaluationModel([r],'baseline');assert.equal(selected.service_id,'baseline');assert.match(selected.basis,/no_new_model_pass/);assert.equal(selected.provisional,true);
});
test('reusable matrix cells preserve completed results and skip explicitly isolated integration diagnostics',()=>{
 const diagnostic={key:'calc|mobi|qwen',run_id:'broken-bridge',matrix_eligible:false},fixed={key:diagnostic.key,run_id:'fixed-bridge'},prior={key:'calc|midscene|qwen',run_id:'already-done'};
 assert.equal(findReusableAssessment([diagnostic],diagnostic.key),null);assert.equal(findReusableAssessment([diagnostic,fixed],diagnostic.key),fixed);assert.equal(findReusableAssessment([prior],prior.key),prior);
});
test('result filters combine framework, model, task, phone, phase, batch and judgment without mixing unknowns',()=>{
 const a={id:'a',framework_id:'midscene',service:{model:'qwen'},case_id:'HM-CALC-001',device_info:{model:'phone-a'},phase_id:'stage1',evaluation_id:'eval',review:{verdict:'passed'}};
 const b={...a,id:'b',framework_id:'autoglm',review:{verdict:'failed'}},c={id:'old',service:{model:'other'}};
 assert.deepEqual(filterPhoneRuns([a,b,c],{framework:'midscene',model:'qwen',task:'HM-CALC-001',phone:'phone-a',phase:'stage1',evaluation:'eval',verdict:'passed'}),[a]);
 assert.deepEqual(filterPhoneRuns([a,b,c],{phase:'historical',phone:'unknown',verdict:'pending_review'}),[c]);
 assert.deepEqual(filterPhoneRuns([a,b,c],{search:'CALC'}),[a,b]);assert.equal(filterPhoneRuns([a,b,c],{}).length,3);
});
