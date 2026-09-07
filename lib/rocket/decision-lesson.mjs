import {policyTrace} from './physics.mjs';
export function compareHeight(base,height,model){
 const changed={...base,h:height};
 const before=policyTrace(base,model),after=policyTrace(changed,model);
 const selected=after.activations.slice(0,2).map((values,layer)=>values.reduce((best,v,i)=>Math.abs(v-before.activations[layer][i])>Math.abs(values[best]-before.activations[layer][best])?i:best,0));
 return {changed,before,after,selected};
}
export function nodeCalculation(trace,model,layer,index){
 const inputs=layer===0?trace.inputs:trace.activations[layer-1];
 const weights=model.layers[layer].weight[index],bias=model.layers[layer].bias[index];
 const terms=weights.map((w,i)=>({index:i,input:inputs[i],weight:w,product:w*inputs[i]}));
 const sum=terms.reduce((total,t)=>total+t.product,bias);
 return {terms,bias,sum,output:layer<model.layers.length-1?Math.tanh(sum):sum};
}
