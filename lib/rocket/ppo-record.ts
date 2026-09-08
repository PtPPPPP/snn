import type {Policy} from './physics.mjs';
export type RecordedSample={index:number;inputs:number[];action:number;advantage:number;return:number;neuronGradient:number[][]};
export type PPORound={number:number;steps:number;samples:RecordedSample[];gradient:Policy['layers'];policyLoss:number;maxWeightChange:number;timesteps:number};
export type PPORecord={schema:number;models:Policy[];rounds:PPORound[];source:{revision:string;checkpointSha256:string;kind:string;seed:number;sb3:string};config:{epochs:number;nSteps:number;batchSize:number;learningRate:number;clipRange:number;gradientMeaning:string}};
export function traceNormalized(model:Policy,inputs:number[]){let x=inputs;const activations=model.layers.map((l,i)=>{x=l.weight.map((row,j)=>{const z=row.reduce((sum,w,k)=>sum+w*x[k],l.bias[j]);return i<2?Math.tanh(z):z;});return x;});return {inputs,activations,throttle:(Math.max(-1,Math.min(1,x[0]))+1)/2};}
export function validatePPORecord(d:PPORecord){if(d.schema!==1||!d.rounds?.length||d.models?.length!==d.rounds.length+1)throw Error('训练记录不完整');for(const m of d.models){if(m.layers.length!==3)throw Error('网络层数错误');for(let l=0;l<3;l++){const [rows,cols]=[[128,7],[128,128],[1,128]][l];if(m.layers[l].weight.length!==rows||m.layers[l].bias.length!==rows||!m.layers[l].weight.every(r=>r.length===cols&&r.every(Number.isFinite))||!m.layers[l].bias.every(Number.isFinite))throw Error('模型数据格式错误');}}for(const r of d.rounds){if(!r.samples.length||!r.samples.every(x=>x.inputs.length===7&&x.inputs.every(Number.isFinite)&&x.neuronGradient.map(a=>a.length).join(',')==='128,128,1'))throw Error('训练样本格式错误');}return d;}

export function weightChanges(before:Policy,after:Policy){
 const layers=before.layers.map((l,k)=>({weight:l.weight.map((row,j)=>row.map((w,i)=>after.layers[k].weight[j][i]-w)),bias:l.bias.map((b,j)=>after.layers[k].bias[j]-b)}));
 return {layers,nodes:weightNodes(layers)};
}
export function weightNodes(layers:Policy['layers']){return layers.map(l=>l.weight.map(row=>row.reduce((best,v)=>Math.abs(v)>Math.abs(best)?v:best,0)));}

export async function loadPPORecord(url:string,signal?:AbortSignal):Promise<PPORecord>{
 const response=await fetch(url,{signal});if(!response.ok)throw Error('训练记录暂时无法加载');const d=await response.json();
 if(d.binary){const r=await fetch(d.binary,{signal});if(!r.ok)throw Error('权重数据暂时无法加载');const buffer=await r.arrayBuffer(),view=new DataView(buffer);let cursor=0;
 const number=()=>{if(cursor+4>buffer.byteLength)throw Error('权重数据不完整');const v=view.getFloat32(cursor,true);cursor+=4;return v;};
 const layers=()=>[[128,7],[128,128],[1,128]].map(([rows,cols])=>({weight:Array.from({length:rows},()=>Array.from({length:cols},number)),bias:Array.from({length:rows},number)}));
 for(const m of d.models)m.layers=layers();for(const round of d.rounds)round.gradient=layers();if(cursor!==buffer.byteLength)throw Error('权重数据长度错误');
 }
 return validatePPORecord(d);
}
