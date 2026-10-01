export type Party={id:string;name:string;businessNo:string;source:string};
export const ownBusinessNo='1148667134';
export const dionBusinessNo='5758703517';
export const partyId=(businessNo:string)=>'PARTY-'+businessNo.replace(/[-\s]/g,'');
// Supplier identities from the user's purchase export, Sheet1 rows 2–134.
// Dion's sales recipients are not automatically classified as cost suppliers.
export const seedParties:Party[]=[
 ['5758703517','디온커뮤니케이션즈 주식회사'],
 ['7578802005','주식회사 미디어상생'],
 ['3498802537','주식회사 이투미디어'],
 ['8868602314','주식회사 유안콘텐츠미디어'],
 ['2638801520','주식회사 미디어레인크리에이트'],
 ['1208811492','(주) 테아로하코리아'],
 ['1078672231','주식회사 센미디어'],
].map(([businessNo,name])=>({id:partyId(businessNo),businessNo,name,source:'데이즈온 매입자료 · 2026-09-17 확인'}));
// Observed channel labels in the supplied invoice descriptions and reviewed broadcast links.
export const contractChannels=['JTBC','MBN','TV조선','채널A','MBC','SBS'];
export function partyChoices(f:{parties?:Party[];contracts:{party:string;businessNo:string}[]}):Party[]{
 const map=new Map(seedParties.map(p=>[p.businessNo,p]));
 for(const p of f.parties||[])if(!map.has(p.businessNo))map.set(p.businessNo,p);
 for(const c of f.contracts){const n=c.businessNo.replace(/[-\s]/g,'');if(/^\d{10}$/.test(n)&&n!==ownBusinessNo&&!map.has(n))map.set(n,{id:partyId(n),businessNo:n,name:c.party,source:'기존 계약 거래처'});}
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}
export const displayBusinessNo=(n:string)=>n.replace(/^(\d{3})(\d{2})(\d{5})$/,'$1-$2-$3');
