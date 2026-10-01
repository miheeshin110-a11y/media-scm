import {getServerSession,type NextAuthOptions} from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import {roleForEmail} from './google-access';
export function authOptions():NextAuthOptions{return {
  secret:process.env.NEXTAUTH_SECRET,
  session:{strategy:'jwt',maxAge:8*60*60},
  pages:{signIn:'/login',error:'/login'},
  providers:[GoogleProvider({clientId:process.env.GOOGLE_CLIENT_ID||'',clientSecret:process.env.GOOGLE_CLIENT_SECRET||'',authorization:{params:{scope:'openid email profile',prompt:'select_account'}}})],
  callbacks:{
    async signIn({profile,account}){return account?.provider==='google'&&Boolean(roleForEmail(profile?.email,(profile as {email_verified?:boolean})?.email_verified,process.env));},
    async jwt({token,account,profile}){if(account){token.emailVerified=(profile as {email_verified?:boolean})?.email_verified===true;}return token;},
    async session({session,token}){if(!roleForEmail(token.email,token.emailVerified,process.env))session.user=undefined;return session;},
  },
};}
export const authConfigured=()=>Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.NEXTAUTH_SECRET&&process.env.NEXTAUTH_URL);
export async function currentUser(){
  if(!authConfigured())return null;
  const session=await getServerSession(authOptions());
  const email=session?.user?.email;
  const role=roleForEmail(email,true,process.env);
  return email&&role?{email:email.toLowerCase(),role}:null;
}
