import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentGuiDevice } from '../src/gui-device-journal.mjs';
test('Harmony-compatible synchronous actionSpace remains iterable with durable ordering', async () => {
  const events = [];
  const device = { actionSpace: () => [{ name: 'Tap', call: async () => { events.push('physical'); } }], screenshotBase64: async () => 'fixture' };
  instrumentGuiDevice(device, { capture: async () => {}, intent: async () => { events.push('intent'); return 'a'; }, outcome: async () => { events.push('outcome'); } });
  const actions = [...device.actionSpace()];
  await actions[0].call({ locate: { center: [1, 2] } });
  assert.deepEqual(events, ['intent', 'physical', 'outcome']);
});
test('uncertain SDK failures remain unknown and are not replayed', async () => {
  let physical = 0, outcome;
  const device = { actionSpace: async () => [{ name: 'Tap', call: async () => { physical++; throw Error('fixture'); } }], screenshotBase64: async () => 'fixture' };
  instrumentGuiDevice(device, { capture: async () => {}, intent: async () => 'a', outcome: async (id, value) => { outcome = value; } });
  await assert.rejects((await device.actionSpace())[0].call({}), error => error.effect_unknown === true);
  assert.equal(physical, 1); assert.equal(outcome.status, 'unknown');
});
