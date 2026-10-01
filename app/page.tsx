import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/auth';
import Workspace from './scm-workspace';
export const dynamic='force-dynamic';
export default async function Home(){
 if(!await currentUser())redirect('/login');
 return <Workspace/>;
}
