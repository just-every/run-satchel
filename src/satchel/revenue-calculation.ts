import {insist,rows,type Data} from './model';

// Largest remainders conserve each receipt cent. Stable input order breaks ties.
export function apportion(cents:number,weights:number[]):number[]{
 const total=weights.reduce<bigint>((n,w)=>n+BigInt(w),0n);if(!total)return weights.map(()=>0);
 const parts=weights.map((w,i)=>({i,cents:Number(BigInt(cents)*BigInt(w)/total),remainder:BigInt(cents)*BigInt(w)%total}));
 let left=cents-parts.reduce((n,p)=>n+p.cents,0);
 for(const p of [...parts].sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1)){if(left--<=0)break;p.cents++;}
 return parts.map(p=>p.cents);
}
export const revenueFormula='Receipt cents apportioned across frozen net invoice lines and tax by largest remainder; ties follow source identity. Only collected fee cents are shared in basis points, with the firm receiving the remainder. Each commission is the allocated share times its approved basis points, rounded half-up to a cent. Reversals subtract the difference between successive cumulative calculations on that same frozen basis.';

export async function revenueBasis(db:D1Database,billId:string){
 const bills=await rows(db,`WITH RECURSIVE branch AS (SELECT * FROM s_bills WHERE id=? UNION ALL SELECT b.* FROM s_bills b JOIN branch p ON b.corrects_bill_id=p.id WHERE b.status<>'void') SELECT branch.*,t.snapshot tax_snapshot,e.earned_cents FROM branch LEFT JOIN s_bill_tax_approvals t ON t.bill_id=branch.id LEFT JOIN s_fee_earning_reviews e ON e.bill_id=branch.id WHERE branch.status IN('approved','exported') ORDER BY branch.created_at,branch.id`,billId);
 insist(bills.some(b=>b.id===billId),'Review a live approved original invoice',409);
 const pending=await rows(db,`WITH RECURSIVE branch AS (SELECT * FROM s_bills WHERE id=? UNION ALL SELECT b.* FROM s_bills b JOIN branch p ON b.corrects_bill_id=p.id WHERE b.status<>'void') SELECT id FROM branch WHERE status='draft'`,billId);
 insist(!pending.length,'Resolve the draft correction before allocating collections',409);
 const lines=new Map<string,Data>();let tax=0;
 for(const b of bills){const s=JSON.parse(b.tax_snapshot??b.snapshot);
  // An approved nonhourly invoice must retain its separate earning review.
  insist(!s.feePlan||b.earned_cents!==null,'Nonhourly earning approval is required',409);
  for(const l of s.lines){const before=lines.get(l.sourceId);if(before)before.amountCents+=l.amountCents;else lines.set(l.sourceId,{sourceId:l.sourceId,kind:l.kind,timekeeper:l.timekeeper??s.feePlan?.reviewedBy??null,amountCents:l.amountCents,date:l.date,minutes:l.minutes??null,rateCents:l.rateCents??null});}
  tax+=Number(s.taxCents??0);
 }
 const sourceLines=[...lines.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
 insist(tax>=0&&sourceLines.every(l=>l.amountCents>=0),'Resolve negative component balances before allocating collections',409);
 const total=sourceLines.reduce((n,l)=>n+l.amountCents,0)+tax;insist(Number.isSafeInteger(total)&&total>0,'Invoice has no positive allocation basis',409);
 return {sourceLines,taxCents:tax,totalCents:total,bills:bills.map(b=>({id:b.id,revision:b.revision,snapshot:b.tax_snapshot??b.snapshot,earnedCents:b.earned_cents}))};
}
export function calculateRevenue(cents:number,basis:Data,splits:Data[]){
 const amounts=apportion(cents,[...basis.sourceLines.map((l:Data)=>l.amountCents),basis.taxCents]);
 const sourceLines=basis.sourceLines.map((l:Data,i:number)=>({...l,collectedCents:amounts[i]}));
 const feeCents=sourceLines.filter((l:Data)=>l.kind==='time'||l.kind==='fee').reduce((n:number,l:Data)=>n+l.collectedCents,0),expenseCents=sourceLines.filter((l:Data)=>l.kind==='disbursement').reduce((n:number,l:Data)=>n+l.collectedCents,0),taxCents=amounts.at(-1)!;
 const shares=apportion(feeCents,[...splits.map(s=>s.shareBps),10000-splits.reduce((n,s)=>n+s.shareBps,0)]);
 const allocations=splits.map((s,i)=>({...s,cents:shares[i],commissionCents:Number((BigInt(shares[i])*BigInt(s.commissionBps)+5000n)/10000n)}));
 return {grossCents:cents,feeCents,expenseCents,taxCents,sourceLines,allocations,firmCents:shares.at(-1)!};
}
export function reversedCalculation(before:Data,after:Data){
 const result:Data={};for(const k of ['grossCents','feeCents','expenseCents','taxCents','firmCents'])result[k]=after[k]-before[k];
 result.allocations=after.allocations.map((a:Data,i:number)=>({...a,cents:a.cents-before.allocations[i].cents,commissionCents:a.commissionCents-before.allocations[i].commissionCents}));
 result.sourceLines=after.sourceLines.map((l:Data,i:number)=>({...l,collectedCents:l.collectedCents-before.sourceLines[i].collectedCents}));return result;
}
