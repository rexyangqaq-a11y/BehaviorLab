export const HOME_EVALUATION_CASES=['HM-CALC-001','HM-STOR-001','HM-TB-001','HM-XHS-001'];
export const EVALUATION_REPRESENTATIVE_CASE='HM-CALC-001';
export function assessmentKey(caseId,frameworkId,serviceId){return [caseId,frameworkId,serviceId].join('|');}
export function findReusableAssessment(entries,key){return entries.find(e=>e.key===key&&e.run_id&&e.matrix_eligible!==false)??null;}
export function selectEvaluationModel(runs,baselineServiceId){
  if(runs.some(r=>!r.review))return null;
  const passed=runs.filter(r=>r.review.verdict==='passed');
  const sorted=[...passed].sort((a,b)=>(a.result?.model_usage?.requests??Infinity)-(b.result?.model_usage?.requests??Infinity)||(a.result?.duration_ms??Infinity)-(b.result?.duration_ms??Infinity));
  const choice=sorted[0]??runs.find(r=>r.service_id===baselineServiceId);
  return {service_id:choice.service_id,model:choice.service.model,run_id:choice.id,scope:'one_home_calculator_task',
    basis:sorted.length?'independently_passed_then_fewer_requests_then_shorter_duration':'no_new_model_pass; retain_previous_verified_baseline',provisional:true,final_framework:null};
}
