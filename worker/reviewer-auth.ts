import {createRemoteJWKSet,jwtVerify} from 'jose';
import type {InterviewEnv} from '../lib/interview/database';

// Existing Cloudflare One team. Only public signing keys are cached here.
const issuer='https://cold-boat-f6a9.cloudflareaccess.com';
const publicKeys=createRemoteJWKSet(new URL('/cdn-cgi/access/certs',issuer));

export async function cloudflareReviewerRequest(request:Request,env:InterviewEnv):Promise<Request>{
 const headers=new Headers(request.headers);
 for(const name of [...headers.keys()]){
  if(name.startsWith('oai-authenticated-user-'))headers.delete(name);
 }
 const token=headers.get('cf-access-jwt-assertion')
  ??headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('CF_Authorization='))?.slice('CF_Authorization='.length);
 if(token&&env.SNN_INTERVIEW_ACCESS_AUD){
  try{
   const {payload}=await jwtVerify(token,publicKeys,{
    issuer,audience:env.SNN_INTERVIEW_ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email'],
   });
   if(typeof payload.sub==='string'&&typeof payload.email==='string'){
    headers.set('oai-authenticated-user-id','cloudflare:'+payload.sub);
    headers.set('oai-authenticated-user-email',payload.email);
   }
  }catch{
   // Missing, expired or invalid credentials leave the caller anonymous.
  }
 }
 return new Request(request,{headers});
}
