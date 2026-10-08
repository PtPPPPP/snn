import {examples,initialNetwork,metrics,type DatasetId,type Network} from './foundations.ts';
export type ExperimentId='neuron'|'perceptron'|'xor-limit'|'layers'|'activation'|'loss'|'backprop';
export type InlineSnapshot={model:Network;dataset:DatasetId;steps:number;history:{step:number;loss:number}[];picked:number;selected:number;parameter:number;rate:number};
export function initialExperiment(id:ExperimentId):InlineSnapshot {
 const hard=['neuron','perceptron','xor-limit'].includes(id),dataset:DatasetId=id==='neuron'||id==='perceptron'?'linear':'xor';
 const model=initialNetwork(hard?'perceptron':'mlp',id==='layers'?'linear':'tanh');
 if(id==='xor-limit')model.parameters=[1,1,.6];
 return {model,dataset,steps:0,history:[{step:0,loss:metrics(model,examples(dataset)).loss}],picked:4,selected:hard||id==='loss'?4:0,parameter:id==='neuron'?2:0,rate:.2};
}
