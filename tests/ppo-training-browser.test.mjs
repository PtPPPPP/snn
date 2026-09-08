import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

test('new training studio: real record, playback, stable focus, cell selection and responsive overview',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/play/rocket/train');await page.getByLabel('播放速度',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('播放速度',{exact:true}).inputValue(),'8');
  assert.equal(await page.locator('[data-studio-input]').count(),7);
  assert.equal(await page.locator('[data-studio-layer]').count(),3);
  await page.getByLabel('训练轮次',{exact:true}).fill('0');
  const initial=await page.locator('[data-weight-value]').textContent();
  await page.getByLabel('训练轮次',{exact:true}).fill('599.99');assert.notEqual(await page.locator('[data-weight-value]').textContent(),initial);
  await page.getByRole('button',{name:'聚焦当前格',exact:true}).click();assert.equal(await page.locator('[data-studio-selected]').count(),1);
  await page.getByLabel('选择网络层',{exact:true}).selectOption('0');
  await page.getByLabel('选择神经元编号',{exact:true}).selectOption('83');
  await page.getByLabel('训练轮次',{exact:true}).fill('295');
  assert.equal(await page.locator('[data-source-col]').getAttribute('data-source-col'),'83');
  await page.getByLabel('选择网络层',{exact:true}).selectOption('1');
  await page.getByLabel('选择神经元编号',{exact:true}).selectOption('91');
  assert.equal(await page.locator('[data-source-col]').getAttribute('data-source-col'),'91');
  const selectedBefore=await page.locator('[data-studio-selected]').getAttribute('y');
  await page.getByLabel('播放速度',{exact:true}).selectOption('1');await page.getByRole('button',{name:'继续播放',exact:true}).click();await page.waitForTimeout(120);
  await page.getByRole('button',{name:'暂停播放',exact:true}).click();assert.equal(await page.locator('[data-studio-selected]').getAttribute('y'),selectedBefore);
  await page.locator('[data-studio-layer="1"]').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  const rect=await page.locator('[data-studio-layer="1"]').boundingBox();
 await page.mouse.move(rect.x+10,rect.y+10);await page.mouse.down();await page.mouse.move(rect.x+60,rect.y+90,{steps:8});await page.mouse.up();
  assert.notEqual(await page.getByLabel('选择神经元编号').inputValue(),'91');
  await page.getByRole('button',{name:'取消聚焦',exact:true}).click();assert.equal(await page.locator('[data-studio-selected]').count(),0);
  await page.getByLabel('训练轮次').fill('0');await page.getByLabel('播放速度',{exact:true}).selectOption('32');await page.getByRole('button',{name:'继续播放',exact:true}).click();await page.waitForTimeout(550);await page.getByRole('button',{name:'暂停播放',exact:true}).click();assert.ok(Number(await page.getByLabel('训练轮次').inputValue())>12);
  for(const [width,height] of [[1366,900],[820,1180],[390,844],[844,390],[320,568]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const output=await page.locator('[data-studio-layer="2"]').boundingBox();assert.ok(output.x+output.width<=width,'overview includes output layer');
   await page.screenshot({path:'.preview/studio-verified-'+width+'.png'});
  }
  await page.getByRole('button',{name:'放大选格',exact:true}).click();assert.equal(await page.getByRole('button',{name:'全网概览',exact:true}).getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
