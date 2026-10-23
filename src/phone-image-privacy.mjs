import {realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
let sharp;
export function privateScreenRects(nodes,target){
  return nodes.filter(n=>{const text=(n.text??'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();return text&&(text===target||/^\d{14,17}(?:\s+\d{14,17})*$/.test(text)||/^1[3-9]\d{9}$/.test(text));}).flatMap(n=>{const b=n.bounds?.match(/-?\d+/g)?.map(Number);return b?.length===4&&b[2]>b[0]&&b[3]>b[1]?[{left:b[0],top:b[1],width:b[2]-b[0],height:b[3]-b[1]}]:[];});
}
export async function maskPrivateScreen(bytes,rects){
  if(!rects.length)return bytes;
  if(!sharp){const pkg=await realpath(new URL('../integrations/midscene/node_modules/@midscene/harmony/package.json',import.meta.url));const require=createRequire(pkg),shared=require.resolve('@midscene/shared/img');const requireShared=createRequire(shared);sharp=(await import(pathToFileURL(requireShared.resolve('sharp')).href)).default;}
  const meta=await sharp(bytes).metadata();
  const overlays=rects.map(r=>({left:Math.max(0,Math.floor(r.left)),top:Math.max(0,Math.floor(r.top)),width:Math.max(1,Math.min(meta.width-r.left,Math.ceil(r.width))),height:Math.max(1,Math.min(meta.height-r.top,Math.ceil(r.height)))})).filter(r=>r.left<meta.width&&r.top<meta.height);
  return sharp(bytes).composite(overlays.map(r=>({input:Buffer.from(`<svg width="${r.width}" height="${r.height}"><rect width="100%" height="100%" fill="#202b38"/></svg>`),left:r.left,top:r.top}))).jpeg({quality:90}).toBuffer();
}
