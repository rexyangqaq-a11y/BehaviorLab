const ENDPOINT = 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
export const PROBE_MODELS = ['qwen3.8-flash', 'qwen3.7-plus', 'deepseek-v4.1-flash-1017'];
const number = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const clean = (value, key, limit = 180) => String(value ?? '').replaceAll(key, '[redacted]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9._-]+/gi, '[redacted]').slice(0, limit);

/** One explicit, short text probe. No SDK retries, images, tools or agent loop. */
export async function probeTextService(service, { fetchImpl = fetch } = {}) {
  if (service.base_url !== ENDPOINT || service.protocol !== 'openai-chat' || !PROBE_MODELS.includes(service.model) || typeof service.api_key !== 'string' || !service.api_key) throw new Error('Probe service is not an explicitly allowed configuration');
  const started = Date.now();
  const result = { service_id: service.id, model: service.model, checked_at: new Date().toISOString(),
    kind: 'real_text_connectivity', requests: 1, retries: 0, max_output_tokens: 32, enable_thinking: false,
    image_input_tested: false, gui_actions_tested: false, status: 'failed', http_status: null, usage: null };
  try {
    const response = await fetchImpl(ENDPOINT + '/chat/completions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${service.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: service.model, messages: [{ role: 'user', content: 'Reply with OK only.' }], max_tokens: 32, enable_thinking: false, stream: false }),
    });
    result.http_status = response.status;
    const data = await response.json().catch(() => null);
    if (data?.usage) result.usage = {
      input_tokens: number(data.usage.prompt_tokens ?? data.usage.input_tokens),
      output_tokens: number(data.usage.completion_tokens ?? data.usage.output_tokens), total_tokens: number(data.usage.total_tokens),
      cached_input_tokens: number(data.usage.prompt_tokens_details?.cached_tokens ?? data.usage.input_tokens_details?.cached_tokens),
      reasoning_output_tokens: number(data.usage.completion_tokens_details?.reasoning_tokens ?? data.usage.output_tokens_details?.reasoning_tokens),
    };
    if (!response.ok) {
      result.error_code = clean(data?.error?.code ?? `HTTP_${response.status}`, service.api_key);
      result.error_message = clean(data?.error?.message ?? 'Service rejected the request', service.api_key);
    } else {
      const content = data?.choices?.[0]?.message?.content;
      result.returned_model = clean(data?.model, service.api_key);
      result.response_id = clean(data?.id, service.api_key);
      result.finish_reason = clean(data?.choices?.[0]?.finish_reason, service.api_key);
      result.reply = clean(typeof content === 'string' ? content : '', service.api_key, 120);
      result.status = result.reply.trim() ? 'text_ok' : 'no_text';
      result.expected_reply_matched = result.reply.trim() === 'OK';
    }
  } catch (error) {
    // Do not log request objects, headers or raw network errors containing secrets.
    result.error_code = ['AbortError', 'TimeoutError'].includes(error.name) ? 'TIMEOUT' : 'NETWORK_ERROR';
    result.error_message = 'No verified response; no retry was sent. Usage may be unknown.';
  }
  return { ...result, duration_ms: Date.now() - started };
}
