// Evidence review, not 31 executed GUI benchmarks. Never read private run data here.
export const V04_EVIDENCE=Object.freeze({
  evaluation:{file:'docs/evidence/20261022-phone-evaluation/summary.json',title:'四题36组合真实结果',scope:'historical_real_gui'},
  integrity:{file:'docs/evidence/20261022-phone-evaluation/record-audit.json',title:'原始轨迹与1486张图完整性核验',scope:'historical_real_gui'},
  diagnosis:{file:'docs/PHONE_FAILURE_DIAGNOSIS_20261022.md',title:'失败归因与能力限制',scope:'trace_analysis'},
  deployment:{file:'docs/evidence/20261023-private-migration/acceptance.json',title:'本机中文目录部署与加密迁移验收',scope:'software_and_same_pc_relocation'},
  adapters:{file:'docs/FRAMEWORK_ADAPTER_GUIDE.md',title:'实际框架变体与项目适配契约',scope:'source_review'},
  worker:{file:'scripts/phone-lab-worker.mjs',title:'请求、设备与结束保护源码',scope:'source_review'},
  effects:{file:'src/phone-action-effects.mjs',title:'动作不确定性与边界检查',scope:'source_review'},
  protocol:{file:'integrations/phone_protocol.py',title:'原生协议前置校验',scope:'source_review'},
  selection:{file:'docs/FRAMEWORK_SELECTION_DECISION.md',title:'用户确认的多框架配置策略',scope:'user_decision'},
  video:{file:'docs/HOSCRCPY_VIDEO.md',title:'真实视频验证及断流限制',scope:'historical_device_video'},
  alternatives:{file:'docs/V04_GUI_FRAMEWORK_SELECTION.md',title:'框架来源与迁移调研',scope:'source_review'},
  checks:{file:'docs/evidence/20261024-v04-release/acceptance.json',title:'本轮离线工程与原生契约验收',scope:'offline_software_and_native_contract'},
});
const entry=(status,note,evidence)=>({status,note,evidence});
const reviews={
  'DEP-01':entry('partial','包内依赖与同机干净目录迁移已核对；第二台物理电脑、冷安装工时与远程服务器未测。',['deployment']),
  'DEP-02':entry('partial','Node与隔离Python worker已运行；独立远程worker拓扑未实现，属于保留缺口。',['adapters','evaluation']),
  'DEP-03':entry('evidence_linked','框架固定提交、环境/输入/源码哈希、许可证及相对运行路径有记录；只覆盖本机受测组合。',['evaluation','integrity','deployment']),
  'DEV-01':entry('partial','受测鸿蒙设备的实际截图、中文输入及导航已留证；不推广为所有NEXT6/7设备兼容。',['evaluation','integrity','video']),
  'DEV-02':entry('known_gap','当前使用HDC与原生框架桥；hipyum来源/文档仍缺，未实现或宣称同活动替换通过。',['adapters']),
  'LOOP-01':entry('evidence_linked','三个实际框架循环已有连续观察、决策、动作轨迹；项目记录与原生循环职责分别说明。',['evaluation','adapters','integrity']),
  'LOOP-02':entry('partial','请求/动作/耗时上限和相同动作保护已实现；没有宣称能判断任意语义停滞。',['evaluation','worker','checks']),
  'MOD-01':entry('partial','已真实比较图片与动作协议；本轮修复非法动作兜底结束，失败分支只做原生离线契约，未新做真机任务。',['evaluation','protocol','checks']),
  'MOD-02':entry('deferred','保留当前三变体；未额外比较DeepThink、分工、经验等单变量模式，按用户要求暂不补手机测试。',['adapters','selection']),
  'MEM-01':entry('partial','短任务有条件保持与遗漏的真实样本；没有独立证明多对象工作记忆可靠。',['evaluation','diagnosis']),
  'MEM-02':entry('unverified','完整采集原图已核验；长上下文裁剪后的事实保持没有专项证据。',['integrity','adapters']),
  'CONT-01':entry('known_gap','独立调用续接第37个对象尚无对象台账和真实证据；不以重开任务冒充续接。',['adapters']),
  'CONT-02':entry('known_gap','持久化输入/轨迹已具备；对象级已核实事实、缺项与未闭合动作的自动续接未实现。',['adapters','effects']),
  'EXP-01':entry('known_gap','Midscene缓存关闭，MobiAgent经验/偏好模块关闭，AutoGLM基础变体未补经验库；不计作经验复用通过。',['adapters','selection']),
  'EXP-02':entry('unverified','每运行隔离worker和上下文；跨用户偏好/经验测试未做，账号推荐环境串扰仍需单独评估。',['adapters']),
  'REC-01':entry('evidence_linked','真实运行保留动作意图、原始请求/回复及逐图哈希，1486张矩阵图片已完整核验。',['integrity','evaluation']),
  'REC-02':entry('evidence_linked','SDK动作与HDC原语分别计数/记录；新协议增加action_id关联，离线核对未知效果保留。',['integrity','worker','checks']),
  'TRACE-01':entry('partial','模型/动作/命令与异常阶段可追踪，密钥不回填；并未声称所有上游内部角色均有完整父子调用链。',['integrity','checks','adapters']),
  'VER-01':entry('evidence_linked','业务判定与框架结束独立：16通过、10部分、10失败；助手初判与用户审核分别保留，用户未审核不能计已确认。',['evaluation','diagnosis']),
  'VER-02':entry('deferred','餐厅条件/补看/收藏的完整新任务未执行；用户要求其他手机测试暂缓，未代填城市/预算或执行收藏。',['selection']),
  'VER-03':entry('partial','已有部分完成和错误关键词样本；重复/不足量的对象计数只具工程夹具，未记真实去重通过。',['evaluation','diagnosis']),
  'VER-04':entry('known_gap','人工证据判定已具备；可替代里程碑路径和核对结果在线反馈执行的能力未实现。',['adapters','diagnosis']),
  'LONG-01':entry('deferred','2026-10-24用户明确“这个不强行测”；保留百对象要求与未定口径，不执行或编造成绩。',['selection']),
  'LONG-02':entry('deferred','百对象相关滚动/重排/身份不确定专项随长活动保留；普通短任务不作为该项通过证据。',['diagnosis']),
  'RES-01':entry('partial','意图与命令异常、后续观察失败的离线故障测试通过；真实手机故障注入本轮不做。',['effects','checks']),
  'RES-02':entry('partial','停止不等于撤回在途命令；未知效果保留needs_attention且禁止自动重放，真实在途停止专项未补测。',['worker','effects','checks']),
  'RES-03':entry('known_gap','运行记录可重开查看；真实对象级恢复未实现，重启不会自动续跑或重放。',['adapters','effects']),
  'ARC-01':entry('partial','独立真机工作台与主仿真Mock隔离；真实下层接入主调度属于v0.5，当前未冒充整系统真实闭环。',['adapters','selection']),
  'COST-01':entry('evidence_linked','四题矩阵保留331请求和实际usage，预算有界、零自动重试；含诊断/替换旧消耗373请求单列。',['evaluation','worker']),
  'COST-02':entry('partial','请求、tokens与执行耗时可核对；价格/Credits、人工复核时间及多对象有效成本未知，不编费用排名。',['evaluation']),
  'ALT-01':entry('partial','其他框架/公开成绩与NEXT差异已有资料；未安装或真机实测的替代项目不计通过。',['alternatives']),
};
export const V04_REVIEW_LABELS={evidence_linked:'已有证据',partial:'范围有限',known_gap:'已知缺口',unverified:'未验证',deferred:'后续事项'};
export function v04Acceptance(dimensions){
  const cases=dimensions.flatMap(d=>d.cases.map(c=>{const review=reviews[c.id];if(!review)throw Error('Missing v0.4 evidence disposition: '+c.id);return {id:c.id,name:c.name,dimension:d.id,dimension_name:d.name,procedure:c.procedure,acceptance:c.acceptance,...review,status_label:V04_REVIEW_LABELS[review.status],evidence:review.evidence.map(id=>({id,...V04_EVIDENCE[id],url:'/api/v04/evidence/'+id}))};}));
  if(cases.length!==Object.keys(reviews).length)throw Error('v0.4 evidence inventory does not match definitions');
  return {revision:'2026-10-24',case_count:cases.length,labels:V04_REVIEW_LABELS,counts:Object.fromEntries(Object.keys(V04_REVIEW_LABELS).map(s=>[s,cases.filter(c=>c.status===s).length])),cases,
    release_scope:{user_confirmed_at:'2026-10-24',baseline:'four_cases_three_frameworks_three_models_36_cells',additional_phone_tests:'deferred_by_user',hundred_object_tests:'not_forced_by_user',selection:'user_configurable_with_recommendation',known_gaps_are_not_passes:true},
    historical_gui:{cells:36,passed:16,partial:10,failed:10,matrix_requests:331,campaign_requests_including_replaced_and_diagnostics:373,user_review:'pending'},
    automatic_model_calls:false,automatic_device_commands:false,note:'这是31项要求的证据核对与缺口清单，不是31项真实GUI通过结果；新代码的离线契约与历史真机样本分别报告。'};
}
