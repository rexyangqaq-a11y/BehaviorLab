import test from 'node:test';
import assert from 'node:assert/strict';
import {privateScreenRects} from '../src/phone-image-privacy.mjs';
test('model screen privacy identifies visible serial/phone/IMEI fields but leaves task model and version fields',()=>{
  const nodes=['fixture-serial','123456789012345','13800000000','HOP-AL10','7.0.0','￥99.00'].map(text=>({text,bounds:'[10,20][100,60]'}));
  assert.equal(privateScreenRects(nodes,'fixture-serial').length,3);
});
