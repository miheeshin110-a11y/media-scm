import type {PplAiring} from './ppl-airings.ts';
export type AllocationDraft={id:string;key:string;broadcastId:string;month:string;net:string;airing:PplAiring;applyAgencyCost?:boolean};
// Fill an unfinished slot first so creating a broadcast retains its entered amount and airing.
export function addCreatedBroadcast(rows:AllocationDraft[],fresh:AllocationDraft):AllocationDraft[]{
 if(rows.some(r=>r.broadcastId===fresh.broadcastId))return rows;
 const index=rows.findIndex(r=>!r.broadcastId);
 return index<0?[...rows,fresh]:rows.map((r,i)=>i!==index?r:{...r,broadcastId:fresh.broadcastId,month:r.month||fresh.month});
}
