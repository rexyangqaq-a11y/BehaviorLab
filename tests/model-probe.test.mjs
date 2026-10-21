import test from 'node:test';
import assert from 'node:assert/strict';
import { probeTextService } from '../src/model-probe.mjs';
const service = { id: 'fixture', base_url: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', protocol: 'openai-chat', model: 'qwen3.8-flash', api_key: 'sk-fixture-only-secret' };
test('text probe sends one bounded non-thinking request, preserves usage and cannot claim image or GUI verification', async () => {
  let calls = 0;
  const result = await probeTextService(service, { fetchImpl: async (url, options) => {
    calls++; assert.equal(url, service.base_url + '/chat/completions'); assert.equal(options.redirect, 'error');
    const input = JSON.parse(options.body); assert.equal(input.max_tokens, 32); assert.equal(input.enable_thinking, false); assert.equal(input.stream, false);
    assert.equal(input.messages.length, 1); assert.equal(typeof input.messages[0].content, 'string'); assert.ok(!input.tools);
    return new Response(JSON.stringify({ model: service.model, choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 } }), { status: 200 });
  } });
  assert.equal(calls, 1); assert.equal(result.status, 'text_ok'); assert.equal(result.usage.total_tokens, 13);
  assert.equal(result.usage.cached_input_tokens, null); assert.equal(result.image_input_tested, false); assert.equal(result.gui_actions_tested, false);
});
test('probe failures never retry or expose credentials; absent usage remains unknown and other destinations are rejected', async () => {
  let calls = 0;
  const response = await probeTextService(service, { fetchImpl: async () => {
    calls++; return new Response(JSON.stringify({ error: { code: 'Denied', message: 'denied ' + service.api_key } }), { status: 401 });
  } });
  assert.equal(calls, 1); assert.equal(response.status, 'failed'); assert.equal(response.usage, null);
  assert.ok(!JSON.stringify(response).includes(service.api_key));
  const network = await probeTextService(service, { fetchImpl: async () => { calls++; throw new Error(service.api_key); } });
  assert.equal(calls, 2); assert.equal(network.error_code, 'NETWORK_ERROR'); assert.equal(network.usage, null);
  assert.ok(!JSON.stringify(network).includes(service.api_key));
  await assert.rejects(probeTextService({ ...service, base_url: 'https://elsewhere.invalid' }), /explicitly allowed/);
});
