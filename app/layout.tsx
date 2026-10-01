import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '미디어 SCM · 방송 PPL 통합관리',
  description: '방송·PPL 일정을 입력하고 원데이터로 연동하는 SCM 업무 화면',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
