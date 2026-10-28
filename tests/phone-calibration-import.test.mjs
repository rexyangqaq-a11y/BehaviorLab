import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {validateCalibration,importCalibration} from '../scripts/import-phone-calibration.mjs';
const profile={target_sha256:'a'.repeat(64),device:{model:'fixture',api:'26',os_fullname:'fixture-os',software_version:'fixture-v1'},screen:{width:1000,height:2000},navigation_bounds:[350,1950,650,1980],navigation_center:[500,1965],method:'desktop_native_touch_double_tap_v1'};
test('calibration import validates device binding, copies only known fields, preserves source and refuses overwrite',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'calibration-import-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'old'),target=path.join(root,'new');await mkdir(path.join(source,'.runtime'),{recursive:true});const file=path.join(source,'.runtime/phone-companion-calibration.json');
  const bytes=JSON.stringify({schema_version:1,profiles:[{...profile,extra:'must not migrate'}],unrelated:'must not migrate'});await writeFile(file,bytes);
  assert.equal((await importCalibration({source,target})).profiles,1);assert.equal(await readFile(file,'utf8'),bytes);
  const imported=JSON.parse(await readFile(path.join(target,'.runtime/phone-companion-calibration.json'),'utf8'));assert.deepEqual(imported,{schema_version:1,profiles:[profile]});
  await assert.rejects(importCalibration({source,target}),e=>e.code==='EEXIST');await assert.rejects(importCalibration({source,target:source}),/同一位置/);
});
test('unverified, stale and out-of-screen calibrations are rejected before writing',()=>{
  for(const change of [{target_sha256:'unknown'},{method:'settings_native_touch_double_tap_v1'},{navigation_center:[-1,0]},{screen:{width:1000,height:-1}},{device:{model:'fixture'}}])assert.throws(()=>validateCalibration({schema_version:1,profiles:[{...profile,...change}]}));
});
