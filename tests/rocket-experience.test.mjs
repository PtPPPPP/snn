import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraTarget, resetRound, firstBurn} from '../lib/rocket/experience.mjs';
test('retry preserves height and clears throttle and telemetry',()=>{const s=resetRound(53.2);assert.equal(s.human.h,s.ai.h);assert.equal(s.human.h,53.2);assert.equal(s.throttle,0);assert.equal(s.steps,0);assert.equal(s.humanBurn,null);});
test('shared camera keeps both rockets visible and stable high above ground',()=>{assert.equal(cameraTarget(50,45,50),65);assert.equal(cameraTarget(40,42,50),65);assert.ok(cameraTarget(2,3,50)<20);assert.ok(cameraTarget(60,2,50)>60);});
test('first burn records observed altitude only once',()=>{assert.equal(firstBurn(null,0,50),null);assert.equal(firstBurn(null,60,25),25);assert.equal(firstBurn(25,120,20),25);});
