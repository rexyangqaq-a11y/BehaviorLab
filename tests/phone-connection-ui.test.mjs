import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhoneConnectionPanel} from '../web/phone-connection-ui.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function timers(){let n=0;const tasks=new Map();return {tasks,schedule:(fn,ms)=>{tasks.set(++n,{fn,ms});return n;},cancel:id=>tasks.delete(id),fire(){const [id,{fn}]=tasks.entries().next().value;tasks.delete(id);fn();}};}

test('phone visibility updates automatically without backlog, pauses when hidden and reports failures honestly',async()=>{
  const doc=new EventTarget();doc.hidden=false;const time=timers(),badge={},button={},changes=[];let finish,calls=0,next={state:'connected',checked_at:new Date().toISOString()};
  const panel=createPhoneConnectionPanel({api:async(route,input)=>{calls++;assert.equal(route,'/connection/check');assert.deepEqual(input,{});await new Promise(resolve=>finish=resolve);if(next instanceof Error)throw next;return next;},onChange:value=>changes.push(value.state),badge,button,document:doc,...time});
  panel.start();await tick();assert.equal(calls,1);assert.equal(button.disabled,true);const again=panel.check();finish();await again;
  assert.match(badge.textContent,/已连接1台/);assert.equal(time.tasks.size,1);assert.equal([...time.tasks.values()][0].ms,5000);
  next={state:'disconnected',checked_at:new Date().toISOString()};time.fire();await tick();assert.equal(calls,2);finish();await panel.check();assert.match(badge.textContent,/未连接/);
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(time.tasks.size,0);
  next=Error('service down');doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await tick();finish();await panel.check();assert.match(badge.textContent,/读取失败/);assert.ok(!badge.textContent.includes('未连接'));
  panel.dispose();assert.equal(time.tasks.size,0);assert.deepEqual(changes,['connected','disconnected','error']);
});
