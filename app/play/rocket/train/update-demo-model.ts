// A small supervised example isolates the chain rule; this is not the PPO policy.
export function updateDemo(x: number, target: number, w1: number, w2: number) {
  const hidden = Math.tanh(x * w1);
  const output = hidden * w2;
  const loss = (output - target) ** 2 / 2;
  const feedback = output - target;
  const slope = 1 - hidden ** 2;
  const g2 = feedback * hidden;
  const g1 = feedback * w2 * slope * x;
  const next1 = w1 - .2 * g1, next2 = w2 - .2 * g2;
  const nextOutput = Math.tanh(x * next1) * next2;
  return { hidden, output, loss, feedback, slope, g1, g2, next1, next2, nextOutput, nextLoss: (nextOutput - target) ** 2 / 2 };
}

export const initialNetwork = [[.6, -.3], [.2, .5], [.4, -.2]];
export function networkDemo(inputs: number[], target: number, weights: number[][]) {
  const hidden = weights.slice(0, 2).map(row => Math.tanh(row[0]*inputs[0]+row[1]*inputs[1]));
  const output = hidden[0]*weights[2][0]+hidden[1]*weights[2][1];
  const error = output-target;
  const signals = hidden.map((h,j)=>error*weights[2][j]*(1-h*h));
  const gradients = [...signals.map(g=>inputs.map(x=>g*x)),hidden.map(h=>error*h)];
  const next = weights.map((row,j)=>row.map((w,i)=>w-.2*gradients[j][i]));
  const nextHidden=next.slice(0,2).map(row=>Math.tanh(row[0]*inputs[0]+row[1]*inputs[1]));
  const nextOutput=nextHidden[0]*next[2][0]+nextHidden[1]*next[2][1];
  return {hidden,output,error,signals,gradients,next,nextHidden,nextOutput,loss:error**2/2,nextLoss:(nextOutput-target)**2/2};
}


export function quadraticDemo(inputs:number[], target:number, weights:number[][]){
 const sums=weights.slice(0,2).map(row=>row[0]*inputs[0]+row[1]);
 const hidden=sums.map(v=>v*v),output=hidden[0]*weights[2][0]+hidden[1]*weights[2][1],error=output-target;
 const gradients=[...sums.map((v,j)=>inputs.map(x=>error*weights[2][j]*2*v*x)),hidden.map(h=>error*h)];
 return {hidden,output,error,gradients,loss:error*error/2};
}
export function fitParabola(weights: number[][]) {
 const samples=Array.from({length:21},(_,i)=>{const x=-1+i/10;return quadraticDemo([x,1],x*x,weights);});
 return weights.map((row,j)=>row.map((w,i)=>w-.2*samples.reduce((sum,d)=>sum+d.gradients[j][i],0)/samples.length));
}

export function polynomial(weights:number[][]){
 const [[a,b],[c,d],[u,v]]=weights;
 return [u*a*a+v*c*c,2*(u*a*b+v*c*d),u*b*b+v*d*d];
}
