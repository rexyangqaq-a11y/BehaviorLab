/** Report revision with concrete implementation, standard time order and trace evidence.
 * Native editable diagrams/tables. CSS px at 96 dpi on a standard 16:9 page.
 */
export async function buildExplainedReport(p,summary,audit){
 const C={ink:'#17384B',muted:'#557184',blue:'#286C9D',green:'#28816F',purple:'#805AB1',orange:'#AD701A',red:'#AB4D4D',line:'#CFDEE7',blueBg:'#EFF5FB',greenBg:'#EEF7F3',purpleBg:'#F5F1FA',orangeBg:'#FFF6E7',redBg:'#FBEFEF'};
 const meta={size:{width:1280,height:720},slides:[],tableSlides:[],routes:[],matrixSlide:5,performanceSlide:7,slideCount:9};let s,n=0,k=0;
 const box=(x,y,w,h,fill='none',stroke=C.line,width=1)=>s.shapes.add({geometry:'rect',name:'box-'+(++k),position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width}});
 const txt=(v,x,y,w,h,size=21,bold=false,color=C.ink)=>{const a=s.shapes.add({geometry:'textbox',name:'text-'+(++k),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});a.text=v;a.text.style={typeface:'Microsoft YaHei',fontSize:size,bold,color,insets:0,wrap:'square',autoFit:'none',verticalAlignment:'middle'};return a;};
 const route=(points,color=C.muted,dash=false,arrow=true)=>{const xs=points.map(a=>a[0]),ys=points.map(a=>a[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y),name=`route-${++k}`;s.shapes.add({geometry:'custom',name,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:color,width:1.5},customPaths:[{width:w,height:h,commands:points.map(([px,py],i)=>({[i?'lineTo':'moveTo']:{x:px-x,y:py-y}}))}]});meta.routes.push({slide:n,name,points,dash,arrow});};
 const section=(v,x,y,w=1200)=>txt(v,x,y,w,32,24,true,C.blue);
 const module=(title,body,x,y,w,h,color=C.blue,fill=C.blueBg,size=20)=>{box(x,y,w,h,fill,color);txt(title,x+13,y+8,w-26,32,23,true,color);txt(body,x+13,y+46,w-26,h-53,size);};
 const page=(part,title,sub,notes='')=>{s=p.slides.add({width:1280,height:720});s.background.fill='#FFFFFF';n++;meta.slides.push({number:n,part,title});txt(title,30,19,1220,53,35,true);txt(sub,31,76,1218,29,19,false,C.muted);box(30,113,1220,1,C.line,C.line,0);txt(part+'  ·  真机成绩截至2026-10-22，报告修订2026-10-23',31,684,1130,22,13,false,C.muted);txt(String(n).padStart(2,'0')+' / 09',1173,684,77,22,14,false,C.muted);s.speakerNotes.text=notes+'\n\n本机依据：docs/PHONE_EVALUATION_RESULTS_20261022.md；docs/PHONE_FAILURE_DIAGNOSIS_20261022.md；docs/evidence/20261022-phone-evaluation/summary.json；scripts/phone-report-trace-audit.mjs对留存原始events.jsonl的只读提取。未新增手机操作或模型调用。成绩为助手核对，用户复核待定。';};
 const table=(values,widths,x,y,w,h,size=20,heights)=>{const t=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,columnWidths:widths,values});meta.tableSlides.push(n);t.styleOptions={headerRow:false,bandedRows:false};t.borders.assign({style:'solid',fill:C.line,width:1});values.forEach((r,ri)=>{t.rows[ri].height=heights?.[ri]??h/values.length;r.forEach((v,ci)=>{const c=t.getCell(ri,ci);c.fill=ri===0?C.blueBg:ci===0?'#F5F8FA':'#FFFFFF';c.text.style={typeface:'Microsoft YaHei',fontSize:size,color:ri===0?C.blue:C.ink,bold:ri===0||ci===0};t.cells.block({row:ri,column:ci,rowCount:1,columnCount:1}).assign({margins:{left:9,right:9,top:4,bottom:4},anchor:'center'});});});return t;};
 const fs=['midscene','mobiagent','autoglm'],fl={midscene:'Midscene',mobiagent:'MobiAgent',autoglm:'AutoGLM'},models=['qwen3.8-flash','qwen3.7-plus','deepseek-v4.1-flash-1017'],ids=['HM-CALC-001','HM-STOR-001','HM-TB-001','HM-XHS-001'];
 const row=(f,id)=>audit.rows.find(r=>r.framework===f&&r.model===models[1]&&r.case_id===id);

 page('一  下层操作模块','实际架构：我们把开源框架、模型接口和鸿蒙手机接起来','我们实现测试与接入层，开源框架组织操作步骤，大模型看图决定下一步，HDC把操作送到真实手机。','源码：src/phone-lab.mjs、scripts/phone-lab-worker.mjs、integrations/adapters/midscene.mjs、integrations/adapters/python-native.mjs、integrations/phone-frameworks.py、src/gui-trial-transport.mjs、src/phone-device.mjs、src/phone-evidence.mjs。模型API节点概括统一运输层和所配置的外部服务。');
 module('测试工作台〔我们实现〕','任务、起点、框架、模型选择\n单项运行、组合评估、结果筛选',30,144,315,112);
 module('任务执行器〔我们实现〕','下发任务，保存本次配置\n管理队列、限额、停止与异常',394,144,420,112);
 route([[345,198],[394,198]],C.blue);
 module('大模型API服务','Qwen / DeepSeek等图片接口\n输入：任务、当前图、必要历史\n输出：判断、动作或结束说明',876,144,374,144,C.purple,C.purpleBg);
 box(30,305,784,167,C.greenBg,C.green);txt('开源框架〔每次选一个，保留各自原有操作循环〕',44,314,755,33,24,true,C.green);
 const entries=[['Midscene','JavaScript直接调用\n官方Harmony接口'],['MobiAgent','Python运行原有循环\n本机接入手机与模型'],['Open-AutoGLM','Python运行原有循环\n本机接入手机与模型']];
 entries.forEach(([a,b],i)=>{const x=45+i*254;txt(a,x,356,240,31,23,true,C.green);txt(b,x,397,238,59,20);if(i<2)box(x+242,357,1,94,C.line,C.line,0);});
 route([[604,256],[604,305]],C.blue);txt('① 指定任务与约束',618,266,196,30,18,false,C.blue);
 route([[814,366],[853,366],[853,213],[876,213]],C.purple);txt('② 发截图和上下文',878,312,310,28,20,true,C.purple);
 route([[1218,288],[1218,422],[814,422]],C.purple,true);txt('③ 返回下一步操作',877,377,310,29,20,true,C.purple);
 module('统一手机控制〔我们实现〕','检查操作范围与重复点击，转换点击/滑动/输入指令\nHDC是华为手机调试工具；同一入口负责截图与执行',30,526,784,112,C.blue,C.blueBg);
 module('鸿蒙真机','HOP-AL10\n真实APP与屏幕变化',876,526,374,112,C.green,C.greenBg);
 route([[320,472],[320,526]],C.green);txt('④ 执行动作',45,484,258,29,19,true,C.green);
 route([[673,526],[673,472]],C.blue,true);txt('⑥ 新图回到框架继续判断',383,484,431,29,19,false,C.blue);
 route([[814,553],[876,553]],C.blue);route([[876,610],[814,610]],C.blue,true);txt('⑤ 操作 / 新图',903,476,330,30,19,true,C.blue);
 txt('全程自动记录输入、版本、回复、动作、截图与用量；结束后观察方核对任务结果。主仿真流程的真实闭环尚待集成。',31,646,1218,31,18,false,C.muted);

 page('一  下层操作模块','完整时序：下发任务、循环操作、结束后核对','实线表示请求或操作，虚线表示返回。记录由执行器和接入层自动完成，最终审核由观察方在结果页进行。','角色合并说明：模型API含统一HTTP转发与所配置模型服务。手机控制含HDC设备接口。审核不是框架循环中的独立服务，也没有额外自动评审模型。保存本次任务/配置属于下发过程，不是冻结手机的专门动作。');
 const xs=[102,310,518,726,934,1160],names=['工作台','任务执行器','开源框架','模型API','手机控制','鸿蒙手机'];
 xs.forEach((x,i)=>{box(x-82,132,164,42,i===3?C.purpleBg:C.blueBg,C.line);txt(names[i],x-75,138,150,29,21,true,i===3?C.purple:C.blue);route([[x,174],[x,650]],'#BBCEDB',true,false);});
 const msg=(a,b,y,label,dash=false,col=C.blue)=>{route([[xs[a],y],[xs[b],y]],col,dash);txt(label,Math.min(xs[a],xs[b])+9,y-24,Math.abs(xs[a]-xs[b])-18,23,16,false,col);};
 // Messages are ordered from top to bottom. Loop encloses only repeated observe/decide/act.
 msg(0,1,209,'下发任务及配置');msg(1,4,239,'读取环境，检查起点');msg(4,1,269,'返回设备与起点信息',true);msg(1,2,299,'启动所选框架');
 box(421,310,817,246,'none',C.green);txt('循环：任务未完成且未超限',435,312,478,23,16,true,C.green);
 msg(2,4,358,'请求当前截图');msg(4,5,379,'采集屏幕');msg(5,4,400,'返回图像',true);msg(4,2,421,'返回当前截图',true);
 msg(2,3,442,'任务、截图、历史',false,C.purple);msg(3,2,463,'判断及下一动作',true,C.purple);msg(2,4,484,'提交动作并检查');
 msg(4,5,505,'点击/滑动/输入');msg(5,4,526,'操作返回',true);msg(4,2,547,'结果返回，下一轮看新图',true);
 msg(2,1,578,'结束或异常');msg(1,4,606,'采集终图，整理执行记录');msg(4,1,635,'返回最终画面与记录',true);msg(1,0,665,'返回，待结果核对',true);

 page('二  框架调研与选择','三个框架的背景、主要用途与入选理由','公开评测只帮助了解项目能力。模型、设备、任务和上限不同，三家公开数字不能直接横向排名。','官方资料核对于2026-10-23。Midscene团队：https://github.com/web-infra-dev；用途与设备：https://midscenejs.com/；官方AndroidWorld报告：https://midscenejs.com/android-world-benchmark-report （1.9.5，Gemini-3.5-Flash，DeepThink开启，循环上限120，含环境和验证器调整，93.10% Pass@1）。MobiAgent：https://arxiv.org/html/2509.00531v1 和 https://github.com/IPADS-SAI/MobiAgent/blob/main/README_zh.md；IPADS上海交通大学，MobiFlow结果使用MobiMind组合、非本轮通用API，AgentRR加速2–3倍为特定重复任务。AutoGLM：https://www.zhipuai.cn/en/autoglm （2024 AutoGLM系列AndroidLab36.2%、常见中文APP89.7%，不是本机Open-AutoGLM变体成绩）；https://github.com/zai-org/Open-AutoGLM；https://autoglm.z.ai/blog/。');
 table([['项目','谁做的、主要用在哪','公开评测与必须注意的条件','为什么放进本轮测试'],['Midscene','字节跳动Web Infra团队\n主要做网页、手机、桌面\n自动化测试，支持鸿蒙','官方AndroidWorld一次通过93.1%\n配Gemini-3.5-Flash、最多120轮\n测试环境与部分验证器有调整','官方鸿蒙接口可直接接入\n和现有JavaScript工程接近\n本轮固定1.16.0'],['MobiAgent','上海交通大学IPADS团队\n研究手机助手、操作经验复用\n开源手机端和脚本运行方式','论文MobiFlow中自研模型领先\n重复任务复用可加速2–3倍\n本轮未启用其专用模型/经验复用','有鸿蒙运行路径\n便于研究长期行为与记忆\n本轮固定4ee7940…'],['Open-AutoGLM','智谱/Z.ai团队\n面向手机助手，搜索、购物等\n真实APP操作与开发者接入','2024 AutoGLM系列公开结果\nAndroidLab36.2%、中文常用任务89.7%\n较早模型成绩，非本轮框架成绩','明确的手机动作输出方式\n适合作为逐步操作的比较基线\n本轮固定86f5538…']],[170,340,395,315],30,137,1220,322,19,[37,95,95,95]);
 section('本轮按相同方式比较，而不是照搬三家演示',30,479);
 table([['共同条件','我们实际测的内容'],['三框架 × 三模型','都换成已接通的Qwen/DeepSeek图片API，同一手机、四个任务、相同单题上限'],['保留差异','保留各框架的提示说明、动作解释与循环逻辑，统一模型调用计量和手机操作记录'],['范围边界','测的是“框架＋通用模型API＋本机鸿蒙接入”的效果，未复现三家的专用模型榜单']],[210,1010],30,526,1220,135,19,[34,34,34,33]);

 page('三  测试用例','四项完整手机任务，从可操作的桌面出发','同一HOP-AL10、展开横屏、同一桌面页面。时钟、推荐和最近应用顺序可以变化，框架自行打开APP。');
 const cases=[['计算器',['打开并清空','输入 (128+37)×6','执行计算','终图显示990'],'核对界面中的990\n文字说算对不算通过'],['系统存储',['打开设置','进入“存储”','读取容量及应用占用','保持目标页面'],'容量要有图可核对\n未显示的字段说明未显示\n禁止清理、删除'],['淘宝商品',['打开淘宝','搜索“折叠手机支架”','打开普通商品详情','读取标题及展示价格'],'搜索词、标题、价格都核对\n禁止加购、收藏、交易'],['小红书图文',['打开小红书','搜索“杭州旅游”','打开普通图文笔记','读取标题/作者/建议'],'内容与画面一致\n全程不打开视频/广告/直播\n禁止点赞、收藏、关注']];
 cases.forEach(([title,steps,accept],i)=>{const x=30+i*309;section(title,x,133,292);steps.forEach((v,j)=>{box(x+7,183+j*64,278,44,j===3?C.greenBg:C.blueBg,j===3?C.green:C.blue);txt(v,x+17,190+j*64,257,30,20,j===3,j===3?C.green:C.ink);if(j<3)route([[x+146,227+j*64],[x+146,247+j*64]]);});txt(accept,x+7,453,279,99,19);if(i<3)box(x+298,138,1,402,C.line,C.line,0);});
 section('执行顺序与判定规则',30,571);txt('先单配置跑全任务，再逐步扩大模型和框架，最后补齐3×3×4＝36项。已测的同组合复用。\n每题每组合最多15次请求、40次动作、600秒，每次最多512输出tokens。整批无总请求限制。\n通过看最终界面和全过程约束；部分完成不计入成功，正常失败不为提高成绩而重跑。',30,609,1220,71,19);

 page('四  测试结果与分析','异常修复并重测后，最终36项中16项严格通过','这是替换异常记录后的成绩：16通过、10部分完成、10未通过。四条接入异常重测均通过，正常失败保留。');
 txt('Q3.8＝qwen3.8-flash；Q3.7＝qwen3.7-plus；DS＝deepseek-v4.1-flash-1017（本机服务标识）',31,116,1218,23,15,false,C.muted);
 const vals=[['框架 × 模型','计算器','存储','淘宝','小红书','通过']];for(const f of fs)for(let m=0;m<3;m++){const rs=ids.map(id=>summary.rows.find(r=>r.framework_id===f&&r.model===models[m]&&r.case_id===id));vals.push([fl[f]+' × '+['Q3.8','Q3.7','DS'][m],...rs.map(r=>({passed:'通过',partial:'部分',failed:'未通过'})[r.verdict]),rs.filter(r=>r.verdict==='passed').length+'/4']);}
 const mat=table(vals,[245,113,113,113,113,113],30,151,810,400,20);for(let r=1;r<10;r++)for(let c=1;c<5;c++){const v=vals[r][c],cell=mat.getCell(r,c);cell.fill=v==='通过'?C.greenBg:v==='部分'?C.orangeBg:C.redBg;cell.text.style={typeface:'Microsoft YaHei',fontSize:20,bold:true,color:v==='通过'?C.green:v==='部分'?C.orange:C.red};}
 section('严格通过率44.4%',868,151,382);table([['框架','通过'],['AutoGLM','7/12'],['Midscene','6/12'],['MobiAgent','3/12']],[267,115],868,201,382,136,20);
 table([['模型','通过'],['Q3.7','8/12'],['Q3.8','5/12'],['DS','3/12']],[267,115],868,354,382,136,20);txt('每格一次探索性实测\n助手已核对，用户复核待定',868,508,382,48,19,false,C.muted);
 box(30,575,1220,96,C.greenBg,C.green);txt('哪些重测、哪些没有重测',44,583,330,33,24,true,C.green);txt('输入与图片过大两类问题修复后，AutoGLM三模型、MobiAgent×Q3.7的小红书重测均通过，共25请求。旧异常记录已覆盖，消耗仍计账。正常失败保留，案例见下一页。',390,584,840,76,20);

 page('四  测试结果与分析','部分完成与未通过：看到了什么，具体差在哪里','以下是正常保留的真实案例。最终画面看似接近目标，也可能搜索错内容、违反过程要求，或提前结束。');
 const stories=[{y:141,title:'部分完成：淘宝商品搜错了',tag:'MobiAgent × Q3.7  ·  5次请求',steps:['任务：折叠手机支架','实际：吸盘手机支架','进详情，读出价格','搜索条件不符'],body:'把推荐词当成已经填好的任务词。虽然进入商品页并读出标题、价格，仍不能算完成指定搜索。',color:C.orange,bg:C.orangeBg},
 {y:318,title:'部分完成：图文读对了，但先打开过视频',tag:'Midscene × DS  ·  8次请求',steps:['要求：只看普通图文','先打开视频','返回后读对图文','违反全过程约束'],body:'最终标题、作者和出行建议有依据，但任务明确要求不要打开视频。完成核对必须回看中间步骤。',color:C.orange,bg:C.orangeBg},
 {y:495,title:'未通过：计算器还没算完，程序却结束了',tag:'AutoGLM × Q3.8  ·  8次请求',steps:['目标：算式结果990','反复清空、输左括号','最后只回复想法','终图无990，未通过'],body:'第8次只说“需要清空后重新输入”，没有给出可执行操作。框架把这种回复当作结束，界面仍显示错误。',color:C.red,bg:C.redBg}];
 for(const a of stories){txt(a.title,30,a.y,800,33,25,true,a.color);txt(a.tag,869,a.y+3,381,28,18,false,C.muted);a.steps.forEach((v,i)=>{const x=30+i*309;box(x,a.y+49,292,43,a.bg,a.color);txt(v,x+10,a.y+54,270,31,20,i===3,i===3?a.color:C.ink);if(i<3)route([[x+292,a.y+70],[x+309,a.y+70]],a.color);});txt(a.body,31,a.y+105,1218,49,20);}
 s.speakerNotes.text+='\n案例运行：phone_b66b2b64-1435-439a-afc9-3ce089fe8bd4；phone_b12d5c11-6361-432d-a75b-67a80d78e3a6；phone_16146195-cb5c-45dd-ac3e-2188c57bd2cf。依据各run的review.json及完整原始回复和动作链，未把失败重写成接入异常。';

 page('四  测试结果与分析','性能差异：既看调用量，也看真实操作走了几步','同为Q3.7、同一任务且均通过。模型请求耗时包含接口往返，其余为运行总耗时减去模型请求耗时。');
 const perf=[['框架','存储：秒 / 请求 / 总tokens','小红书：秒 / 请求 / 总tokens']];for(const f of fs)perf.push([fl[f],...['HM-STOR-001','HM-XHS-001'].map(id=>{const r=row(f,id);return (r.duration_ms/1000).toFixed(1)+' / '+r.requests+' / '+(r.input_tokens+r.output_tokens).toLocaleString('en-US');})]);
 table(perf,[166,310,310],30,137,786,164,19,[38,42,42,42]);
 section('Midscene为何更耗输入量',850,134,400);txt('三框架各测12项，任务数量相同。\n总请求123 / 116 / 92次（Mid / Mobi / Auto）\n平均每请求输入10,337 / 2,098 / 3,300\n\nMid系统说明约3.3万字符，\n存储样本随历史累积从33,568增至\n40,554字符；每请求仍只有一张图。',850,178,400,166,18);
 section('存储任务：AutoGLM比Midscene快42.4秒',30,324,800);
 const timing=[['耗时拆分','Midscene','MobiAgent','AutoGLM'],['模型API往返合计',...fs.map(f=>(row(f,'HM-STOR-001').model_http_ms/1000).toFixed(1)+'秒')],['其余执行、采集、等待等',...fs.map(f=>(row(f,'HM-STOR-001').other_elapsed_ms/1000).toFixed(1)+'秒')]];
 table(timing,[281,168,168,169],30,366,786,108,19,[36,36,36]);
 txt('少15.9秒来自模型请求，少26.5秒来自其余开销。\n记录图片资产39份对23份，含模型输入副本等，不能当成截图命令数。',30,486,786,52,19);
 box(850,372,400,166,C.orangeBg,C.orange);txt('“AutoGLM更快”有适用范围',862,381,376,34,23,true,C.orange);txt('小红书三者约66–68秒，差距很小。\nMid该题只需5次请求，反而最少。\n输入量更大不等于每题调用更多，\n单次结果也不能证明稳定时延优势。',862,427,376,100,19);
 txt('实际存储路径',30,551,240,30,23,true,C.blue);
 txt('Auto：开设置 → 滑动两次 → 点存储 → 读取并结束（5请求）\nMid：开设置 → 滑动 → 点存储 → 滑动 → 进应用和元服务 → 返回存储 → 结束（7请求）',30,590,1220,58,20);
 txt('tokens为模型用量计量单位，输入占97.7%。留存331请求，含异常共373请求，实付未知。其余耗时尚不能逐项精确归因。',30,652,1220,27,16,false,C.muted);
 s.speakerNotes.text+='\n新提取：存储模型请求合计Mid35085ms/Mobi23716ms/Auto19154ms；其余49796/35931/23282ms。Mid-Auto差值42445ms，其中15931ms模型、26514ms其他。图片是image事件计数，不是唯一采集次数。系统说明33094实际字符。模型输入总字符按既有transport.text_chars计，随历史增长。所有原始事件哈希与提取脚本可复核。';

 page('四  测试结果与分析','失败原因分开看：想错、点错、没有执行、过早结束','用户怀疑的“GUI操作没有落地”确实存在，但每条失败要沿回复、实际动作和新画面对照，不能只看自报。');
 const causes=[['已确认并修复','输入框已选中，却又按旧位置点击','误点相机或推荐词；改为直接在当前输入框输入\n另将过大的页面图片改为同尺寸JPEG，4条重测通过',C.green,C.greenBg],['有线索，需校准','说要点计算器，实际一直点旁边','Mobi×DS连续5次实际点击后仍在桌面\n位置单位说明不清，可能影响转换；也可能定位本身有误',C.purple,C.purpleBg],['任务判断有误','把推荐词当任务词，或先点了视频','关键词和禁止操作没有逐条核对\n读对最后一张图，不能抵消前面违反要求',C.orange,C.orangeBg],['结束判断有误','只说“接下来要做什么”，却被当作结束','Auto计算器没有给出操作，原有解释逻辑仍让程序结束\n程序退出不等于任务做完，应明确报“回复无法执行”',C.red,C.redBg]];
 causes.forEach(([state,problem,evidence,color,bg],i)=>{const y=141+i*111;box(30,y,192,89,bg,color);txt(state,42,y+15,168,58,22,true,color);route([[222,y+44],[258,y+44]],color);txt(problem,271,y+2,963,31,24,true,color);txt(evidence,271,y+41,963,51,20);});
 box(30,601,1220,71,C.blueBg,C.blue);txt('另一个干扰源：截图会改变淘宝页面',43,609,551,31,23,true,C.blue);txt('至少4条淘宝任务受到“分享截屏”弹层干扰。\n文件能打开，也不能证明截图没影响APP。需单独对照测试。',620,607,614,56,19);
 s.speakerNotes.text+='\n坐标案例依据docs/evidence/20261022-report-release/failure-audit.json。屏2584×1828，图1292×914，模型位置框[700,855,780,935]按原生0–1000约定转为(1911,1635)，实际设备也点击这里。数值转换吻合，未证明执行器把正确位置二次缩放错。坐标单位与定位质量均待校准，不能靠猜单位补乘二。';

 page('四  改进与下一轮验证','改进顺序：先让每步操作可核对，再比较长期稳定性','下面是待执行建议。先处理接入和判断问题，再用相同条件重复试验，最后确认框架选择。');
 const plan=[['第一步：检查操作是否真的生效','把模型想点的位置画在原图上，\n对照手机实际落点。\n\n输入后核对搜索框里的真实文字。\n无法执行的回复明确报错。\n比较截图前后是否多出弹层。','验收：想点哪里、实际点哪里、\n页面变成什么，都能对应。',C.blue,C.blueBg],['第二步：同条件重复验证','保留Auto×Q3.7、Mid×Q3.7\n两个主候选，各四题重复3次。\n合计24次新试验。\n\n换新搜索词、新笔记，减少旧历史\n影响；统计乱点、重复和多余操作。','验收：既看严格通过率，\n也看耗时波动和违反要求次数。',C.green,C.greenBg],['第三步：依据结果确认方案','Mobi先查清位置转换问题，\nDS先核对回复能否正确执行。\n\n再决定单框架还是按任务选框架。\n若采用失败后换框架，需重新测试\n完整流程，不能直接拼已有成绩。','验收：用户确认最终框架后，\n再接回主仿真流程。',C.purple,C.purpleBg]];
 plan.forEach(([title,body,accept,color,bg],i)=>{const x=30+i*415;module(title,body,x,147,390,291,color,bg,20);box(x,455,390,82,bg,color);txt(accept,x+12,465,366,61,20,true,color);if(i<2)route([[x+390,287],[x+415,287]],color);});
 section('当前选择依据',30,560);txt('AutoGLM×Q3.7与Midscene×Q3.7均通过3/4，但擅长任务不同，没有单组合4/4。\n建议继续保留两个候选，暂不定最终框架。现有工作台已能比较组合并回看全过程，\n跨手机、稳定无人值守和主仿真真实执行仍待验证。本页24次试验尚未启动。',30,599,1220,80,21);
 meta.tableSlides=[...new Set(meta.tableSlides)];return meta;
}
