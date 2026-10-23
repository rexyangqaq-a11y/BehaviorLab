import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { appendFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { findHdc, parseHdcTargets } from '../../src/hdc-environment.mjs';
import { imageDimensions } from '../../scripts/hdc-device-baseline.mjs';
import { instrumentGuiDevice } from '../../src/gui-device-journal.mjs';
import { createTrialTransport } from '../../src/gui-trial-transport.mjs';
import { reconcileScreenshotSize } from '../../src/gui-screenshot-coordinates.mjs';
import { createRepeatedActionGuard } from '../../src/gui-trial-action-limits.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const run = promisify(execFile);
const { values } = parseArgs({ options: { out: { type: 'string' }, prepare: { type: 'boolean' }, run: { type: 'boolean' } } });
if (!values.out || Boolean(values.prepare) === Boolean(values.run)) throw new Error('Specify --out and exactly one of --prepare / --run');
const output = path.resolve(values.out);
if (!output.startsWith(path.join(project, 'output') + path.sep)) throw new Error('Evidence must remain under project output');
if (values.prepare) { await mkdir(path.dirname(output), { recursive: true }); await mkdir(output); await mkdir(path.join(output, 'screenshots')); }
else if (!existsSync(path.join(output, 'prepared.json')) || existsSync(path.join(output, 'run-start.json'))) throw new Error('Prepared evidence required; resuming/repeating an attempt is disabled');

process.env.MIDSCENE_RUN_DIR = path.join(output, 'sdk-local');
process.env.MIDSCENE_LANGSMITH_DEBUG = 'false';
process.env.MIDSCENE_LANGFUSE_DEBUG = 'false';
process.env.MIDSCENE_RECORD_MODEL_CALL = 'false';
process.env.DEBUG = '';
const { HarmonyDevice, HarmonyAgent } = await import('@midscene/harmony');
const planFile = path.join(project, 'docs/reference/V04_MINIMAL_REAL_VALIDATION_20261021.json');
const plan = JSON.parse(await readFile(planFile, 'utf8')), task = plan.tasks.find(value => value.id === 'HM-SYS-001');
if (plan.trial_framework !== 'midscene' || plan.trial_confirmation?.status !== 'user_confirmed') throw new Error('Trial framework is not confirmed');
const executable = findHdc({ localConfigPath: path.join(project, '.runtime/device-tools.json') });
if (!executable) throw new Error('HDC unavailable');
let target, imageSequence = 0, eventSequence = 0, actionCount = 0, physicalActions = 0, activeAction = null;
let phase = values.prepare ? 'operator_preparation' : 'pre_run', apiKey = '', trialStarted = null, agent, timer;
const control = new AbortController(), images = [];
const scrub = value => {
  const text = JSON.stringify(value);
  return JSON.parse((apiKey ? text.split(apiKey).join('[redacted]') : text).split(target || '\u0000').join('[target]'));
};
const record = event => {
  const entry = scrub({ seq: ++eventSequence, at: new Date().toISOString(), elapsed_ms: trialStarted ? Date.now() - trialStarted : null, phase, ...event });
  appendFileSync(path.join(output, 'events.jsonl'), JSON.stringify(entry) + '\n', { flush: true });
  if (event.type?.startsWith('model_')) appendFileSync(path.join(output, 'model-calls.jsonl'), JSON.stringify(entry) + '\n', { flush: true });
};
const save = async (file, value) => writeFile(path.join(output, file), JSON.stringify(scrub(value), null, 2), { flag: 'wx', flush: true });
const saveImage = async (bytes, mime, role) => {
  const dimensions = imageDimensions(bytes), id = ++imageSequence;
  const file = `screenshots/${values.prepare ? 'prep' : 'run'}-${String(id).padStart(3, '0')}-${role}.${dimensions.format === 'jpeg' ? 'jpeg' : 'png'}`;
  await writeFile(path.join(output, file), bytes, { flag: 'wx', flush: true });
  const asset = { file, sha256: hash(bytes), bytes: bytes.length, ...dimensions, captured_at: new Date().toISOString(), phase, action_id: activeAction, role };
  images.push(asset); record({ type: 'image', asset }); return asset;
};
const command = async (args, selected = target) => {
  if (control.signal.aborted && phase !== 'final_observation') throw new Error('Trial deadline/stopped');
  const shell = args[0] === 'shell' ? args.slice(1).join(' ') : '';
  if (phase === 'agent' && shell && !/^(snapshot_display -f \/data\/local\/tmp\/[\w.-]+\.jpeg|hidumper -s RenderService -a screen|uitest uiInput (click \d+ \d+|fling \d+ \d+ \d+ \d+ \d+|keyEvent Back))$/.test(shell)) throw new Error('HDC command outside trial allowlist');
  if (/^uitest uiInput /.test(shell)) {
    if (phase === 'agent' && !activeAction) throw new Error('Physical action has no durable SDK intent');
    if (phase === 'agent' && physicalActions >= 6) throw new Error('Physical action budget exhausted');
    if (phase === 'agent') physicalActions++;
  }
  const id = `hdc_${eventSequence + 1}`, started = Date.now(); record({ type: 'hdc_intent', id, args, target_sha256: selected ? hash(selected) : null });
  try {
    const response = await run(executable, [...(selected ? ['-t', selected] : []), ...args], {
      shell: false, windowsHide: true, timeout: 10000, maxBuffer: 2 * 1024 * 1024,
      ...(phase === 'agent' ? { signal: control.signal } : {}) });
    if (/\[Fail\]|\bfailed\b|error:|Invalid parameters|Please confirm that the coordinate values are correct/i.test(response.stdout + response.stderr)) throw new Error('HDC returned a failure marker');
    record({ type: 'hdc_return', id, duration_ms: Date.now() - started, stdout: response.stdout, stderr: response.stderr });
    return response.stdout;
  } catch (error) {
    record({ type: 'hdc_unknown_or_failed', id, duration_ms: Date.now() - started, error: String(error.message) });
    throw new Error('HDC failed; effect may be unknown; no replay', { cause: error });
  }
};
const listing = parseHdcTargets(await command(['list', 'targets'], null));
if (listing.targets.length !== 1) throw new Error('Exactly one target required');
target = listing.targets[0];
const device = new HarmonyDevice(target, { hdcPath: executable });
record({ type: 'sdk_connect_start', target_sha256: hash(target) });
const hdc = await device.connect();
record({ type: 'sdk_connect_return', render_size: await device.size() });
// Keep the SDK's command construction and device actions; replace only physical
// process transport, so timeouts with partial stdout cannot be treated as success.
hdc.exec = (...args) => command(args);
const screenshot = device.screenshotBase64.bind(device);
let latestDimensions;
device.screenshotBase64 = async () => {
  const data = await screenshot(), bytes = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  latestDimensions = imageDimensions(bytes);
  const sdkSize = await device.size();
  const mapping = reconcileScreenshotSize(device, latestDimensions, sdkSize);
  if (mapping.corrected) record({ type: 'coordinate_basis_corrected', ...mapping, reason: 'HDC width:/height: output is not matched by SDK 1.16.0 width/height regex' });
  return data;
};
device.describe = () => 'Local HarmonyOS device, screenshot pixel coordinates; no browser or external apps.';
const capture = async role => {
  const data = await device.screenshotBase64();
  return saveImage(Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'), 'image/jpeg', role);
};

if (values.prepare) {
  const baseline = JSON.parse(await readFile(path.join(project, 'output/device_validation_20261021/baseline-connected/result.json'), 'utf8'));
  if (baseline.environment.target_sha256 !== hash(target)) throw new Error('Device changed from reviewed baseline');
  const files = ['integrations/midscene/real-trial.mjs', 'src/gui-trial-transport.mjs', 'src/gui-screenshot-coordinates.mjs', 'src/gui-device-journal.mjs', 'scripts/hdc-device-baseline.mjs', 'integrations/midscene/pnpm-lock.yaml'];
  const sources = Object.fromEntries(await Promise.all(files.map(async file => [file, hash(await readFile(path.join(project, file)))])));
  const pkg = JSON.parse(await readFile(new URL('./node_modules/@midscene/harmony/package.json', import.meta.url), 'utf8'));
  const environment = { ...baseline.environment, host: { node: process.version, platform: process.platform, arch: process.arch, release: os.release() },
    sdk: { package: pkg.name, version: pkg.version }, source_revision: (await run('git', ['rev-parse', 'HEAD'], { cwd: project })).stdout.trim(),
    source_status: (await run('git', ['status', '--short'], { cwd: project })).stdout, source_sha256: sources,
    prompt_parser: 'Unmodified Midscene 1.16.0 qwen3 adapter, full actual prompts/responses in model-calls.jsonl',
    coordinate_policy: 'Reconcile native SDK dimensions against decoded screenshot, allowing a rotation only; adapter compensates width:/height: parsing gap. Shrink factor 2; SDK maps resized coordinates back. Physical input mapping needs observed navigation.',
    screen: null, cloud_test_platform_used: false };
  await save('input.json', { schema_version: 1, kind: 'real_gui_trial', task, trial_framework: 'midscene', final_framework: null,
    service: 'aliyun_qwen3_7_plus', model: 'qwen3.7-plus', model_family: 'qwen3', model_bindings_changed: false,
    user_service_decision: { date: '2026-10-21', explicit_token_plan_for_this_trial: true, provider_approval: 'not_claimed', batch_authorized: false },
    enforced_limits: { attempts: 1, requests: 4, sdk_actions: 6, physical_actions: 6, output_tokens_per_request: 512,
      elapsed_seconds: 180, serialized_payload_bytes: 2097152, text_chars: 60000, images_per_request: 2, automatic_retries: 0, thinking: false, archive_describer_requests: 0 },
    preparation: 'Operator uses the SDK to open Settings only; preparation is excluded from Agent navigation success.' });
  record({ type: 'operator_preparation_intent', operation: 'Launch Settings', counted_as_agent_action: false });
  await device.launch('com.huawei.hmos.settings');
  record({ type: 'operator_preparation_return', operation: 'Launch Settings' });
  await new Promise(resolve => setTimeout(resolve, 1200));
  const initial = await capture('initial-settings'); environment.screen = initial;
  await save('environment.json', environment);
  await save('prepared.json', { at: new Date().toISOString(), target_sha256: hash(target), initial, model_requests: 0, agent_actions: 0, visual_review: 'required' });
  console.log(JSON.stringify({ status: 'prepared_pending_visual_review', output, initial }));
} else {
  const prepared = JSON.parse(await readFile(path.join(output, 'prepared.json'), 'utf8'));
  const review = JSON.parse(await readFile(path.join(output, 'initial-review.json'), 'utf8'));
  if (prepared.target_sha256 !== hash(target) || review.settings_home_visible !== true || review.safe_to_start !== true) throw new Error('Initial device/review requirements unmet');
  if (Date.now() - Date.parse(review.at) > 15 * 60 * 1000) throw new Error('Initial review expired');
  let db, service, revision;
  try {
    db = new DatabaseSync(path.join(project, '.data/.model-services.sqlite'), { readOnly: true });
    const row = db.prepare('SELECT revision,document FROM model_settings WHERE id=1').get(); revision = row.revision;
    service = JSON.parse(row.document).services.find(value => value.id === 'aliyun_qwen3_7_plus');
    apiKey = db.prepare('SELECT api_key FROM model_credentials WHERE service_id=?').get(service.id)?.api_key;
  } finally { db?.close(); }
  if (!apiKey || service.model !== 'qwen3.7-plus' || service.base_url !== 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1') throw new Error('Selected service differs from reviewed configuration');
  const transport = createTrialTransport({ baseUrl: service.base_url, model: service.model, apiKey, signal: control.signal, record, saveImage });
  const allowed = new Set(['Tap', 'Scroll', 'HarmonyBackButton']);
  const checkRepeatedAction = createRepeatedActionGuard();
  const nativeActions = device.actionSpace.bind(device);
  device.actionSpace = () => nativeActions().filter(action => allowed.has(action.name));
  instrumentGuiDevice(device, {
    capture: data => saveImage(Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'), 'image/jpeg', 'sdk-observation'),
    intent: async action => {
      if (control.signal.aborted || actionCount >= 6) throw new Error('Action/time limit reached');
      try { checkRepeatedAction(action); }
      catch (error) { record({ type: 'action_blocked', action, reason: error.message, physical_input_sent: false }); throw error; }
      if (action.name === 'Scroll' && action.param?.scrollType && action.param.scrollType !== 'singleAction') throw new Error('Repeated scroll modes disabled');
      // Fixed first-task safety region, reviewed on the real initial image.
      // Only the left-hand device/About navigation card can receive a tap;
      // right-hand Bluetooth/NearLink toggles cannot be touched.
      if (action.name === 'Tap') {
        const point = action.param?.locate?.center, bounds = review.tap_navigation_bounds;
        if (!point || !bounds || point[0] < bounds.x_min || point[0] > bounds.x_max || point[1] < bounds.y_min || point[1] > bounds.y_max) throw new Error('Tap is outside reviewed About navigation region');
      }
      const id = `action_${++actionCount}`; await capture('before-action'); activeAction = id;
      record({ type: 'action_intent', id, action }); return id;
    },
    outcome: async (id, outcome) => {
      record({ type: 'action_outcome', id, outcome });
      await new Promise(resolve => setTimeout(resolve, 600));
      await capture('after-action'); activeAction = null;
      if (outcome.status !== 'returned') control.abort('Unknown action effect');
    },
  });
  const result = { schema_version: 1, task_id: task.id, framework: 'midscene', final_framework: null, state: 'running', business_result: 'pending_independent_review', sdk_return: null };
  await save('run-start.json', { at: new Date().toISOString(), revision, target_sha256: hash(target), final_framework: null });
  await save('run-source.json', { runner_sha256: hash(await readFile(fileURLToPath(import.meta.url))),
    transport_sha256: hash(await readFile(path.join(project, 'src/gui-trial-transport.mjs'))),
    journal_sha256: hash(await readFile(path.join(project, 'src/gui-device-journal.mjs'))),
    coordinate_adapter_sha256: hash(await readFile(path.join(project, 'src/gui-screenshot-coordinates.mjs'))), initial_review: review });
  const initial = await capture('run-initial');
  trialStarted = Date.now(); phase = 'agent';
  timer = setTimeout(() => control.abort('180-second trial deadline'), 180000);
  record({ type: 'agent_start', task_id: task.id, initial });
  try {
    agent = new HarmonyAgent(device, { generateReport: false, persistExecutionDump: false, autoPrintReportMsg: false,
      cache: false, replanningCycleLimit: 4, waitAfterAction: 500, screenshotShrinkFactor: 2,
      modelConfig: { MIDSCENE_MODEL_NAME: service.model, MIDSCENE_MODEL_API_KEY: apiKey, MIDSCENE_MODEL_BASE_URL: service.base_url,
        MIDSCENE_MODEL_FAMILY: 'qwen3', MIDSCENE_MODEL_STREAM_MODE: 'non-stream', MIDSCENE_MODEL_RETRY_COUNT: 0,
        MIDSCENE_MODEL_TIMEOUT: 30000, MIDSCENE_MODEL_REASONING_ENABLED: 'false',
        MIDSCENE_MODEL_EXTRA_BODY_JSON: JSON.stringify({ max_tokens: 512, enable_thinking: false }) },
      createOpenAIClient: async client => client.withOptions({ maxRetries: 0, timeout: 30000, fetch: transport.fetch, logLevel: 'off' }),
      onLLMUsage: usage => record({ type: 'sdk_usage', usage }),
      aiContexts: { aiAct: '仅允许在系统设置内点击导航项、单次滚动和返回。禁止改变开关、输入文字、打开其他应用或运行命令。遇到账号、授权、安装或支付页面立即结束并说明。不得把隐藏字段或推测当作页面可见结果。' } });
    result.sdk_return = await agent.aiAct(task.instruction, { deepThink: false, abortSignal: control.signal });
    result.state = 'sdk_returned_pending_review';
    record({ type: 'agent_return', value: result.sdk_return });
  } catch (error) {
    result.state = 'stopped_pending_review'; result.stop_reason = String(error.message);
    record({ type: 'agent_stopped', error: result.stop_reason, effect_unknown: error.effect_unknown ?? false });
  } finally {
    clearTimeout(timer); result.task_duration_ms = Date.now() - trialStarted;
    phase = 'final_observation';
    try { result.final_image = await capture('final'); } catch (error) { result.final_observation_error = String(error.message); }
    result.finished_at = new Date().toISOString(); result.agent_actions = actionCount; result.physical_actions = physicalActions;
    result.model_usage = transport.summary(); result.images = images;
    result.user_review = 'pending'; result.run_duration_including_final_observation_ms = Date.now() - trialStarted;
    await save('result.json', result);
    await save('assets.json', images);
    // Cleanup cannot launch another task or call a model.
    try { await agent?.destroy(); } catch { /* evidence already written */ }
    console.log(JSON.stringify({ output, state: result.state, business_result: result.business_result, actions: result.agent_actions,
      physical_actions: result.physical_actions, model_usage: result.model_usage, duration_ms: result.task_duration_ms,
      final_image: result.final_image?.file, stop_reason: result.stop_reason ?? null }));
  }
}
