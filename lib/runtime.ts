import {database,type Database} from './database';
import {currentUser} from './auth';
export type ScmEnv={DB:Database;GOOGLE_SERVICE_ACCOUNT_EMAIL?:string;GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?:string};
export const runtime=():ScmEnv=>({DB:database(),GOOGLE_SERVICE_ACCOUNT_EMAIL:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY});
type User=NonNullable<Awaited<ReturnType<typeof currentUser>>>;
const users=new WeakMap<Request,User>();
export const identity=(request:Request)=>{const u=users.get(request);return u?'email:'+u.email:null;};
export const readable=(request:Request)=>users.has(request);
export const editable=readable;
export const reviewer=(request:Request)=>users.get(request)?.role==='reviewer';
export function checkWrite(request:Request){
 if(!identity(request))return Response.json({error:'회사 구글 계정으로 로그인해 주세요.'},{status:401});
 const origin=request.headers.get('origin');
 const expected=process.env.NEXTAUTH_URL?new URL(process.env.NEXTAUTH_URL).origin:new URL(request.url).origin;
 if(!origin||origin!==expected)return Response.json({error:'허용되지 않은 요청입니다.'},{status:403});
 return null;
}
export function authenticated(handler:(request:Request)=>Promise<Response>){return async(request:Request)=>{
 try{
  const user=await currentUser();
  if(!user)return Response.json({error:'등록된 회사 구글 계정으로 로그인해 주세요.'},{status:401});
  users.set(request,user);
  if(!process.env.DATABASE_URL)return Response.json({error:'데이터 저장소 연결을 준비 중입니다.'},{status:503});
  return await handler(request);
 }finally{users.delete(request);}
};}
