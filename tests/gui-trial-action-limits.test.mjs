import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepeatedActionGuard } from '../src/gui-trial-action-limits.mjs';
test('third identical SDK action is refused before dispatch, while changed action resets the guard', () => {
  const guard = createRepeatedActionGuard(), scroll = { name: 'Scroll', param: { direction: 'down' } };
  guard(scroll); guard(scroll);
  assert.throws(() => guard(scroll), /Repeated identical action/);
  guard({ name: 'Scroll', param: { direction: 'up' } }); guard(scroll); guard(scroll);
});
