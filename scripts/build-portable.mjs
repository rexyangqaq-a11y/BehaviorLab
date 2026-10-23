import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import {packagePhoneRuntime} from './package-phone-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async file => { try { await realpath(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const active = ['queued', 'running', 'stopping'];

function verifyDatabase(db, label) {
  requireThat(db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', `Database integrity check failed: ${label}`);
  requireThat(db.prepare('PRAGMA foreign_key_check').all().length === 0, `Foreign key check failed: ${label}`);
}

export async function buildPortable({ out, runtime, license, checksums, clean = false, phone = false }) {
  const target = path.resolve(out);
  requireThat(!await exists(target), 'Output already exists; choose a new directory.');
  requireThat(!path.relative(root, target).startsWith(`.data${path.sep}`) && target !== path.join(root, '.data'), 'Output cannot be inside source data.');
  const executable = path.resolve(runtime);
  const version = JSON.parse(execFileSync(executable, ['-p', 'JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})'], { encoding: 'utf8', windowsHide: true }));
  requireThat(version.version === 'v24.19.0' && version.platform === 'win32' && version.arch === 'x64', 'This package recipe requires official Node.js v24.19.0 Windows x64.');
  const nodeBytes = await readFile(executable);
  const nodeHash = digest(nodeBytes);
  const official = await readFile(checksums, 'utf8');
  const expected = official.split(/\r?\n/).find(line => line.trim().endsWith('win-x64/node.exe'))?.trim().split(/\s+/)[0];
  requireThat(expected === nodeHash && nodeHash === '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237', 'Runtime does not match official Node.js checksum.');
  const licenseBytes = await readFile(license);
  requireThat(licenseBytes.length > 100000 && licenseBytes.toString('utf8').startsWith('Node.js is licensed'), 'Complete official Node.js license required.');
  const opened = [];
  const snapshots = [];
  const started = new Date().toISOString();
  let userCount = 0;
  try {
    if (!clean) {
      const source = path.join(root, '.data');
      const add = async (sourceFile, relative, runId) => {
        const db = new DatabaseSync(sourceFile, { readOnly: true });
        opened.push(db);
        verifyDatabase(db, relative);
        const dataVersion = db.prepare('PRAGMA data_version').get().data_version;
        let jobText;
        if (runId) {
          requireThat(db.prepare('SELECT COUNT(*) AS n FROM leases').get().n === 0, `Run ${runId} has a worker lease; stop/recover its task before packaging.`);
          const config = JSON.parse(db.prepare('SELECT config_json FROM runs').get().config_json);
          requireThat(config.mode === 'mock', `Run ${runId} is not a Mock dataset.`);
          const jobFile = path.join(source, runId, 'web-job.json');
          if (await exists(jobFile)) {
            jobText = await readFile(jobFile, 'utf8');
            requireThat(!active.includes(JSON.parse(jobText).status), `Run ${runId} is active; wait for it to pause/finish before packaging.`);
          }
        } else {
          requireThat(db.prepare("SELECT COUNT(*) AS n FROM batches WHERE status='generating'").get().n === 0, 'User generation is active; wait before packaging.');
          userCount = db.prepare('SELECT COUNT(*) AS n FROM profiles').get().n;
        }
        snapshots.push({ db, sourceFile, relative, runId, dataVersion, jobText });
      };
      if (await exists(path.join(source, '.users.sqlite'))) await add(path.join(source, '.users.sqlite'), '.users.sqlite');
      for (const entry of await readdir(source, { withFileTypes: true })) {
        if (entry.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(entry.name) && await exists(path.join(source, entry.name, 'state.sqlite'))) {
          await add(path.join(source, entry.name, 'state.sqlite'), path.join(entry.name, 'state.sqlite'), entry.name);
        }
      }
    }
    await mkdir(target, { recursive: true });
    for (const name of ['src', 'web', 'scripts', 'examples', 'tests', 'docs', 'package.json', 'README.md', 'CONTRIBUTING.md', '00_README.txt', '01_START.cmd', '02_STOP.cmd', '03_CHECK.cmd', 'start-web.cmd']) {
      await cp(path.join(root, name), path.join(target, name), { recursive: true, errorOnExist: true, force: false });
    }
    // Use CRLF for cmd.exe, including when sources were edited with LF.
    for (const name of ['01_START.cmd', '02_STOP.cmd', '03_CHECK.cmd', 'start-web.cmd']) {
      const text = await readFile(path.join(target, name), 'utf8');
      await writeFile(path.join(target, name), text.replace(/\r?\n/g, '\r\n'), 'utf8');
    }
    const guide = await readFile(path.join(target, '00_README.txt'), 'utf8');
    await writeFile(path.join(target, '00_README.txt'), '\ufeff' + guide.replace(/^\ufeff/, '').replace(/\r?\n/g, '\r\n'), 'utf8');
    await mkdir(path.join(target, 'runtime'));
    await writeFile(path.join(target, 'runtime/node.exe'), nodeBytes);
    await writeFile(path.join(target, 'runtime/NODE-LICENSE.txt'), licenseBytes);
    await writeFile(path.join(target, 'runtime/NODE-SHASUMS256.txt'), official);
    await mkdir(path.join(target,'integrations/adapters'),{recursive:true});
    for(const name of ['phone-frameworks.py','phone-frameworks-requirements.txt','adapters','hoscrcpy'])await cp(path.join(root,'integrations',name),path.join(target,'integrations',name),{recursive:true});
    const phoneRuntime=phone?await packagePhoneRuntime(root,target):null;
    await mkdir(path.join(target, '.data'));
    const runs = [];
    for (const snapshot of snapshots) {
      const destination = path.join(target, '.data', snapshot.relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await backup(snapshot.db, destination);
      const copied = new DatabaseSync(destination);
      try {
        verifyDatabase(copied, snapshot.relative);
        if (snapshot.runId) {
          const runRoot = path.dirname(destination);
          const sourceRun = path.dirname(snapshot.sourceFile);
          const screenshots = copied.prepare('SELECT asset_path,sha256 FROM screenshots').all();
          for (const image of screenshots) {
            const asset = path.resolve(sourceRun, image.asset_path);
            const relative = path.relative(sourceRun, asset);
            requireThat(relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative), 'Asset path escapes source run.');
            const resolved = await realpath(asset);
            const resolvedRelative = path.relative(await realpath(sourceRun), resolved);
            requireThat(resolvedRelative !== '' && !resolvedRelative.startsWith('..') && !path.isAbsolute(resolvedRelative), 'Asset link escapes source run.');
            const bytes = await readFile(asset);
            requireThat(digest(bytes) === image.sha256, `Asset checksum failed: ${snapshot.runId}/${image.asset_path}`);
            const assetTarget = path.resolve(runRoot, relative);
            await mkdir(path.dirname(assetTarget), { recursive: true });
            await writeFile(assetTarget, bytes);
          }
          if (snapshot.jobText) await writeFile(path.join(runRoot, 'web-job.json'), snapshot.jobText);
          runs.push({ id: snapshot.runId, results: copied.prepare('SELECT COUNT(*) AS n FROM results').get().n, screenshots: screenshots.length });
        }
        copied.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        copied.exec('PRAGMA journal_mode=DELETE');
      } finally { copied.close(); }
    }
    // Refuse a package if source progress changed at any point while taking its snapshot.
    for (const snapshot of snapshots) {
      requireThat(snapshot.db.prepare('PRAGMA data_version').get().data_version === snapshot.dataVersion, 'Source data changed during packaging; retry while tasks are paused.');
      if (snapshot.runId) {
        const job = path.join(path.dirname(snapshot.sourceFile), 'web-job.json');
        const current = await exists(job) ? await readFile(job, 'utf8') : undefined;
        requireThat(current === snapshot.jobText, 'Source task changed during packaging; retry while tasks are paused.');
      }
    }
    const manifest = { format: 2, product: 'BehaviorLab v0.4-preview.6', package_status: 'complete', platform: 'Windows 10/11 x64 (Intel/AMD)', created_at: new Date().toISOString(), snapshot_started_at: started,
      contents: clean ? 'clean' : 'current-demo-snapshot', main_simulation_mode: 'mock', phone_workbench: phoneRuntime,
      runtime: { ...version, sha256: nodeHash, source: 'https://nodejs.org/download/release/v24.19.0/win-x64/node.exe', checksums: 'https://nodejs.org/download/release/v24.19.0/SHASUMS256.txt' },
      users: userCount, runs, omitted: ['runtime control files', 'logs', 'old exports', 'unreferenced assets', 'build caches', 'model service settings and credentials', 'GUI lab experiment records and assets', ...(phone?[]:['candidate SDK dependencies'])],
      verification: { sqlite_integrity: 'passed', foreign_keys: 'passed', referenced_asset_sha256: 'passed', source_unchanged: 'passed' } };
    await writeFile(path.join(target, 'portable-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return { target, users: userCount, runs: runs.length, screenshots: runs.reduce((n, run) => n + run.screenshots, 0), runtime_sha256: nodeHash };
  } finally { for (const db of opened) db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { out: { type: 'string' }, runtime: { type: 'string', default: process.execPath }, license: { type: 'string' }, checksums: { type: 'string' }, clean: { type: 'boolean' }, phone:{type:'boolean'} } });
  if (!values.out || !values.license || !values.checksums) { console.error('Required: --out DIRECTORY --license NODE-LICENSE --checksums SHASUMS256.txt [--runtime NODE.EXE] [--clean]'); process.exitCode = 1; }
  else buildPortable(values).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
}
