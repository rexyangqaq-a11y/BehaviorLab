import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {verifyVideoFiles,packagePhoneVideo} from '../scripts/package-phone-video.mjs';
async function temporary(t){const root=await mkdtemp(path.join(os.tmpdir(),'phone-video-package-'));t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('phone-video-package-'));await rm(root,{recursive:true,force:true});});return root;}
test('portable video file checks reject tampering, empty manifests and paths outside the two runtime directories',async t=>{
  const root=await temporary(t),name='.runtime/hoscrcpy/classes/fixture.class';await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),'fixture');
  const manifest={[name]:createHash('sha256').update('fixture').digest('hex')};await verifyVideoFiles(root,manifest);
  for(const file of ['../outside','.runtime/../outside','/absolute','.runtime/other/file'])await assert.rejects(verifyVideoFiles(root,{[file]:'hash'}),/escapes/);
  await assert.rejects(verifyVideoFiles(root,{}),/missing/);await writeFile(path.join(root,name),'changed');await assert.rejects(verifyVideoFiles(root,manifest),/checksum differs/);
});
test('a modified Java archive is rejected before creating a package or executing Java/Python',async t=>{
  const root=await temporary(t),archive=path.join(root,'untrusted.zip'),target=path.join(root,'output');await writeFile(archive,'not the pinned archive');
  await assert.rejects(packagePhoneVideo(root,target,archive),/archive checksum differs/);await assert.rejects(access(target),{code:'ENOENT'});
});
