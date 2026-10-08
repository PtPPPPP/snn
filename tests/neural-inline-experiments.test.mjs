import test from 'node:test';
import assert from 'node:assert/strict';
import {initialExperiment} from '../lib/learning/inline-experiments.ts';
import {examples,metrics,trainStep} from '../lib/learning/foundations.ts';
const ids=['neuron','perceptron','xor-limit','layers','activation','loss','backprop'];
test('each inline block owns a fresh deterministic model with the intended question setup',()=>{
 for(const id of ids){const a=initialExperiment(id),b=initialExperiment(id);assert.deepEqual(a,b);assert.notEqual(a,b);assert.notEqual(a.model,b.model);assert.notEqual(a.model.parameters,b.model.parameters);}
 assert.equal(initialExperiment('neuron').dataset,'linear');assert.equal(initialExperiment('xor-limit').dataset,'xor');
 assert.equal(initialExperiment('layers').model.activation,'linear');assert.equal(initialExperiment('activation').model.activation,'tanh');
});
test('changing and resetting one block never mutates another block',()=>{
 const blocks=ids.map(initialExperiment),before=JSON.stringify(blocks);
 const updated=trainStep(blocks[6].model,examples('xor'),.2).model;
 assert.notDeepEqual(updated.parameters,blocks[6].model.parameters);assert.equal(JSON.stringify(blocks),before);
 const fresh=initialExperiment('backprop');fresh.model.parameters[0]=4;assert.equal(JSON.stringify(blocks),before);
});
test('the XOR limitation example starts with three of four symmetric clusters correct, not a 50% maximum claim',()=>{
 const q=initialExperiment('xor-limit');assert.equal(metrics(q.model,examples(q.dataset)).accuracy,.75);
});
