import {readFile, writeFile, mkdir, stat, realpath, readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';

const EVALUATION = 'evaluation_20261022_b14102b7-e102-4744-b9a3-bc1d99ef014b';
const sha = value => createHash('sha256').update(value).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const html = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail = (condition, message) => {if (!condition) throw Error(message);};
const style = '<meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:16px/1.6 system-ui;max-width:1100px;margin:32px auto;padding:0 20px;color:#172b3a}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd5dd;padding:8px;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f7;padding:12px}img{max-width:100%;height:auto}details{border:1px solid #ddd;margin:12px 0;padding:8px}a{color:#075ca6}</style>';

// Only structured secrets/identifiers and workstation paths are cleaned here.
// Natural-language model text and screenshots require a separate human review.
export function cleanArchiveValue(value, counts = {}) {
  const mark = name => {counts[name] = (counts[name] ?? 0) + 1; return '[omitted for public archive]';};
  if (Array.isArray(value)) return value.map(v => cleanArchiveValue(v, counts));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    /^(?:api_?key|authorization|proxy-authorization|password|secret|access_token|refresh_token|cookie|set-cookie|target|target_sha256|device_serial|serial|imei|imsi|base_url|endpoint)$/i.test(key) ? mark('structured_identifier_or_secret') :
    key === 'stdout' && value.type === 'hdc_return' ? mark('raw_hdc_stdout') : cleanArchiveValue(child, counts)]));
  if (typeof value !== 'string') return value;
  return value.replace(/\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, () => mark('credential_literal'))
    .replace(/\bBearer\s+[A-Za-z0-9_.\/=+-]{20,}/gi, () => mark('bearer_literal'))
    .replace(/\b[A-Za-z]:[\\/](?:Users|work|Program Files)[^\r\n"<>|]*/gi, () => mark('workstation_path'));
}

export async function exportV04Archive({source, out}) {
  const sourceRoot = await realpath(source), target = path.resolve(out);
  const exists = await stat(target).catch(e => {if(e.code !== 'ENOENT') throw e; return null;});
  fail(!exists, 'Choose a new archive directory; existing output is never overwritten.');
  const relative = path.relative(sourceRoot, target);
  fail(relative && !relative.startsWith('.data' + path.sep) && relative !== '.data', 'Output must not be in source data.');
  const summary = await json(path.join(sourceRoot, 'docs/evidence/20261022-phone-evaluation/summary.json'));
  fail(summary.evaluation_id === EVALUATION && summary.rows.length === 36, 'Expected frozen 36-cell v0.4 evaluation.');
  fail(new Set(summary.rows.map(r => r.run_id)).size === 36, 'Duplicate run IDs.');
  const counts = {}, files = [], sourceChecks = [], cases = new Map(), records = [];
  let images = 0, eventsCount = 0, requests = 0;
  const put = async (name, bytes) => {
    const destination = path.resolve(target, name), rel = path.relative(target, destination);
    fail(rel && !rel.startsWith('..') && !path.isAbsolute(rel), 'Archive path escapes output.');
    const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    await mkdir(path.dirname(destination), {recursive:true}); await writeFile(destination, b, {flag:'wx'});
    files.push({file:name.replaceAll('\\','/'), bytes:b.length, sha256:sha(b)});
  };
  const putJson = (name, value) => put(name, JSON.stringify(cleanArchiveValue(value, counts), null, 2) + '\n');
  const readSource = async file => {
    const bytes = await readFile(file); sourceChecks.push({file, sha256:sha(bytes)}); return bytes;
  };
  await mkdir(target, {recursive:true});
  for (const row of summary.rows) {
    fail(/^phone_[a-f0-9-]{36}$/.test(row.run_id), 'Invalid frozen run ID.');
    const dir = path.join(sourceRoot, '.data/.phone-lab/runs', row.run_id);
    const actualDir = await realpath(dir);
    fail(actualDir === dir, 'Run directory links are not allowed.');
    const readJson = async name => JSON.parse((await readSource(path.join(dir, name))).toString('utf8'));
    const input = await readJson('input.json'), result = await readJson('result.json'), state = await readJson('state.json');
    fail(!['queued','running','stopping','interrupted'].includes(state.status), 'Run is not terminal.');
    fail(input.id === row.run_id && input.case_id === row.case_id && input.framework_id === row.framework_id && input.service_id === row.service_id, 'Summary/input mismatch.');
    fail(input.evaluation_id === EVALUATION, 'Unrelated run rejected.');
    const events = (await readSource(path.join(dir, 'events.jsonl'))).toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const calls = (await readSource(path.join(dir, 'model-calls.jsonl'))).toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    fail(events.every((e,i) => e.seq === i+1), 'Event sequence gap.');
    fail(JSON.stringify(calls) === JSON.stringify(events.filter(e => e.type.startsWith('model_'))), 'Mirrored model ledger differs.');
    const starts = events.filter(e => e.type === 'model_request_start');
    fail(starts.length === row.requests && starts.length === result.model_usage.requests, 'Model request count differs.');
    for (const request of starts) fail(events.filter(e => e.type === 'model_response' && e.id === request.id).length === 1, 'Request response pairing differs.');
    for (const action of events.filter(e => e.type === 'action_intent')) fail(events.some(e => ['action_return','action_unknown'].includes(e.type) && e.id === action.id), 'Action outcome missing.');
    const assets = events.filter(e => e.type === 'image').map(e => e.asset);
    const base = 'runs/' + row.run_id;
    for (const asset of assets) {
      fail(/^assets\/img_[a-f0-9-]+\.(?:png|jpe?g)$/.test(asset.file), 'Unexpected image reference.');
      const file = path.join(dir, asset.file);
      fail(await realpath(file) === file, 'Asset links rejected.');
      const bytes = await readSource(file); fail(sha(bytes) === asset.sha256, 'Source screenshot hash differs.');
      await put(base + '/' + asset.file, bytes);
    }
    for (const match of JSON.stringify(starts).matchAll(/asset:([^"#]+)#sha256=([a-f0-9]{64})/g)) fail(assets.some(a => a.file === match[1] && a.sha256 === match[2]), 'Submitted model image reference missing.');
    for (const name of ['environment.json','source-versions.json','start-check.json','review.json']) await putJson(base + '/' + name, await readJson(name));
    for (const [name,value] of [['input.json',input],['result.json',result],['state.json',state]]) await putJson(base + '/' + name, value);
    const cleanEvents = events.map(e => cleanArchiveValue(e, counts));
    await put(base + '/events.jsonl', cleanEvents.map(e => JSON.stringify(e)).join('\n') + '\n');
    await put(base + '/model-calls.jsonl', cleanEvents.filter(e => e.type.startsWith('model_')).map(e => JSON.stringify(e)).join('\n') + '\n');
    const cleanInput = cleanArchiveValue(input, {});
    cases.set(input.case_id, cleanInput.task ?? {id:input.case_id,instruction:cleanInput.instruction,acceptance:cleanInput.acceptance});
    const body = cleanEvents.map(e => `<details><summary>#${e.seq} ${html(e.type)} ${html(e.name ?? e.id ?? '')}</summary>${e.type === 'image' ? `<a href="${html(e.asset.file)}"><img loading="lazy" src="${html(e.asset.file)}" alt="${html(e.asset.role)}"></a>` : ''}<pre>${html(JSON.stringify(e,null,2))}</pre></details>`).join('\n');
    await put(base + '/index.html', style + `<title>${html(input.name)}</title><p><a href="../../index.html">返回36项矩阵</a></p><h1>${html(input.name)}</h1><p>${html(row.framework_id)} / ${html(row.model)} · ${html(row.verdict)} · 用户复核：${html(row.user_review)}</p><pre>${html(cleanInput.instruction)}</pre><p>历史真实轨迹。结构化字段已清洗，截图与自然语言原文仍需公开审阅。此页面不执行任何设备或模型操作。</p><h2>逐步轨迹（${events.length}事件，${assets.length}图）</h2>${body}`);
    records.push({run_id:row.run_id,case_id:row.case_id,events:events.length,images:assets.length,requests:starts.length,verdict:row.verdict});
    images += assets.length; eventsCount += events.length; requests += starts.length;
  }
  fail(images === 1486 && requests === 331, 'Frozen evaluation totals differ.');
  for (const name of ['docs/V04_FRAMEWORK_TEST_CASES.md','docs/V04_GUI_EVALUATION_CASES.md','docs/PHONE_EVALUATION_RESULTS_20261022.md','docs/PHONE_EVALUATION_ANALYSIS_20261022.md','docs/PHONE_FAILURE_DIAGNOSIS_20261022.md','docs/reference/PHONE_HOME_EVALUATION_CASES_20261022.json','docs/reference/GUI_EVALUATION_CASES_20261021.json','docs/evidence/20261022-phone-evaluation/record-audit.json']) {
    await put('definitions/' + name, await readSource(path.join(sourceRoot,name)));
  }
  // Keep the v0.4 tests from the exporter checkout, not newer development tests.
  const releaseRoot = fileURLToPath(new URL('../',import.meta.url));
  for (const name of (await readdir(path.join(releaseRoot,'tests'))).filter(n => n.endsWith('.test.mjs') && n !== 'release-archive.test.mjs')) await put('definitions/engineering-tests/' + name, await readFile(path.join(releaseRoot,'tests',name)));
  await put('definitions/README.txt', 'Historical definitions and engineering test source. Run tests from a complete matching source/Windows package using node --test tests/*.test.mjs; this standalone archive is read-only evidence, not a separate runnable test harness. The four real GUI tasks, 31 comparison definitions, and engineering tests are different sets and must not be added together as a pass count.\n');
  for (const file of sourceChecks) fail(sha(await readFile(file.file)) === file.sha256, 'Source changed during export.');
  await putJson('summary.json', summary);
  await putJson('cases.json', [...cases.values()]);
  const table = summary.rows.map(r => `<tr><td>${html(r.case_id)}</td><td>${html(r.framework_id)}</td><td>${html(r.model)}</td><td>${html(r.verdict)}</td><td>${r.requests}</td><td><a href="runs/${r.run_id}/index.html">查看轨迹</a></td></tr>`).join('\n');
  await put('index.html', style + '<title>v0.4历史测试档案</title><h1>v0.4历史测试档案</h1><p>2026-10-22 · 四题 × 三框架 × 三模型 · 36项：16通过／10部分完成／10未通过。用户复核待定。旧协议历史成绩，不是preview.10收尾保护的真机复测。</p><p>本地待公开审阅副本。只读查看，不会调用模型或设备。<a href="cases.json">用例JSON</a> · <a href="summary.json">完整结果</a> · <a href="manifest.json">档案清单</a> · <a href="privacy-review.json">公开审阅状态</a></p><table><thead><tr><th>任务</th><th>框架</th><th>模型</th><th>判定</th><th>请求</th><th>轨迹</th></tr></thead><tbody>' + table + '</tbody></table>');
  const manifest = {format:1,version:'0.4.0-preview.10',evaluation_id:EVALUATION,runs:records.length,cases:cases.size,images,events:eventsCount,requests,verdicts:summary.totals.verdicts,source_unchanged:true,source_files_checked:sourceChecks.length,structure_verified:true,records,real_model_requests_during_export:0,real_device_commands_during_export:0};
  await putJson('manifest.json', manifest);
  await putJson('privacy-review.json', {public_upload_approved:false,review_state:'pending_screenshot_and_natural_language_review',structured_cleaning:counts,images:'byte-identical historical evidence; not newly anonymized',omitted:['model settings and credentials database','unrelated runs and task library','raw UI layout files','SDK debug/cache files','unreferenced captures','all saved startpoint library files'],note:'Structured cleaning is not a claim that all screenshot/text personal information has been removed. Review before any public upload.'});
  await writeFile(path.join(target, 'files.sha256.json'), JSON.stringify(files, null, 2) + '\n', {flag:'wx'});
  return {...manifest,files:files.length+1,out:target};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const {values} = parseArgs({options:{source:{type:'string',default:fileURLToPath(new URL('../',import.meta.url))},out:{type:'string'}}});
  fail(values.out, '--out is required; source is read-only.');
  exportV04Archive(values).then(result => console.log(JSON.stringify(result))).catch(error => {console.error(error.message);process.exitCode=1;});
}
