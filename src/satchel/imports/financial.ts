import type {Data} from '../model';
export const sourceArKinds=['invoice','payment','credit','refund','payment_reversal','credit_reversal','dispute','dispute_clear'];
export const reversalKinds:Record<string,string>={refund:'payment',payment_reversal:'payment',credit_reversal:'credit',dispute_clear:'dispute'};
export function sourceMoneyEffect(kind:string,cents:number):Data{
 if(kind==='invoice')return {dueCents:cents};
 if(kind==='payment')return {paidCents:cents,dueCents:-cents};
 if(kind==='credit')return {creditedCents:cents,dueCents:-cents};
 if(kind==='refund'||kind==='payment_reversal')return {paidCents:-cents,dueCents:cents};
 if(kind==='credit_reversal')return {creditedCents:-cents,dueCents:cents};
 if(kind==='dispute')return {disputedCents:cents};
 if(kind==='dispute_clear')return {disputedCents:-cents};
 return {};
}
