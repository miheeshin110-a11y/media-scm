import {spawnSync} from 'node:child_process';
function run(script,args=[]){
 const child=spawnSync(process.execPath,[script,...args],{stdio:'inherit',env:process.env});
 if(child.error)throw child.error;
 if(child.status!==0)process.exit(child.status??1);
}
// Preview builds never migrate the production database.
if(process.env.VERCEL_ENV==='production')run('scripts/migrate.mjs');
run('node_modules/next/dist/bin/next',['build','--webpack']);
