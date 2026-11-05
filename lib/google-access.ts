export type Role='reviewer'|'inputter';
export function roleForEmail(email:unknown,verified:unknown,config:NodeJS.ProcessEnv):Role|null {
  if(verified!==true||typeof email!=='string')return null;
  const normalized=email.trim().toLowerCase();
  const list=(key:string)=>{try{const v:unknown=JSON.parse(config[key]||'[]');return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string').map(x=>x.trim().toLowerCase().replace(/^email:/,'')):[];}catch{return [];}};
  if([...list('SCM_REVIEWER_EMAILS'),...list('SCM_ADDITIONAL_REVIEWER_EMAILS')].includes(normalized))return 'reviewer';
  if(list('SCM_INPUTTER_EMAILS').includes(normalized))return 'inputter';
  return null;
}
