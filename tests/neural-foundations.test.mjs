import test from 'node:test';
import assert from 'node:assert/strict';
import { examples, initialNetwork, forward, binaryLoss, metrics, gradients, applyGradient, trainStep, correctMistake, equivalentLinear, decisionLogit, hasMeaningfulBoundary } from '../lib/learning/foundations.ts';

test('initialization and datasets are deterministic and account for all 17 parameters', () => {
  assert.deepEqual(initialNetwork('mlp'), initialNetwork('mlp'));
  assert.equal(initialNetwork('mlp').parameters.length, 17);
  assert.equal(initialNetwork('mlp').parameters[0], -.9577169832773507);
  for (const id of ['linear', 'xor']) {
    const points = examples(id);
    assert.equal(points.length, 36);
    assert.equal(points.filter(p => p.target === 1).length, 18);
    assert.ok(points.every(p => p.x.every(x => Math.abs(x) < 1)));
  }
});
test('all gradients match central differences for tanh and identity, including nonzero biases', () => {
  const points = [{id:0,x:[.21,-.43],target:1},{id:1,x:[-.64,.12],target:0},{id:2,x:[.71,.38],target:1}];
  for (const activation of ['tanh', 'linear']) {
    const model = initialNetwork('mlp', activation);
    model.parameters = model.parameters.map((w,i) => w + (i - 7) * .013);
    const g = gradients(model, points), before = [...model.parameters];
    for (let i=0;i<17;i++) {
      const plus = {...model,parameters:[...before]}, minus = {...model,parameters:[...before]};
      plus.parameters[i] += 1e-5; minus.parameters[i] -= 1e-5;
      const numeric = (metrics(plus,points).loss-metrics(minus,points).loss)/2e-5;
      assert.ok(Math.abs(numeric-g[i])<1e-8,`${activation} parameter ${i}: ${numeric} vs ${g[i]}`);
    }
    const next = applyGradient(model,g,.2);
    assert.deepEqual(model.parameters,before);
    next.parameters.forEach((v,i) => assert.equal(v,before[i]-.2*g[i]));
    assert.ok(metrics(next,points).loss<metrics(model,points).loss);
  }
});
test('the perceptron corrects the separable data without using smooth backprop', () => {
  let model = initialNetwork('perceptron');
  const data = examples('linear');
  for(let i=0;i<200;i++) model=correctMistake(model,data,.2).model;
  assert.equal(metrics(model,data).accuracy,1);
  assert.throws(()=>gradients(model,data));
});
test('affine hidden layers exactly collapse to a single affine map', () => {
  const model=initialNetwork('mlp','linear'), [a,b,c]=equivalentLinear(model);
  for(const p of examples('xor')) assert.ok(Math.abs(forward(model,p.x).logit-(a*p.x[0]+b*p.x[1]+c))<1e-12);
});
test('deterministic tanh network learns this XOR dataset, linear comparison remains constrained', () => {
  const data=examples('xor');let tanh=initialNetwork('mlp'),linear=initialNetwork('mlp','linear');
  const start=metrics(tanh,data).loss;
  for(let i=0;i<1200;i++){tanh=trainStep(tanh,data,.2).model;linear=trainStep(linear,data,.2).model;}
  assert.equal(metrics(tanh,data).accuracy,1);
  assert.ok(metrics(tanh,data).loss<.007);
  assert.ok(metrics(tanh,data).loss<start/50);
  assert.ok(Math.abs(metrics(linear,data).loss-Math.log(2))<1e-5);
});
test('stable loss stays finite at extreme logits and threshold convention is explicit', () => {
  for(const z of [-1000,1000]) for(const y of [0,1]) assert.ok(Number.isFinite(binaryLoss(z,y)));
  assert.equal(forward({kind:'perceptron',activation:'linear',parameters:[0,0,0]},[0,0]).prediction,1);
});
test('affine XOR contours remain straight and suppress numerically degenerate boundaries', () => {
  const data=examples('xor');
  for (const rate of [.2,.5]) {
    let model=initialNetwork('mlp','linear');
    for(let i=0;i<1200;i++) model=trainStep(model,data,rate).model;
    assert.equal(hasMeaningfulBoundary(model),false);
    for(let row=0;row<=58;row++) {
      let previous=null, crossings=0;
      for(let col=0;col<=58;col++) {
        const x=[col/58*2-1,1-row/58*2];
        const positive=decisionLogit(model,x)>=0;
        if(previous!==null&&previous!==positive)crossings++;
        previous=positive;
        assert.ok(Math.abs(forward(model,x).probability-.5)<1e-7);
      }
      assert.ok(crossings<=1,'an affine boundary crosses a row at most once');
    }
  }
  assert.equal(hasMeaningfulBoundary(initialNetwork('mlp','linear')),true);
});
