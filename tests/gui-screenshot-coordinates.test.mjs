import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileScreenshotSize } from '../src/gui-screenshot-coordinates.mjs';
test('rotated real screenshot replaces stale native SDK dimensions without inventing a device-input pass', () => {
  const device = { cachedScreenSize: { width: 1828, height: 2584 } };
  const result = reconcileScreenshotSize(device, { width: 2584, height: 1828 }, device.cachedScreenSize);
  assert.deepEqual(device.cachedScreenSize, { width: 2584, height: 1828 });
  assert.equal(result.corrected, true);
  assert.equal(result.device_input_mapping, 'requires_observed_navigation');
});
test('unexplained fold or display size changes stop rather than guessing coordinates', () => {
  const device = { cachedScreenSize: { width: 1264, height: 1848 } };
  assert.throws(() => reconcileScreenshotSize(device, { width: 2584, height: 1828 }, device.cachedScreenSize), /stop and inspect/);
  assert.deepEqual(device.cachedScreenSize, { width: 1264, height: 1848 });
});
