import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Offline estimate only: no credentials, HTTP requests, or framework execution.
const rates = [
  { model: 'qwen3.8-flash', profile: 'standard_beijing', input: 0.8, output: 2.7, cached_input: 0.1 },
  { model: 'qwen3.7-plus', profile: 'standard_beijing_input_le_256k', input: 2, output: 8, cached_input: 0.4 },
  { model: 'deepseek-v4.1-flash-1017', profile: 'standard_beijing_busy', input: 2, output: 8, cached_input: 0.2 },
  { model: 'deepseek-v4.1-flash-1017', profile: 'standard_beijing_off_peak', input: 1, output: 4, cached_input: 0.1 },
];
const round = value => Number(value.toFixed(8));
const cost = (input, output, rate) => round((input * rate.input + output * rate.output) / 1e6);
const scenarios = [
  { id: 'capability', label: '每模型 4 次固定输入能力检查；三模型合计', requests: [12, 12], input_per_request: 3000, output_per_request: 200, allocation: 'four_per_model' },
  { id: 'pilot', label: '两候选各 5 个短活动，每活动 10–30 次模型请求', requests: [100, 300], input_per_request: 4000, output_per_request: 300 },
  { id: 'short_comparison', label: '三候选各 10 个短活动，每活动 10–30 次模型请求；包含 pilot', requests: [300, 900], input_per_request: 4000, output_per_request: 300 },
  { id: 'long_comparison', label: '三候选各完成 100 对象，每对象 5–15 次模型请求', requests: [1500, 4500], input_per_request: 6000, output_per_request: 400 },
  { id: 'archive_vlm', label: '上述长活动 300 对象，每对象留图 10–30 张；逐图独立描述', requests: [3000, 9000], input_per_request: 2000, output_per_request: 300 },
];
for (const scenario of scenarios) {
  scenario.input_tokens = scenario.requests.map(n => n * scenario.input_per_request);
  scenario.output_tokens = scenario.requests.map(n => n * scenario.output_per_request);
  scenario.total_tokens = scenario.input_tokens.map((n, i) => n + scenario.output_tokens[i]);
  scenario.reference_rmb = rates.map(rate => ({ model: rate.model, profile: rate.profile,
    range: scenario.requests.map((_, i) => cost(scenario.input_tokens[i], scenario.output_tokens[i], rate)),
    meaning: scenario.allocation ? 'Counterfactual: all requests at this model rate; actual mixed allocation below' : 'All requests at this model rate; not a three-model Cartesian product',
  }));
}
const capability = scenarios[0];
const mixedCapability = [0, 1].map(bound => round(
  cost(12000, 800, rates[0]) + cost(12000, 800, rates[1]) + cost(12000, 800, rates[bound === 0 ? 3 : 2])
));
const byId = id => scenarios.find(item => item.id === id);
const bundles = [
  { id: 'pilot_bundle', stages: ['capability', 'pilot'] },
  { id: 'full_comparison_bundle', stages: ['capability', 'short_comparison', 'long_comparison', 'archive_vlm'] },
].map(bundle => {
  const selected = bundle.stages.map(byId);
  const input = [0, 1].map(i => selected.reduce((sum, s) => sum + s.input_tokens[i], 0));
  const output = [0, 1].map(i => selected.reduce((sum, s) => sum + s.output_tokens[i], 0));
  const rmb = rates.map(rate => ({ model: rate.model, profile: rate.profile,
    range: [0, 1].map(i => round(mixedCapability[rate.profile.includes('off_peak') ? 0 : 1] + cost(input[i] - capability.input_tokens[i], output[i] - capability.output_tokens[i], rate))),
  }));
  return { ...bundle, input_tokens: input, output_tokens: output, total_tokens: input.map((n, i) => n + output[i]),
    reference_rmb: rmb,
    with_30_percent_contingency: {
      total_tokens: input.map((n, i) => Math.ceil((n + output[i]) * 1.3)),
      reference_rmb: rmb.map(r => ({ ...r, range: r.range.map(n => round(n * 1.3)) })),
    },
  };
});
const probePath = new URL('../output/model_probe_20261020/connectivity.json', import.meta.url);
const probe = JSON.parse(await readFile(probePath, 'utf8'));
const actualProbes = probe.results.map(result => {
  const rate = rates.find(r => r.model === result.model && !r.profile.includes('off_peak'));
  if (result.usage?.input_tokens == null || result.usage?.output_tokens == null) throw new Error('Missing observed usage; cannot calculate actual probe reference');
  return { model: result.model, input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens,
    total_tokens: result.usage.total_tokens, reference_rmb: cost(result.usage.input_tokens, result.usage.output_tokens, rate) };
});
const report = {
  date: '2026-10-20', currency: 'CNY', price_unit: 'per_million_tokens',
  billing_warning: 'Reference standard API list prices only. The configured endpoint is Token Plan; actual Credits and cash charge are unknown, not zero.',
  actual_credits: null, actual_cash_charge_rmb: null,
  sources: [
    'https://help.aliyun.com/zh/model-studio/qwen3-8-flash',
    'https://help.aliyun.com/zh/model-studio/qwen3-7-plus',
    'https://help.aliyun.com/zh/model-studio/deepseek-v4-1-flash',
    'https://help.aliyun.com/zh/model-studio/token-plan-personal-overview',
    'https://help.aliyun.com/zh/model-studio/token-plan-team-overview',
  ],
  assumptions: {
    forecast_only: true, cache_hit_ratio: 0, thinking: false, tools: false,
    image_tokens: 'Included in input estimates, not measured. Resolution, history and provider tokenization change actual usage.',
    calls_per_step: 'Not fixed; decision, grounding, verification, retries and summaries must all count as separate requests when invoked.',
    archive_images: 'Independent volume estimate; persist every returned screenshot. Do not drop images to fit budget; pause or revise budget if actual volume is higher.',
    contingency_fraction: 0.3,
    contingency_is_hard_limit: false,
    non_model_costs_included: false,
  },
  rates, actual_text_probes: actualProbes,
  actual_probe_total: {
    requests: probe.results.length,
    input_tokens: actualProbes.reduce((sum, row) => sum + row.input_tokens, 0),
    output_tokens: actualProbes.reduce((sum, row) => sum + row.output_tokens, 0),
    total_tokens: actualProbes.reduce((sum, row) => sum + row.total_tokens, 0),
    reference_rmb: round(actualProbes.reduce((sum, row) => sum + row.reference_rmb, 0)),
  },
  capability_mixed_reference_rmb: mixedCapability, scenarios, bundles,
};
const output = new URL('../output/model_probe_20261020/cost-estimate.json', import.meta.url);
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: fileURLToPath(output), actual_probe_total: report.actual_probe_total, capability_mixed_reference_rmb: mixedCapability, bundles }, null, 2));
