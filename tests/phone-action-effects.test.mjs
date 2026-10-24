import test from 'node:test';
import assert from 'node:assert/strict';
import {actionEffects,observedAction,validatePhysicalAction,unexpectedWorkerState} from '../src/phone-action-effects.mjs';

test('action intent without outcome and swallowed physical failures remain uncertain',()=>{
  assert.equal(actionEffects([{type:'action_intent',id:'a'}]).effect_unknown,true);
  assert.equal(actionEffects([{type:'action_intent',id:'a'},{type:'action_return',id:'a'}]).effect_unknown,false);
  const result=actionEffects([{type:'action_intent',id:'a'},{type:'hdc_failed_or_unknown',id:'h',action_id:'a',effect_unknown:true},{type:'action_return',id:'a'}]);
  assert.equal(result.effect_unknown,true);assert.deepEqual(result.unknown_action_ids,['a']);assert.equal(result.automatic_replay,false);
  assert.equal(unexpectedWorkerState({status:'running'},[{type:'action_intent',id:'a'}]).status,'needs_attention');
  assert.equal(unexpectedWorkerState({status:'queued'},[],Error('spawn failed')).status,'blocked');
});

test('observation errors never erase an earlier physical error or permit automatic replay',async()=>{
  const events=[],primary=Error('device timeout');let calls=0;
  await assert.rejects(observedAction({id:'a',record:e=>events.push(e),perform:async()=>{calls++;throw primary;},after:async()=>{throw Error('camera unavailable');}}),e=>e===primary&&e.effect_unknown&&e.observation_error==='camera unavailable');
  assert.equal(calls,1);assert.equal(actionEffects(events).effect_unknown,true);
});

test('a missing observation after a returned command and a failed durable outcome require review',async()=>{
  const events=[];
  await assert.rejects(observedAction({id:'a',record:e=>events.push(e),perform:async()=>42,after:async()=>{throw Error('camera');}}),e=>e.effect_unknown);
  assert.equal(actionEffects(events).effect_unknown,true);
  let sent=0;await assert.rejects(observedAction({id:'b',record:()=>{throw Error('disk full');},perform:async()=>{sent++;},after:async()=>{}}),e=>e.effect_unknown);assert.equal(sent,1);
});

test('physical coordinates reject mixed units, NaN and screen boundaries before sending',()=>{
  const screen={width:1320,height:2848};validatePhysicalAction('tap',{x:0,y:2847},screen);
  for(const p of [{x:1320,y:0},{x:10,y:2848},{x:NaN,y:0},{x:-1,y:2}])assert.throws(()=>validatePhysicalAction('tap',p,screen),e=>e.action_not_sent&&e.effect_unknown===false);
  assert.throws(()=>validatePhysicalAction('swipe',{x:0,y:1,ex:20,ey:9999},screen));
  assert.throws(()=>validatePhysicalAction('tap',{x:1,y:1},null));validatePhysicalAction('back',{},null);
});
