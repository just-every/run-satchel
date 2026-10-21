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

// Real public setup for a client requiring both LEDES formats.
export async function insurer(h){
 const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};
 await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:25000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
 const {open}=await import('./harness.mjs'),{xmlProfile}=await import('./ledes-xml-reader.mjs');
 const m=await open(h,'Harbor Mutual coverage review','Harbor Mutual Insurance','Reed Logistics');
 await h.json('/ledes/timekeepers',{email:'owner@example.test',timekeeperId:'BL-001',name:'Barton, Avery',classification:'PT'},h.owner);
 await h.json('/matters/'+m.id+'/ledes-guideline',{clientLedesId:'HARBOR',lawFirmId:'BARTON',requireTask:false,requireActivity:false,requireExpense:false,narrativeMin:0,bannedPhrases:[],maxRates:{},incrementMinutes:0,note:'Synthetic client-reviewed insurer guidelines',xmlProfile},h.owner);
 return m;
}
