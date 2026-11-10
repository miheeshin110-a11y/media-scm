// Old PC agents stop polling on 401. Do not accept tokens/results or create ERP jobs.
export async function POST(){return Response.json({error:'이카운트 PC 연결 기능 사용이 중지됐습니다.'},{status:401,headers:{'Cache-Control':'no-store'}});}
