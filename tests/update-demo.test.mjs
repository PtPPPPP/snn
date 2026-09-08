import test from 'node:test';
import assert from 'node:assert/strict';
import { updateDemo, networkDemo, initialNetwork, quadraticDemo, fitParabola, polynomial } from '../app/play/rocket/train/update-demo-model.ts';

test('teaching backprop matches numerical derivatives and updates reduce loss', () => {
  for (const x of [.2, 1, 1.5]) for (const target of [-.8, 0, .8]) {
    let w1=.6,w2=.4;
    for(let i=0;i<30;i++) {
      const d=updateDemo(x,target,w1,w2),eps=1e-5;
      const numerical1=(updateDemo(x,target,w1+eps,w2).loss-updateDemo(x,target,w1-eps,w2).loss)/(2*eps);
      const numerical2=(updateDemo(x,target,w1,w2+eps).loss-updateDemo(x,target,w1,w2-eps).loss)/(2*eps);
      assert.ok(Math.abs(d.g1-numerical1)<1e-8);
      assert.ok(Math.abs(d.g2-numerical2)<1e-8);
      assert.ok(d.nextLoss<=d.loss+1e-12);
      w1=d.next1;w2=d.next2;
    }
  }
});

test('all six weight gradients match numerical derivatives',()=>{
 for(const inputs of [[1,.5],[-.8,1.5],[0,0]])for(const target of [-.8,.8]){
  const d=networkDemo(inputs,target,initialNetwork),eps=1e-5;
  for(let j=0;j<3;j++)for(let i=0;i<2;i++){
   const a=structuredClone(initialNetwork),b=structuredClone(initialNetwork);a[j][i]+=eps;b[j][i]-=eps;
   const numeric=(networkDemo(inputs,target,a).loss-networkDemo(inputs,target,b).loss)/(2*eps);
   assert.ok(Math.abs(numeric-d.gradients[j][i])<1e-8);
  }
  assert.ok(d.nextLoss<=d.loss+1e-12);
 }
});

test('quadratic teaching network learns x squared across the whole interval',()=>{
 const loss=w=>Array.from({length:21},(_,i)=>{const x=-1+i/10;return quadraticDemo([x,1],x*x,w).loss;}).reduce((a,b)=>a+b)/21;
 let w=structuredClone(initialNetwork);const start=loss(w);
 for(let n=0;n<100;n++)w=fitParabola(w);
 assert.ok(loss(w)<start*.01);
 for(let j=0;j<3;j++)for(let i=0;i<2;i++){
 const a=structuredClone(w),b=structuredClone(w),eps=1e-5;a[j][i]+=eps;b[j][i]-=eps;
 const numeric=(quadraticDemo([.4,1],.16,a).loss-quadraticDemo([.4,1],.16,b).loss)/(2*eps);
 assert.ok(Math.abs(numeric-quadraticDemo([.4,1],.16,w).gradients[j][i])<1e-8);
 }
});

test('expanded polynomial exactly equals the network throughout training',()=>{
 let weights=initialNetwork;
 for(let k=0;k<100;k++){
  const [a,b,c]=polynomial(weights);
  for(const x of [-1,-.7,0,.2,1])assert.ok(Math.abs(a*x*x+b*x+c-quadraticDemo([x,1],x*x,weights).output)<1e-12);
  weights=fitParabola(weights);
 }
});
