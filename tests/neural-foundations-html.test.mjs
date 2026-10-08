import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {default:worker}=await import('../dist/server/index.js');
async function response(path){return worker.fetch(new Request('http://localhost'+path,{headers:{accept:'text/html'}}),{ASSETS:{fetch:async()=>new Response('Not found',{status:404})}},{waitUntil(){},passThroughOnException(){}});}
async function html(path){const r=await response(path);assert.equal(r.status,200,path);return r.text();}
function elementWith(html,attribute,tag){const start=new RegExp(`<${tag}\\b[^>]*\\b${attribute}(?:="[^"]*")?[^>]*>`).exec(html);if(!start)return null;const rest=html.slice(start.index),tags=new RegExp(`<(/?)${tag}\\b[^>]*>`,'g');let depth=0;for(const match of rest.matchAll(tags)){depth+=match[1]?-1:1;if(depth===0)return rest.slice(0,match.index+match[0].length);}return null;}
test('canonical route is one sequential article with seven independent local experiments',async()=>{
 const text=await html('/learn/neural-networks/archive');assert.match(text,/data-foundations-article/);assert.equal((text.match(/data-inline-experiment=/g)||[]).length,7);
 for(const id of ['neuron','perceptron','xor-limit','layers','activation','loss','backprop'])assert.ok(text.includes(`id="${id}"`));
 assert.doesNotMatch(text,/data-linked-scene|aria-label="顺序阅读导航"|data-experiment-controls/);
 assert.match(text,/自己的图和参数/);assert.match(text,/d2l.ai/);assert.doesNotMatch(text,/NaN|Infinity/);
});
test('every repeated interactive block contains its own controls, visual and result',async()=>{
 let remaining=(await html('/learn/neural-networks/archive')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'');let count=0;
 while(true){const block=elementWith(remaining,'data-inline-experiment','section');if(!block)break;count++;assert.match(block,/data-local-controls/);assert.match(block,/data-local-visual/);assert.match(block,/data-local-result/);const details=elementWith(block,'data-local-readonly','details');assert.ok(details);assert.doesNotMatch(details,/<(?:input|select|button)\b/);remaining=remaining.replace(block,'');}
 assert.equal(count,7);
});
for(const slug of ['neuron','perceptron','layers','activation','loss','backprop'])test(`legacy ${slug} URL redirects to its article anchor`,async()=>{const r=await response('/learn/neural-networks/'+slug);assert.ok([301,302,303,307,308].includes(r.status));const target=new URL(r.headers.get('location'),'http://localhost');assert.equal(target.origin,'http://localhost');assert.equal(target.pathname,'/learn/neural-networks/archive');assert.equal(target.hash,'#'+slug);});
test('homepage keeps the article entry and old rocket routes',async()=>{const text=await html('/');for(const path of ['/learn/neural-networks','/play/rocket','/play/rocket/explain','/play/rocket/train'])assert.ok(text.includes(`href="${path}"`));});
test('routed article contains no sticky scene, corrective scroll or shared session provider',async()=>{
 const source=await readFile('app/learn/neural-networks/inline-experiment.tsx','utf8'),css=await readFile('app/learn/neural-networks/reading.module.css','utf8');
 assert.doesNotMatch(source,/scrollBy|scrollIntoView|onFocusCapture|visualViewport|sessionStorage|ExperimentFrame/);
 assert.doesNotMatch(css,/position:\s*(?:sticky|fixed)/);assert.match(source,/useState\(\(\)=>fresh\(id\)\)/);assert.match(source,/IntersectionObserver/);
 const manifest=JSON.parse(await readFile('dist/client/.vite/manifest.json','utf8'));assert.ok(Object.values(manifest).some(v=>v.src==='app/learn/neural-networks/inline-experiment.tsx'));
});

