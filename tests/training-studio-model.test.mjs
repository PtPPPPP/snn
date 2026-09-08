import test from 'node:test';
import assert from 'node:assert/strict';
import {boards,cellBox,cellBlend,dependencies,hitCell,playback,revealFor} from '../app/play/rocket/train/studio-model.ts';

test('all 17,408 cell centres round-trip through touch geometry',()=>{
  let count=0;
  for(let layer=0;layer<3;layer++)for(let row=0;row<boards[layer].rows;row++)for(let col=0;col<boards[layer].cols;col++){
    const cell={layer,row,col},box=cellBox(cell);
    assert.deepEqual(hitCell(layer,box.x+box.width/2,box.y+box.height/2),cell);count++;
  }
  assert.equal(count,17408);
});
test('exact downstream dependencies use column j of next weight matrix',()=>{
  assert.deepEqual(dependencies({layer:1,row:91,col:77}),[{layer:2,row:0,col:91}]);
  const deps=dependencies({layer:0,row:83,col:6});assert.equal(deps.length,128);
  deps.forEach((c,k)=>assert.deepEqual(c,{layer:1,row:k,col:83}));
  assert.deepEqual(dependencies({layer:2,row:0,col:90}),[]);
});
test('update sweep reveals single weights in column-major order and exact endpoints',()=>{
  const a={layer:1,row:63,col:63},index=63*128+63;
  assert.equal(cellBlend(a,index/16384),0);
  assert.equal(cellBlend(a,(index+.5)/16384),.5);
  assert.equal(cellBlend(a,(index+1)/16384),1);
  for(let l=0;l<3;l++){assert.equal(revealFor(l,0,.8),0);assert.equal(revealFor(l,1,.8),0);assert.equal(revealFor(l,2,1),1);}
  assert.equal(revealFor(2,2,.2),.6000000000000001);assert.equal(revealFor(1,2,.2),0);
  assert.equal(playback(599.99,50).round,49);
  const end=playback(600,50);
  assert.deepEqual(end,{round:49,phase:2,part:1,layer:0});
  assert.equal(cellBlend({layer:0,row:127,col:6},revealFor(0,end.phase,end.part)),1);
});
