import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialState} from '../lib/rocket/physics.mjs';
import {compareHeight,nodeCalculation} from '../lib/rocket/decision-lesson.mjs';
const model=JSON.parse(fs.readFileSync(new URL('../public/rocket/energy.json',import.meta.url)));
test('height intervention keeps physical quantities fixed and recomputes braking input',()=>{
 const base={...initialState(20),v:-10};
 const c=compareHeight(base,10,model);
 assert.equal(c.changed.v,base.v);assert.equal(c.changed.fuel,base.fuel);assert.equal(c.changed.thrust,base.thrust);
 assert.notEqual(c.before.inputs[0],c.after.inputs[0]);assert.notEqual(c.before.inputs[4],c.after.inputs[4]);
 for(const i of [1,2,3,5,6])assert.equal(c.before.inputs[i],c.after.inputs[i]);
});
test('selected node calculations and final action exactly reconstruct real trace',()=>{
 const c=compareHeight({...initialState(20),v:-10},8,model);
 for(const t of [c.before,c.after])for(let layer=0;layer<3;layer++){
 const i=layer===2?0:c.selected[layer];
 const calc=nodeCalculation(t,model,layer,i);
 assert.ok(Math.abs(calc.output-t.activations[layer][i])<1e-12);
 }
 const calc=nodeCalculation(c.after,model,2,0);
 assert.equal((Math.fround(Math.max(-1,Math.min(1,calc.sum)))+1)/2,c.after.throttle);
});
