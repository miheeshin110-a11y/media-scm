// Sources: home-shopping results workbook, 2026!A7:D2231 (read 2026-11-04),
// quantity-plan workbook code sheet A/F, and existing SCM gift names.
// Sales quantities are deliberately excluded; distinct product variants remain distinct.
export const costItemCatalog=[
 {name:'파라다이스 그레인 버닝',aliases:['파라','파라다이스'],giftOnly:false},
 {name:'알파시클로덱스트린',aliases:['알파'],giftOnly:false},
 {name:'그린 아세로라C',aliases:['아세로라','아세'],giftOnly:false},
 {name:'올인원 프리바이오틱스',aliases:['올포','프리바이오틱스'],giftOnly:false},
 {name:'프리트리플',aliases:['트리플'],giftOnly:false},
 {name:'맥주효모 비오틴 플러스',aliases:['맥주효모','맥비'],giftOnly:false},
 {name:'블루베리 파우더 30g',aliases:['블루베리'],giftOnly:false},
 {name:'홍화씨',aliases:[],giftOnly:false},
 {name:'올인원 프리바이오틱스(지관)',aliases:['올포[지관]'],giftOnly:false},
 {name:'루피니빈',aliases:[],giftOnly:false},
 {name:'알파프로',aliases:[],giftOnly:false},
 {name:'바이탈',aliases:[],giftOnly:false},
 {name:'젤리',aliases:[],giftOnly:true},
 {name:'보틀',aliases:[],giftOnly:true},
 {name:'쇼핑백',aliases:[],giftOnly:true},
 {name:'쇼핑백[소]',aliases:[],giftOnly:true},
 {name:'비쥬텀블러',aliases:[],giftOnly:true},
];
const key=(s:string)=>s.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ko');
export function canonicalCostItem(name:string,kind:string){
 return costItemCatalog.find(c=>(!c.giftOnly||kind==='gift')&&[c.name,...c.aliases].some(n=>key(n)===key(name)))?.name;
}
