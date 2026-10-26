import http from 'node:http';
import { readFile, readdir, mkdir, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { normalizeConfig, safeId, ensure, parse, now, validDate } from './contracts.mjs';
import { Store, openExisting } from './store.mjs';
import { initialize } from './runner.mjs';
import { createMockAdapters } from './adapters/mock.mjs';
import { buildEvents } from './output.mjs';
import { ACTIONS, ACTIVE_JOBS, readJob, writeJob, isAlive } from './web-jobs.mjs';
import { APP_CATALOG } from './app-catalog.mjs';
import { UserLibrary } from './user-library.mjs';
import { ModelSettings } from './model-settings.mjs';
import { GuiLab } from './gui-lab.mjs';
import { guiComparisonPlan } from './gui-comparison-cases.mjs';
import {V04_EVIDENCE} from './v04-acceptance.mjs';
import { PhoneLab } from './phone-lab.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(project, 'web');
const fail = (status, message) => Object.assign(new Error(message), { status });
const jsonResponse = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
const decodeRow = (row, mapping) => Object.fromEntries(Object.entries(row).map(([key, value]) => mapping.includes(key) ? [key.replace(/_json$/, ''), parse(value)] : [key, value]));

async function body(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw fail(415, '请使用 JSON 请求');
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1024 * 1024) throw fail(413, '配置超过 1 MB');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail(400, 'JSON 格式无效'); }
}

