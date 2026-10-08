/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {interviewAPI} from './interview-api';
import {isInterviewReviewer,type InterviewEnv} from '../lib/interview/database';
import {cloudflareReviewerRequest} from './reviewer-auth';

interface Env extends InterviewEnv {
  ASSETS: {
    fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (env.SNN_INTERVIEW_AUTH_PROVIDER === 'cloudflare') {
      if (url.pathname === '/signin-with-chatgpt') {
        // Old candidate bookmarks may still use the former login URL. Keep their destination public.
        let destination=new URL('/join/interview',url);
        try{
          const requested=new URL(url.searchParams.get('return_to')??'/join/interview',url);
          if(requested.origin===url.origin){
            if(requested.pathname.replace(/\/$/,'')==='/join/interview/review')destination=new URL('/_staff/interview/login',url);
            else if(['/','/join/interview','/join/interview/','/join/interview/result','/join/interview/result/'].includes(requested.pathname))destination=requested;
          }
        }catch{}
        return Response.redirect(destination,303);
      }
      if (url.pathname === '/signout-with-chatgpt') {
        return Response.redirect(new URL('/cdn-cgi/access/logout',url),303);
      }
      request = await cloudflareReviewerRequest(request,env);
      const allowed=isInterviewReviewer(env,request.headers.get('oai-authenticated-user-email'),request.headers.get('oai-authenticated-user-id'));
      if(url.pathname==='/_staff/interview/login'){
        // Access protects only this explicit staff login URL; verified JWT + owner allowlist still protect all review data.
        if(allowed)return Response.redirect(new URL('/join/interview/review',url),303);
        return new Response('负责人登录暂未完成。学生请返回 /join/interview 答题或查分。',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, no-store'}});
      }
      if(url.pathname.replace(/\/$/,'')==='/join/interview/review'&&!allowed){
        return Response.redirect(new URL('/join/interview',url),303);
      }
    }
    if(url.pathname.startsWith('/api/interview/'))return interviewAPI(request,env);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response=await handler.fetch(request, env, ctx);
    if(url.pathname==='/join/interview'||url.pathname.startsWith('/join/interview/')){
      const protectedResponse=new Response(response.body,response);
      protectedResponse.headers.set('Cache-Control','private, no-store');
      protectedResponse.headers.append('Vary','Cookie, oai-authenticated-user-id, oai-authenticated-user-email');
      return protectedResponse;
    }
    return response;
  },
};

export default worker;
