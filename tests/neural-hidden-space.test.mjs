import test from 'node:test';
import assert from 'node:assert/strict';
import {CLASSIFIER_PLANE,OBLIQUE,TOP,XOR_CORNERS,classify,features,initialReveal,orbit,outputScore,presentation,project,revealPosition,updateReveal} from '../lib/learning/hidden-space.ts';

test('hand-set features exactly separate the four XOR corners with actual hidden coordinates',()=>{
 assert.deepEqual(XOR_CORNERS.map(p=>features(p.input)),[[0,0,0],[1,0,0],[0,1,0],[1,1,1]]);
 assert.deepEqual(XOR_CORNERS.map(p=>outputScore(features(p.input))),[0,1,1,0]);
 for(const p of XOR_CORNERS)assert.equal(classify(features(p.input)),p.target);
 assert.equal(classify([.5,0,0]),0,'score threshold is strictly greater than .5');
});
test('the clipped plane is coplanar, cyclic and lies inside the unit cube',()=>{
 for(const p of CLASSIFIER_PLANE){assert.ok(p.every(v=>v>=0&&v<=1));assert.equal(outputScore(p),.5);}
 for(let i=0;i<CLASSIFIER_PLANE.length;i++){
  const a=CLASSIFIER_PLANE[i],b=CLASSIFIER_PLANE[(i+1)%5],c=CLASSIFIER_PLANE[(i+2)%5];
  assert.ok((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])>0);
 }
});
test('reveal and camera change display coordinates only; intermediate predictions and plane stay hidden',()=>{
 const baseline=XOR_CORNERS.map(p=>features(p.input));
 for(let i=0;i<=100;i++){
  const t=i/100,stage=presentation(t,true);
  assert.equal(stage.planeVisible,i===100);assert.equal(stage.predictionsVisible,i===100);assert.equal(stage.attemptedLineVisible,i===0);
  assert.deepEqual(revealPosition(baseline[3],t),[1,1,t]);
  for(let j=0;j<3;j++)assert.deepEqual(revealPosition(baseline[j],t),baseline[j]);
 }
 assert.deepEqual(XOR_CORNERS.map(p=>features(p.input)),baseline);
 assert.equal(presentation(1,false).planeVisible,false);assert.equal(presentation(1,false).predictionsVisible,true);
});
test('default oblique camera reveals height, top view collapses it, orbit remains finite and bounded',()=>{
 const flat=project([1,1,0],OBLIQUE),lifted=project([1,1,1],OBLIQUE);assert.ok(flat.y-lifted.y>90);
 const topFlat=project([1,1,0],TOP),topLifted=project([1,1,1],TOP);assert.ok(Math.abs(topFlat.y-topLifted.y)<1e-10);
 for(const t of [0,1])for(const point of XOR_CORNERS){const p=project(revealPosition(features(point.input),t),OBLIQUE);assert.ok(p.x>20&&p.x<320&&p.y>20&&p.y<258);}
 let camera={...OBLIQUE};for(let i=0;i<100;i++){camera=orbit(camera,.12,-.1);assert.ok(camera.pitch>=.12&&camera.pitch<=Math.PI/2);const p=project([1,1,1],camera);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));}
 assert.deepEqual(OBLIQUE,{yaw:-.62,pitch:.55});
});
test('axis labels remain inside the diagram throughout all reachable camera angles',()=>{
 for(let yaw=-Math.PI;yaw<=Math.PI;yaw+=.04)for(let pitch=.12;pitch<=Math.PI/2;pitch+=.025)for(let axis=0;axis<3;axis++){
  const end=[0,0,0];end[axis]=1.17;const p=project(end,{yaw,pitch}),baseline=p.y+(axis===2?-7:15);
  assert.ok(p.x>=30&&p.x<=310);assert.ok(baseline>=16&&baseline<=274,`${yaw}, ${pitch}, ${axis}: ${baseline}`);
 }
});
test('completion is factual and counted once per attempt; view and plane changes cannot retrigger it',()=>{
 let state=initialReveal();state=updateReveal(state,{planeRequested:false,t:1});assert.equal(state.completionCount,0);
 state=updateReveal(state,{planeRequested:true});assert.equal(state.completionCount,1);
 for(const patch of [{t:.5},{t:1},{planeRequested:false},{planeRequested:true}])state=updateReveal(state,patch);
 assert.equal(state.completionCount,1);assert.equal(initialReveal().completionCount,0);
});
test('a separately defined continuous-quadrant XOR exposes the hand-set model limitation',()=>{
 const input=[.4,.4],target=Number((input[0]>=.5)!==(input[1]>=.5));
 assert.equal(target,0);assert.equal(outputScore(features(input)),.8);assert.equal(classify(features(input)),1);
});
