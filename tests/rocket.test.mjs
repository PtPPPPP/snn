import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, step, throttleForHold } from '../lib/rocket/physics.mjs';
test('hold ramps linearly and releases immediately', () => {
 assert.equal(throttleForHold(.25, true), .25);
 assert.equal(throttleForHold(2, true), 1);
 assert.equal(throttleForHold(2, false), 0);
});
test('zero throttle falls under gravity without consuming fuel', () => {
 const s = step(initialState(), 0,.05);
 assert.equal(s.fuel, 5);
 assert.ok(Math.abs(s.v + .4905) < 1e-10);
 assert.ok(Math.abs(s.h - 49.975475) < 1e-10);
});
test('full thrust consumes exact nominal fuel per step', () => {
 const s = step(initialState(), 1,.05);
 assert.equal(s.fuel, 4.925);
 assert.equal(s.thrust, 300);
});
test('empty fuel cannot generate thrust; landed state stops', () => {
 assert.equal(step({...initialState(),fuel:0}, 1).thrust, 0);
 const landed = step({...initialState(),h:.001,v:-.1},0);
 assert.equal(landed.result,'success');
 assert.deepEqual(step(landed,1),landed);
 const crash = step({...initialState(),h:.01,v:-5},0);
 assert.equal(crash.result,'crash');
});
import {readFileSync} from 'node:fs';
import {observation,policyThrottle} from '../lib/rocket/physics.mjs';
const read = path => JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
test('browser physics and energy observations match original Python fixtures',()=>{
 for(const fixture of read('./fixtures/rocket-physics.json')){
  let s=initialState();
  [0,.25,.5,1,0,.8,0].forEach((throttle,i)=>{
   s=step(s,throttle,.05);const expected=fixture.states[i];
   for(const key of ['h','v','fuel','thrust'])assert.ok(Math.abs(s[key]-expected[key])<1e-5,`${key}: ${s[key]} vs ${expected[key]}`);
   observation(s,fixture.energy).forEach((v,j)=>assert.ok(Math.abs(v-expected.obs[j])<1e-5));
  });
 }
});
test('browser actor outputs match PyTorch fixtures',()=>{
 for(const fixture of read('./fixtures/rocket-policy.json')){
  const model=read(`../public/rocket/${fixture.name}.json`);
  assert.ok(Math.abs(policyThrottle(fixture.state,model)-fixture.throttle)<1e-5);
 }
});
import {DT} from '../lib/rocket/physics.mjs';
test('fine integration defaults to 10ms and preserves engine response time',()=>{
 assert.equal(DT,.01);
 const s=step(initialState(70),1);
 assert.ok(Math.abs(s.thrust-60)<1e-10);
 assert.ok(Math.abs(s.fuel-4.997)<1e-10);
 assert.ok(s.h>69&&s.h<71);
});
