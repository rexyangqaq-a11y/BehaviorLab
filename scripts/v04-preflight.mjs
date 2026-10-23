import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findHdc, parseHdcTargets } from '../src/hdc-environment.mjs';
export { findHdc } from '../src/hdc-environment.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);
const sha256 = value => createHash('sha256').update(value).digest('hex');

// Inspect configuration without ModelSettings' schema/initialization writes.
// The API-key column is never selected and no credentials leave SQLite.
export function inspectModelConfiguration(dataRoot) {
  const file = path.join(dataRoot, '.model-services.sqlite');
  if (!existsSync(file)) return { status: 'not_found', revision: null, services: [], bindings: null };
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const row = db.prepare('SELECT revision,document FROM model_settings WHERE id=1').get();
    if (!row) throw new Error('Missing document');
    const document = JSON.parse(row.document);
    const credentialIds = new Set(db.prepare('SELECT service_id FROM model_credentials').all().map(item => item.service_id));
    return { status: 'read_only', revision: row.revision,
      services: document.services.map(service => ({ id: service.id, model: service.model, protocol: service.protocol,
        endpoint_host: new URL(service.base_url).hostname, has_api_key: credentialIds.has(service.id),
        image_protocol_verified: false })),
      bindings: Object.fromEntries(['persona', 'planner', 'gui', 'describer'].map(role => [role, document.bindings[role] ?? null])) };
  } catch {
    return { status: 'inspection_failed', revision: null, services: [], bindings: null };
  } finally { db?.close(); }
}

/** No SDK import, model/network request, phone shell command or GUI action. */
export async function collectPreflight({ dataRoot = path.join(project, '.data'), hdcPath, env = process.env,
  localConfigPath = path.join(project, '.runtime/device-tools.json'),
  trialPlanPath = path.join(project, 'docs/reference/V04_MINIMAL_REAL_VALIDATION_20261021.json'),
  run = exec } = {}) {
  const started = Date.now();
  const report = { schema_version: 1, kind: 'real_gui_preflight', checked_at: new Date().toISOString(),
    final_framework: null, trial_framework: null, framework_loop_executed: false,
    host: { node: process.version, platform: process.platform, arch: process.arch, os_release: (await import('node:os')).release() },
    sdk: { package: '@midscene/harmony', manifest_version: null, installed_version: null, status: 'not_installed' },
    hdc: { status: 'not_found', version: null, target_count: null, target_hashes: [], commands: [] },
    device: { model: null, os_build: null, app_versions: null, screenshot_verified: false },
    model_configuration: inspectModelConfiguration(dataRoot),
    activity_attempts: 0, gui_actions: 0, screenshots: 0,
    model_usage: { requests: 0, retries: 0, input_tokens: 0, output_tokens: 0, reason: 'No model request code is invoked by this preflight.' },
    gui_result: { status: 'not_executed', passed: false, assessment: null }, blockers: [] };
  // This is diagnostic metadata only; it does not select/import a runtime.
  // Recommendation alone never becomes confirmation or a final selection.
  try {
    const plan = JSON.parse(await readFile(trialPlanPath, 'utf8'));
    if (plan.trial_confirmation?.status === 'user_confirmed' && ['midscene', 'mobiagent', 'autoglm'].includes(plan.trial_framework)) {
      report.trial_framework = plan.trial_framework;
      report.trial_confirmation = { ...plan.trial_confirmation };
    }
  } catch { /* Unknown remains unconfirmed; no fallback framework. */ }
  try {
    const manifest = JSON.parse(await readFile(path.join(project, 'integrations/midscene/package.json'), 'utf8'));
    report.sdk.manifest_version = manifest.dependencies['@midscene/harmony'];
    const installed = JSON.parse(await readFile(path.join(project, 'integrations/midscene/node_modules/@midscene/harmony/package.json'), 'utf8'));
    report.sdk.installed_version = installed.version;
    report.sdk.status = installed.version === report.sdk.manifest_version ? 'installed_version_matches' : 'version_mismatch';
  } catch { /* Optional SDK is not a core dependency. */ }
  const binary = findHdc({ explicitPath: hdcPath, env, localConfigPath });
  if (binary) {
    // Only executable + argv; never construct a shell command from a supplied path.
    const command = async args => {
      const begin = Date.now();
      const entry = { args, status: 'started', duration_ms: null };
      report.hdc.commands.push(entry);
      try {
        const result = await run(binary, args, { windowsHide: true, timeout: 8000, maxBuffer: 32768, shell: false });
        entry.status = 'returned';
        return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
      } catch {
        entry.status = 'failed_or_timed_out';
        return null; // No raw errors, device identifiers, environment, or retry.
      } finally { entry.duration_ms = Date.now() - begin; }
    };
    const version = await command(['-v']);
    report.hdc.version = version ? (`${version.stdout}\n${version.stderr}`.match(/\bVer:\s*([\w.-]+)/i)?.[1] ?? null) : null;
    const listing = await command(['list', 'targets']);
    if (listing === null) report.hdc.status = 'list_failed';
    else {
      const parsed = parseHdcTargets(listing.stdout, listing.stderr);
      if (parsed.status === 'unverified') report.hdc.status = 'list_unverified';
      else {
        report.hdc.target_count = parsed.targets.length;
        report.hdc.target_hashes = parsed.targets.map(sha256);
        report.hdc.status = parsed.targets.length === 0 ? 'no_targets' : parsed.targets.length === 1 ? 'one_target_listed' : 'multiple_targets_listed';
      }
    }
  }
  if (!report.trial_framework) report.blockers.push({ id: 'trial_choice', owner: 'user', detail: '首测候选尚未确认；推荐不等于最终选型。' });
  if (report.hdc.status !== 'one_target_listed') report.blockers.push({ id: 'device_connection', owner: 'environment', detail: '需要可用的 HDC 与明确的一台已授权调试设备。列设备仍不证明 GUI 兼容。' });
  report.blockers.push(
    { id: 'device_baseline', owner: 'implementation', detail: '需采集型号/系统构建、实际起始页、截图/尺寸并核对；此脚本不发送设备 shell 命令。' },
    { id: 'bounded_runner', owner: 'implementation', detail: '需接通候选循环、图片/动作协议、动作前记录、逐请求用量/限额、停止与独立完成核对。当前网页仍只接受 Mock。' });
  report.duration_ms = Date.now() - started;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { data: { type: 'string' }, hdc: { type: 'string' }, out: { type: 'string' } } });
  const output = path.resolve(values.out ?? `output/v04-preflight-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  // Refuse replacement BEFORE even the read-only HDC probes.
  if (existsSync(output)) throw new Error('Output already exists; preserve historical evidence and use a new path.');
  const report = await collectPreflight({ dataRoot: path.resolve(values.data ?? '.data'), hdcPath: values.hdc });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', flush: true });
  console.log(JSON.stringify({ output, hdc: report.hdc.status, sdk: report.sdk.status, gui_status: report.gui_result.status,
    model_requests: report.model_usage.requests, blockers: report.blockers.map(item => item.id) }));
}
