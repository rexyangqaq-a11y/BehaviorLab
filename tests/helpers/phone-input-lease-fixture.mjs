import { waitForPhoneInputLease } from '../../src/phone-worker-lease.mjs';

// A real local child process exercising IPC only, never a phone/model worker.
const controller = new AbortController();
process.once('disconnect', () => controller.abort());
try {
  const lease = await waitForPhoneInputLease({ owner: 'fixture-run', signal: controller.signal });
  lease.assertOwnership();
  process.send({ type: 'fixture_ready', checked: true });
  process.on('message', message => {
    if (message?.type === 'fixture_check') {
      try { lease.assertOwnership(); process.send({ type: 'fixture_checked' }); }
      catch { process.send({ type: 'fixture_denied' }); }
    }
    if (message?.type === 'fixture_exit') process.disconnect();
  });
} catch {
  if (process.connected) process.disconnect();
}
