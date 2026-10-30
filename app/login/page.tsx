import {CalendarDays, LockKeyhole} from 'lucide-react';
import {authConfigured} from '@/lib/auth';
import {GoogleButton} from './google-button';
import styles from './login.module.css';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;const ready=authConfigured();
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <header className={styles.brand}>
          <span className={styles.brandIcon}><CalendarDays size={26} aria-hidden="true" /></span>
          <div><p className={styles.brandName}>미디어 SCM</p><p className={styles.brandDescription}>방송 · PPL 통합관리</p></div>
        </header>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>업무 시작하기</p>
          <h1 id="login-title" className={styles.title}>회사 계정으로 로그인</h1>
          <p className={styles.description}>방송 입력부터 PPL 배분, 미입력 확인까지<br />한곳에서 이어서 관리하세요.</p>
        </div>
        {!ready && <p className={styles.notice} role="status">서비스 연결을 준비 중입니다. 설정 완료 후 로그인할 수 있습니다.</p>}
        {error && <p className={styles.error} role="alert">로그인하지 못했습니다. 등록된 회사 계정인지 확인한 뒤 다시 시도해 주세요.</p>}
        <GoogleButton enabled={ready} />
        <p className={styles.hint}>버튼을 누른 뒤 회사 Google 계정을 선택해 주세요.</p>
        <footer className={styles.footer}>
          <LockKeyhole size={16} aria-hidden="true" />
          <p>사전에 등록된 <strong>회사 Google 계정</strong>으로 이용할 수 있습니다.<br />접속 권한이 필요하면 팀장에게 문의해 주세요.</p>
        </footer>
      </section>
    </main>
  );
}
