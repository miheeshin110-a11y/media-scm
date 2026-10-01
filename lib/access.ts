export type AccessConfig={SCM_PUBLIC_DEMO?:string;SCM_EDITOR_IDENTITIES?:string;SCM_INPUTTER_IDENTITIES?:string;SCM_REVIEWER_IDENTITIES?:string};
export function requestIdentity(request:Request){const id=request.headers.get('oai-authenticated-user-id');if(id)return id;const email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();return email&&email.includes('@')?'email:'+email:null;}
export const publicDemo=(config:AccessConfig)=>config.SCM_PUBLIC_DEMO==='1';
export function canEdit(request:Request,config:AccessConfig){
 if(!requestIdentity(request))return false;
 if(!publicDemo(config))return true;
 return matches(request,config.SCM_EDITOR_IDENTITIES)||matches(request,config.SCM_INPUTTER_IDENTITIES)||matches(request,config.SCM_REVIEWER_IDENTITIES);
}
export const canRead=(request:Request,config:AccessConfig)=>publicDemo(config)||Boolean(requestIdentity(request));
function matches(request:Request,value?:string){try{const list:unknown=JSON.parse(value||'[]');if(!Array.isArray(list)||list.some(x=>typeof x!=='string'))return false;const email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();return list.includes(requestIdentity(request))||Boolean(email&&list.includes('email:'+email));}catch{return false;}}
export function canReview(request:Request,config:AccessConfig){return canEdit(request,config)&&(matches(request,config.SCM_EDITOR_IDENTITIES)||matches(request,config.SCM_REVIEWER_IDENTITIES));}
