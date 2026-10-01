'use client';
import {useState} from 'react';
import {ArrowRight, LoaderCircle} from 'lucide-react';
import {signIn} from 'next-auth/react';
import styles from './login.module.css';

export function GoogleButton({enabled}: {enabled: boolean}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function login() {
    setPending(true);
    setFailed(false);
    try {
      await signIn('google', {callbackUrl: '/'});
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return <>
    <button type="button" className={styles.googleButton} disabled={!enabled || pending} aria-busy={pending} onClick={login}>
      <span className={styles.googleIcon} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.31 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z"/></svg>
      </span>
      <span>{pending ? 'Google 로그인 연결 중…' : 'Google 계정으로 로그인'}</span>
      {pending ? <LoaderCircle size={20} className={styles.spinner} aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />}
    </button>
    {failed && <p className={styles.error} role="alert">로그인 연결에 실패했습니다. 잠시 후 다시 눌러 주세요.</p>}
  </>;
}
