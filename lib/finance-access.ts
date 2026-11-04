// PPL entry belongs to every registered operator. Accounting imports remain restricted.
export function canSaveFinance(kind:string,isReviewer:boolean){
 return isReviewer||['giftItem','salesComposition','party','program','contract','allocation','allocations','voidAllocation'].includes(kind);
}
