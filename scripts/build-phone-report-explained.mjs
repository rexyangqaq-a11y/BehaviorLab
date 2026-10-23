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

 page('一  下层操作模块','实际架构：复用框架的鸿蒙能力，补充测试接入与过程记录','框架已有HDC控制能力。我们补充工作台、模型与设备转接、执行检查和记录，手机操作仍由框架决策。','源码：src/phone-lab.mjs、scripts/phone-lab-worker.mjs、integrations/adapters/midscene.mjs、integrations/adapters/python-native.mjs、integrations/phone-frameworks.py、src/gui-trial-transport.mjs、src/phone-device.mjs、src/phone-evidence.mjs。Midscene保留原生HarmonyAgent与HarmonyDevice动作实现，我们包装动作前后检查/记录并接管HDC命令留证和截图。MobiAgent/Open-AutoGLM保留选定决策循环，将设备I/O经本机Python-Node转接接入共用会话；共用会话仍复用Midscene的Harmony设备/HDC能力，未另造点击滑动引擎。Python输入前复用旧位置与Windows中文通信错误是我们接入引入的问题，不是修复上游框架的鸿蒙能力。AutoGLM图片过大来自既有2MiB入口限制，改同尺寸JPEG并校正MIME；去除answer包装用于固定客户端回复兼容。分支内改动影响对应组合，共用输入影响两个Python框架，共用截图/记录/保护也可能改变各框架观察与耗时，不宣称无干扰。Mobi经验/记忆关闭、外层启动调度未纳入。测试对象是框架＋模型＋本机接入变体，不是原封不动的原生框架榜单。模型API节点概括统一运输层和所配置的外部服务。');
 module('测试工作台〔我们实现〕','任务、起点、框架、模型选择\n单项运行、组合评估、结果筛选',30,144,315,112);
 module('任务执行器〔我们实现〕','下发任务，保存本次配置\n管理队列、限额、停止与异常',394,144,420,112);
 route([[345,198],[394,198]],C.blue);
 module('大模型API服务','Qwen / DeepSeek等图片接口\n输入：任务、当前图、必要历史\n输出：判断、动作或结束说明',876,144,374,144,C.purple,C.purpleBg);
 box(30,305,784,167,C.greenBg,C.green);txt('开源框架：组织看图、模型判断与操作执行',44,314,755,33,24,true,C.green);
 txt('每次选择一个：Midscene / MobiAgent / Open-AutoGLM',45,354,755,31,21,true,C.green);
 const commonSteps=['取当前截图','请模型给下一步','解释并执行操作','看新图再判断'];
 commonSteps.forEach((value,i)=>{const x=45+i*192;box(x,402,174,43,'#FFFFFF',C.green);txt(value,x+8,408,158,30,19,true,C.green);if(i<3)route([[x+174,423],[x+192,423]],C.green);});
 route([[604,256],[604,305]],C.blue);txt('① 指定任务与约束',618,266,196,30,18,false,C.blue);
 route([[814,366],[853,366],[853,213],[876,213]],C.purple);txt('② 发截图和上下文',878,312,310,28,20,true,C.purple);
 route([[1218,288],[1218,422],[814,422]],C.purple,true);txt('③ 返回下一步操作',877,377,310,29,20,true,C.purple);
 module('设备接入与执行记录〔我们补充〕','复用现有HDC能力，统一限额、权限检查、动作与截图记录\n补充本机转接及兼容处理，并保留各框架的接入差异',30,526,784,112,C.blue,C.blueBg);
 module('鸿蒙真机','HOP-AL10\n真实APP与屏幕变化',876,526,374,112,C.green,C.greenBg);
 route([[320,472],[320,526]],C.green);txt('④ 沿各自路径执行',45,484,258,29,19,true,C.green);
 route([[673,526],[673,472]],C.blue,true);txt('⑥ 新图回到框架继续判断',383,484,431,29,19,false,C.blue);
 route([[814,553],[876,553]],C.blue);route([[876,610],[814,610]],C.blue,true);txt('⑤ 操作 / 新图',903,476,330,30,19,true,C.blue);
 txt('测的是“框架＋模型＋本机接入”组合。输入、图片与记录方式会影响结果，不能直接当作原框架能力排名。',31,646,1218,31,18,false,C.muted);

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

 page('二  框架调研与选择','三个框架的背景、用途与公开测试组合','统一看整项任务成功率和50步/轮上限。Mobi与Auto同集可比，Mid使用另一测试集，不能当作同榜排名。','资料核对于2026-10-23。背景来源：https://github.com/web-infra-dev；https://arxiv.org/html/2509.00531v1；https://github.com/zai-org/Open-AutoGLM。主要评测来源1：https://midscenejs.com/mobile-world-benchmark-report，Midscene1.10.3＋Gemini-3.6-Flash，117任务92通过，Pass@1 78.63%，50轮上限，DockerEmulator，2026-07-28，MastodonNewFilterTask验收规则调整。主要来源2：https://www.preprints.org/manuscript/202603.1313，2026-03-17非同行评审预印本，5.1节说明GUI专用模型使用官方执行框架，最多50步；表3基础场景SR：MobiMind-Mixed4B53.8%、AutoGLM-Phone9B16.7%，分别CR72.9%和30.2%，本页只用SR，不混入CR/加速倍数。MobiFlow基于真实APP采集轨迹构建状态转移图，不等于在每条测试中实时控制真机。论文所称官方执行框架未明确固定到本机MobiAgent/Open-AutoGLM提交，不能声称本机版本复现，且不能证明两者在同模型下框架净效果。全套20APP/240任务包含不同场景，本页基础场景分母不冒称240。代码：https://github.com/nanookfyf/MobiBench，完整数据与复现未实测。未找到Midscene在该MobiFlow同一基础场景的公开结果。本轮成绩见第五页，来自冻结summary，qwen3.7-plus各四题严格通过3/4、2/4、3/4，15请求/40动作/600秒，每组合一次，协议v4–v7及APP内部历史差异仍存在。补充公开资料：https://midscenejs.com/android-world-benchmark-report（Mid1.9.5＋Gemini-3.5-Flash，93.10% Pass@1，120轮，验证器有调整）；https://midscenejs.com/app-control-bench-report（Mid1.12.0，同60个iOS任务，Qwen3.7 Plus93.33%、DeepSeek V4 Flash Vision Exp86.67%、Doubao Seed2.1 Turbo96.67%，部分完成另计），详见docs/PUBLIC_GUI_BENCHMARKS_20261023.md。');
 table([['项目','谁做的、主要用在哪','公开测试组合、任务集与整项成功率','为什么放进本轮测试'],['Midscene','字节跳动Web Infra团队\n主要做网页、手机、桌面\n自动化测试，支持鸿蒙','组合：Midscene 1.10.3＋Gemini-3.6-Flash\n测试：MobileWorld，117题，最多50轮\n一次整项成功率：78.63%（92/117）\n安卓模拟器，1项验收规则有调整','官方鸿蒙接口可直接接入\n和现有JavaScript工程接近\n本轮固定1.16.0'],['MobiAgent','上海交通大学IPADS团队\n研究手机助手、操作经验复用\n开源手机端和脚本运行方式','组合：官方执行框架＋MobiMind-Mixed-4B\n测试：MobiFlow基础场景，最多50步\n整项成功率：53.8%（2026预印本）\n环境：按采集的页面状态图推进','有鸿蒙运行路径\n便于研究长期行为与记忆\n本轮固定4ee7940…'],['Open-AutoGLM','智谱/Z.ai团队\n面向手机助手，搜索、购物等\n真实APP操作与开发者接入','组合：官方执行框架＋AutoGLM-Phone-9B\n测试：同一MobiFlow基础场景，最多50步\n整项成功率：16.7%（同一预印本）\n环境同上，未确认等同本机框架版本','明确的手机动作输出方式\n适合作为逐步操作的比较基线\n本轮固定86f5538…']],[170,295,455,300],30,137,1220,322,18,[37,95,95,95]);
 section('本页测试集：都看完整任务是否成功，运行环境不同',30,479);
 table([['测试集','怎样运行','测什么、怎样看成绩'],['MobileWorld','在安卓模拟器中实际打开应用并操作','本页117题，含跨APP和较长流程\n按任务最终结果验收，一次整项成功率78.63%'],['MobiFlow','由真实APP采集的页面与操作构建状态图\n模型的动作决定走到哪张页面','整套20个APP、240任务，含不同场景\n本页只取基础场景，不把部分进度计为成功']],[180,500,540],30,526,1220,135,18,[31,52,52]);

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

 page('四  测试结果与分析','为什么换框架会影响效果：操作规则与设备接入都要看','共同流程都是看图、模型判断、执行。下面区分框架规则、本机接入与已有观察，不把所有失败都归给模型。');
 const perf=[['框架','存储：秒 / 请求 / 总tokens','小红书：秒 / 请求 / 总tokens']];for(const f of fs)perf.push([fl[f],...['HM-STOR-001','HM-XHS-001'].map(id=>{const r=row(f,id);return (r.duration_ms/1000).toFixed(1)+' / '+r.requests+' / '+(r.input_tokens+r.output_tokens).toLocaleString('en-US');})]);
 table(perf,[166,310,310],30,137,786,148,18,[34,38,38,38]);
 section('存储耗时：模型API / 其余',850,134,400);
 const timing=[['框架','模型API','其余'],...fs.map(f=>[fl[f],(row(f,'HM-STOR-001').model_http_ms/1000).toFixed(1)+'秒',(row(f,'HM-STOR-001').other_elapsed_ms/1000).toFixed(1)+'秒'])];
 table(timing,[160,120,120],850,173,400,112,17,[28,28,28,28]);
 txt('上表固定qwen3.7-plus且三框架均通过。tokens为模型用量单位。API耗时含网络往返，“其余”不能逐项精确归因。',30,287,1220,27,16,false,C.muted);
 section('框架像操作手册与控制台：给模型的说明、指令和结束规则不同',30,313);
 table([['本轮配置','怎样组织模型判断和操作','怎样结束或处理异常','已观察到什么'],['Midscene','完整操作说明＋执行记录\n模型选工具、目标及参数，框架执行','按模型的完成标记结束\n未完成则继续看图和执行','系统说明约3.3万字符\n本轮输入用量较大'],['MobiAgent','简短说明＋动作历史\n模型给出动作及目标区域，框架转换位置','按完成/失败等标记处理\n本轮未启用经验与记忆','通过样本用量较低\n错点仍需查位置单位'],['Open-AutoGLM','连续对话含当前应用与截图\n模型直接给点击、输入、结束等指令','原有逻辑可把无法解释的回复当作结束\n计算器只说想法，也曾提前结束','存储少两次请求\n不代表所有任务都更快']],[160,420,340,300],30,352,1220,174,17,[30,48,48,48]);
 section('设备接入同样会影响结果：从“模型想做”到“手机做到”还有一段',30,534);
 txt('接入：Mid走原生设备接口，Mobi/Auto经本机转接，最终都用HDC。转接、采集与记录都有开销。\n输入与截图：旧位置误点已修复，Auto改用JPEG，淘宝样本中截图触发弹层，影响操作或判断。\n耗时：存储差42.4秒中，15.9秒为模型API差值，26.5秒为其余开销合计，不能全算成模型快慢。',30,574,1220,76,18);
 txt('结论：测的是框架＋模型＋接入组合。以上观察未隔离单个原因，小红书三者约66–68秒，不能据此做稳定排名。',30,654,1220,25,16,false,C.muted);
 s.speakerNotes.text+='\n新提取：存储模型请求合计Mid35085ms/Mobi23716ms/Auto19154ms；其余49796/35931/23282ms。Mid-Auto差值42445ms，其中15931ms模型、26514ms其他。图片是image事件计数，不是唯一采集次数。系统说明33094实际字符。模型输入总字符按既有transport.text_chars计，随历史增长。Mid存储路径：开设置、滑动、点存储、滑动、进应用和元服务、返回存储、结束；Auto开设置、滑动两次、点存储、读取结束。总请求123/116/92，各测12项；平均每请求输入10337/2098/3300，三者每请求均一张图。矩阵331请求，含异常373请求，输入占总tokens97.7%，实付未知。所有原始事件哈希与提取脚本可复核。原理说明针对本轮固定配置，不泛化全部模式：Mid aiAct且deepThink关闭；Mobi task_in_app e2e qwen_json，未启用经验/记忆，输入截图和动作历史，按结构化动作/目标区域解析转换；AutoPhoneAgent逐步对话含前台应用，去除旧图保留文字历史，原生parse_action失败会转为finish，这不等于真实完成。依据integrations/adapters/midscene.mjs、integrations/phone-frameworks.py、固定源码runner/mobiagent/decider_adapters/qwen.py和phone_agent/agent.py。接入分层：Mid保留原生Harmony设备动作并加检查/记录，两个Python框架经本机转接到共用设备会话。Python输入、UTF-8是接入修补；AutoJPEG及answer包装是专属分支；截图、权限/重复动作保护和记录会共同影响观察、行为及耗时，不宣称无干扰或单因素因果。';

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
