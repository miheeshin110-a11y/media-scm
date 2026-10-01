import {actualDateTime,unifiedResult,resultMetrics,type Item} from './scm-model.ts';
import {computedItem,costCalculation} from './workflow.ts';
import {workflowRows} from './workflow-sheets.ts';
export const TEST_SHEET_ID='1CgPQJuFoZ0fb0xb_CzySTs2UR_VcYvznfntP46mUJJk';
export const sheetHeaders={
  'SCM_방송':['방송 ID','버전','편성 기준일','편성 표기시간','실제 방송일시(편성환산)','홈쇼핑 채널','아이템','담당자','방송 상태','주문 목표금액','홈쇼핑 목표금액','사업계획 이익목표','수정자','수정일시'],
  'SCM_방송결과':['방송 ID','버전','실제 시작일','실제 시작시간','실제 종료일','실제 종료시간','주문수량 합계','주문금액(VAT 제외)','홈쇼핑 목표 달성률(%)','이익금','실적 기준일','근거 자료','비고','수정자','수정일시'],
  'SCM_구성실적':['구성결과 ID','방송 ID','버전','구성','주문수량(세트)','판매가','판매가 부가세 기준','공급단가','수수료 유형','수수료 값','전환율(%)','예상출고(선택한 수량처리 기준)','확정출고(세트)','실제출고(세트)'],
  'SCM_결과비용':['방송 ID','버전','PPL 귀속비용','홈쇼핑 광고비','배송료','상품원가','기타비용','게스트 비용','판관비','비용 귀속월'],
} as const;
export function sheetRows(item:Item,rowId:number){
  if(!Number.isSafeInteger(rowId)||rowId<1)throw new Error('Invalid sheet row');
  item=computedItem(item);
  const r=unifiedResult(item.result),m=resultMetrics(item),v=item.version||0,blank=(x:unknown)=>x??'';
  const row=rowId+1,compositionRow=(rowId-1)*2+2;
  const rows=[
    {range:"'SCM_방송'!A"+row+':N'+row,values:[[item.id,v,item.date,item.time,actualDateTime(item.date,item.time),item.channel,item.item,item.owner,item.status,item.target,item.hsTarget||'',item.businessProfitTarget||'',item.updatedBy||'',item.updatedAt||'']]},
    {range:"'SCM_방송결과'!A"+row+':O'+row,values:[[item.id,v,r.actualDate,r.actualStart,r.actualEndDate,r.actualEnd,blank(m.orderTotal),r.orderAmount,blank(m.achievement),r.profit,r.asOfDate,r.sourceRef,r.notes,item.updatedBy||'',item.updatedAt||'']]},
    {range:"'SCM_구성실적'!A"+compositionRow+':N'+(compositionRow+1),values:([['single','메인 구성',r.single,m.estimatedSingle],['double','서브 구성',r.double,m.estimatedDouble]] as const).map(([key,label,line,estimate])=>[item.id+'-'+key,item.id,v,label,line.quantity,line.sellingPrice,line.vatBasis,line.supplyPrice,line.commissionType,line.commission,line.conversionRate,blank(estimate),line.confirmedShipment,line.actualShipment])},
    {range:"'SCM_결과비용'!A"+row+':J'+row,values:[[item.id,v,r.pplCost,r.adCost,r.shippingCost,r.goodsCost,r.otherCost,r.guestCost,r.administrationCost,item.attribution]]},
  ];
  if(item.calculationMode==='auto'){
    const calc=costCalculation(item);rows[2].values[0][11]=blank(calc.shipments.single);rows[2].values[1][11]=blank(calc.shipments.double);
  }
  const numericColumns=[[1,9,10,11],[1,6,7,8,9],[2,4,5,7,9,10,11,12,13],[1,2,3,4,5,6,7,8]];
  rows.forEach((group,i)=>group.values.forEach(row=>numericColumns[i].forEach(k=>{if(row[k]!==''&&row[k]!==undefined)row[k]=Number(row[k])})));
  return [...rows,...workflowRows(item,rowId)];
}
