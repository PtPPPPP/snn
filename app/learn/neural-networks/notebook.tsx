"use client";

import Link from '../../_sections/IntentLink';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {LessonFlowProvider,useLessonFlow} from './lesson-flow';
import GeometryActivity from './geometry-activity';
import NetworkLab from './network-lab';
import LessonAssistant from './lesson-assistant';
import s from './notebook.module.css';
import {coordinate,readCourse,samplesFor,trace} from '../../../lib/learning/geometry-course';

const chapters=[
 {id:'classification-demo',title:'先只绕中心转',checkpoint:'course-line',group:'01 / 先找到一条分类线'},
 {id:'direction',title:'哪一侧才是类别 1',checkpoint:'course-sides'},
 {id:'signed-score',title:'给位置一个正负分数',checkpoint:'course-score'},
 {id:'scan-surface',title:'把分数立起来',checkpoint:'course-plane'},
 {id:'network-forward',title:'怎样找到合适的面',checkpoint:'course-machine',group:'02 / 设计一台可调的机器'},
 {id:'center-limit',title:'只绕中心转，不够了',checkpoint:'course-center-limit'},
 {id:'bias',title:'让它平移：引入 b',checkpoint:'course-bias'},
 {id:'normalization',title:'从分数到概率',checkpoint:'course-probability',group:'03 / 让数据帮助找面'},
 {id:'loss',title:'给预测记下损失',checkpoint:'course-loss'},
 {id:'backprop',title:'让网络自己调参数',checkpoint:'course-linear-learning'},
 {id:'linear-limit',title:'新任务，手调解不开',checkpoint:'course-xor-manual',group:'04 / 先看原办法的局限'},
 {id:'linear-training-limit',title:'让学习也来试试',checkpoint:'course-xor-learning'},
 {id:'nonlinear-space',title:'这次改变计算：ReLU',checkpoint:'course-relu',group:'05 / 让网络能表达折面'},
 {id:'folded-score',title:'把折面接进网络',checkpoint:'course-fold-network'},
 {id:'relu-learning',title:'换了结构，再学习',checkpoint:'course-relu-learning'},
];
function Note({index,children}:{index:number;children:ReactNode}){
 const chapter=chapters[index];
 return <section className={s.note} id={chapter.id} data-note={index} data-checkpoint={chapter.checkpoint} aria-labelledby={`${chapter.id}-heading`}><h2 id={`${chapter.id}-heading`}><span>{String(index+1).padStart(2,'0')}</span>{chapter.title}</h2>{children}</section>;
}
function NotebookPage(){
 const article=useRef<HTMLElement>(null),flow=useLessonFlow();
 const [active,setActive]=useState(0),[selectedText,setSelectedText]=useState('');
 const [context,setContext]=useState<{id:string;title:string;text:string;snapshot?:unknown}>({id:chapters[0].id,title:chapters[0].title,text:'从中心旋转分类出发，推导正负分数与分数面；设计没有偏置的线性网络，遇到平移问题才引入 b，先学习，再遇到结构局限，最后引入 ReLU。'});
 const goToChapter=(event:React.MouseEvent<HTMLAnchorElement>,id:string)=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();event.stopPropagation();window.history.replaceState(window.history.state,'',`#${id}`);document.getElementById(id)?.scrollIntoView({behavior:'instant',block:'start'});};
 const questionSnapshot=()=>{const snapshot=flow.read(chapters[active].checkpoint),state=readCourse(snapshot);if(!state)return snapshot;const t=trace(state.model,state.input),isFoldDemo=chapters[active].id==='nonlinear-space',folded=article.current?.querySelector('[data-geometry-activity="relu"]')?.getAttribute('data-relu-folded')==='true';return {coordinates:'数学坐标；图中心为 (0,0)，范围 [-1,1]',input:state.input.map(coordinate),model:state.model.activation==='linear'?{activation:'linear',weights:state.model.linear.slice(0,2),...(active>=6?{bias:state.model.linear[2]}:{})}:state.model,calculation:isFoldDemo?{operation:folded?'relu':'linear-preview',a:t.a,displayedOutput:folded?t.h:t.a}:{score:t.s},samples:samplesFor(state).map(item=>({input:item.point.map(coordinate),label:item.label}))};};
 useEffect(()=>{
  const root=article.current;if(!root)return;let scheduled=0,timer=0;
  const refresh=()=>{
   scheduled=0;const sections=Array.from(root.querySelectorAll<HTMLElement>('[data-note]')),line=Math.min(window.innerHeight*.3,220);let current=sections[0];
   for(const section of sections){if(section.getBoundingClientRect().top<=line)current=section;else break;}if(!current)return;
   const index=Number(current.dataset.note),chapter=chapters[index];setActive(index);
   const next={id:chapter.id,title:chapter.title,text:current.innerText.slice(0,8000),snapshot:flow.read(chapter.checkpoint)};
   setContext(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  };
  const schedule=()=>{if(!scheduled)scheduled=requestAnimationFrame(refresh);};
  const afterChange=()=>{window.clearTimeout(timer);timer=window.setTimeout(schedule,120);};
  const selection=()=>{const current=window.getSelection();if(!current||current.isCollapsed){setSelectedText('');return;}if(current.anchorNode&&current.focusNode&&root.contains(current.anchorNode)&&root.contains(current.focusNode))setSelectedText(current.toString().trim().slice(0,2000));};
  const message=(event:MessageEvent)=>{if(event.origin===location.origin&&event.data?.channel==='snn-lesson-network'&&event.data?.type==='snapshot')afterChange();};
  refresh();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);window.addEventListener('message',message);root.addEventListener('input',afterChange);root.addEventListener('change',afterChange);root.addEventListener('click',afterChange);document.addEventListener('selectionchange',selection);
  return()=>{cancelAnimationFrame(scheduled);clearTimeout(timer);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);window.removeEventListener('message',message);root.removeEventListener('input',afterChange);root.removeEventListener('change',afterChange);root.removeEventListener('click',afterChange);document.removeEventListener('selectionchange',selection);};
 },[flow]);
 return <div className={s.notebook} data-notebook-desktop>
  <aside className={s.navigation} aria-label="学习章节"><Link className={s.brand} href="/">SNN <span>/ 笔记</span></Link><div className={s.navBody}><p className={s.navTitle}>神经网络 · 从分类开始</p><nav aria-label="本页目录">{chapters.map((chapter,index)=><div key={chapter.id}>{chapter.group&&<p className={s.navGroup}>{chapter.group}</p>}<a href={`#${chapter.id}`} onClick={event=>goToChapter(event,chapter.id)} aria-current={active===index?'location':undefined}><span className={s.index}>{String(index+1).padStart(2,'0')}</span><span>{chapter.title}</span></a></div>)}</nav></div><p className={s.navFoot}>一页学习 · 就地操作<br/>阅读位置 {String(active+1).padStart(2,'0')} / {chapters.length}</p></aside>
  <main className={s.article} ref={article}>
   <header className={s.title}><span>SNN / 神经网络学习笔记</span><h1>从一条分类线，走到神经网络。</h1><p>先只给一条能绕中心旋转的线。<br/>遇到当前办法解决不了的问题，再增加一个新办法。</p><small>连续向下阅读，每段都有眼前能操作的例子。每节参数独立；复位只恢复本节的初始设置。</small></header>

   <Note index={0}><p>先试一个简单任务：红色 0 和绿色 1 是已知类别的点。只给你一条经过中心 (0, 0) 的直线；现在它不能平移，只能转动。能不能把两组点分到两边？</p><GeometryActivity kind="line" id="course-line"/><p className={s.observation}>这一组点只靠旋转就能分开。先记住你找到的这条线，不急着增加别的办法。</p></Note>

   <Note index={1}><p>线把点分开了，还缺一个约定：哪侧叫 1，哪侧叫 0？给两侧分别标上正、负，再规定“正 → 1，负 → 0”。翻转一次，看看边界和答案分别发生了什么。</p><GeometryActivity kind="sides" id="course-sides"/><p className={s.observation}>边界的位置没有变，分类答案却反过来了。分类规则需要同时表达边界与方向。</p></Note>

   <Note index={2}><p>怎样让任意一个新点也得到答案？先给位置算一个有正负的分数。试用 <code>s = w₁x₁ + w₂x₂</code>：正数判为 1，负数判为 0，零分就是边界。本节仍然只有两个系数。</p><GeometryActivity kind="score" id="course-score"/><p className={s.observation}>中心的两个坐标都是 0，所以无论系数怎样改，中心分数都为 0。现在的边界只能绕中心转。</p></Note>

   <Note index={3}><p>把分数当作高度：<code>(x₁, x₂) → (x₁, x₂, s)</code>。逐点算一遍，就得到一张分数面。零高度把它分成正、负两部分；与零高度底面相交的线，就是刚才的分类边界。</p><GeometryActivity kind="plane" id="course-plane"/><p className={s.observation}>我们有了另一种看待分类的方式：找一张让绿点在上、红点在下的面。那么，怎样找到一张合适的面？</p></Note>

   <Note index={4}><p>我们来设计一台可调的机器：两个入口接收 x₁、x₂，每条连接把输入乘一个系数，输出单元把贡献相加。先让 Linear 原样输出这个和。这就是最简单的线性神经网络。这台机器先只有 w₁、w₂ 两个可调系数。</p><NetworkLab mode="design" id="course-machine"/><p className={s.observation}>拖动连接的系数，看网络里的数值与右边的面一起变化。现在，找面变成了找一组网络参数。按“重播传递”，再看一个点怎样穿过这台机器。</p></Note>

   <Note index={5}><p>换一组点，仍用刚才的机器。红点与绿点都在中心右侧，近处是红，远处是绿。先保持规则不变，只调整两个连接系数：这次还能只靠旋转分开吗？</p><NetworkLab mode="stuck-center" id="course-center-limit"/><p className={s.observation}>这组点中，同一条射线上的一近一远分别属于两类。经过中心的直线把它们放在同一侧，转来转去都不够。接下来只增加一种能力：把边界挪开。</p></Note>

   <Note index={6}><p>在相加之后，再加一个可以独立调整的数 b：<code>s = w₁x₁ + w₂x₂ + b</code>。先保持两个连接不变，只改 b，观察分数面整体升降、零边界平移。这个额外的数叫偏置。</p><NetworkLab mode="bias" id="course-bias"/><p className={s.observation}>现在既能旋转，也能平移。这组点可以分开了。b 不是预先塞进公式的符号，它补上了刚才缺少的平移能力。</p></Note>

   <Note index={7}><p>手动调三个参数已经能找面，但每次都靠人试会很慢。要让数据帮忙，先问怎样评价一次预测。把分数 s 变成两个总和为 1 的概率：以 <code>[0, s]</code> 为 logits，取指数后除以总和。这一步叫 Softmax。</p><GeometryActivity kind="probability" id="course-probability"/><p className={s.observation}>s 越大，类别 1 的概率越大；s = 0 时各为 0.5。归一化只是把当前分数转换成概率，还没有改变网络参数。</p></Note>

   <Note index={8}><p>选一个已经知道答案的点，看模型给真实类别分了多少概率 p。用 <code>L = −log(p)</code> 为它记下损失：给正确答案的概率越大，损失越小。再把所有已知点的损失取平均，作为找面的目标。</p><GeometryActivity kind="loss" id="course-loss"/><p className={s.observation}>这时我们才有了“调得更好”的标准：让同一组数据的平均损失下降，而不是只把眼前一个点调对。</p></Note>

   <Note index={9}><p>这节用同一组点，重新从尚未分对的初值出发，不带入前面的手调结果。现在让机器自己调。先计算平均损失对 w₁、w₂、b 的梯度，再更新：<code>新参数 = 旧参数 − 学习率 × 梯度</code>。先分开按一次“计算”和“应用”，再试自动学习；看三个参数、分类面和损失一起变化。</p><NetworkLab mode="learn-linear" id="course-linear-learning"/><p className={s.observation}>数据通过梯度告诉网络怎样调面。“计算梯度”时参数不变，“应用更新”才改变参数。即使样本已经分对，学习仍可能通过调整分数降低损失。</p></Note>

   <Note index={10}><p>再换一个任务：四个角中，相对的两个角同类。沿用线性网络的结构，旋转与平移都允许；本节使用独立的初始参数。先由你手动调整 w₁、w₂、b，试着把四个点一起分对。</p><NetworkLab mode="manual-xor" id="course-xor-manual"/><p className={s.observation}>这次，增加平移也没有解决问题。先别急着换结构，再让刚学会的自动学习来试一试。</p></Note>

   <Note index={11}><p>使用同样四个点和线性结构，重新从本节的初始参数出发，让自动学习找面。前节的手动操作不会改变这里。观察损失是否还在下降，以及四个点是否真的都分对。更新更多次，并不会让这张平面自己长出折痕。</p><NetworkLab mode="learn-xor" id="course-xor-learning"/><p className={s.observation}>这组对称数据的最佳线性解会趋近两类概率各 0.5、平均损失约 0.693，仍不能全分对。手调和学习都受限，问题在于目前的网络只能表达一个平面。</p><details className={s.derivation}><summary>[为什么] 不是学习得还不够久吗？</summary><p>四个点的两条对角线有同一个中点。线性给分时，中点分数等于两端的平均。若两个红点都为负，中点应为负；若两个绿点都为正，同一个中点又应为正，无法同时成立。堆叠纯 Linear 计算仍是线性规则；继续找参数不能消除这个矛盾。</p></details></Note>

   <Note index={12}><p>既然只改参数不够，这次改变单元里的计算。取 <code>a = x₁ + x₂</code>，把负的输出改成 0，正的保留：<code>h = max(0, a)</code>。这个计算叫 ReLU。先比较改变前后，看看平面怎样多出一道折痕。</p><GeometryActivity kind="relu" id="course-relu"/><p className={s.observation}>我们终于增加了一种原网络没有的形状变化。接下来把它接进网络，看看它能否帮助刚才的分类任务。</p></Note>

   <Note index={13}><p>保留两路 Linear 来传递输入，再增加一个 ReLU 单元，输出把三路结果组合起来。这里具体取 <code>h = ReLU(x₁+x₂)</code>，先看底面 <code>s₀ = x₁+x₂+1</code>，再接入 <code>−2h</code>。调整系数，观察网络如何改变折面与边界。</p><NetworkLab mode="relu-network" id="course-fold-network"/><p className={s.observation}>同样四个点，现在能被包含折痕的分数面分开了。起作用的是新增的非线性计算与它的组合方式。</p></Note>

   <Note index={14}><p>最后再让数据调整参数。本节独立从尚未解好的初值开始，不带入前节手动接好的答案。数据还是刚才四个点，改变的是网络结构：现在可以调三个组合系数与输出偏置，以及 ReLU 前的两个权重和偏置，共 7 个参数。观察学习怎样同时调整折痕与两侧的面。</p><NetworkLab mode="learn-relu" id="course-relu-learning"/><p className={s.observation}>先判断结构能否表达任务需要的形状，再让学习去寻找参数。训练点分对以后，还要用新数据检验这套规则。</p></Note>

   <footer className={s.footer}><p>只转动 → 加平移 → 手动找面 → 让数据学习 → 发现结构局限 → 加入 ReLU</p><span>每次增加一个新办法，都为了解决前一步实际遇到的问题。</span></footer>
  </main>
  <aside className={s.assistant} aria-label="笔记 AI 问答"><LessonAssistant context={context} selectedText={selectedText} getSnapshot={questionSnapshot}/></aside>
 </div>;
}
export default function Notebook(){
 const [assistantOpen,setAssistantOpen]=useState(false);
 return <LessonFlowProvider key="independent-causal-v4"><div className={s.courseShell} data-assistant-open={assistantOpen}>
  <details className={s.mobileChapters}><summary>学习目录 / 神经网络 <span>展开 +</span></summary><nav aria-label="移动端学习章节">{chapters.map((chapter,index)=><a key={chapter.id} href={`#${chapter.id}`} onClick={event=>{event.preventDefault();window.history.replaceState(window.history.state,'',`#${chapter.id}`);document.getElementById(chapter.id)?.scrollIntoView({block:'start'});event.currentTarget.closest('details')?.removeAttribute('open');}}><span>{String(index+1).padStart(2,'0')}</span>{chapter.title}</a>)}</nav></details>
  <NotebookPage/>
  <button className={s.assistantToggle} aria-expanded={assistantOpen} onClick={()=>setAssistantOpen(!assistantOpen)}>{assistantOpen?'[ 收起问答 ↓ ]':'[ 随页问答 ↑ ]'}</button>
 </div></LessonFlowProvider>;
}