export async function createDebugServer({ dataRoot = path.join(project, '.data'), port = 4317, phoneLabOptions } = {}) {
  await mkdir(dataRoot, { recursive: true });
  const root = await realpath(path.resolve(dataRoot));
  const library = new UserLibrary(root);
  const modelSettings = new ModelSettings(root);
  const guiLab = new GuiLab(root);
  const phoneLab = new PhoneLab(root,{archiveRoot:path.join(project,'test-archive'),...phoneLabOptions});
  const children = new Map();
  const stores = new Map();
  let closing = false;
  let localPort;

  async function runDirectory(id) {
    try { safeId(id); } catch { throw fail(400, '运行目录 ID 无效'); }
    const directory = path.join(root, id);
    let resolved;
    try { resolved = await realpath(directory); } catch { throw fail(404, '未找到运行'); }
    if (path.dirname(resolved) !== root || !existsSync(path.join(resolved, 'state.sqlite'))) throw fail(404, '未找到运行');
    return resolved;
  }
  function effectiveJob(directory) {
    const job = readJob(directory);
    if (job && ACTIVE_JOBS.includes(job.status) && !children.has(directory) && !isAlive(job.pid)) {
      job.status = 'interrupted'; job.finished_at = now(); job.error = '上次任务进程已退出，可从已保存进度恢复';
      job.stages = job.stages.map(s => s.status === 'running' ? { ...s, status: 'interrupted' } : s);
      writeJob(directory, job);
    }
    return job;
  }
  function withStore(directory, callback) {
    // Keep one connection while serving a run. Closing the last WAL connection
    // during worker startup can race with another process opening it on Windows.
    let store = stores.get(directory);
    if (!store) { store = openExisting(directory); stores.set(directory, store); }
    return callback(store);
  }
  async function createRun(input) {
    let config;
    try { config = normalizeConfig(input); } catch (error) { throw fail(400, error.message); }
    if (config.run_id.length > 64 || config.users.some(u => u.user_id.length > 40)) throw fail(400, '运行 ID 最多 64 字符，用户 ID 最多 40 字符');
    const directory = path.join(root, config.run_id);
    try { await mkdir(directory); } catch (error) { if (error.code === 'EEXIST') throw fail(409, '运行 ID 已存在；已有数据不会覆盖'); throw error; }
    const store = new Store(directory);
    try { await initialize(store, config, createMockAdapters(config)); } finally { store.close(); }
    return { id: config.run_id, synthetic: true };
  }
  function startJob(directory, action) {
    if (closing) throw fail(503, '调试服务正在关闭');
    if (!ACTIONS.includes(action)) throw fail(400, '未知操作');
    const previous = effectiveJob(directory);
    if (children.has(directory) || previous && ACTIVE_JOBS.includes(previous.status)) throw fail(409, '此运行已有任务，请等待或先停止');
    const externalWorkers = withStore(directory, s => s.status().workers.filter(w => isAlive(w.pid)));
    if (externalWorkers.length) throw fail(409, '此运行正在被命令行或其他进程使用');
    const job = { id: randomUUID(), action, status: 'queued', pid: null, created_at: now(), stages: [], synthetic: true };
    writeJob(directory, job);
    const child = spawn(process.execPath, [path.join(project, 'scripts/web-worker.mjs'), directory, job.id], { cwd: project, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let stopped = false;
    let settled = false;
    const completion = new Promise(resolve => {
      const finish = (code, error) => {
        if (settled) return;
        settled = true;
        children.delete(directory);
        const current = readJob(directory) ?? job;
        if (current.id === job.id && ACTIVE_JOBS.includes(current.status)) {
          current.status = stopped ? 'stopped' : code === 73 ? 'interrupted' : 'failed';
          current.finished_at = now();
          current.error = stopped ? '已停止，执行和描述记录已保留；可继续恢复' : code === 73 ? 'Mock 中断演练：动作意图与图像已落盘，尚未保存活动结果；请点击执行/恢复' : (error?.message ?? (stderr.trim().slice(-4000) || `任务异常退出 (${code})`));
          current.stages = current.stages.map(s => s.status === 'running' ? { ...s, status: current.status, finished_at: now() } : s);
          writeJob(directory, current);
        }
        resolve();
      };
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
      child.once('error', error => finish(null, error));
      child.once('exit', code => finish(code));
    });
    children.set(directory, { child, completion, stop: () => { stopped = true; child.kill('SIGTERM'); } });
    return job;
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    try {
      const allowedHosts = [`127.0.0.1:${localPort}`, `localhost:${localPort}`];
      if (!allowedHosts.includes(request.headers.host)) throw fail(403, '仅接受本地调试请求');
      const url = new URL(request.url, `http://127.0.0.1:${localPort}`);
      if (request.method === 'POST') {
        const origins = allowedHosts.map(host => `http://${host}`);
        if (request.headers.origin && !origins.includes(request.headers.origin) || request.headers['sec-fetch-site'] === 'cross-site' || request.headers['x-simulator-ui'] !== '1') throw fail(403, '请求来源无效');
      } else if (request.method !== 'GET') throw fail(405, '不支持此 HTTP 方法');
      const staticFiles = { '/v04-acceptance':['v04-acceptance.html','text/html'], '/v04-acceptance.mjs':['v04-acceptance.mjs','text/javascript'], '/': ['index.html', 'text/html'], '/workspace.mjs': ['workspace.mjs', 'text/javascript'], '/user-creator.mjs': ['user-creator.mjs', 'text/javascript'], '/model-settings.mjs': ['model-settings.mjs', 'text/javascript'], '/gui-lab.mjs': ['gui-lab.mjs', 'text/javascript'], '/gui-lab.css': ['gui-lab.css', 'text/css'], '/workspace.css': ['workspace.css', 'text/css'] };
      if (request.method === 'GET' && staticFiles[url.pathname]) {
        const [filename, type] = staticFiles[url.pathname];
        response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        response.end(await readFile(path.join(publicRoot, filename))); return;
      }
      const phoneFiles = { '/phone-video-ui.mjs':['phone-video-ui.mjs','text/javascript'], '/phone-video-protocol.mjs':['phone-video-protocol.mjs','text/javascript'], '/vendor/jmuxer.min.js':['vendor/jmuxer.min.js','text/javascript'], '/phone-process.mjs':['phone-process.mjs','text/javascript'], '/phone-process-ui.mjs':['phone-process-ui.mjs','text/javascript'], '/phone-lab': ['phone-lab.html','text/html'], '/phone-lab.mjs': ['phone-lab.mjs','text/javascript'], '/phone-test-plan.mjs':['phone-test-plan.mjs','text/javascript'], '/phone-trace.mjs': ['phone-trace.mjs','text/javascript'], '/phone-results.mjs': ['phone-results.mjs','text/javascript'], '/phone-lab.css': ['phone-lab.css','text/css'] };
      if(request.method==='GET'&&phoneFiles[url.pathname]){
        const [file,type]=phoneFiles[url.pathname];response.writeHead(200,{'Content-Type':type+'; charset=utf-8'});response.end(await readFile(path.join(publicRoot,file)));return;
      }
      if(url.pathname.startsWith('/api/phone-lab')){
        const suffix=url.pathname.slice('/api/phone-lab'.length);
        if(!suffix&&request.method==='GET')jsonResponse(response,200,await phoneLab.catalog(modelSettings.read()));
        else if(suffix==='/video/status'&&request.method==='GET')jsonResponse(response,200,phoneLab.video.status());
        else if(suffix==='/video/start'&&request.method==='POST'){
          const input=await body(request);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw fail(400,'投屏启动不接受设备、路径或命令参数');
          jsonResponse(response,200,await phoneLab.video.start());
        }
        else if(suffix==='/video/stop'&&request.method==='POST'){
          const input=await body(request);if(!input||typeof input.id!=='string'||typeof input.token!=='string'||Object.keys(input).some(k=>!['id','token'].includes(k)))throw fail(400,'投屏会话参数无效');
          jsonResponse(response,200,phoneLab.video.stop(input));
        }
        else if(/^\/video\/video_[a-f0-9-]{36}\/stream$/.test(suffix)&&request.method==='GET'){
          if(request.headers['sec-fetch-site']==='cross-site'||request.headers.origin&&![`http://127.0.0.1:${localPort}`,`http://localhost:${localPort}`].includes(request.headers.origin))throw fail(403,'投屏查看来源无效');
          phoneLab.video.attach(suffix.split('/')[2],request.headers['x-phone-video-token'],response);
        }
        else if(suffix==='/tasks'&&request.method==='GET')jsonResponse(response,200,phoneLab.listTasks());
        else if(suffix==='/tasks'&&request.method==='POST')jsonResponse(response,201,phoneLab.tasks.save(await body(request)));
        else if(/^\/tasks\/(task_[a-f0-9-]{36}|HM-[A-Z]+-\d+)\/startpoint$/.test(suffix)&&request.method==='POST')jsonResponse(response,200,await phoneLab.selectTaskStart(suffix.split('/')[2],await body(request)));
        else if(/^\/tasks\/(task_[a-f0-9-]{36}|HM-[A-Z]+-\d+)$/.test(suffix)&&request.method==='POST')jsonResponse(response,200,phoneLab.tasks.save(await body(request),suffix.split('/')[2]));
        else if(suffix==='/pause'&&request.method==='POST'){const input=await body(request);jsonResponse(response,200,phoneLab.pause(typeof input.reason==='string'?input.reason.slice(0,500):undefined));}
        else if(suffix==='/resume'&&request.method==='POST'){await body(request);jsonResponse(response,200,phoneLab.resume());}
        else if(suffix==='/starts'&&request.method==='POST')jsonResponse(response,201,await phoneLab.captureStart(await body(request)));
        else if(suffix==='/runs'&&request.method==='POST')jsonResponse(response,201,await phoneLab.start(await body(request),modelSettings.read()));
        else if(suffix==='/batches'&&request.method==='POST')jsonResponse(response,201,await phoneLab.batch(await body(request),modelSettings.read()));
        else{
          const m=suffix.match(/^\/(runs|starts|batches)\/([a-z_0-9-]+)(?:\/(stop|continue|review|export|bundle|process|assets\/([a-z_0-9-]+)))?$/);
          if(!m)throw fail(404,'未找到真机测试接口');
          const [,kind,id,action,assetId]=m;
          if(assetId&&request.method==='GET'){
            const a=await phoneLab.asset(kind,id,assetId);response.writeHead(200,{'Content-Type':a.type});response.end(a.bytes);
          }else if(kind==='runs'&&action==='bundle'&&request.method==='GET'){
            const bytes=await phoneLab.bundle(id);response.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${id}-evidence.zip"`});response.end(bytes);
          }else if(kind==='runs'&&action==='process'&&request.method==='GET'){
            response.setHeader('Cache-Control','no-store');jsonResponse(response,200,phoneLab.processSnapshot(id,Number(url.searchParams.get('after_seq')??0)));
          }else if(kind==='runs'&&request.method==='GET'){
            if(action==='export')response.setHeader('Content-Disposition',`attachment; filename="${id}.json"`);
            jsonResponse(response,200,phoneLab.snapshot(id));
          }else if(kind==='runs'&&action==='stop'&&request.method==='POST'){await body(request);jsonResponse(response,200,phoneLab.stop(id));}
          else if(kind==='runs'&&action==='review'&&request.method==='POST')jsonResponse(response,200,phoneLab.review(id,await body(request)));
          else if(kind==='batches'&&action==='stop'&&request.method==='POST'){await body(request);jsonResponse(response,200,phoneLab.stopBatch(id));}
          else if(kind==='batches'&&action==='continue'&&request.method==='POST')jsonResponse(response,200,await phoneLab.continueBatch(id,await body(request)));
          else throw fail(405,'不支持此真机测试操作');
        }
        return;
      }
      if (url.pathname === '/api/system' && request.method === 'GET') {
        jsonResponse(response, 200, { apps: APP_CATALOG, modules: [
          { id: 'users', name: '用户库与人设快照', mode: 'system' }, { id: 'persona_generator', name: '人设生成内容', mode: 'mock' }, { id: 'runtime', name: '事件调度与虚拟时间', mode: 'system' },
          { id: 'records', name: '持久化与来源关联', mode: 'system' }, { id: 'upper_planner', name: '上层模型规划内容', mode: 'mock' },
          { id: 'lower_executor', name: '页面决策与手机操作', mode: 'mock' }, { id: 'describer', name: '截图转文字', mode: 'mock' },
        ], user_count: library.list().length }); return;
      }
      if (url.pathname === '/api/settings/models') {
        if (request.method === 'GET') jsonResponse(response, 200, modelSettings.read());
        else jsonResponse(response, 200, modelSettings.save(await body(request)));
        return;
      }
      if (url.pathname === '/api/gui-lab' && request.method === 'GET') {
        jsonResponse(response, 200, guiLab.catalog()); return;
      }
      if (url.pathname === '/api/gui-lab/comparison' && request.method === 'GET') {
        response.setHeader('Content-Disposition', 'attachment; filename="framework-comparison-cases.json"');
        jsonResponse(response, 200, guiComparisonPlan()); return;
      }
      if(url.pathname==='/api/v04/acceptance'&&request.method==='GET'){jsonResponse(response,200,guiComparisonPlan().evidence_review);return;}
      if(url.pathname.startsWith('/api/v04/evidence/')&&request.method==='GET'){
        const key=url.pathname.slice('/api/v04/evidence/'.length),item=Object.hasOwn(V04_EVIDENCE,key)?V04_EVIDENCE[key]:null;if(!item)throw fail(404,'证据不存在');
        response.writeHead(200,{'Content-Type':item.file.endsWith('.json')?'application/json; charset=utf-8':'text/plain; charset=utf-8','Cache-Control':'no-store'});response.end(await readFile(path.join(project,item.file)));return;
      }
      if (url.pathname === '/api/gui-lab/diagnostics' && request.method === 'POST') {
        await body(request); jsonResponse(response, 200, await guiLab.diagnostics(modelSettings)); return;
      }
      if (url.pathname === '/api/gui-lab/experiments' && request.method === 'POST') {
        const input = await body(request), settings = modelSettings.read();
        jsonResponse(response, 201, guiLab.start(input, { service_id: settings.bindings.gui, settings_revision: settings.revision, applied: false })); return;
      }
      const labMatch = url.pathname.match(/^\/api\/gui-lab\/experiments\/([a-zA-Z0-9_-]+)(?:\/(stop|resume|export|assets\/([a-zA-Z0-9_-]+)))?$/);
      if (labMatch) {
        const [, runId, action, assetId] = labMatch;
        if (request.method === 'POST' && ['stop', 'resume'].includes(action)) {
          await body(request); jsonResponse(response, 200, action === 'stop' ? guiLab.stop(runId) : guiLab.resume(runId));
        } else if (request.method === 'GET' && assetId) {
          response.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' }); response.end(guiLab.asset(runId, assetId));
        } else if (request.method === 'GET' && (!action || action === 'export')) {
          if (action === 'export') response.setHeader('Content-Disposition', `attachment; filename="${runId}.json"`);
          jsonResponse(response, 200, guiLab.snapshot(runId));
        } else throw fail(405, '不支持此验证操作');
        return;
      }
      if (url.pathname === '/api/users' && request.method === 'GET') {
        jsonResponse(response, 200, { users: library.list(), batches: library.batches(), calls: library.calls() }); return;
      }
      const draftMatch = url.pathname.match(/^\/api\/users\/drafts\/([^/]+)(\/commit)?$/);
      if (draftMatch) {
        try {
          if (request.method === 'GET' && !draftMatch[2]) jsonResponse(response, 200, library.draft(decodeURIComponent(draftMatch[1])));
          else if (request.method === 'POST' && draftMatch[2]) jsonResponse(response, 201, library.commit(decodeURIComponent(draftMatch[1]), (await body(request)).candidates));
          else throw fail(405, '不支持此 HTTP 方法');
        } catch (error) { throw fail(error.status ?? 400, error.message); }
        return;
      }
      if (['/api/users/preview', '/api/users/manual'].includes(url.pathname) && request.method === 'POST') {
        const input = await body(request);
        try { jsonResponse(response, 201, url.pathname.endsWith('/manual') ? library.manual(input) : await library.preview(input, createMockAdapters({ mock: {} }).personas)); }
        catch (error) { throw fail(400, error.message); }
        return;
      }
      if (url.pathname === '/api/users/generate' && request.method === 'POST') {
        const input = await body(request);
        try { jsonResponse(response, 201, await library.generate(input, createMockAdapters({ mock: {} }).personas)); }
        catch (error) { throw fail(400, error.message); }
        return;
      }
      if (url.pathname === '/api/simulations' && request.method === 'POST') {
        const input = await body(request);
        try {
          ensure(typeof input.name === 'string' && input.name.trim(), '请填写仿真任务名称');
          ensure(Array.isArray(input.user_ids) && input.user_ids.length > 0 && new Set(input.user_ids).size === input.user_ids.length, '请选择不重复的虚拟用户');
          const users = input.user_ids.map(id => { const profile = library.list().find(u => u.user_id === id); ensure(profile, `用户不存在：${id}`); return { user_id: id, source_user_id: id, requirements: profile.requirements, persona_snapshot: profile.persona, persona_provenance: profile.provenance }; });
          validDate(input.start_date);
          let end = input.end_date;
          if (!end) { ensure(Number.isSafeInteger(input.duration_days) && input.duration_days > 0, '跨度天数应为正整数'); end = new Date(Date.parse(input.start_date) + (input.duration_days - 1) * 86400000).toISOString().slice(0, 10); }
          validDate(end);
          ensure(Array.isArray(input.app_ids) && input.app_ids.length > 0 && new Set(input.app_ids).size === input.app_ids.length, '请选择不重复的 APP');
          const apps = input.app_ids.map(id => { const app = APP_CATALOG.find(a => a.app_id === id); ensure(app, `APP 未配置：${id}`); return app; });
          const config = { run_id: `sim_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`, experiment_name: input.name.trim(), mode: 'mock', virtual_start_date: input.start_date, virtual_end_date: end,
            virtual_timezone: input.timezone ?? 'Asia/Hong_Kong', external_requirements: input.requirements ?? '', apps, users,
            settings: { recent_activity_limit: 5, description_max_attempts: 3 },
            mock: { scenario: 'daily_apps_v1', partial_first_activity: input.test_partial ?? false, description_fail_once: input.test_description_failure ?? false, execution_delay_ms: input.execution_delay_ms ?? 120, description_delay_ms: 70 } };
          jsonResponse(response, 201, await createRun(config));
        } catch (error) { throw fail(error.status ?? 400, error.message); }
        return;
      }
      if (url.pathname === '/api/template' && request.method === 'GET') {
        const config = JSON.parse(await readFile(path.join(project, 'examples/mock-run.json'), 'utf8'));
        config.run_id = `demo_${Date.now().toString(36)}`;
        config.mock.execution_delay_ms = 300; config.mock.description_delay_ms = 180;
        jsonResponse(response, 200, config); return;
      }
      if (url.pathname === '/api/runs' && request.method === 'GET') {
        const entries = await readdir(root, { withFileTypes: true });
        const runs = [];
        for (const entry of entries) {
          if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]+$/.test(entry.name)) continue;
          try {
            const directory = await runDirectory(entry.name);
            runs.push(withStore(directory, store => ({ id: entry.name, config: store.config(), created_at: store.get('SELECT created_at FROM runs').created_at, status: store.status(), job: effectiveJob(directory) })));
          } catch (error) { runs.push({ id: entry.name, error: error.message }); }
        }
        runs.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
        jsonResponse(response, 200, { runs }); return;
      }
      if (url.pathname === '/api/runs' && request.method === 'POST') {
        const input = await body(request);
        jsonResponse(response, 201, await createRun(input.config)); return;
      }
      const match = /^\/api\/runs\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
      if (!match) throw fail(404, '未找到接口');
      const id = decodeURIComponent(match[1]);
      const directory = await runDirectory(id);
      const suffix = match[2] ?? '';
      if (suffix === '' && request.method === 'GET') {
        const snapshot = withStore(directory, store => {
          const { data, events } = buildEvents(store);
          const status = store.status();
          status.workers = status.workers.map(worker => ({ ...worker, alive: isAlive(worker.pid) }));
          return {
            id, config: data.config, users: data.users, status, job: effectiveJob(directory),
            activities: store.all('SELECT * FROM activities ORDER BY user_id,virtual_start,ordinal').map(r => decodeRow(r, ['task_json'])),
            plans: data.plans.map(r => decodeRow(r, ['tasks_json', 'context_json', 'basis_json'])),
            results: data.results.map(r => decodeRow(r, ['result_json'])), decisions: data.decisions.map(r => decodeRow(r, ['decision_json', 'context_json', 'provenance_json'])),
            events, audit: store.all('SELECT * FROM audit ORDER BY id DESC LIMIT 300').map(r => decodeRow(r, ['payload_json'])),
            description_history: data.history,
            calls: store.all('SELECT id,trace_id,parent_id,module,operation,mode,adapter,user_id,activity_id,virtual_date,status,started_at,finished_at,error FROM call_spans ORDER BY started_at DESC LIMIT 1000'),
            call_count: store.get('SELECT COUNT(*) AS n FROM call_spans').n,
          };
        });
        try { snapshot.report = JSON.parse(await readFile(path.join(directory, 'export/check-report.json'), 'utf8')); } catch { snapshot.report = null; }
        snapshot.files = ['events.jsonl', 'run.json', 'check-report.json'].filter(file => existsSync(path.join(directory, 'export', file)));
        jsonResponse(response, 200, snapshot); return;
      }
      if (suffix.startsWith('calls/') && request.method === 'GET') {
        const callId = decodeURIComponent(suffix.slice(6));
        const call = withStore(directory, store => store.get('SELECT * FROM call_spans WHERE id=?', callId));
        if (!call) throw fail(404, '调用记录不存在');
        jsonResponse(response, 200, decodeRow(call, ['input_json', 'output_json'])); return;
      }
      if (suffix === 'pause' && request.method === 'POST') {
        await body(request);
        if (!children.has(directory)) throw fail(409, '当前没有可暂停的任务');
        withStore(directory, store => { if (!store.status().workers.some(w => w.name === 'execution' && isAlive(w.pid))) throw fail(409, '当前不在活动执行阶段'); store.requestPause(true); });
        jsonResponse(response, 200, { pause_requested: true, boundary: 'after_activity_feedback' }); return;
      }
      if (suffix === 'jobs' && request.method === 'POST') {
        const { action } = await body(request);
        jsonResponse(response, 202, startJob(directory, action)); return;
      }
      if (suffix === 'stop' && request.method === 'POST') {
        await body(request);
        const owned = children.get(directory);
        if (!owned) throw fail(409, '没有由当前调试服务启动的活动任务');
        owned.stop(); await owned.completion;
        jsonResponse(response, 200, { job: readJob(directory) }); return;
      }
      if (suffix.startsWith('screens/') && request.method === 'GET') {
        const screenshotId = decodeURIComponent(suffix.slice(8));
        const store = openExisting(directory);
        try {
          const row = store.get('SELECT * FROM screenshots WHERE id=?', screenshotId);
          if (!row) throw fail(404, '图像不存在');
          const bytes = await store.readAsset(row);
          response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
          response.writeHead(200, { 'Content-Type': row.media_type }); response.end(bytes);
        } finally { store.close(); }
        return;
      }
      if (suffix.startsWith('files/') && request.method === 'GET') {
        const file = suffix.slice(6);
        if (!['events.jsonl', 'run.json', 'check-report.json'].includes(file)) throw fail(404, '文件不在导出列表中');
        let bytes;
        try { bytes = await readFile(path.join(directory, 'export', file)); } catch { throw fail(404, '请先执行导出或检查'); }
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${file}"` }); response.end(bytes); return;
      }
      throw fail(404, '未找到接口');
    } catch (error) {
      if (!response.headersSent) jsonResponse(response, error.status ?? 500, { error: error.message });
      else response.destroy();
    }
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { localPort = server.address().port; resolve(); }); });
  } catch (error) { await phoneLab.close(); await guiLab.close(); modelSettings.close(); library.close(); throw error; }
  return {
    server, url: `http://127.0.0.1:${localPort}`,
    async close() {
      closing = true;
      const jobs = [...children.values()];
      jobs.forEach(job => job.stop());
      await Promise.allSettled(jobs.map(job => job.completion));
      await phoneLab.close();
      await guiLab.close();
      await new Promise(resolve => server.close(resolve));
      for (const store of stores.values()) store.close();
      stores.clear();
      modelSettings.close();
      library.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '4317' }, data: { type: 'string' } } });
  const port = Number(values.port);
  ensure(Number.isSafeInteger(port) && port >= 1 && port <= 65535, 'Invalid port');
  createDebugServer({ port, dataRoot: values.data }).then(app => {
    console.log(`BehaviorLab 用户行为仿真系统: ${app.url}`);
    console.log('仅监听本机；复用现有持久化流水线。Ctrl+C 停止服务，记录保留。');
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await app.close(); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  }).catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
}
