import { readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';

const busy = message => Object.assign(new Error(message), { status: 409 });
const alive = pid => { if (!Number.isSafeInteger(pid) || pid <= 0) return true; try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
function mutate(file, operation) {
  const guard = file + '.guard', token = randomUUID();
  try { writeFileSync(guard, JSON.stringify({ token, pid: process.pid }), { flag: 'wx', flush: true }); }
  catch (error) { if (error.code === 'EEXIST') throw busy('设备锁正在更新或需要检查'); throw error; }
  try { return operation(); } finally { if (readDeviceLease(guard)?.token === token) unlinkSync(guard); }
}
export function readDeviceLease(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } }
export function assertDeviceLease(file, token, workerPid = null) {
  const lease = readDeviceLease(file);
  if (!lease || lease.token !== token || lease.host && lease.host !== hostname() || workerPid != null && lease.worker_pid !== workerPid) throw busy('设备所有权无效，未发送输入');
  return lease;
}
export function acquireDeviceLease(file, owner) {
  mkdirSync(path.dirname(file), { recursive: true });
  return mutate(file, () => {
  if (existsSync(file)) {
    const old = readDeviceLease(file);
    if (!old || old.host !== hostname() || !Object.hasOwn(old, 'worker_pid') || alive(old.pid) || old.worker_pid != null && alive(old.worker_pid)) throw busy('手机正在被另一项真机准备或测试占用，或锁状态需要检查');
    // All new owners serialize mutation; legacy live owners are rejected above.
    unlinkSync(file);
  }
  const token = randomUUID();
  try { writeFileSync(file, JSON.stringify({ token, host: hostname(), pid: process.pid, worker_pid: null, owner }), { flag: 'wx', flush: true }); }
  catch (error) { if (error.code === 'EEXIST') throw busy('设备已被其他进程占用'); throw error; }
  const release = () => mutate(file, () => {
    const lease = readDeviceLease(file);
    if (lease?.token !== token) return false;
    if (lease.worker_pid != null && alive(lease.worker_pid)) return false;
    unlinkSync(file); return true;
  });
  release.token = token;
  release.registerWorker = pid => mutate(file, () => {
    if (!Number.isSafeInteger(pid) || pid <= 0) throw busy('无效worker身份');
    const current = assertDeviceLease(file, token);
    if (current.worker_pid != null && current.worker_pid !== pid && alive(current.worker_pid)) throw busy('既有worker仍存活，不能替换所有权');
    // The owner remains live and exclusive during this local atomic replacement.
    const temporary = file + '.' + token + '.tmp';
    writeFileSync(temporary, JSON.stringify({ ...current, worker_pid: pid }), { flag: 'wx', flush: true });
    assertDeviceLease(file, token); renameSync(temporary, file);
  });
  return release;
  });
}
