// Test utility: deliberately exits without finally/cleanup, simulating process loss.
import { openExisting } from '../src/store.mjs';
import { createMockAdapters } from '../src/adapters/mock.mjs';
import { runSimulation } from '../src/runner.mjs';
import { describeSaved } from '../src/descriptions.mjs';
const [directory, point] = process.argv.slice(2);
const store = openExisting(directory);
const crash = () => process.exit(73);
const adapters = createMockAdapters(store.config(), {
  afterCapture: point === 'capture' ? crash : undefined,
  onDescribe: point === 'description' ? crash : undefined,
});
if (point === 'description') await describeSaved(store, adapters.describer);
else await runSimulation(store, adapters, { describe: false, afterResult: point === 'result' ? crash : undefined });
store.close();
throw new Error('Fault point was not reached');
