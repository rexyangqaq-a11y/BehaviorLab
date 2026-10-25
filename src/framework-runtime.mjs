import { frameworkSpec } from './phone-framework-registry.mjs';

/** One allowlisted dispatch boundary shared by phone-lab and injected offline runs. */
export async function runRegisteredFramework(frameworkId, context, { source, loadAdapter } = {}) {
  const spec = frameworkSpec(frameworkId);
  if (source === 'offline_fixture') {
    if (typeof loadAdapter !== 'function') throw new Error('Offline dispatch requires an injected adapter; native loading is forbidden');
  } else if (source !== 'real_device' || loadAdapter) throw new Error('Invalid framework runtime source');
  const adapter = loadAdapter ? await loadAdapter(spec) : await import('../integrations/adapters/' + spec.adapter + '.mjs');
  if (typeof adapter?.run !== 'function') throw new Error('Registered adapter.run missing');
  return adapter.run({ ...context, framework_spec: spec });
}
