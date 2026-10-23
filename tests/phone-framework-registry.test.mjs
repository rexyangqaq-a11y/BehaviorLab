import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {frameworkSpec,PHONE_FRAMEWORKS} from '../src/phone-framework-registry.mjs';
import {phonePython} from '../src/phone-runtime-paths.mjs';
test('Framework entry points are fixed allowlisted modules, not client paths',()=>{
 assert.equal(PHONE_FRAMEWORKS.length,3);assert.equal(new Set(PHONE_FRAMEWORKS.map(f=>f.id)).size,3);
 for(const f of PHONE_FRAMEWORKS){const spec=frameworkSpec(f.id);assert.ok(['midscene','python-native'].includes(spec.adapter));assert.ok(Object.isFrozen(spec));assert.ok(spec.sourceFiles.length);}
 for(const value of ['../../arbitrary','file:///tmp/runner.mjs','unknown'])assert.throws(()=>frameworkSpec(value),/Unknown/);
});
test('Portable Python resolves from the moved project and rejects escaping paths',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'phone-path-contract-'));
 try{await mkdir(path.join(root,'.runtime'));const config=path.join(root,'.runtime/phone-frameworks.json');
  await writeFile(config,JSON.stringify({python_relative:'.runtime/python-phone/python.exe',python:'C:/obsolete/python.exe'}));
  assert.equal(phonePython(root),path.join(root,'.runtime/python-phone/python.exe'));
  await writeFile(config,JSON.stringify({python_relative:'../outside/python.exe'}));assert.throws(()=>phonePython(root),/inside/);
 }finally{const relative=path.relative(os.tmpdir(),root);assert.ok(relative.startsWith('phone-path-contract-')&&!relative.includes(path.sep));await rm(root,{recursive:true,force:true});}
});