test('three-feature example is a local independent block after the nonlinearity experiment',async()=>{
 const text=(await html('/learn/neural-networks/archive')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'');
 const block=elementWith(text,'data-hidden-space','section');assert.ok(block);
 assert.match(block,/data-hidden-space-visual/);assert.match(block,/data-hidden-space-controls/);assert.match(block,/data-hidden-space-result/);
 assert.match(block,/手设网络/);assert.match(block,/3 个 ReLU 特征/);assert.match(block,/type="range"/);assert.match(block,/tabindex="0"/);
 assert.doesNotMatch(block,/data-classifier-plane|data-endpoint-prediction/);
 assert.ok(text.indexOf('data-inline-experiment="activation"')<text.indexOf('data-hidden-space'));
 assert.ok(text.indexOf('data-hidden-space')<text.indexOf('id="loss"'));
 assert.match(text,/0\.4, 0\.4/);assert.match(text,/qx7hirqgfuU/);
 const source=await readFile('app/learn/neural-networks/hidden-space.tsx','utf8'),css=await readFile('app/learn/neural-networks/hidden-space.module.css','utf8');
 assert.doesNotMatch(source,/scrollBy|scrollIntoView|onFocusCapture|visualViewport|sessionStorage|setInterval/);
 assert.doesNotMatch(css,/position:\s*(?:sticky|fixed)/);assert.match(css,/touch-action:\s*pan-y/);assert.match(css,/prefers-reduced-motion/);
});

test('opening regression blocks connect the local neuron, substitution, fixed-scale plot, residual and loss',async()=>{
 const text=(await html('/learn/neural-networks/archive')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'');
 assert.ok(text.indexOf('id="fit"')<text.indexOf('id="fit-update"'));assert.ok(text.indexOf('id="fit-update"')<text.indexOf('id="neuron"'));
 for(const mode of ['explore','update']){const block=elementWith(text,`data-linear-fit="${mode}"`,'section');assert.ok(block);for(const attr of ['data-fit-neuron','data-fit-substitution','data-fit-controls','data-fit-result','data-fit-plot'])assert.ok(block.includes(attr));assert.match(block,/半均方误差/);assert.match(block,/2 × 1 = 2/);assert.match(block,/真实值 y = 5/);assert.match(block,/0\.8333/);}
 const explore=elementWith(text,'data-linear-fit="explore"','section');assert.match(explore,/只改 w/);assert.match(explore,/只改 b/);assert.match(explore,/data-slope-indicator/);
 const update=elementWith(text,'data-linear-fit="update"','section');assert.match(update,/变化率/);assert.match(update,/横轴是参数/);assert.match(update,/计算梯度/);
 assert.match(text,/不是刚才预测数值的拟合线/);
 const source=await readFile('app/learn/neural-networks/linear-fit.tsx','utf8'),css=await readFile('app/learn/neural-networks/linear-fit.module.css','utf8');
 assert.doesNotMatch(source,/scrollBy|scrollIntoView|sessionStorage|setInterval/);assert.doesNotMatch(css,/position:\s*(?:sticky|fixed)/);assert.match(source,/prefers-reduced-motion/);assert.match(source,/fitTrace\(parameters, FIT_SAMPLES\)/);
});
test('affine chapter has the actual decision boundary as well as its network; controlled cross-entropy comparison is real arithmetic',async()=>{
 const text=await html('/learn/neural-networks/archive');assert.match(text,/data-affine-boundary/);assert.match(text,/0\.5108/);assert.match(text,/0\.1054/);assert.match(text,/独立的概率对比/);
});

test('prediction legends and factual local feedback render quietly before any user action',async()=>{
 const text=(await html('/learn/neural-networks/archive')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 assert.match(text,/预测 0/);assert.match(text,/预测 1/);assert.match(text,/不代表已校准/);assert.match(text,/点的形状和颜色是真实类别/);
 assert.match(text,/data-feedback-event="0"/);assert.doesNotMatch(text,/data-feedback-active="(?:complete|flip)"/);
 const source=await readFile('app/learn/neural-networks/local-feedback.tsx','utf8'),css=await readFile('app/learn/neural-networks/local-feedback.module.css','utf8');
 assert.match(source,/1800/);assert.match(source,/aria-live/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/animation:none/);assert.doesNotMatch(source,/scrollBy|scrollIntoView|\.focus\(|Audio/);
});
