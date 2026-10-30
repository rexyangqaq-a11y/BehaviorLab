import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, '.runtime');
const stateFile = path.join(runtime, 'desktop.json');
const lockFile = path.join(runtime, 'start.lock');
const identity = createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0, 24);
const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\behaviorlab-${identity}` : path.join(runtime, 'control.sock');
const logFile = path.join(runtime, 'server.log');

async function state() {
  try {
    const value = JSON.parse(await readFile(stateFile, 'utf8'));
    const url = new URL(value.url);
    if (value.root !== root || value.pipe !== pipe || !/^[a-f0-9]{64}$/.test(value.token) || url.hostname !== '127.0.0.1' || url.protocol !== 'http:') return null;
    return value;
  } catch { return null; }
}

function control(saved, action, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(saved.pipe);
    let output = '';
    const timer = setTimeout(() => socket.destroy(new Error('Service response timed out')), timeout);
    socket.once('connect', () => socket.write(JSON.stringify({ token: saved.token, action }) + '\n'));
    socket.on('data', chunk => { output += chunk; if (output.length > 4096) socket.destroy(new Error('Invalid service response')); });
    socket.once('error', error => { clearTimeout(timer); reject(error); });
    socket.once('end', () => {
      clearTimeout(timer);
      try { const response = JSON.parse(output); if (!response.ok || response.root !== root || response.pid !== saved.pid) throw new Error('Service identity mismatch'); resolve(response); }
      catch (error) { reject(error); }
    });
  });
}

async function running() {
  const saved = await state();
  if (!saved) return null;
  try { return await control(saved, 'status'); } catch { return null; }
}

async function startupLock() {
  const owner = { pid: process.pid, id: randomUUID() };
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(lockFile, 'wx');
      try { await handle.writeFile(JSON.stringify(owner)); } finally { await handle.close(); }
      return async () => { try { if (JSON.parse(await readFile(lockFile, 'utf8')).id === owner.id) await unlink(lockFile); } catch {} };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const previous = JSON.parse(await readFile(lockFile, 'utf8'));
        if (Number.isSafeInteger(previous.pid) && previous.pid > 0) {
          try { process.kill(previous.pid, 0); }
          catch (error) { if (error.code === 'ESRCH') await unlink(lockFile); }
        }
      } catch {}
      await delay(200);
    }
  }
  throw new Error('Another launch is still in progress. Wait a few seconds and try again.');
}

function browser(url) {
  const command = process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(...command, { detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => console.log(`Open this address in your browser: ${url}`));
  child.unref();
}

async function start(port, noBrowser) {
  await mkdir(runtime, { recursive: true });
  const release = await startupLock();
  let result;
  try {
    result = await running();
    if (!result) {
      const log = await open(logFile, 'a');
      let child;
      try {
        child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', '--port', String(port)], {
          cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
        });
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
        child.unref();
      } finally { await log.close(); }
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        result = await running();
        if (result) break;
        if (child.exitCode !== null) break;
        await delay(150);
      }
      if (!result) throw new Error(`Could not start BehaviorLab. See ${logFile}`);
    }
  } finally { await release(); }
  console.log(`READY ${result.url}`);
  console.log('The service runs in the background. Close the browser freely. Use 02_STOP.cmd to stop it.');
  if (!noBrowser) browser(result.url);
  return result;
}

async function serve(port) {
  const { createDebugServer } = await import('../src/web-server.mjs');
  // A different app or a different copy of BehaviorLab may already own 4317.
  let app;
  try { app = await createDebugServer({ port, seedBundledTasks: true }); }
  catch (error) { if (error.code !== 'EADDRINUSE' || port === 0) throw error; app = await createDebugServer({ port: 0, seedBundledTasks: true }); }
  const saved = { schema_version: 1, root, pid: process.pid, pipe, url: app.url, token: randomBytes(32).toString('hex') };
  let stopping = false;
  const response = () => ({ ok: true, root, pid: process.pid, url: app.url });
  async function stop(socket) {
    if (stopping) { socket?.end(JSON.stringify({ ...response(), stopping: true })); return; }
    stopping = true;
    try {
      await app.close();
      if ((await state())?.token === saved.token) await unlink(stateFile);
      socket?.end(JSON.stringify(response()));
      server.close();
      console.log(`${new Date().toISOString()} STOPPED`);
    } catch (error) { console.error(error); socket?.destroy(); process.exitCode = 1; }
  }
  // Control is an authenticated local named pipe; no shutdown HTTP endpoint is exposed.
  const server = net.createServer({ allowHalfOpen: true }, socket => {
    socket.setTimeout(3000, () => socket.destroy());
    let input = '';
    let handled = false;
    socket.on('error', () => {});
    const handle = () => {
      if (handled) return;
      handled = true;
      try {
        const request = JSON.parse(input);
        if (request.token !== saved.token) { socket.destroy(); return; }
        if (request.action === 'status') socket.end(JSON.stringify(response()));
        else if (request.action === 'stop') { socket.setTimeout(20000); void stop(socket); }
        else socket.destroy();
      } catch { socket.destroy(); }
    };
    socket.on('data', chunk => { input += chunk; if (input.length > 2048) socket.destroy(); else if (input.includes('\n')) handle(); });
    socket.once('end', handle);
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve); });
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(saved), { mode: 0o600 });
    await rename(temporary, stateFile);
  } catch (error) { server.close(); await app.close(); throw error; }
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
  console.log(`${new Date().toISOString()} READY ${app.url}`);
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { port: { type: 'string', default: '4317' }, 'no-browser': { type: 'boolean' } } });
  const [action = 'start'] = positionals;
  if (positionals.length > 1 || !['start', 'stop', 'status', 'serve'].includes(action)) throw new Error('Use start, stop or status.');
  const port = Number(values.port);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
  if (action === 'start') return start(port, values['no-browser']);
  if (action === 'serve') return serve(port);
  const saved = await state();
  if (action === 'status') { const result = await running(); console.log(JSON.stringify(result ?? { running: false })); return result; }
  if (!saved || !await running()) { console.log('NOT_RUNNING: This copy of BehaviorLab is already stopped.'); return; }
  await control(saved, 'stop', 20000);
  console.log('STOPPED: Saved users, tasks and screenshots are kept in .data.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
}
