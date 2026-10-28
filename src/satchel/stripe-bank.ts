import {atomic,audit,date,id,insist,integer,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard,postingDateGuard} from './trust-guards';
import {accountWallScope} from './trust-wall-scope';
import {operatingAttempt,reconciliationState,settlementAccess} from './stripe-reconciliation';
import {stripeApi,type StripeEnv} from './stripe-api';

export async function bankMatches(env:StripeEnv):Promise<Data[]>{
 const originals=await rows(env.DB,'SELECT *,NULL account_id,NULL entry_id,NULL deposit_date FROM s_stripe_bank_matches');
 const deposits=await rows(env.DB,'SELECT * FROM s_stripe_bank_deposits'),reversals=await rows(env.DB,'SELECT * FROM s_stripe_bank_reversals');
 return [...originals,...deposits].map(m=>({...m,reversal:reversals.find(r=>r.match_id===m.id)??null}));
}
async function bankAccess(env:StripeEnv,actor:Actor,accountId:string){
 insist(await stmt(env.DB,`SELECT 1 FROM s_trust_accounts a CROSS JOIN (SELECT ? email) viewer WHERE a.id=? AND a.kind='operating' AND ${accountWallScope('a.id','viewer.email')}`,actor.email,accountId).first(),'Choose an accessible operating bank account',409);
}
export async function matchSettlement(env:StripeEnv,actor:Actor,attemptId:string,b:Data){
 const {bill,config}=await operatingAttempt(env,actor,attemptId),observation=await stmt(env.DB,'SELECT * FROM s_stripe_settlement_observations WHERE id=? AND config_id=?',text(b.observationId,'Reviewed settlement',100),config.id).first<Data>();
 insist(observation,'Settlement not found',404);
 const s=JSON.parse(observation.snapshot),cents=integer(b.cents,'Bank deposit in USD cents',1),reference=text(b.bankReference,'Bank statement reference',200),reason=text(b.reason,'Finance match evidence',1000);
 const accountId=text(b.operatingAccountId,'Operating deposit account',100),day=date(b.depositDate);await bankAccess(env,actor,accountId);
 insist(b.confirmed===true&&s.status==='paid'&&s.reconciliationStatus==='completed'&&s.netCents===s.amountCents&&s.amountCents===cents&&s.transactions.every((t:Data)=>t.status==='available'),'Only a fully reconciled paid payout can match an exact bank deposit',409);
 const current=await stripeApi(env,'/payouts/'+encodeURIComponent(s.payoutId));
 insist(current.status==='paid'&&current.amount===cents&&current.currency==='usd','Payout changed; inspect it again',409);
 const attempts=await rows(env.DB,"SELECT payment_intent_id FROM s_stripe_checkouts WHERE bill_id=? AND purpose='operating'",bill.id);
 insist(s.transactions.some((t:Data)=>attempts.some(a=>a.payment_intent_id===t.paymentIntentId)),'Settlement is not allocated to this invoice',409);
 const batchGuards=await settlementAccess(env,actor,s.transactions),matches=await bankMatches(env),prior=matches.find(m=>m.payout_id===s.payoutId&&!m.reversal);
 if(prior){insist(prior.bank_reference===reference&&prior.cents===cents&&prior.reason===reason&&prior.account_id===accountId&&prior.deposit_date===day,'Reverse the retained bank match before recording a different decision',409);return reconciliationState(env,actor,bill.id);}
 insist(!matches.some(m=>m.bank_reference===reference),'This bank statement reference already belongs to a retained match',409);
 const matchId=id(),entryId=id(),at=now();
 await atomic(env.DB,actor,[...batchGuards,accessGuard(env.DB,actor,bill.matter_id),postingDateGuard(env.DB,accountId,day),
 guard(env.DB,"EXISTS(SELECT 1 FROM s_trust_accounts WHERE id=? AND kind='operating')",accountId),
 guard(env.DB,'NOT EXISTS(SELECT 1 FROM s_stripe_bank_deposits d WHERE d.payout_id=? AND NOT EXISTS(SELECT 1 FROM s_stripe_bank_reversals r WHERE r.match_id=d.id)) AND NOT EXISTS(SELECT 1 FROM s_stripe_bank_matches d WHERE d.payout_id=? AND NOT EXISTS(SELECT 1 FROM s_stripe_bank_reversals r WHERE r.match_id=d.id))',s.payoutId,s.payoutId),
 stmt(env.DB,"INSERT INTO s_trust_entries VALUES(?,?,NULL,'stripe_payout',?,?,?,?,?,?)",entryId,accountId,cents,day,day,matchId,actor.email,at),
 stmt(env.DB,'INSERT INTO s_stripe_bank_deposits VALUES(?,?,?,?,?,?,?,?,?,?,?)',matchId,s.payoutId,observation.id,reference,cents,reason,actor.email,at,accountId,entryId,day),
 audit(env.DB,actor,'stripe.bank_matched',s.payoutId,JSON.stringify({matchId,reference,cents,reason,observationId:observation.id,accountId,entryId}),{matterId:bill.matter_id})]);
 return reconciliationState(env,actor,bill.id);
}
export async function reverseBankMatch(env:StripeEnv,actor:Actor,attemptId:string,b:Data){
 const {bill}=await operatingAttempt(env,actor,attemptId),matchId=text(b.matchId,'Original bank match',100),reason=text(b.reason,'Finance reversal reason',1000),key=text(b.requestKey,'Reversal decision identity',100),day=date(b.depositDate);
 insist(b.confirmed===true&&b.revision===bill.revision,'Approve reversal against the current invoice revision',409);
 const match=(await bankMatches(env)).find(m=>m.id===matchId);insist(match,'Bank match not found',404);
 const observation=await stmt(env.DB,'SELECT * FROM s_stripe_settlement_observations WHERE id=?',match.observation_id).first<Data>(),snapshot=JSON.parse(observation!.snapshot);
 const attempts=await rows(env.DB,"SELECT payment_intent_id FROM s_stripe_checkouts WHERE bill_id=? AND purpose='operating'",bill.id);
 insist(snapshot.transactions.some((t:Data)=>attempts.some(a=>a.payment_intent_id===t.paymentIntentId)),'Bank match is not allocated to this invoice',409);
 const batchGuards=await settlementAccess(env,actor,snapshot.transactions);
 if(match.account_id)await bankAccess(env,actor,match.account_id);
 const request=JSON.stringify({matchId,reason,day,revision:b.revision}),prior=await stmt(env.DB,'SELECT * FROM s_stripe_bank_reversals WHERE request_key=?',key).first<Data>();
 if(prior){insist(prior.request_json===request,'This reversal identity belongs to another decision',409);return reconciliationState(env,actor,bill.id);}
 insist(!match.reversal,'This bank match is already reversed',409);
 const reversalId=id(),entryId=match.entry_id?id():null,at=now();
 await atomic(env.DB,actor,[...batchGuards,accessGuard(env.DB,actor,bill.matter_id),guard(env.DB,'EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=?)',bill.id,b.revision),
 ...(entryId?[postingDateGuard(env.DB,match.account_id,day),stmt(env.DB,"INSERT INTO s_trust_entries VALUES(?,?,NULL,'stripe_payout_reversal',?,?,?,?,?,?)",entryId,match.account_id,-match.cents,day,day,reversalId,actor.email,at)]:[]),
 stmt(env.DB,'INSERT INTO s_stripe_bank_reversals VALUES(?,?,?,?,?,?,?,?)',reversalId,key,request,match.id,reason,actor.email,at,entryId),
 audit(env.DB,actor,'stripe.bank_match_reversed',match.id,request,{matterId:bill.matter_id})]);
 return reconciliationState(env,actor,bill.id);
}
