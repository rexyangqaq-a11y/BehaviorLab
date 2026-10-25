import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { normalizeConfig, ensure } from './contracts.mjs';
import { Store, openExisting } from './store.mjs';
import { createRuntimeAdapters } from './runtime-assembly.mjs';
import { initialize, runSimulation } from './runner.mjs';
import { describeSaved } from './descriptions.mjs';
import { exportRun, checkRun } from './output.mjs';

const help = `Mock and explicit v0.5 offline fixtures; no phone or model calls.
Node.js 24; no package installation needed.

node src/cli.mjs init --config examples/mock-run.json --data .data/demo
node src/cli.mjs run --data .data/demo [--no-descriptions]
node src/cli.mjs status --data .data/demo
node src/cli.mjs describe --data .data/demo [--retry-failed]
node src/cli.mjs export --data .data/demo [--out .data/demo/export]
node src/cli.mjs check --data .data/demo [--out .data/demo/export]

run resumes saved execution and missing feedback; successful activities are not recollected.
describe resumes missing images; --retry-failed retries failures below the configured attempt limit.
Exit codes: 0 success; 1 command/error/recovery attention; 2 offline integrity failed.
`;

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    config: { type: 'string' }, data: { type: 'string' }, out: { type: 'string' },
    'retry-failed': { type: 'boolean' }, 'no-descriptions': { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help || positionals.length === 0) { console.log(help); return; }
  ensure(positionals.length === 1, 'Exactly one command required');
  const command = positionals[0];
  ensure(['init', 'run', 'status', 'describe', 'export', 'check'].includes(command), `Unknown command: ${command}`);
  ensure(values.data, '--data required');
  ensure(!values['retry-failed'] || command === 'describe', '--retry-failed applies to describe only');
  ensure(!values['no-descriptions'] || command === 'run', '--no-descriptions applies to run only');
  const data = path.resolve(values.data);
  let store;
  try {
    let output;
    if (command === 'init') {
      ensure(values.config, '--config required');
      const config = normalizeConfig(JSON.parse(await readFile(values.config, 'utf8')));
      const adapters = createRuntimeAdapters(config);
      store = new Store(data);
      await initialize(store, config, adapters);
      output = { initialized: true, run_id: config.run_id, mode: config.mode, synthetic: true, data };
    } else {
      store = openExisting(data);
      const config = store.config();
      const adapters = ['run', 'describe'].includes(command) ? createRuntimeAdapters(config) : null;
      if (command === 'run') output = await runSimulation(store, adapters, { describe: !values['no-descriptions'], maxActivities: config.mode === 'offline' ? 1 : Infinity });
      if (command === 'status') output = store.status();
      if (command === 'describe') output = { processed: await describeSaved(store, adapters.describer, { retryFailed: Boolean(values['retry-failed']) }), ...store.status() };
      if (command === 'export') output = await exportRun(store, values.out ?? path.join(data, 'export'));
      if (command === 'check') {
        output = await checkRun(store, values.out ?? path.join(data, 'export'));
        if (!output.integrity_passed) process.exitCode = 2;
      }
    }
    console.log(JSON.stringify(output, null, 2));
  } finally { store?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
}
