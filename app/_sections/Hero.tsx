import Link from "next/link";

const experiments=[
 {number:'01',title:'回收挑战',description:'控制油门，和 AI 一起把火箭带回地面。',href:'/play/rocket'},
 {number:'02',title:'怎样推理',description:'看高度与速度怎样经过网络，变成油门。',href:'/play/rocket/explain'},
 {number:'03',title:'怎样学习',description:'从一条反馈开始，看权重和决策逐渐改变。',href:'/play/rocket/train'},
];
export function Hero(){return <section className="hero" id="top">
 <div className="hero-copy"><p className="home-eyebrow">SNN / SMART NEURAL NETWORK</p><h1>与 AI 共创，<br/>构建下一步。</h1><p className="home-intro">一个面向新手的科技社团。<br/>从看懂一个原理，到亲手完成一个作品。</p><div className="hero-actions"><a className="button button-primary" href="#projects">探索共创项目 ↗</a><Link className="button button-ghost" href="/ai/">进入 SNN AI →</Link></div><div className="home-directions"><span>人工智能</span><span>机器人</span><span>项目实践</span></div></div>
 <div className="home-lab"><div className="home-lab-heading"><span>学习实验室</span><small>从体验，到理解</small></div>
 <svg className="home-network" viewBox="0 0 480 110" role="img" aria-label="输入经过网络形成输出的示意图">
  <g fill="none" stroke="#7897ad" strokeWidth=".7" opacity=".25">{[25,55,85].flatMap((y,i)=>[20,43,66,89].map((z,j)=><path key={`${i}-${j}`} d={`M45 ${y}C110 ${y} 110 ${z} 175 ${z}M175 ${z}C235 ${z} 235 ${y} 300 ${y}M300 ${y}C355 ${y} 355 55 423 55`}/>))}</g>
  <path className="home-signal" d="M45 55C110 55 110 43 175 43C235 43 235 55 300 55H423" fill="none" stroke="#527c9b" strokeWidth="1.4"/>
  {[25,55,85].map(y=><circle key={y} cx="45" cy={y} r="5" fill="#537c9a"/>)}{[20,43,66,89].map(y=><g key={y}><circle cx="175" cy={y} r="7" fill="#f7f9fc" stroke="#afc0ce"/><circle cx="175" cy={y} r="3" fill="#557d9b"/></g>)}{[25,55,85].map(y=><g key={y}><circle cx="300" cy={y} r="7" fill="#f7f9fc" stroke="#afc0ce"/><circle cx="300" cy={y} r="3" fill={y===55?'#b78b51':'#557d9b'}/></g>)}<circle cx="430" cy="55" r="16" fill="#f0f5f8" stroke="#8ea9bd"/><circle cx="430" cy="55" r="10" fill="#355f7e"/>
 </svg>
 <div className="home-lab-links">{experiments.map(e=><Link key={e.number} href={e.href}><span className="home-lab-number">{e.number}</span><div><h2>{e.title}</h2><p>{e.description}</p></div><span aria-hidden="true">↗</span></Link>)}</div>
 </div>
 </section>;}
