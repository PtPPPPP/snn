import test from 'node:test';
import assert from 'node:assert/strict';
import {expireFeedback,initialFeedback,observeFeedback,sameObservation} from '../lib/learning/local-feedback.ts';
const observation=(patch={})=>({attempt:0,model:'initial',sample:'2',prediction:0,goal:false,...patch});
test('initial or initially solved presets never celebrate',()=>{
 for(const goal of [false,true]){const state=initialFeedback(observation({goal}));assert.equal(state.event,0);assert.equal(state.active,false);}
 let state=initialFeedback(observation({goal:true}));state=observeFeedback(state,observation({model:'wrong',goal:false}));state=observeFeedback(state,observation({model:'correct',goal:true}));assert.notEqual(state.kind,'complete');
});
test('real model false-to-true completion happens once, loses stale claim and is reset per attempt',()=>{
 let state=initialFeedback(observation());state=observeFeedback(state,observation({model:'fit',goal:true}));assert.equal(state.kind,'complete');assert.equal(state.event,1);assert.equal(state.active,true);
 state=observeFeedback(state,observation({model:'fit-again',goal:true}));assert.equal(state.event,1);
 state=observeFeedback(state,observation({model:'not-fit',goal:false}));assert.equal(state.active,false);assert.equal(state.kind,null);
 state=observeFeedback(state,observation({model:'fit',goal:true}));assert.equal(state.active,false);assert.equal(state.event,1);
 state=observeFeedback(state,observation({attempt:1}));assert.equal(state.event,0);state=observeFeedback(state,observation({attempt:1,model:'fit',goal:true}));assert.equal(state.kind,'complete');assert.equal(state.event,1);
});
test('changing inspected samples cannot pretend that a prediction changed',()=>{
 let state=initialFeedback(observation());state=observeFeedback(state,observation({sample:'1',prediction:1}));assert.equal(state.event,0);assert.equal(state.active,false);
 state=observeFeedback(state,observation({model:'new',sample:'1',prediction:0}));assert.equal(state.kind,'flip');assert.equal(state.from,1);assert.equal(state.event,1);
 state=observeFeedback(state,observation({model:'new',sample:'2',prediction:1}));assert.equal(state.active,false);assert.equal(state.kind,null);assert.equal(state.event,1);
});
test('goal feedback takes priority over a simultaneous selected-point flip, and null predictions never produce fake flips',()=>{
 const state=observeFeedback(initialFeedback(observation()),observation({model:'new',prediction:1,goal:true}));assert.equal(state.kind,'complete');assert.equal(state.event,1);
 const reveal=observeFeedback(initialFeedback(observation({prediction:null})),observation({model:'end',prediction:1}));assert.equal(reveal.event,0);
});
test('old timers cannot expire newer cues; reduced motion uses the exact same logical completion state',()=>{
 let state=initialFeedback(observation());state=observeFeedback(state,observation({model:'one',prediction:1}));state=observeFeedback(state,observation({model:'two',prediction:0}));assert.equal(state.event,2);
 assert.equal(expireFeedback(state,1,0).active,true);assert.equal(expireFeedback(state,2,0).active,false);
 const complete=observeFeedback(initialFeedback(observation()),observation({model:'fit',goal:true}));assert.equal(expireFeedback(complete,complete.event,0).observation.goal,true);assert.equal(expireFeedback(complete,complete.event,0).completed,true);
 const newAttempt=observeFeedback(initialFeedback(observation({attempt:1})),observation({attempt:1,model:'fit',goal:true}));assert.equal(expireFeedback(newAttempt,1,0).active,true);assert.equal(expireFeedback(newAttempt,1,1).active,false);
 assert.equal(sameObservation(observation(),observation()),true);assert.equal(sameObservation(observation(),observation({attempt:1})),false);
});
