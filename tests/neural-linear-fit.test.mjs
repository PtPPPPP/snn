import test from 'node:test';
import assert from 'node:assert/strict';
import {FIT_SAMPLES,FIT_RATE,fitTrace,initialFit,predictValue,updateFit} from '../lib/learning/linear-fit.ts';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('one linear neuron gives the same selected prediction, residual and half-squared loss as the line',()=>{
 const p=initialFit(),trace=fitTrace(p,FIT_SAMPLES);
 assert.deepEqual(trace.rows.map(p=>p.prediction),[1,2,3]);assert.deepEqual(trace.rows.map(p=>p.residual),[0,-1,-2]);
 assert.equal(trace.rows[2].sampleLoss,2);close(trace.loss,5/6);close(trace.gradient.w,-5/3);close(trace.gradient.b,-1);
 for(const row of trace.rows)assert.equal(row.prediction,predictValue(p,row.x));
});
test('weight change has zero, single and double influence; bias has equal influence for all inputs',()=>{
 for(const row of FIT_SAMPLES){close(predictValue({w:1.1,b:1},row.x)-predictValue(initialFit(),row.x),.1*row.x);close(predictValue({w:1,b:1.1},row.x)-predictValue(initialFit(),row.x),.1);}
});
test('batch gradient matches finite differences under the declared 1/(2N) convention',()=>{
 const p={w:.75,b:1.4},trace=fitTrace(p,FIT_SAMPLES),eps=1e-5;
 for(const k of ['w','b']){const high=fitTrace({...p,[k]:p[k]+eps},FIT_SAMPLES).loss,low=fitTrace({...p,[k]:p[k]-eps},FIT_SAMPLES).loss;close((high-low)/(2*eps),trace.gradient[k]);}
});
test('simultaneous fixed-rate update uses one old snapshot, improving average while hurting x=0',()=>{
 const p=initialFit(),before=fitTrace(p,FIT_SAMPLES),next=updateFit(p,before.gradient,FIT_RATE),after=fitTrace(next,FIT_SAMPLES);
 close(next.w,1.5);close(next.b,1.3);for(const [i,v] of [1.3,2.8,4.3].entries())close(after.rows[i].prediction,v);
 close(after.loss,31/300);assert.ok(after.rows[0].sampleLoss>before.rows[0].sampleLoss);assert.ok(after.loss<before.loss);assert.deepEqual(p,initialFit());
});
test('the exact fit has zero gradient; a large rate is not guaranteed to improve loss',()=>{
 const exact=fitTrace({w:2,b:1},FIT_SAMPLES);assert.equal(exact.loss,0);assert.deepEqual(exact.gradient,{w:0,b:0});
 const p=initialFit(),before=fitTrace(p,FIT_SAMPLES),after=fitTrace(updateFit(p,before.gradient,3),FIT_SAMPLES);assert.ok(after.loss>before.loss);
});
test('next gradient is recomputed and local finite change matches the correctly conditioned loss slice',()=>{
 const initial=initialFit(),first=fitTrace(initial,FIT_SAMPLES),next=updateFit(initial,first.gradient,FIT_RATE),second=fitTrace(next,FIT_SAMPLES);
 close(second.gradient.w,-8/15);close(second.gradient.b,-1/5);
 const nudged=fitTrace({w:1.01,b:1},FIT_SAMPLES);close(nudged.loss,.81675);close((nudged.loss-first.loss)/.01,-1.6583333333333333);
 const oldSliceAtNewW=fitTrace({w:1.5,b:1},FIT_SAMPLES).loss;assert.notEqual(oldSliceAtNewW,second.loss);
 for(let i=0;i<30;i++){const t=fitTrace(initial,FIT_SAMPLES),n=updateFit(initial,t.gradient,FIT_RATE);initial.w=n.w;initial.b=n.b;assert.ok(FIT_SAMPLES.every(p=>predictValue(initial,p.x)>=0&&predictValue(initial,p.x)<=7.5));}
});

test('symmetric finite-change explanation keeps the analytic gradient sign through all thirty updates',()=>{
 let parameters=initialFit();
 for(let step=0;step<=30;step++){const trace=fitTrace(parameters,FIT_SAMPLES);for(const key of ['w','b']){const plus=fitTrace({...parameters,[key]:parameters[key]+.01},FIT_SAMPLES).loss,minus=fitTrace({...parameters,[key]:parameters[key]-.01},FIT_SAMPLES).loss;close((plus-minus)/.02,trace.gradient[key]);}
 parameters=updateFit(parameters,trace.gradient,FIT_RATE);}
});
