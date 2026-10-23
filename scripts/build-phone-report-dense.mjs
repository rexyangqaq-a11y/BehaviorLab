/** Eight-page report, matching the reference's analytical composition.
 * Native editable objects only. Geometry uses CSS px (96 dpi), not points.
 * Call buildDenseReport(presentation, sanitizedCampaignSummary).
 */
export async function buildDenseReport(p, summary) {
  if(summary.rows.length!==36||summary.totals.verdicts.passed!==16)throw Error('Unexpected campaign snapshot');
  const C={ink:'#17384B',muted:'#557184',blue:'#286C9D',green:'#28816F',purple:'#805AB1',orange:'#B57A22',line:'#CFDEE7',blueBg:'#EFF5FB',greenBg:'#EEF7F3',purpleBg:'#F5F1FA',orangeBg:'#FFF6E7',red:'#AB4D4D',redBg:'#FBEFEF'};
  const meta={size:{width:1280,height:720},slides:[],tableSlides:[],routes:[],dataSource:'docs/evidence/20261022-phone-evaluation/summary.json'};
  let s,number=0,serial=0;
  const box=(x,y,w,h,fill='none',stroke=C.line,width=1)=>s.shapes.add({geometry:'rect',name:'box-'+(++serial),position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width}});
  const txt=(value,x,y,w,h,size=21,bold=false,color=C.ink)=>{const sh=s.shapes.add({geometry:'textbox',name:'text-'+(++serial),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});sh.text=value;sh.text.style={typeface:'Microsoft YaHei',fontSize:size,bold,color,insets:0,wrap:'square',autoFit:'none',verticalAlignment:'middle'};return sh;};
  const route=(points,color=C.muted,dash=false,arrow=true)=>{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y),name=`route-${dash?'dash':'solid'}-${++serial}`;
    const sh=s.shapes.add({geometry:'custom',name,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:color,width:1.6},customPaths:[{width:w,height:h,commands:points.map(([px,py],i)=>({[i?'lineTo':'moveTo']:{x:px-x,y:py-y}}))}]});meta.routes.push({slide:number,name,points,dash,arrow});return sh;};
  const module=(title,body,x,y,w,h,color=C.blue,fill=C.blueBg,size=20)=>{box(x,y,w,h,fill,color);txt(title,x+12,y+9,w-24,32,23,true,color);txt(body,x+12,y+46,w-24,h-54,size);};
  const section=(title,x,y,w=800)=>txt(title,x,y,w,31,23,true,C.blue);
  const page=(part,title,subtitle,notes='')=>{s=p.slides.add({width:1280,height:720});s.background.fill='#FFFFFF';number++;meta.slides.push({number,part,title});txt(title,30,19,1218,53,35,true);txt(subtitle,31,74,1218,31,19,false,C.muted);box(30,112,1220,1,C.line,C.line,0);txt(part+'  ·  真机评估数据截至2026-10-22，工程状态核对2026-10-23',31,683,1135,22,13,false,C.muted);txt(String(number).padStart(2,'0')+' / 08',1175,683,75,22,14,false,C.muted);s.speakerNotes.text=notes+'\n\n依据：docs/PHONE_EVALUATION_RESULTS_20261022.md；docs/PHONE_EVALUATION_ANALYSIS_20261022.md；docs/PHONE_FAILURE_DIAGNOSIS_20261022.md；docs/evidence/20261022-phone-evaluation/summary.json。\n同一HOP-AL10，四题三框架三模型，每组合一次探索性实测，协议v4–v7有修订。助手核对、用户待复核，最终框架仍未确定。';return s;};
  const table=(values,widths,x,y,w,h,size=20,rowHeights)=>{const t=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,columnWidths:widths,values});meta.tableSlides.push(number);t.styleOptions={headerRow:false,bandedRows:false};t.borders.assign({style:'solid',fill:C.line,width:1});for(let r=0;r<values.length;r++){t.rows[r].height=rowHeights?.[r]??h/values.length;for(let c=0;c<values[0].length;c++){const cell=t.getCell(r,c);cell.fill=r===0?C.blueBg:c===0?'#F5F8FA':'#FFFFFF';cell.text.style={typeface:'Microsoft YaHei',fontSize:size,color:r===0?C.blue:C.ink,bold:r===0||c===0};t.cells.block({row:r,column:c,rowCount:1,columnCount:1}).assign({margins:{left:9,right:9,top:4,bottom:4},anchor:'center'});}}return t;};

  // 1. Whole-system boundary, detailed closed loop, shared service/evidence.
  page('一  下层操作模块','下层操作模块 · 任务边界与真实执行闭环','程序管理进度，上层安排每日活动，下层决定当前手机操作；独立工作台已接通真实设备，主仿真内容仍为Mock。','当前真实接入实现：src/phone-lab.mjs、scripts/phone-lab-worker.mjs、integrations/adapters/。六块是职责划分，不代表六次模型调用或六个独立模型。');
  module('程序管理','调度、虚拟时间、持久化、暂停',30,130,300,82,C.green,C.greenBg,18);
  module('上层每日规划','给出活动目标与约束；主流程仍Mock',350,130,392,82,C.purple,C.purpleBg,18);
  module('冻结当前测试输入','任务版本、起点、服务、设备与源码',762,130,488,82,C.green,C.greenBg,18);
  route([[330,171],[350,171]]);route([[742,171],[762,171]]);
  const modules=[['① 任务与进度','读取目标、禁止操作、已有记录。\n框架按原生循环推进当前步骤。',30,253,C.purple,C.purpleBg],['② 页面观察与定位','读取真实截图与可用UI信息。\n坐标关联图像尺寸和设备方向。',350,253,C.blue,C.blueBg],['③ 决策与动作检查','模型输出下一动作及参数。\n核对范围、权限、重复与额度。',670,253,C.blue,C.blueBg],['⑥ 更新与结束','继续、结束、失败或停止。\n工程退出与业务判定分别记录。',30,435,C.purple,C.purpleBg],['⑤ 结果核对','框架重看新图并判断变化。\n独立审核结合全程约束判定。',350,435,C.blue,C.blueBg],['④ HDC执行与留证','先存动作意图，再点按/输入。\n记录返回、物理命令和动作后图。',670,435,C.green,C.greenBg]];
  for(const [a,b,x,y,c,f]of modules)module(a,b.replace('\n',''),x,y,292,130,c,f,20);
  route([[1004,212],[1004,230],[176,230],[176,253]],C.green);
  route([[322,318],[350,318]]);route([[642,318],[670,318]]);route([[816,383],[816,435]]);
  route([[670,500],[642,500]]);route([[350,500],[322,500]]);route([[30,500],[16,500],[16,318],[30,318]],C.purple);
  txt('未完成：按新状态继续',35,390,280,30,18,false,C.purple);
  route([[496,435],[496,383]],C.blue,true);txt('新截图用于下一步',353,391,275,29,18,false,C.blue);
  box(988,248,1,329,C.line,C.line,0);
  section('统一执行边界',1008,250,240);txt('15次HTTP / 40框架动作\n600秒 / 512输出tokens\n零重试，整批无总请求上限\n\n新增系统权限入口拒绝。\n效果未知即停，不重放。',1008,291,242,164,18);
  section('证据与结果',1008,470,240);txt('输入/版本与原始回复\n意图、物理输入及前后图\n耗时、usage及审核依据\n用户复核待定。',1008,509,242,90,18);
  box(30,602,1220,66,C.blueBg,C.blue);txt('当前三条接入路线',43,617,240,35,23,true,C.blue);txt('Midscene：HarmonyAgent直接接Harmony设备；MobiAgent / AutoGLM：\nPython原生循环经RPC连接同一HDC与模型入口。',302,610,932,49,19);

  // 2. Sequence, not a duplicate architecture diagram.
  page('一  下层操作模块','一次真实任务 · 调用顺序与证据关联','起点、模型请求、框架动作、物理输入和截图分别计量；一次请求可以产生多个动作，也可以没有可执行动作。');
  const laneXs=[120,302,484,666,848],laneNames=['工作台 / worker','框架原生循环','统一模型HTTP','设备 / HDC','证据与审核'];
  laneXs.forEach((x,i)=>{box(x-83,132,166,43,i===2?C.purpleBg:C.blueBg,C.line);txt(laneNames[i],x-76,139,152,28,18,true,i===2?C.purple:C.blue);route([[x,177],[x,479]],'#C4D3DE',true,false);});
  const seq=(a,b,y,label,color=C.blue)=>{route([[laneXs[a],y],[laneXs[b],y]],color);txt(label,Math.min(laneXs[a],laneXs[b])+8,y-29,Math.abs(laneXs[b]-laneXs[a])-16,25,17,false,color);};
  seq(0,3,220,'1 取环境、截图、核对任务起点');seq(0,1,279,'2 冻结任务');seq(1,2,333,'3 图片与上下文');seq(2,1,383,'4 回复与usage',C.purple);seq(1,3,438,'5 解析并执行，取得新图');
  seq(3,4,470,'命令与图像留证',C.green);
  route([[302,451],[278,451],[278,308],[302,308]],C.blue,true);txt('继续观察与决策',35,353,220,31,17,false,C.blue);
  route([[848,476],[848,496],[120,496]],C.green);txt('6 终图、工程状态、业务判定与完整记录',250,500,650,28,19,true,C.green);
  box(948,130,1,399,C.line,C.line,0);section('源码职责对应',969,132,270);
  txt('phone-lab：任务、队列、起点与审核\nworker：限额、停止、最终观察\nadapters：SDK或Python原生循环\ntransport：唯一HTTP入口与计量\nphone-device：截图与物理输入\nphone-evidence：事件、图片与哈希',969,179,280,177,18);
  section('每次运行冻结',969,365,270);txt('任务/模型/框架版本，\n型号、系统、应用与源码哈希。\n每图关联输入、回复与动作。\n查看页面不调用模型。',969,409,280,108,19);
  table([['对象','计数含义','为何不是固定一一对应'],['HTTP请求','真实发往模型服务的请求','一次规划可给出多个动作，或只输出思考/完成'],['框架 / 物理动作','SDK动作与实际设备指令分别计数','一次输入可能含清空/输入/确认；留证还会额外截图']],[175,415,630],30,552,1220,113,18,[33,38,42]);

  // 3. Reference's common-dimension comparison, with current candidates.
  page('二  框架调研与入选理由','三个测试候选 · 鸿蒙接入优先，同维度比较','调研涵盖手机Agent、视觉自动化框架与评测环境；本轮选入测试，不代表确定最终生产框架。','官方来源：https://github.com/web-infra-dev/midscene；https://github.com/IPADS-SAI/MobiAgent；https://github.com/zai-org/Open-AutoGLM。固定版本和变体以本机运行快照为准，优缺点为工程判断与本轮观察。');
  const criteria=[['设备','能接当前Harmony/HDC'],['循环','保留原生观察与动作循环'],['模型','可比较多个图片API'],['留证','版本、动作与用量可追溯']];criteria.forEach(([a,b],i)=>{const x=30+i*309;box(x,131,292,57,C.greenBg,C.green);txt(a,x+10,141,52,30,21,true,C.green);txt(b,x+67,140,215,33,18);if(i<3)route([[x+292,159],[x+309,159]]);});
  table([['维度','Midscene','MobiAgent','Open-AutoGLM'],['来源 / 定位','web-infra-dev\n跨平台视觉自动化','IPADS-SAI\n手机任务Agent','zai-org\n手机操作框架'],['任务与观察','HarmonyAgent按截图规划/定位\nSDK动作空间受工作台约束','原生task_in_app，e2e qwen_json\n按任务、历史和截图决定动作','原生PhoneAgent.step\n当前截图与历史决定下一动作'],['动作执行','Harmony设备接口直接执行\nSDK动作监测，HTTP统一记录','Python解析bbox/动作，经RPC\n接当前HDC与统一模型入口','保留原生动作解析，经RPC\n接HDC；UTF-8/包装/MIME适配'],['核对与记忆','框架重看截图；不启用缓存\n额外保留独立业务核对','本轮关闭经验/用户记忆\n不评价其记忆能力','原生循环结束与独立审核分离\n本轮未使用上游专用权重'],['优势 / 入选理由','原生Harmony接口，便于Node接入\n精确输入有通过样本','Harmony路径与较低上下文用量\n保留经验/记忆研究空间','动作协议清晰，适合作为基线\n本轮APP任务有较好样本'],['限制 / 固定版本','输入上下文较大，family影响行为\n1.16.0','跨模型坐标契约需校准\n4ee7940…','格式解析与伪完成需检查\n86f5538…']],[142,359,359,360],30,209,1220,390,18,[34,54,63,63,63,59,54]);
  section('其他调研对象的作用',30,609,325);txt('Mobile-Agent / AppAgentX / UI-TARS：参考分工、定位和复用方法，另查设备适配。\nAndroidWorld / AITW / AndroidControl：参考评价与离线诊断，不能替代这台鸿蒙手机的实测。',345,606,905,59,18);

  // 4. Four actual task flows, strict success and constraints, evaluation order.
  page('三  测试设计','四项完整任务 · 共同桌面起点与严格验收','同一HOP-AL10、展开横屏、同一桌面页面且可操作；动态时钟、推荐和最近应用顺序允许变化，不要求像素一致。');
  const cases=[['计算器',['打开并清空','输入 (128+37)×6','执行计算','终图显示990'],'验收：UI输入，终图990。\n不接受文字答案或残留错误。\n重点：精确操作、长序列停止。'],['系统存储',['打开系统设置','进入“存储”','读取容量与应用占用','保持目标页面'],'验收：已用/总量有图可核对。\n应用占用可见或明确未显示。\n禁止清理、删除和修改配置。'],['淘宝商品',['打开淘宝','搜索“折叠手机支架”','打开普通商品详情','读取标题与展示价格'],'验收：词正确，标题/价格有图。\n禁止选规格、加购、收藏和交易。\n重点：焦点、弹层与条件核对。'],['小红书图文',['打开小红书','搜索“杭州旅游”','打开普通图文笔记','读取标题/作者/建议'],'验收：字段与图文实际内容一致。\n禁止视频、广告、直播及互动。\n重点：内容类型与全程约束。']];
  cases.forEach(([name,steps,accept],i)=>{const x=30+i*309;section(name,x,132,292);steps.forEach((v,k)=>{box(x+7,178+k*59,278,42,k===3?C.greenBg:C.blueBg,k===3?C.green:C.blue);txt(v,x+18,184+k*59,254,29,20,k===3,k===3?C.green:C.ink);if(k<3)route([[x+146,220+k*59],[x+146,237+k*59]]);});txt(accept,x+6,424,284,109,18);if(i<3)box(x+299,134,1,395,C.line,C.line,0);});
  section('四阶段补齐36个唯一单元',30,545,1220);const stages=['单配置 / 全任务','单框架 / 多模型 / 单任务','多框架 / 临时最佳模型 / 单任务','三框架 × 三模型 × 四题'];stages.forEach((v,i)=>{const x=30+i*309;box(x,589,292,42,i===3?C.purpleBg:C.greenBg,i===3?C.purple:C.green);txt(v,x+7,594,278,31,17,true,i===3?C.purple:C.green);if(i<3)route([[x+292,610],[x+309,610]]);});
  txt('准备仅停止目标APP并回桌面，不清账号/数据；框架自行打开。已做同组合复用，正常失败不自动重测。\n每题每组合15请求 / 40动作 / 600秒 / 每次512输出tokens，零重试，整批无总请求硬上限。',30,639,1220,38,16,false,C.muted);

  // 5. Matrix is the primary evidence, not a large headline with blank space.
  page('四  真实测试与分析','36项结果矩阵 · 16通过、10部分完成、10未通过','工程ended不等于业务通过。每格一个样本，真实截图与全过程约束共同判定，用户复核待定。');
  txt('Q3.8=qwen3.8-flash；Q3.7=qwen3.7-plus；DS=deepseek-v4.1-flash-1017（本机服务标识）',31,115,1218,22,15,false,C.muted);
  const models=['qwen3.8-flash','qwen3.7-plus','deepseek-v4.1-flash-1017'],frameworks=['midscene','mobiagent','autoglm'],ids=['HM-CALC-001','HM-STOR-001','HM-TB-001','HM-XHS-001'];
  const labels={midscene:'Midscene',mobiagent:'MobiAgent',autoglm:'AutoGLM'},ml=['Q3.8','Q3.7','DS'],verdict={passed:'通过',partial:'部分',failed:'未通过'};
  const vals=[['框架 × 模型','计算器','存储','淘宝','小红书','通过']];
  for(const f of frameworks)for(let m=0;m<3;m++){const rs=ids.map(id=>summary.rows.find(r=>r.framework_id===f&&r.model===models[m]&&r.case_id===id));if(rs.some(r=>!r))throw Error('Incomplete report matrix');vals.push([labels[f]+' × '+ml[m],...rs.map(r=>verdict[r.verdict]),rs.filter(r=>r.verdict==='passed').length+'/4']);}
  const matrix=table(vals,[245,113,113,113,113,113],30,142,810,400,20);
  for(let r=1;r<10;r++)for(let c=1;c<=4;c++){const v=vals[r][c],cell=matrix.getCell(r,c);cell.fill=v==='通过'?C.greenBg:v==='部分'?C.orangeBg:C.redBg;cell.text.style={typeface:'Microsoft YaHei',fontSize:20,bold:true,color:v==='通过'?C.green:v==='部分'?C.orange:C.red};}
  section('本轮分布与判断',867,141,380);txt('严格通过 16/36（44.4%）\n部分完成10项不能计入成功率。',867,184,382,62,23,true,C.green);
  table([['框架','通过'],['Open-AutoGLM','7/12'],['Midscene','6/12'],['MobiAgent','3/12']],[270,113],867,266,383,136,18);
  table([['模型','通过'],['qwen3.7-plus','8/12'],['qwen3.8-flash','5/12'],['DeepSeek服务','3/12']],[270,113],867,417,383,136,18);
  box(30,565,1220,102,C.purpleBg,C.purple);txt('建议主候选：AutoGLM × Q3.7 与 Midscene × Q3.7',44,573,1190,31,24,true,C.purple);txt('二者均3/4，但通过集合不同：Mid可完成计算器，Auto在淘宝更好；没有单组合4/4。\n已通过任务的并集覆盖四题，自动路由/失败切换尚未实现或验证，最终框架不锁定。',44,612,1190,47,20);
  s.speakerNotes.text+='\n模型缩写：Q3.8=qwen3.8-flash；Q3.7=qwen3.7-plus；DS=deepseek-v4.1-flash-1017。矩阵数据逐格读取冻结summary，非凭空重写。';

  // 6. Comparability, resources and input-volume explanation on one page.
  page('四  真实测试与分析','性能与用量 · 同任务成功样本才适合比较','比较固定Q3.7、且三框架都通过的存储和小红书；耗时包含框架、截图、RPC与留证，不是纯模型推理时长。');
  section('同模型、同目标、均通过',30,132,650);
  const perf=[['框架','存储：秒 / 请求 / tokens','小红书：秒 / 请求 / tokens']];
  for(const f of frameworks){const rs=['HM-STOR-001','HM-XHS-001'].map(id=>summary.rows.find(r=>r.framework_id===f&&r.model===models[1]&&r.case_id===id));if(rs.some(r=>r.verdict!=='passed'))throw Error('Performance sample must pass');perf.push([labels[f],...rs.map(r=>(r.duration_ms/1000).toFixed(1)+' / '+r.requests+' / '+(r.input_tokens+r.output_tokens).toLocaleString('en-US'))]);}
  table(perf,[150,310,310],30,177,770,204,19,[42,54,54,54]);txt('存储：Auto更快、请求更少。小红书约66–68秒，差距小。\nMobi在这两个通过样本的tokens最低，不能只凭总通过数淘汰。',30,397,770,69,21);
  section('每请求平均输入tokens',830,132,420);const tokenAvg=[10337,2098,3300],colors=[C.blue,C.green,C.purple];
  frameworks.forEach((f,i)=>{const y=189+i*83;txt(labels[f],830,y,142,28,20,true,colors[i]);box(980,y+3,tokenAvg[i]/11000*208,23,colors[i],colors[i],0);txt(tokenAvg[i].toLocaleString('en-US'),980,y+30,240,28,19);});
  txt('文本字符均值约38,345 / 3,130 / 4,614。\n三者平均均约1张模型输入图，提示与\n上下文长度是用量差异的重要线索。',830,445,420,77,19);
  box(30,493,770,1,C.line,C.line,0);section('用量账本',30,510,770);
  table([['保留矩阵','331请求','输入1,818,302 / 输出43,050 tokens'],['累计消耗','373请求','含已覆盖异常42请求，不能抹去']],[164,150,456],30,551,770,92,19);
  box(830,545,420,114,C.orangeBg,C.orange);txt('输入占总tokens 97.7%',844,554,394,32,24,true,C.orange);txt('总计1,861,352 tokens。实际费用未知，\ntokens不能直接换算为实付金额。',844,599,394,48,19);
  txt('提前失败会缩短运行时间，不能作为性能优势；单次样本不支持稳定时延或成本排名。',30,650,770,26,16,false,C.muted);

  // 7. Specific chains establish what is and is not attributable to the model.
  page('四  真实测试与分析','失败定位 · 沿同一条动作链区分问题','部分失败已确认是接入问题；其余需区分定位/单位、任务理解、解析和停止，不能全算模型能力或执行器故障。');
  const chain=['当前图与任务','模型原始回复','原生解析/转换','HDC物理输入','新图与业务判定'];chain.forEach((v,i)=>{const x=30+i*247;box(x,134,231,43,C.blueBg,C.blue);txt(v,x+8,140,215,30,20,true,C.blue);if(i<4)route([[x+231,155],[x+247,155]]);});
  module('已确认：输入与图片接入','输入前复用旧点击坐标，可能误点相机/推荐词。\n复杂页PNG超过2MiB，模型入口被阻断。\n已改当前焦点输入、同分辨率JPEG与正确MIME。\nAuto三模型 + Mobi×Q3.7小红书重测4/4通过，\n用25请求；旧记录按要求覆盖，只保留消耗摘要。',30,203,593,189,C.green,C.greenBg,20);
  module('具体坐标链：并非已证明执行器缩放错误','Mobi×DS计算器：图1292×914，屏2584×1828。\nbbox [700,855,780,935]按0–1000转换为\n(1911,1635)，HDC实际也点这里，仍停桌面。\n提示未明确单位，且真实图标更靠左。单位混淆\n或定位偏差待验证，不能靠猜单位自动补乘二。',650,203,600,189,C.purple,C.purpleBg,20);
  table([['其他现象','证据与归因边界','改进方向'],['任务条件/全过程','淘宝实际搜“吸盘手机支架”；两条小红书先开视频，终图读对仍不通过','回读真实关键词，检查内容类型与禁止动作'],['解析与停止','Auto仅think可被包装finish；23条ended≠23通过，另2条failed实际达成','解析失败独立状态，目标满足后及时结束'],['中间状态/采集','计算器因中间括号错误反复清空；淘宝4项受分享截屏弹层干扰','进展反馈、局部恢复；量化截图副作用']],[188,637,395],30,420,1220,188,18,[35,51,51,51]);
  txt('已确认的工程修复证明适配层会影响成绩，但重测并非严格单变量A/B。记录可解码/命令返回成功，也不能证明GUI操作正确。',30,626,1220,42,19,false,C.muted);

  // 8. Dependency-based next steps, measurable acceptance and current boundary.
  page('四  真实测试与分析','改进路线与选型条件 · 先校准执行链，再测稳定性','本轮一台手机、四题、每组合一次，经历v4–v7修订。搜索历史和动态内容未恢复镜像，结果属于探索性观察。');
  module('P0  执行契约与采集','显式坐标单位、尺寸、方向、裁剪。\n严格动作解析，禁止失败包装finish。\n输入后回读焦点/实际文本。\n对照测试截图弹层与连续采集副作用。',30,144,386,177,C.blue,C.blueBg,20);
  module('P1  固定协议与重复采样','冻结最终提示、解析、截图与保护。\nMid×Q3.7、Auto×Q3.7两候选，\n每题重复3次，四题共24次新试验。\n增加新关键词/笔记，减少历史复用影响。',447,144,386,177,C.green,C.greenBg,20);
  module('P2  再确认集成方案','看稳定通过率、约束违反与时延分布。\nMobi先校准跨模型坐标协议。\n需要时再验证路由/回退，不直接拼成绩。\n用户确认后再定最终框架与主流程集成。',864,144,386,177,C.purple,C.purpleBg,20);
  route([[416,233],[447,233]]);route([[833,233],[864,233]]);
  table([['验证对象','最小可检查依据','不提前宣称'],['坐标 / 输入 / 解析','离线角点与旋转夹具、中文失焦、保留回复回放；再做最小真机校准','离线契约通过不等于GUI成功'],['任务可靠性','严格通过、禁止动作、无进展循环、达成后额外请求、耗时分布','部分完成不能加进成功率'],['上下文与费用','优先减少重复说明和无关历史；在同条件下比较输入/输出usage','未知费用不写成零，失败时快不算优势']],[206,663,351],30,353,1220,194,19,[35,53,53,53]);
  section('已实现与尚未完成',30,568,420);txt('已实现：三框架独立真机验证台、任务与起点、单项/组合、过程trace、结果筛选与审核。\n尚未完成：稳定无人值守、主仿真真实闭环、最终框架确认与跨设备验证。\n后续24次为待执行建议，本次PPT重构不新增手机或模型调用。',30,606,1220,68,19);
  meta.tableSlides=[...new Set(meta.tableSlides)];return meta;
}
