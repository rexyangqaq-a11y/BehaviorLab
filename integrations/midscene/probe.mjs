import { readFile } from 'node:fs/promises';
import { HarmonyAgent, HarmonyDevice } from '@midscene/harmony';
import { instrumentGuiDevice } from '../../src/gui-device-journal.mjs';

// Read the installed package, never guess its version from the manifest alone.
const pkg = JSON.parse(await readFile(new URL('./node_modules/@midscene/harmony/package.json', import.meta.url), 'utf8'));
const device = new HarmonyDevice('OFFLINE-CONTRACT-ONLY');
const actions = await device.actionSpace();
const journal = [];
// Replace only the physical I/O seam: this is a real SDK action with a fake HDC.
device.getHdc = async () => ({ click: async (x, y) => journal.push({ kind: 'fake_hdc_click', x, y }) });
instrumentGuiDevice(device, {
  intent: async action => { journal.push({ kind: 'intent', name: action.name }); return 'contract_step'; },
  outcome: async () => { journal.push({ kind: 'outcome' }); },
  capture: async () => {},
});
const tap = (await device.actionSpace()).find(a => a.name === 'Tap');
await tap.call({ locate: { center: [10, 20] } });
if (journal.map(e => e.kind).join(',') !== 'intent,fake_hdc_click,outcome') throw new Error('SDK journal ordering contract failed');
const agentMethodNames = ['aiAct', 'aiAssert', 'destroy'].filter(name => typeof HarmonyAgent.prototype[name] === 'function');
console.log(JSON.stringify({ package: pkg.name, version: pkg.version, status: 'passed',
  exports: { HarmonyAgent: typeof HarmonyAgent, HarmonyDevice: typeof HarmonyDevice },
  actions: actions.map(a => a.name), agent_methods: agentMethodNames,
  journal_order: journal.map(e => e.kind), framework_loop_executed: false, device_io: 'fake_hdc', model_calls: 0,
  limitation: '仅验证已安装 SDK 的动作入口与记录顺序；没有模型决策、截图或真机兼容性结果。' }));
