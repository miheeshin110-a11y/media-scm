// PPL entry belongs to every registered operator. Accounting imports remain restricted.
export function canSaveFinance(kind:string,isReviewer:boolean){
 return isReviewer||['party','program','contract','allocation','allocations','voidAllocation'].includes(kind);
}
