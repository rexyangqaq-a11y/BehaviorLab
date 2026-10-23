import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrialTransport } from '../src/gui-trial-transport.mjs';

const baseUrl = 'https://example.invalid/v1', apiKey = 'fixture-secret-local-only';
const request = text => ({ method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: 'fixture', messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ==' } }] }] }) });
const harness = extra => {
  const events = [], images = [];
  return { events, images, transport: createTrialTransport({ baseUrl, model: 'fixture', apiKey,
    record: async event => { events.push(event); }, saveImage: async bytes => { images.push(bytes); return { file: 'fixture.jpeg', sha256: 'fixture-hash' }; }, ...extra }) };
};

test('trial transport records before send, enforces output/non-thinking and saves image references without credentials', async () => {
  const h = harness({ fetchImpl: async (url, options) => {
    assert.equal(h.events.at(-1).type, 'model_request_start');
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 512); assert.equal(body.enable_thinking, false); assert.equal(body.stream, false);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ choices: [{ message: { content: 'fixture' } }], usage: { prompt_tokens: 11, completion_tokens: 2 } }));
  } });
  await h.transport.fetch(baseUrl + '/chat/completions', request('first'));
  assert.equal(h.images.length, 1);
  assert.ok(!JSON.stringify(h.events).includes(apiKey));
  assert.ok(!JSON.stringify(h.events).includes('base64,'));
  assert.equal(h.transport.summary().known_input_tokens, 11);
  assert.equal(h.transport.summary().cache_and_reasoning[0].reasoning_output_tokens, null);
});

test('failed or unknown-usage calls block subsequent requests and are never counted as zero usage', async () => {
  let sent = 0;
  const h = harness({ fetchImpl: async () => { sent++; throw new Error(apiKey); } });
  await assert.rejects(h.transport.fetch(baseUrl + '/chat/completions', request('first')));
  await assert.rejects(h.transport.fetch(baseUrl + '/chat/completions', request('different')), /retry is disabled/);
  assert.equal(sent, 1); assert.equal(h.transport.summary().unknown_usage_requests, 1);
  assert.ok(!JSON.stringify(h.events).includes(apiKey));
});

test('request budget, duplicate requests, text-only requests and alternate destinations stop before network', async () => {
  let sent = 0;
  const h = harness({ maxRequests: 2, fetchImpl: async () => { sent++; return new Response(JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1 } })); } });
  await assert.rejects(h.transport.fetch('https://elsewhere.invalid', request('x')), /destination/);
  const text = request('x'); JSON.parse(text.body); text.body = JSON.stringify({ model: 'fixture', messages: [{ role: 'user', content: 'text-only' }] });
  await assert.rejects(h.transport.fetch(baseUrl + '/chat/completions', text), /real image/);
  await h.transport.fetch(baseUrl + '/chat/completions', request('first'));
  await assert.rejects(h.transport.fetch(baseUrl + '/chat/completions', request('first')), /Duplicate/);
  await h.transport.fetch(baseUrl + '/chat/completions', request('second'));
  await assert.rejects(h.transport.fetch(baseUrl + '/chat/completions', request('third')), /budget/);
  assert.equal(sent, 2);
});

test('oversized native screenshot leaves a durable pre-network stop and consumes no request', async () => {
  let sent=0;
  const h=harness({maxPayloadBytes:150,fetchImpl:async()=>{sent++;throw Error('must not send');}});
  await assert.rejects(h.transport.fetch(baseUrl+'/chat/completions',request('oversized image fixture')),/payload byte/);
  assert.equal(sent,0);assert.equal(h.transport.summary().requests,0);
  assert.deepEqual(h.transport.summary().blocked_before_network,[{reason:'Model payload byte limit exceeded',requests_already_sent:0}]);
  assert.equal(h.events.at(-1).type,'model_request_blocked');assert.equal(h.events.at(-1).network_sent,false);
});
