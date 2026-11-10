"use client";
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {projects, activities} from '../../_sections/data';
import IntentLink from '../../_sections/IntentLink';
import NetworkGlyphs from './preview-network';
import type {CourseModel, Point} from '../../../lib/learning/geometry-course';
import s from './unified-preview.module.css';
const sampleModel: CourseModel = {
  linear: [1, 1, -0.5], hinge: [1, 1, -1], gain: -2, activation: 'relu',
};
const samplePoint: Point = [0.75, 0.625];
const observations = ['第一路连接', '第二路连接', '输出求和', 'ReLU 的第一路连接', 'ReLU 的第二路连接', 'ReLU 输入', 'ReLU 输出的连接'];

function Home() {
  const [selected, setSelected] = useState<number | null>(null);
  return <main className={s.home}>
    <div className={s.breadcrumb}>SNN / 学生科技社团 <span>学习 · 动手 · 分享</span></div>
    <section className={s.hero}>
      <div className={s.heroCopy}>
        <p className={s.kicker}>SMART NEURAL NETWORK</p>
        <h1>一起学习，<br />一起把想法做出来。</h1>
        <p className={s.intro}>从一个问题，到一个能运行的作品。<br />和同学一起探索 AI、机器人与智能系统。</p>
        <div className={s.heroActions}>
          <IntentLink className={s.primaryAction} href="/learn/neural-networks">开始学习 <span>→</span></IntentLink>
          <IntentLink className={s.textAction} href="/ai">和 SNN AI 对话 <span>↗</span></IntentLink>
        </div>
      </div>
      <div className={s.heroFigure}>
        <div className={s.figureHeading}><span>学习实验室 / 神经网络</span><span>2 → 3 → 1</span></div>
        <NetworkGlyphs model={sampleModel} input={samplePoint} phase={4} bias onSelect={setSelected} />
        <div className={s.figureCaption}><span>{selected === null ? '点击节点或连接，观察网络' : `正在观察：${observations[selected]}`}</span><IntentLink href="/learn/neural-networks">进入课程 ↗</IntentLink></div>
      </div>
    </section>
    <section className={s.section} id="learning-lab" aria-labelledby="preview-explore">
      <div className={s.sectionHeading}><span>01 / EXPLORE</span><h2 id="preview-explore">从这里开始</h2><p>看、动手、提问，选一种方式开始。</p></div>
      <div className={s.entries}>
        <IntentLink href="/learn/neural-networks"><span className={s.entryNumber}>01 / LEARN</span><strong>神经网络学习笔记</strong><span>从分类问题出发，一边读一边操作。</span><b>进入学习 →</b></IntentLink>
        <IntentLink href="/play/rocket"><span className={s.entryNumber}>02 / LAB</span><strong>火箭回收实验</strong><span>动手操纵火箭，观察人与模型的控制。</span><b>进入实验 →</b></IntentLink>
        <IntentLink href="/ai"><span className={s.entryNumber}>03 / ASK</span><strong>SNN AI</strong><span>围绕你的问题继续对话和探索。</span><b>开始对话 →</b></IntentLink>
      </div>
    </section>
    <section className={s.section} id="about" aria-labelledby="about-title">
      <div className={s.sectionHeading}><span>ABOUT / SNN</span><h2 id="about-title">一起做点有意思的事</h2><p>我们一起听分享、学工具、组队做项目，把课堂之外的想法变成真正能运行的作品。</p></div>
      <div className={s.activities}><article><span>INPUT</span><h3>欢迎新同学</h3><p>不要求一开始就很厉害，从一个小任务和一次分享开始。</p></article><article><span>PROCESS</span><h3>一起做项目</h3><p>围绕真实问题组队，在动手和协作中学习。</p></article><article><span>OUTPUT</span><h3>把过程留下</h3><p>记录文档、Demo 和复盘，让每次尝试成为下一次的起点。</p></article></div>
    </section>
    <section className={s.section} id="projects" aria-labelledby="preview-projects-title">
      <div className={s.sectionHeading}><span>02 / PROJECTS</span><h2 id="preview-projects-title">我们的共创项目</h2><p>从软件到物理系统，把想法做成可以继续改进的作品。</p></div>
      <div className={s.rows}>{projects.map(project => <a href={project.href} key={project.index} target="_blank" rel="noreferrer"><span>{project.index}</span><strong>{project.title}</strong><p>{project.summary}</p><b>GitHub ↗</b></a>)}</div>
    </section>
    <section className={s.section} id="activities" aria-labelledby="preview-activities-title">
      <div className={s.sectionHeading}><span>03 / COMMUNITY</span><h2 id="preview-activities-title">一起学，一起做，一起分享</h2><p>把经验分享给下一位同学。</p></div>
      <div className={s.activities}>{activities.map(activity => <article key={activity.code}><span>{activity.code}</span><h3>{activity.title}</h3><p>{activity.detail}</p></article>)}</div>
    </section>
    <section className={`${s.section} ${s.join}`} id="join" aria-labelledby="preview-join-title">
      <div><p className={s.kicker}>04 / JOIN</p><h2 id="preview-join-title">想学点东西？<br />来和我们一起做。</h2><p>只要愿意学习、交流和动手，SNN 都欢迎你。</p><a className={s.primaryAction} href="/join/interview">参加入社笔试 <span>↗</span></a></div>
      <div className={s.qr}><img src="/assets/snn-wechat.jpg" width="128" height="128" loading="lazy" decoding="async" alt="SNN 社团公众号二维码" /><span>关注 SNN 社团公众号<br />了解活动、项目和招新</span></div>
    </section>
    <footer className={s.footer}><strong>SNN</strong><span>SMART NEURAL NETWORK / 学生共建</span><a href="mailto:1074897559@qq.com">联系邮箱</a><a href="https://github.com/PtPPPPP" target="_blank" rel="noreferrer">GitHub ↗</a><a href="#top">回到顶部 ↑</a></footer>
  </main>;
}


export default function ProductionHome() {
 const router=useRouter();
 useEffect(()=>{
  // Wait until the homepage has loaded; then prepare the main destinations
  // at idle priority. Respect visitors who ask to save data or use 2G.
  const connection=(navigator as Navigator & {connection?:{saveData?:boolean;effectiveType?:string}}).connection;
  if(connection?.saveData||connection?.effectiveType?.includes('2g'))return;
  const timers:number[]=[],idles:number[]=[];
  let stopped=false;
  const stop=()=>{
   stopped=true;
   window.removeEventListener('load',prepare);
   timers.forEach(clearTimeout);
   idles.forEach(id=>window.cancelIdleCallback(id));
  };
  const prepare=()=>{
   if(stopped)return;
   ['/learn/neural-networks','/ai','/play/rocket'].forEach((href,index)=>{
    timers.push(window.setTimeout(()=>{
     const warm=()=>{if(document.visibilityState==='visible')router.prefetch(href);};
     if('requestIdleCallback' in window)idles.push(window.requestIdleCallback(warm,{timeout:2000}));
     else warm();
    },1500+index*3000));
   });
  };
  document.addEventListener('pointerdown',stop,{capture:true,once:true});
  document.addEventListener('keydown',stop,{capture:true,once:true});
  if(document.readyState==='complete')prepare();
  else window.addEventListener('load',prepare,{once:true});
  return()=>{stop();document.removeEventListener('pointerdown',stop,true);document.removeEventListener('keydown',stop,true);};
 },[router]);
 return <div className={s.preview} id="top"><Home/></div>;
}
