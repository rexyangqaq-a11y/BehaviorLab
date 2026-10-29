import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
import path from 'node:path';

// Use the installed phone runtime's Undici rather than Node fetch's implicit
// headers/body deadlines. The transport owns optional deadlines and Stop.
export function createPhoneModelNetwork(project){
  const require=createRequire(path.join(realpathSync(path.join(project,'integrations/midscene/node_modules/@midscene/harmony')),'package.json'));
  const {Agent,fetch}=require('undici');
  const dispatcher=new Agent({headersTimeout:0,bodyTimeout:0,connect:{timeout:0}});
  return {fetch:(url,options)=>fetch(url,{...options,dispatcher}),close:()=>dispatcher.close()};
}

// Pinned OpenAI 6.x creates another timeout inside fetchWithTimeout even with
// a custom fetch. Route this seam directly to our audited transport instead.
export function controlledModelClient(client,{fetch,signal}){
  const wrapped=client.withOptions({maxRetries:0,fetch,logLevel:'off'});
  if(typeof wrapped.fetchWithTimeout!=='function')throw Error('模型SDK超时接口已变化，请先更新接入适配');
  wrapped.fetchWithTimeout=(url,init={})=>fetch(url,{...init,method:(init.method??'GET').toUpperCase(),signal});
  return wrapped;
}
