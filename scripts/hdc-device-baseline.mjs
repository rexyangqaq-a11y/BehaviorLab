import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findHdc, parseHdcTargets } from '../src/hdc-environment.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function imageDimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) throw new Error('Unsupported screenshot image');
  let p = 2;
  while (p + 4 <= bytes.length) {
    if (bytes[p++] !== 0xff) throw new Error('Invalid JPEG marker');
    while (bytes[p] === 0xff) p++;
    const marker = bytes[p++];
    if ([0xda, 0xd9].includes(marker)) break;
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const length = bytes.readUInt16BE(p);
    if (length < 2 || p + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
      return { format: 'jpeg', height: bytes.readUInt16BE(p + 3), width: bytes.readUInt16BE(p + 5) };
    }
    p += length;
  }
  throw new Error('No readable JPEG dimensions');
}

/** Read-only metadata and one current screenshot; no UI navigation or model. */
export async function collectDeviceBaseline({ output, hdcPath, runCommand = run } = {}) {
  const executable = findHdc({ explicitPath: hdcPath, localConfigPath: path.join(project, '.runtime/device-tools.json') });
  if (!executable) throw new Error('HDC is not configured');
  output = path.resolve(output);
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output); // Unique evidence directory: never resume/overwrite.
  const started = Date.now(), input = { schema_version: 1, kind: 'device_baseline_not_agent_attempt',
    started_at: new Date().toISOString(), scope: 'Device version and Settings metadata; one current image. No navigation, input, setting change or model request.' };
  await writeFile(path.join(output, 'input.json'), JSON.stringify(input, null, 2), { flag: 'wx', flush: true });
  let sequence = 0, device = null;
  const result = { ...input, status: 'running', environment: { node: process.version, hdc_version: null, device: {}, settings_app: null },
    asset: null, model_requests: 0, phone_gui_actions: 0, agent_attempts: 0, gui_result: 'not_executed', unknown_fields: [] };
  const command = async (label, args, target = device) => {
    const started = Date.now(), entry = { seq: ++sequence, label, args, target_sha256: target ? hash(target) : null, started_at: new Date().toISOString() };
    await appendFile(path.join(output, 'events.jsonl'), JSON.stringify({ ...entry, status: 'before_send' }) + '\n', { flush: true });
    let outcome;
    try {
      const value = await runCommand(executable, target ? ['-t', target, ...args] : args,
        { windowsHide: true, shell: false, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
      outcome = { ...entry, status: 'returned', stdout: value.stdout ?? '', stderr: value.stderr ?? '' };
    } catch (error) {
      outcome = { ...entry, status: 'failed_or_unknown', stdout: error.stdout ?? '', stderr: error.stderr ?? '', exit_code: error.code ?? null };
    }
    outcome.duration_ms = Date.now() - started;
    await appendFile(path.join(output, 'events.jsonl'), JSON.stringify(outcome) + '\n', { flush: true });
    return outcome;
  };
  try {
    const listing = await command('list_targets_before', ['list', 'targets'], null);
    const parsed = parseHdcTargets(listing.stdout, listing.stderr);
    if (listing.status !== 'returned' || parsed.targets.length !== 1) throw new Error('Exactly one verified HDC target required');
    device = parsed.targets[0];
    result.environment.target_sha256 = hash(device);
    const version = await command('hdc_version', ['-v'], null);
    result.environment.hdc_version = `${version.stdout}\n${version.stderr}`.match(/\bVer:\s*([\w.-]+)/i)?.[1] ?? null;
    for (const [field, key] of [['model', 'const.product.model'], ['os_fullname', 'const.ohos.fullname'],
      ['software_version', 'const.product.software.version'], ['api_version', 'const.ohos.apiversion']]) {
      const value = await command(`read_${field}`, ['shell', 'param', 'get', key]);
      result.environment.device[field] = value.status === 'returned' && !/\[Fail\]|error:|not found/i.test(value.stdout + value.stderr) ? value.stdout.trim() || null : null;
      if (!result.environment.device[field]) result.unknown_fields.push(field);
    }
    const app = await command('settings_bundle', ['shell', 'bm', 'dump', '-n', 'com.huawei.hmos.settings']);
    await writeFile(path.join(output, 'settings-bundle-raw.txt'), app.stdout, { flag: 'wx' });
    try {
      const bundle = JSON.parse(app.stdout.replace(/^[\s\S]*?(?=\{)/, ''));
      result.environment.settings_app = { bundle_name: bundle.name ?? bundle.bundleName ?? 'com.huawei.hmos.settings',
        version_name: bundle.versionName ?? null, version_code: bundle.versionCode ?? null };
    } catch { result.unknown_fields.push('settings_app_version'); }
    const screen = await command('screen_geometry', ['shell', 'hidumper', '-s', 'RenderService', '-a', 'screen']);
    await writeFile(path.join(output, 'screen-geometry-raw.txt'), screen.stdout, { flag: 'wx' });
    result.environment.screen_geometry_status = screen.status;
    result.environment.rotation = null;
    result.unknown_fields.push('rotation_not_yet_interpreted');
    const remote = `/data/local/tmp/behaviorlab-baseline-${randomUUID()}.jpeg`;
    result.remote_screenshot_retained = remote;
    const snapshot = await command('capture_current_screen', ['shell', 'snapshot_display', '-f', remote]);
    if (snapshot.status !== 'returned' || /\[Fail\]|failed|error:/i.test(snapshot.stdout + snapshot.stderr)) throw new Error('Screenshot command did not return verified success');
    const local = path.join(output, 'initial.jpeg');
    const transfer = await command('receive_current_screen', ['file', 'recv', remote, local]);
    if (transfer.status !== 'returned') throw new Error('Screenshot transfer failed');
    const bytes = await readFile(local), dimensions = imageDimensions(bytes);
    result.asset = { file: 'initial.jpeg', bytes: bytes.length, sha256: hash(bytes), ...dimensions,
      phase: 'baseline_observation', captured_at: snapshot.started_at, visual_inspection: 'pending' };
    const after = await command('list_targets_after', ['list', 'targets'], null);
    const stable = parseHdcTargets(after.stdout, after.stderr);
    result.device_stable_across_baseline = after.status === 'returned' && stable.targets.length === 1 && stable.targets[0] === device;
    result.status = result.device_stable_across_baseline ? 'captured_pending_visual_review' : 'partial_device_changed_after_capture';
  } catch (error) {
    result.status = 'blocked';
    result.reason = error.message;
  } finally {
    result.finished_at = new Date().toISOString();
    result.duration_ms = Date.now() - started;
    result.hdc_commands = sequence;
    await writeFile(path.join(output, 'environment.json'), JSON.stringify(result.environment, null, 2), { flag: 'wx', flush: true });
    await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx', flush: true });
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { out: { type: 'string' }, hdc: { type: 'string' } } });
  const output = values.out ?? `output/device-baseline-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const result = await collectDeviceBaseline({ output, hdcPath: values.hdc });
  console.log(JSON.stringify({ output: path.resolve(output), status: result.status, environment: result.environment,
    asset: result.asset, model_requests: 0, phone_gui_actions: 0, duration_ms: result.duration_ms, reason: result.reason ?? null }));
  if (result.status === 'blocked') process.exitCode = 1;
}
