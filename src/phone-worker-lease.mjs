import path from 'node:path';
import { assertDeviceLease } from './device-lease.mjs';

const denied = message => Object.assign(new Error(message), {
  action_not_sent: true, effect_unknown: false,
});

/** Wait for the parent to register this worker before any model or device I/O. */
export function waitForPhoneInputLease({ owner, channel = process, signal, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    let timer;
    const clean = () => {
      clearTimeout(timer);
      channel.removeListener('message', receive);
      channel.removeListener('disconnect', disconnected);
      signal?.removeEventListener('abort', aborted);
    };
    const fail = error => { clean(); reject(error); };
    const disconnected = () => fail(denied('服务已断开，未取得手机输入许可'));
    const aborted = () => fail(denied('执行已停止，未取得手机输入许可'));
    const receive = message => {
      if (message?.type !== 'phone_input_lease') return;
      try {
        if (typeof message.file !== 'string' || !path.isAbsolute(message.file) ||
            typeof message.token !== 'string' || message.worker_pid !== channel.pid) {
          throw denied('手机输入许可格式无效');
        }
        const assertOwnership = () => {
          if (signal?.aborted || channel.connected !== true) {
            throw denied('执行已停止或服务已断开，未发送设备命令');
          }
          let lease;
          try { lease = assertDeviceLease(message.file, message.token, channel.pid); }
          catch { throw denied('手机输入占用已失效，未发送设备命令'); }
          if (lease.owner !== owner || lease.pid !== channel.ppid) {
            throw denied('手机输入许可与当前运行不符');
          }
          return lease;
        };
        assertOwnership();
        clean();
        resolve({ assertOwnership });
      } catch (error) { fail(error); }
    };
    if (signal?.aborted || channel.connected !== true) {
      fail(denied('执行未连接到授予手机输入许可的服务'));
      return;
    }
    channel.on('message', receive);
    channel.once('disconnect', disconnected);
    signal?.addEventListener('abort', aborted, { once: true });
    timer = setTimeout(() => fail(denied('等待手机输入许可超时，未执行任务')), timeoutMs);
    try {
      channel.send({ type: 'phone_input_lease_request' }, error => {
        if (error) fail(denied('无法请求手机输入许可'));
      });
    } catch { fail(denied('无法请求手机输入许可')); }
  });
}
