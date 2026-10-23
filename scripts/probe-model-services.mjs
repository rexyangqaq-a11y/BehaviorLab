import { mkdir, open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ModelSettings } from '../src/model-settings.mjs';
import { PROBE_MODELS, probeTextService } from '../src/model-probe.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
export async function runProbes({ dataRoot, output }) {
  const store = new ModelSettings(dataRoot);
  try {
    const settings = store.read();
    const services = PROBE_MODELS.map(model => {
      const service = settings.services.find(s => s.model === model && s.base_url === 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
      if (!service?.has_api_key || service.missing.length) throw new Error('An expected service is missing or incomplete; no requests sent');
      return service;
    });
    await mkdir(path.dirname(output), { recursive: true });
    const report = { date: '2026-10-20', settings_revision: settings.revision, scope: 'Three explicitly requested text probes; no automatic retries, images or phone actions', max_requests: 3, max_output_tokens_per_request: 32, results: [] };
    // Refuse an accidental second execution. Review this record before choosing
    // an explicit new output path for a later user-requested probe.
    const handle = await open(output, 'wx');
    try { await handle.writeFile(JSON.stringify(report, null, 2)); await handle.sync(); } finally { await handle.close(); }
    for (const service of services) {
      report.results.push({ service_id: service.id, model: service.model, status: 'sending', started_at: new Date().toISOString() });
      await writeFile(output, JSON.stringify(report, null, 2), { flush: true });
      const credential = store.credential(service.id);
      report.results[report.results.length - 1] = await probeTextService({ ...service, api_key: credential });
      await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flush: true });
      console.log(JSON.stringify(report.results.at(-1)));
    }
    return report;
  } finally { store.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { send: { type: 'boolean' }, data: { type: 'string' }, out: { type: 'string' } } });
  if (!values.send) throw new Error('Explicit --send required; this sends up to three paid model requests');
  runProbes({ dataRoot: path.resolve(values.data ?? path.join(project, '.data')), output: path.resolve(values.out ?? path.join(project, 'output/model_probe_20261020/connectivity.json')) })
    .catch(error => { console.error(error.code === 'EEXIST' ? 'Existing probe report found; no duplicate probes sent.' : 'Probe stopped; review the report. No automatic retry.'); process.exitCode = 1; });
}
