import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function modelUsage(usage) {
  return { input_tokens: count(usage?.prompt_tokens ?? usage?.input_tokens),
    output_tokens: count(usage?.completion_tokens ?? usage?.output_tokens), total_tokens: count(usage?.total_tokens),
    cached_input_tokens: count(usage?.prompt_tokens_details?.cached_tokens),
    reasoning_output_tokens: count(usage?.completion_tokens_details?.reasoning_tokens) };
}

/** Transport-level limits cover the SDK's internal HTTP requests too. */
export function createTrialTransport({ baseUrl, model, apiKey, signal, record, saveImage,
  fetchImpl = fetch, maxRequests = 4, maxOutputTokens = 512, maxPayloadBytes = 2 * 1024 * 1024,
  maxTextChars = 60000, maxImages = 2, requestTimeoutMs = 30000 }) {
  let requests = 0, failed = false;
  const responses = [], blocked = [], seen = new Set(), destination = new URL(baseUrl.replace(/\/$/, '') + '/chat/completions');
  const scrub = value => typeof value === 'string' ? value.split(apiKey).join('[redacted]')
    : Array.isArray(value) ? value.map(scrub) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([key]) => !/authorization|api_key/i.test(key)).map(([key, item]) => [key, scrub(item)])) : value;
  const guardedFetch = async (url, options = {}) => {
    const block = async reason => {
      blocked.push({ reason, requests_already_sent: requests });
      await record({ type: 'model_request_blocked', reason, requests_already_sent: requests, network_sent: false });
      throw new Error(reason);
    };
    if (signal?.aborted) return block('Trial stopped');
    if (failed) return block('A previous request failed or had unknown usage; automatic retry is disabled');
    if (requests >= maxRequests) return block('Model request budget exhausted');
    if (String(url) !== destination.href || options.method?.toUpperCase() !== 'POST') throw new Error('Unexpected model destination or method');
    if (typeof options.body !== 'string') throw new Error('Only inspectable JSON model requests are allowed');
    const body = JSON.parse(options.body);
    if (body.model !== model) throw new Error('Unexpected model; fallback is disabled');
    if (body.stream === true) throw new Error('Configure the SDK for non-stream mode before sending');
    body.stream = false;
    body.max_tokens = maxOutputTokens;
    delete body.max_completion_tokens;
    body.enable_thinking = false;
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized) > maxPayloadBytes) return block('Model payload byte limit exceeded');
    const fingerprint = hash(serialized);
    if (seen.has(fingerprint)) return block('Duplicate model request blocked; no automatic retry');
    const publicBody = structuredClone(body);
    let imageCount = 0, textChars = 0;
    // Retain exact submitted images separately, including SDK resizes.
    const retain = async value => {
      if (typeof value === 'string') {
        const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
        if (match) {
          if (++imageCount > maxImages) throw new Error('Model image count limit exceeded');
          const bytes = Buffer.from(match[2], 'base64');
          const asset = await saveImage(bytes, match[1], 'model_input');
          return `asset:${asset.file}#sha256=${asset.sha256}`;
        }
        if (/^https?:\/\//.test(value)) throw new Error('External image/resource URL not allowed in trial prompt');
        textChars += value.length;
        if (textChars > maxTextChars) throw new Error('Model text context limit exceeded');
        return scrub(value);
      }
      if (Array.isArray(value)) return Promise.all(value.map(retain));
      if (value && typeof value === 'object') {
        const pairs = [];
        for (const [key, item] of Object.entries(value)) pairs.push([key, await retain(item)]);
        return Object.fromEntries(pairs);
      }
      return value;
    };
    publicBody.messages = await retain(publicBody.messages);
    if (!imageCount) throw new Error('GUI trial requires a real image; text-only requests are disabled');
    seen.add(fingerprint);
    const id = `model_${++requests}`, started = Date.now();
    await record({ type: 'model_request_start', id, request: scrub(publicBody), serialized_sha256: fingerprint,
      serialized_bytes: Buffer.byteLength(serialized), images: imageCount, text_chars: textChars, max_retries: 0 });
    try {
      const response = await fetchImpl(url, { ...options, body: serialized, redirect: 'error',
        signal: AbortSignal.any([...(signal ? [signal] : []), ...(options.signal ? [options.signal] : []), AbortSignal.timeout(requestTimeoutMs)]) });
      const raw = await response.clone().text();
      let data;
      try { data = JSON.parse(raw); } catch { data = null; }
      const usage = modelUsage(data?.usage);
      const entry = { type: 'model_response', id, http_status: response.status, duration_ms: Date.now() - started,
        usage, response: scrub(data ?? { unparsed_response: raw.slice(0, 2000) }) };
      responses.push(entry);
      await record(entry);
      // A failed response must not cause SDK or network retries.
      if (!response.ok || !data || usage.input_tokens === null || usage.output_tokens === null) failed = true;
      return response;
    } catch (error) {
      failed = true;
      const entry = { type: 'model_response', id, status: 'failed_or_usage_unknown', duration_ms: Date.now() - started,
        usage: modelUsage(null), error: 'No verified response; no automatic retry.' };
      if (!responses.some(value => value.id === id)) { responses.push(entry); await record(entry); }
      throw new Error('Model transport stopped; see retained evidence', { cause: error });
    }
  };
  return { fetch: guardedFetch, summary: () => ({ requests, retries: 0, blocked_before_network: [...blocked],
    known_input_tokens: responses.reduce((sum, value) => sum + (value.usage.input_tokens ?? 0), 0),
    known_output_tokens: responses.reduce((sum, value) => sum + (value.usage.output_tokens ?? 0), 0),
    unknown_usage_requests: requests - responses.filter(value => value.usage.input_tokens !== null && value.usage.output_tokens !== null).length,
    cache_and_reasoning: responses.map(value => ({ id: value.id, cached_input_tokens: value.usage.cached_input_tokens, reasoning_output_tokens: value.usage.reasoning_output_tokens })),
    fees: null, credits: null }) };
}
