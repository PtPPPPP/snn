import HeightLesson from './height-lesson';
export const metadata={title:'问 AI：飞行时间轴 · SNN',description:'沿真实飞行时间轴观察 PPO 的每次神经网络计算。'};
export default function Page(){return <>
  <link rel="preload" as="fetch" href="/rocket/energy.json" crossOrigin="anonymous" fetchPriority="low" />
  <HeightLesson/>
</>;}
