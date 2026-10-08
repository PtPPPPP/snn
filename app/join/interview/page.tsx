import type {Metadata} from 'next';
import Link from 'next/link';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {isInterviewReviewer,type InterviewEnv} from '../../../lib/interview/database';
import InterviewForm from './interview-form';
import s from './interview.module.css';
export const metadata:Metadata={title:'入社笔试 · SNN 社团',description:'SNN 入社线上笔试：基础知识与 AI 应用能力结合，包含单选、多选、判断、简答及情景题。'};
export const dynamic='force-dynamic';
export default async function InterviewPage(){const user=await getChatGPTUser(),allowed=user&&isInterviewReviewer(env as unknown as InterviewEnv,user.email,user.userId);return <main className={s.page}>
 <header className={s.intro}><p className={s.eyebrow}>SNN / MEMBER APPLICATION</p><div className={s.titleRow}><h1>入社笔试</h1><span className={s.count}>[ 12 题 / 100 分 ]</span></div><p className={s.lead}>既看基础知识，也看你如何判断 AI 的结果、验证问题并完成交付。</p><div className={s.guide}><p>基础知识 40 分：4 道单选、2 道多选、2 道判断；应用能力 60 分：2 道简答、1 道方向题、1 道情景题。建议用 30–40 分钟。系统会记录从开始到提交的用时，刷新或离开页面也计时。</p><p>基础题涉及简短逻辑、数据、AI 和机器人常识，无需运行代码或注册 AI 账号。简答每题两步，方向／情景题每题四步，只依据给定材料回答。</p><p>可以用 AI 辅助，但请自行核对。客观题后台计分；主观题按分项判据阅卷，术语与篇幅不额外加分。提交后不可自行修改。负责人完成整卷评分后，本人可查看成绩与评语，并回复复试或下一次测试的参加意愿。</p></div><Link href="/join/interview/result" prefetch={false} className={s.primaryLink}>[ 已提交？查看我的成绩与通知 ]</Link></header>
 <ol className={s.steps} aria-label="笔试流程"><li>01 登记</li><li>02 绑定身份</li><li>03 作答</li><li>04 提交</li></ol>
 <InterviewForm/>
 <footer className={s.footer}><Link href="/#join">[ 返回加入 SNN ]</Link>{allowed?<Link href="/join/interview/review" prefetch={false}>[ 招新负责人阅卷 ]</Link>:(env as unknown as InterviewEnv).SNN_INTERVIEW_AUTH_PROVIDER==='cloudflare'&&<a href="/_staff/interview/login">[ 仅招新负责人：登录阅卷 ]</a>}</footer>
</main>;}
