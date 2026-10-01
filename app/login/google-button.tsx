'use client';
import {signIn} from 'next-auth/react';
export function GoogleButton({enabled}:{enabled:boolean}){return <button className="primary" disabled={!enabled} onClick={()=>signIn('google',{callbackUrl:'/'})}>회사 구글 계정으로 로그인</button>;}
