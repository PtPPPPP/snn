import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
test('rocket tutor captures context, renders SSE and cancels without live AI', async()=>{
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 const browser=await chromium.launch({headless:true,...(existsSync(edge)?{executablePath:edge}:{})});
 try{
 const page=await browser.newPage();let payload,mode='success';
 await page.route('https://api.snnai.cn/**',async route=>{
  if(!route.request().url().endsWith('/chat/stream'))return route.abort();
  payload=route.request().postDataJSON();
  if(mode==='hold'){await new Promise(r=>setTimeout(r,1500));return route.abort().catch(()=>{});}
  return route.fulfill({status:200,contentType:'text/event-stream',headers:{'access-control-allow-origin':'*'},body:'event: delta\ndata: {"text":"模拟回答："}\n\nevent: delta\ndata: {"text":"全部贡献一起相加。"}\n\nevent: done\ndata: {}\n\n'});
 });
 await page.goto('http://127.0.0.1:5173/play/rocket/explain');
 await page.getByRole('button',{name:'第2层神经元48',exact:true}).click();
 await page.getByLabel('你的问题',{exact:true}).fill('这一层怎么算？');
 await page.getByRole('button',{name:'发送问题',exact:true}).click();
 await page.getByText('模拟回答：全部贡献一起相加。',{exact:true}).waitFor();
 const snapshot=JSON.parse(payload.messages.at(-1).content.split('\n学生问题：')[0]);
 assert.equal(snapshot.selectedLayer,2);assert.equal(snapshot.selectedNeuron,48);assert.equal(snapshot.calculation.terms.length,128);
 assert.ok(payload.messages[0].content.includes('高中生'));assert.equal(await page.getByRole('button',{name:'暂停',exact:true}).count(),1);
 const frozen=await page.locator('article small').first().textContent();
 await page.getByRole('button',{name:'输入神经元：燃料',exact:true}).click();
 assert.equal(await page.locator('article small').first().textContent(),frozen);
 mode='hold';await page.getByLabel('你的问题',{exact:true}).fill('再解释一下');await page.getByRole('button',{name:'发送问题',exact:true}).click();await page.getByRole('button',{name:'停止回答',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'停止'}).waitFor();
 await page.setViewportSize({width:360,height:800});
 const size=await page.locator('section[aria-label="实验 AI 答疑"]').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(size.scroll<=size.width);
 }finally{await browser.close();}
});
