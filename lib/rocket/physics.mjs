export const DT = .01;
export const throttleForHold = (seconds, held) => held ? Math.min(1, Math.max(0, seconds)) : 0;
export const initialState = (height=50) => ({h:height,v:0,fuel:5,thrust:0,t:0,result:null});
export function step(s, throttle, dt=DT) {
 if(s.result) return s;
 const target = Math.min(1,Math.max(0,throttle))*300;
 let thrust = s.thrust + Math.min(1,dt/.05)*(target-s.thrust);
 let consumed = thrust/200*dt;
 if(s.fuel<=0){thrust=0;consumed=0;}
 else if(consumed>s.fuel){thrust=s.fuel/dt*200;consumed=thrust/200*dt;}
 const fuel=Math.max(0,s.fuel-consumed);
 if(fuel<=0) thrust=0;
 const mass=10+fuel;
 const acceleration=(thrust-.02*s.v*Math.abs(s.v)-mass*9.81)/mass;
 const v=s.v+acceleration*dt;
 const h=s.h+v*dt;
 const t=s.t+dt;
 const result=h<=0?(Math.abs(v)<=2?'success':'crash'):h>120?'out_of_bounds':Math.abs(v)>50?'velocity_exceeded':Math.abs(acceleration)>35?'acceleration_exceeded':t>100?'timeout':null;
 return {h:Math.max(0,h),v,fuel,thrust,t,result};
}
export function observation(s, energy) {
 const obs=[s.h/50,s.v/10,s.fuel/5,s.thrust/300].map(Math.fround);
 if(energy){
  const mass=10+s.fuel, kinetic=.5*mass*s.v*s.v;
  const braking=Math.max(300-mass*9.81,0)*Math.max(s.h,0);
  const dv=200*Math.log(mass/10);
  const ratios=[kinetic/Math.max(braking,1e-6),kinetic/Math.max(.5*mass*dv*dv,1e-6),kinetic/(.5*mass*4)];
  obs.push(...ratios.map((x,i)=>Math.fround(Math.min(i===2?30:3,Math.max(0,x))/(i===2?30:3))));
 }
 return obs;
}
export function policyTrace(s, model){
 let x=observation(s,model.energy).map((v,i)=>Math.fround(Math.max(-model.clip,Math.min(model.clip,(v-model.mean[i])/Math.sqrt(model.variance[i]+model.epsilon)))));
 const activations=[];
 const inputs=[...x];
 model.layers.forEach((layer,index)=>{
  x=layer.weight.map((row,i)=>{const sum=row.reduce((total,w,j)=>total+w*x[j],layer.bias[i]);return index<model.layers.length-1?Math.tanh(sum):sum;});
  activations.push([...x]);
 });
 const throttle=(Math.fround(Math.max(-1,Math.min(1,x[0])))+1)/2;
 return {inputs,activations,throttle};
}
export function policyThrottle(s,model){return policyTrace(s,model).throttle;}
