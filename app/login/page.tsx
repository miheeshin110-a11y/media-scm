import {authConfigured} from '@/lib/auth';
import {GoogleButton} from './google-button';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;const ready=authConfigured();
  return <main style={{maxWidth:440,margin:'12vh auto',padding:32,background:'white',borderRadius:24}}><h1 style={{fontSize:26}}>미디어 SCM</h1><p>방송 · PPL 통합관리</p><p>등록된 회사 구글 계정으로 로그인해 주세요.</p>{!ready&&<p role="status">독립 서비스 연결을 준비 중입니다. 설정 완료 후 로그인할 수 있습니다.</p>}{error&&<p role="alert">로그인하지 못했습니다. 등록된 계정인지 확인한 뒤 다시 시도해 주세요.</p>}<GoogleButton enabled={ready}/></main>;
}
