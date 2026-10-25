import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanArchiveValue} from '../scripts/export-v04-release-archive.mjs';

test('public archive removes structured credentials and device identifiers without changing evidence counters', () => {
  const original={request:{headers:{Authorization:'Bearer credential-value',Cookie:'session=value'},max_tokens:512},target_sha256:'device-hash',service:{base_url:'https://private.example/v1',model:'example'},model_usage:{known_input_tokens:1234,requests:2},nested:[{api_key:'credential-value',text:'normal model text'}]};
  const cleaned=cleanArchiveValue(original);
  assert.equal(cleaned.model_usage.known_input_tokens,1234);
  assert.equal(cleaned.request.max_tokens,512);
  assert.equal(cleaned.nested[0].text,'normal model text');
  assert.ok(!JSON.stringify(cleaned).includes('credential-value'));
  assert.ok(!JSON.stringify(cleaned).includes('device-hash'));
  assert.ok(!JSON.stringify(cleaned).includes('private.example'));
  assert.equal(original.nested[0].api_key,'credential-value');
});

test('archive cleaning preserves image hashes, event order and model response text; masks raw device stdout', () => {
  const event={seq:17,type:'image',asset:{file:'assets/img_123.jpeg',sha256:'a'.repeat(64)}};
  assert.deepEqual(cleanArchiveValue(event),event);
  assert.equal(cleanArchiveValue({type:'model_response',response:'990'}).response,'990');
  assert.equal(cleanArchiveValue({type:'hdc_return',stdout:'device serial'}).stdout,'[omitted for public archive]');
  assert.ok(!cleanArchiveValue('C:\\Users\\private-user\\source').includes('private-user'));
});
