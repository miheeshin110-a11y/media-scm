// Retired workflow: logistics now exports broadcast preparation/shipment quantities to Excel.
// No database access, ERP request, inventory apply or credential handling remains on this route.
const disabled=()=>Response.json({error:'이카운트 연결은 사용하지 않습니다. 물류 SCM의 전달 엑셀 다운로드를 이용하세요.',disabled:true},{status:410,headers:{'Cache-Control':'no-store'}});
export const GET=disabled;
export const POST=disabled;
