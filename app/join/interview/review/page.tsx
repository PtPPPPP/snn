import type {Metadata} from 'next';
import Link from 'next/link';
import {env} from 'cloudflare:workers';
import {getChatGPTUser,chatGPTSignInPath,chatGPTSignOutPath} from '../../../chatgpt-auth';
import {isInterviewReviewer,type InterviewEnv} from '../../../../lib/interview/database';
import ReviewDashboard from './review-dashboard';
import s from '../interview.module.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'入社笔试阅卷 · SNN 社团',robots:{index:false,follow:false}};
export default async function ReviewPage(){const user=await getChatGPTUser(),allowed=user&&isInterviewReviewer(env as unknown as InterviewEnv,user.email,user.userId);
 return <main className={s.page}><header className={s.intro}><p className={s.eyebrow}>SNN / REVIEW DESK</p><div className={s.titleRow}><h1>入社笔试阅卷</h1><Link className={s.count} href="/join/interview">[ 返回笔试 ]</Link></div><p className={s.lead}>查看提交人数、打开完整答卷、逐题评分并保存评语。</p></header>
 {!user?<section className={s.accessGate}><p className={s.eyebrow}>AUTHORIZED ACCESS</p><h2>登录后验证阅卷权限</h2><p>仅已授权的招新负责人可以查看考生信息、完整答卷和评分记录。</p><a className={s.primaryLink} href={chatGPTSignInPath('/join/interview/review')} target="_top">[ 使用 ChatGPT 登录 ]</a></section>:!allowed?<section className={s.accessGate}><h2>当前账号没有阅卷权限</h2><p>请使用网站负责人已授权的账号登录。</p><a className={s.primaryLink} href={chatGPTSignOutPath('/join/interview/review')} target="_top">[ 退出当前账号 ]</a></section>:<><div className={s.accountBar}><span>授权阅卷人 · {user.displayName}</span><a href={chatGPTSignOutPath('/join/interview/review')} target="_top">[ 退出账号 ]</a></div><ReviewDashboard signInPath={chatGPTSignInPath('/join/interview/review')}/></>}
 </main>;
}
