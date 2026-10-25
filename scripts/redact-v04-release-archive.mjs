import {cp,readFile,readdir,writeFile,stat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {releasePrivacyPlan,cleanPrivateText} from './release-privacy.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nodesOf=tree=>{const rows=[];const walk=n=>{if(n?.attributes&&n.attributes.visible!=='false')rows.push(n.attributes);for(const child of n?.children??[])walk(child);};walk(tree);return rows;};
const fail=(value,message)=>{if(!value)throw Error(message);};

export function scaleReleaseRectangles(rectangles,screen,asset){
  return rectangles.map(r=>{const left=Math.max(0,Math.floor(r.left*asset.width/screen.width)),top=Math.max(0,Math.floor(r.top*asset.height/screen.height));return {left,top,width:Math.min(asset.width-left,Math.ceil((r.right-r.left)*asset.width/screen.width)),height:Math.min(asset.height-top,Math.ceil((r.bottom-r.top)*asset.height/screen.height))};}).filter(r=>r.width>0&&r.height>0);
}

export async function redactV04Archive({source,archive,out}){
  const original=await realpath(archive),target=path.resolve(out),sourceRoot=await realpath(source);
  fail(!(await stat(target).catch(e=>{if(e.code!=='ENOENT')throw e;return null;})),'Choose a new output directory; original archives are never overwritten.');
  const sourceRelative=path.relative(sourceRoot,target),archiveRelative=path.relative(original,target);
  fail(sourceRelative&&sourceRelative!=='.data'&&!sourceRelative.startsWith('.data'+path.sep),'Output cannot be in source data.');
  fail(archiveRelative&&(!archiveRelative.startsWith('..')?false:true),'Output cannot be nested inside the input archive.');
  const manifest=await json(path.join(original,'manifest.json'));
  fail(manifest.evaluation_id==='evaluation_20261022_b14102b7-e102-4744-b9a3-bc1d99ef014b'&&manifest.runs===36&&manifest.images===1486,'Only the frozen v0.4 archive is supported.');
  const req=createRequire(path.join(sourceRoot,'integrations/midscene/node_modules/@midscene/harmony/package.json'));
  const shared=createRequire(req.resolve('@midscene/shared/img'));
  const sharp=(await import(pathToFileURL(shared.resolve('sharp')).href)).default;
  const plans=new Map(),privateStrings=new Set(),sourceChecks=[];
  const readSource=async file=>{const bytes=await readFile(file);sourceChecks.push({file,sha256:sha(bytes)});return bytes;};
  for(const record of manifest.records){
    const dir=path.join(sourceRoot,'.data/.phone-lab/runs',record.run_id),layouts=[];
    for(const name of (await readdir(dir)).filter(n=>/^layout-[a-f0-9-]+\.json$/.test(n)||n==='final-layout.json'))layouts.push(nodesOf(JSON.parse((await readSource(path.join(dir,name))).toString('utf8'))));
    const environment=await json(path.join(original,'runs',record.run_id,'environment.json'));
    const plan=releasePrivacyPlan(layouts,{...environment.screen,caseId:record.case_id});
    fail(plan.screen.width>0&&plan.screen.height>0,'Recorded screen dimensions missing.');
    plans.set(record.run_id,plan);for(const text of plan.privateStrings)privateStrings.add(text);
  }
  await cp(original,target,{recursive:true,errorOnExist:true,force:false});
  const mappings=new Map(),publicImages=[];
  let changed=0;
  for(const record of manifest.records){
    const dir=path.join(target,'runs',record.run_id),plan=plans.get(record.run_id);
    const events=(await readFile(path.join(dir,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    for(const asset of events.filter(e=>e.type==='image').map(e=>e.asset)){
      fail(/^assets\/img_[a-f0-9-]+\.(?:jpe?g|png)$/.test(asset.file),'Unexpected image path.');
      const file=path.join(dir,asset.file),bytes=await readFile(file);
      fail(sha(bytes)===asset.sha256,'Original archive image hash mismatch.');
      let publicBytes=bytes;const rectangles=scaleReleaseRectangles(plan.rectangles,plan.screen,asset);
      if(rectangles.length){
        const overlays=rectangles.map(r=>({left:r.left,top:r.top,input:Buffer.from(`<svg width="${r.width}" height="${r.height}"><rect width="100%" height="100%" fill="#202b38"/></svg>`)}));
        const render=sharp(bytes).composite(overlays);
        publicBytes=asset.format==='png'?await render.png().toBuffer():await render.jpeg({quality:95}).toBuffer();
        await writeFile(file,publicBytes);changed++;
      }
      const info={run_id:record.run_id,id:asset.id,file:'runs/'+record.run_id+'/'+asset.file,source_sha256:asset.sha256,public_sha256:sha(publicBytes),redacted:rectangles.length>0,rectangles,policy:'v04-release-private-identifiers-v1'};
      mappings.set(asset.id,info);publicImages.push(info);
    }
  }
  const secrets=[...privateStrings];
  const clean=value=>{
    if(Array.isArray(value))return value.map(clean);
    if(value&&typeof value==='object'){
      const result=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)]));
      const image=mappings.get(value.id);
      if(image&&value.sha256===image.source_sha256){result.source_sha256=image.source_sha256;result.sha256=image.public_sha256;result.release_redaction={applied:image.redacted,policy:image.policy};}
      return result;
    }
    return typeof value==='string'?cleanPrivateText(value,secrets):value;
  };
  const files=[];
  async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name),rel=path.relative(target,file).replaceAll('\\','/');
    if(item.isSymbolicLink())throw Error('Archive links rejected');
    if(item.isDirectory()){await walk(file);continue;}
    if(rel==='files.sha256.json')continue;
    if(file.endsWith('.jsonl')){const rows=(await readFile(file,'utf8')).trim().split('\n').filter(Boolean).map(line=>clean(JSON.parse(line)));await writeFile(file,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');}
    else if(file.endsWith('.json'))await writeFile(file,JSON.stringify(clean(await json(file)),null,2)+'\n');
    else if(/\.(?:html|txt|md|mjs)$/.test(file))await writeFile(file,cleanPrivateText(await readFile(file,'utf8'),secrets));
  }}
  await walk(target);
  // Regenerate run pages from the cleaned event stream so embedded JSON uses
  // public asset hashes; original model-request source hashes stay in strings.
  for(const record of manifest.records){
    const dir=path.join(target,'runs',record.run_id),input=await json(path.join(dir,'input.json'));
    const events=(await readFile(path.join(dir,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    const text='<meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:16px/1.6 system-ui;max-width:1100px;margin:32px auto;padding:0 20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f7;padding:12px}img{max-width:100%;height:auto}details{border:1px solid #ccc;padding:8px;margin:10px 0}</style>'+
      `<title>${escape(input.name)}</title><p><a href="../../index.html">返回36项矩阵</a></p><h1>${escape(input.name)}</h1><p>${escape(input.framework_id)} / ${escape(input.service.model)} · ${escape(record.verdict)} · 用户复核待定</p><p>公开导出副本：敏感区域用实色遮盖，部分相邻UI也会被覆盖；原图只留本机。图像source_sha256为原图哈希，sha256为公开文件哈希。模型请求中的原始asset哈希保留，映射见根目录release-image-map.json。</p><pre>${escape(input.instruction)}</pre>`+
      events.map(e=>`<details><summary>#${e.seq} ${escape(e.type)} ${escape(e.name??e.id??'')}</summary>${e.type==='image'?`<a href="${escape(e.asset.file)}"><img loading="lazy" src="${escape(e.asset.file)}" alt="公开导出图 ${escape(e.asset.role)}"></a>`:''}<pre>${escape(JSON.stringify(e,null,2))}</pre></details>`).join('\n');
    await writeFile(path.join(dir,'index.html'),text);
  }
  await writeFile(path.join(target,'release-image-map.json'),JSON.stringify(publicImages,null,2)+'\n');
  const privacy={public_upload_approved:false,review_state:'local_redacted_candidate_pending_final_review',policy:'v04-release-private-identifiers-v1',images_total:publicImages.length,images_redacted:changed,private_text_values_removed:privateStrings.size,known_credentials_included:false,source_images_overwritten:false,geometry:'union of recorded layout rectangles plus conservative covers on storage task frames; scaled to each recorded image size',request_provenance:'Original request asset hashes are retained as source references; release-image-map.json gives public file hashes.',limitations:['Conservative rectangles can cover adjacent UI','Layout-based cleaning and sampled visual review do not constitute exhaustive OCR review of every screenshot','Public app posts and product content may remain'],real_model_requests:0,real_device_commands:0};
  await writeFile(path.join(target,'privacy-review.json'),JSON.stringify(privacy,null,2)+'\n');
  const finalManifest=await json(path.join(target,'manifest.json'));finalManifest.public_image_derivatives={policy:privacy.policy,total:publicImages.length,redacted:changed,source_hashes_preserved:true};
  await writeFile(path.join(target,'manifest.json'),JSON.stringify(finalManifest,null,2)+'\n');
  const indexFile=path.join(target,'index.html');let index=await readFile(indexFile,'utf8');index=index.replace('本地待公开审阅副本。','已遮盖敏感区域的本地发布候选。');await writeFile(indexFile,index);
  async function hashAll(dir){for(const item of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name),rel=path.relative(target,file).replaceAll('\\','/');if(item.isDirectory())await hashAll(file);else if(rel!=='files.sha256.json'){const bytes=await readFile(file);files.push({file:rel,bytes:bytes.length,sha256:sha(bytes)});if(/\.(?:jsonl?|html|txt|md|mjs)$/.test(file)&&secrets.some(s=>bytes.includes(Buffer.from(s))))throw Error('Private text remains after cleaning');}}}
  await hashAll(target);
  await writeFile(path.join(target,'files.sha256.json'),JSON.stringify(files,null,2)+'\n');
  for(const record of sourceChecks)fail(sha(await readFile(record.file))===record.sha256,'Source layout changed during redaction export.');
  return {runs:36,images:publicImages.length,redacted_images:changed,private_text_values_removed:privateStrings.size,source_unchanged:true,files:files.length+1,out:target};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const {values}=parseArgs({options:{source:{type:'string'},archive:{type:'string'},out:{type:'string'}}});
 fail(values.source&&values.archive&&values.out,'--source, --archive and a new --out directory are required');
 redactV04Archive(values).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
