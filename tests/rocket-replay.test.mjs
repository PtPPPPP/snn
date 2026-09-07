import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {flightReplay} from '../lib/rocket/replay.mjs';
import {policyTrace} from '../lib/rocket/physics.mjs';
const m=JSON.parse(fs.readFileSync(new URL('../public/rocket/energy.json',import.meta.url)));
test('replay retains aligned decisions and terminal landing state',()=>{
 const frames=flightReplay(m);
 assert.equal(frames[0].state.h,50);assert.equal(frames[0].state.v,0);
 assert.equal(frames.at(-1).state.result,'success');assert.equal(frames.at(-1).state.h,0);
 assert.ok(frames.some(f=>f.trace.throttle>.5));
 for(let i=0;i<frames.length;i++){
  const f=frames[i];assert.equal(f.trace.throttle,policyTrace(f.observed,m).throttle);
  if(i)assert.ok(f.state.t>frames[i-1].state.t);
 }
 assert.deepEqual(frames.at(-1).trace,frames.at(-2).trace);
});
