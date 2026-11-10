// Pairing is disabled along with the retired ECOUNT workflow. Existing history is retained.
const disabled=()=>Response.json({error:'물류팀 PC 연결은 사용하지 않습니다. 별도 프로그램을 실행하지 않아도 됩니다.',disabled:true},{status:410,headers:{'Cache-Control':'no-store'}});
export const GET=disabled;
export const POST=disabled;
