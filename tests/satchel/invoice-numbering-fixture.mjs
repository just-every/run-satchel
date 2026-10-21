export const scheme=(nextNumber=100,extra={})=>({prefix:'BL',padding:5,separator:'-',year:true,nextNumber,...extra});
export async function draft(h,m,title='Lease review'){
 const base='/matters/'+m.id,e=await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:title,minutes:90,rateCents:25000},h.owner);
 return h.json(base+'/bills',{title,date:'2026-10-01',entryIds:[e.id]},h.owner);
}
export async function reviewed(h,m,b){
 const rule=await h.json('/matters/'+m.id+'/tax-rules',{state:'NY',jurisdiction:'New York fixture jurisdiction',rounding:'half_up',reference:'Synthetic reviewed exemption; not tax advice',reviewed:true,service:{eligibility:'exempt',ratePpm:0,reference:'Synthetic reviewed service exemption'},expense:{eligibility:'exempt',ratePpm:0,reference:'Synthetic reviewed expense exemption'}},h.owner);
 const review=await h.json('/bills/'+b.id+'/tax-reviews',{revision:b.revision,ruleId:rule.id},h.owner);
 return h.json('/bills/'+b.id+'/approve',{revision:b.revision,taxReviewId:review.id,reviewNote:'Counsel reviewed the exact bill and tax exemption'},h.owner);
}
