import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import path from 'node:path';
const { values } = parseArgs({ options: { dir: { type: 'string' } } });
if (!values.dir) throw new Error('--dir required');
const dir = path.resolve(values.dir), read = file => readFile(path.join(dir, file), 'utf8');
const events = (await read('events.jsonl')).trim().split('\n').map(JSON.parse), result = JSON.parse(await read('result.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const errors = [], check = (condition, message) => { if (!condition) errors.push(message); };
const images = events.filter(e => e.type === 'image').map(e => e.asset);
for (const asset of images) {
  check(!path.isAbsolute(asset.file) && path.resolve(dir, asset.file).startsWith(dir + path.sep), 'Unsafe asset reference');
  const bytes = await readFile(path.join(dir, asset.file));
  check(hash(bytes) === asset.sha256 && bytes.length === asset.bytes, `Asset hash/length mismatch: ${asset.file}`);
}
const starts = events.filter(e => e.type === 'model_request_start'), responses = events.filter(e => e.type === 'model_response');
check(starts.length === 4 && responses.length === 4, 'Expected four actual requests and responses');
check(responses.every(e => e.http_status === 200 && e.usage.output_tokens <= 512), 'Unexpected request status/output');
for (const start of starts) {
  check(events.find(e => e.type === 'model_response' && e.id === start.id)?.seq > start.seq, 'Missing request-before-response record');
  check(start.request.max_tokens === 512 && start.request.enable_thinking === false && start.max_retries === 0, 'Missing model bounds');
  const refs = JSON.stringify(start.request).matchAll(/asset:([^"#]+)#sha256=([a-f0-9]{64})/g);
  let count = 0;
  for (const [, file, expected] of refs) { count++; check(hash(await readFile(path.join(dir, file))) === expected, 'Submitted image reference mismatch'); }
  check(count > 0, 'Text-only request is not GUI evidence');
}
const intents = events.filter(e => e.type === 'action_intent'), physical = events.filter(e => e.type === 'hdc_intent' && e.args[0] === 'shell' && e.args[1]?.startsWith('uitest uiInput'));
for (const intent of intents) {
  const next = physical.find(e => e.seq > intent.seq), after = images.find(a => a.role === 'after-action' && a.action_id === intent.id);
  check(Boolean(next && after), 'Action lacks durable intent or after image');
  check(events.some(e => e.type === 'image' && e.asset.role === 'before-action' && e.seq < intent.seq), 'Action lacks before image');
}
check(physical.length === 4 && intents.length === 4, 'Unexpected physical/action counts');
check(result.model_usage.known_input_tokens === responses.reduce((sum,e) => sum + e.usage.input_tokens,0), 'Input usage mismatch');
check(result.model_usage.known_output_tokens === responses.reduce((sum,e) => sum + e.usage.output_tokens,0), 'Output usage mismatch');
// Scan every retained file against the local credentials without printing them.
let db, keys;
try { db = new DatabaseSync('.data/.model-services.sqlite', { readOnly: true }); keys = db.prepare('SELECT api_key FROM model_credentials').all().map(r=>r.api_key).filter(Boolean); }
finally { db?.close(); }
async function scan(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, item.name);
    if (item.isDirectory()) await scan(file);
    else { const bytes = await readFile(file); check(!keys.some(key=>bytes.includes(Buffer.from(key))), `Credential leakage found in ${path.relative(dir,file)}`); }
  }
}
await scan(dir);
const audit = { checked_at: new Date().toISOString(), status: errors.length ? 'failed' : 'passed', errors,
  asset_records: images.length, unique_asset_hashes: new Set(images.map(a=>a.sha256)).size,
  actual_screenshot_commands: events.filter(e=>e.type==='hdc_intent' && e.args[0]==='shell' && e.args[1]?.startsWith('snapshot_display')).length,
  model_images_retained: images.filter(a=>a.role==='model_input').length,
  actual_requests: starts.length, physical_actions: physical.length,
  original_images_committed: false, credential_value_matches: 0,
  limitation: 'Evidence integrity audit is not a GUI business pass.' };
await writeFile(path.join(dir, 'evidence-audit.json'), JSON.stringify(audit,null,2), { flag:'wx',flush:true });
console.log(JSON.stringify(audit)); if(errors.length)process.exitCode=1;
