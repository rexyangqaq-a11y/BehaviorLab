import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
export function phonePython(project){
  const file=path.join(project,'.runtime/phone-frameworks.json');
  const config=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
  if(config.python_relative){
    const resolved=path.resolve(project,config.python_relative),relative=path.relative(path.join(project,'.runtime'),resolved);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Python runtime must stay inside .runtime');
    return resolved;
  }
  // Legacy local checkouts used an absolute path. Portable builds use only the
  // relative field above, so moving the folder cannot retain the developer path.
  if(config.python)return path.resolve(config.python);
  for(const name of ['python-phone/python.exe','python-phone/Scripts/python.exe']){const candidate=path.join(project,'.runtime',name);if(existsSync(candidate))return candidate;}
  return path.join(project,'.runtime/python-phone/Scripts/python.exe');
}
