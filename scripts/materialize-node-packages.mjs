// Turn pnpm's local links into ordinary directories for a ZIP on Windows.
// Resolve every declared dependency against the installed source graph. Hoist
// when versions agree, otherwise install the conflicting version locally.
import {cp,mkdir,readFile,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
export async function materializeNodePackages(sourceModules,targetModules,entries){
  await mkdir(targetModules,{recursive:true});const roots=new Map(),installed=new Map();let count=0;
  async function locate(from,name){let d=from;while(true){const candidate=path.join(d,'node_modules',name);if(existsSync(candidate))return realpath(candidate);const up=path.dirname(d);if(up===d)return null;d=up;}}
  async function install(source,name,requester,ancestors=[]){
    source=await realpath(source);
    const ancestor=ancestors.find(a=>a.name===name&&a.source===source);if(ancestor)return;
    let target;if(!roots.has(name)){target=path.join(targetModules,name);roots.set(name,{source,target});}else if(roots.get(name).source===source)target=roots.get(name).target;else target=path.join(requester,'node_modules',name);
    if(installed.has(target)){if(installed.get(target)!==source)throw Error('Dependency destination conflict: '+name);return;}
    installed.set(target,source);count++;
    await cp(source,target,{recursive:true,dereference:true,filter:f=>f===source||!path.relative(source,f).split(path.sep).some(p=>['node_modules','.git','__pycache__'].includes(p))});
    const pkg=JSON.parse(await readFile(path.join(source,'package.json'),'utf8'));
    const deps={...pkg.peerDependencies,...pkg.dependencies,...pkg.optionalDependencies};
    for(const dep of Object.keys(deps)){const found=await locate(source,dep);if(!found){if(pkg.optionalDependencies?.[dep]||pkg.peerDependencies?.[dep])continue;throw Error('Installed dependency missing: '+name+' -> '+dep);}await install(found,dep,target,[...ancestors,{name,source,target}]);}
  }
  for(const name of entries)await install(path.join(sourceModules,name),name,targetModules);
  return {materialized_packages:count,symlinks_required:false};
}
