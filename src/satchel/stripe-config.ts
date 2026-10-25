import {guard} from './trust-guards';
import {accountWallScope} from './trust-wall-scope';
import {atomic,audit,human,id,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {requireProviderReview} from './providers';
import {sourceDocument,sourceGuard} from './trust';
import {stripeApi,type StripeEnv} from './stripe-api';
export async function stripeSettings(env:StripeEnv,actor:Actor){
 human(actor);need(actor,'owner');return {configurations:await rows(env.DB,`SELECT c.* FROM s_stripe_config c WHERE c.bank_account_id IS NULL OR EXISTS(SELECT 1 FROM s_trust_accounts a CROSS JOIN (SELECT ? email) viewer WHERE a.id=c.bank_account_id AND ${accountWallScope('a.id','viewer.email')}) ORDER BY c.approved_at,c.id`,actor.email),accounts:await rows(env.DB,`SELECT a.id,a.name,a.kind FROM s_trust_accounts a CROSS JOIN (SELECT ? email) viewer WHERE ${accountWallScope('a.id','viewer.email')} ORDER BY a.name`,actor.email),sandbox:env.STRIPE_MODE!=='live'};
}
export async function approveStripe(env:StripeEnv,actor:Actor,b:Data){
 human(actor);need(actor,'owner');await requireProviderReview(env.DB,'stripe');
 insist(b.confirmed===true,'The principal must approve this processor arrangement');
 insist(['operating','trust'].includes(b.kind),'Choose operating or protected trust collection');
 const processorAccount=b.kind==='trust'?text(b.processorAccountId,'Separate protected Stripe account',100):undefined;
 const account=await stripeApi(env,'/account',undefined,undefined,processorAccount);
 if(processorAccount)insist(account.id===processorAccount,'The verified processor account does not match the protected destination',409);insist(account.country==='US','This connector requires a United States Stripe account',409);
 if(b.kind==='operating')insist(!await stmt(env.DB,"SELECT 1 FROM s_stripe_config WHERE kind='trust' AND account_id=?",account.id).first(),'Operating collection cannot use a protected trust processor account',409);
 const mode=env.STRIPE_MODE==='live'?'live':'test',configId=id(),at=now();let externalBank:string|null=null,bank:string|null=null,document:Awaited<ReturnType<typeof sourceDocument>>|null=null,reference:string|null=null;
 if(b.kind==='trust'){
  insist(b.feesFromOperating===true&&b.chargebacksFromOperating===true&&b.principalProtected===true,'Trust collection requires verified protection of all client principal from fees and chargebacks',409);
  insist(!await stmt(env.DB,"SELECT 1 FROM s_stripe_config WHERE kind='operating' AND account_id=?",account.id).first(),'Trust and operating collection require separate Stripe accounts',409);
  insist(account.controller?.fees?.payer==='application'&&account.controller?.losses?.payments==='application'&&account.settings?.payouts?.debit_negative_balances===false,'The processor must verify separate fee and chargeback liability and refuse debits of protected client principal',409);
  externalBank=text(b.externalBankId,'Verified Stripe settlement bank reference',100);
  const destination=await stripeApi(env,'/accounts/'+encodeURIComponent(account.id)+'/external_accounts/'+encodeURIComponent(externalBank));
  insist(destination.object==='bank_account'&&destination.status==='verified'&&destination.currency==='usd'&&destination.default_for_currency===true,'Use the processor-verified default USD trust settlement bank',409);
  bank=text(b.bankAccountId,'Protected trust bank account',100);insist(await stmt(env.DB,"SELECT 1 FROM s_trust_accounts WHERE id=? AND kind='trust'",bank).first(),'Choose a trust bank account');
  document=await sourceDocument(env.DB,actor,b.documentId);reference=text(b.protectionReference,'Verified bank and processor protection arrangement',2000);
 }
 await atomic(env.DB,actor,[guard(env.DB,'NOT EXISTS(SELECT 1 FROM s_stripe_environment WHERE mode<>?)',mode),stmt(env.DB,'INSERT INTO s_stripe_environment SELECT 1,? WHERE NOT EXISTS(SELECT 1 FROM s_stripe_environment)',mode),...(document?[sourceGuard(env.DB,document,actor)]:[]),stmt(env.DB,'INSERT INTO s_stripe_config VALUES(?,?,?,?,?,?,?,?,?,?,?)',configId,account.id,mode,b.kind,bank,externalBank,document?.id??null,document?.digest??null,reference,actor.email,at),audit(env.DB,actor,'stripe.arrangement_approved',configId,JSON.stringify({kind:b.kind,accountId:account.id,bankAccountId:bank,protectionReference:reference,sourceDigest:document?.digest??null,mode}))]);
 return stripeSettings(env,actor);
}

export async function verifyProtectedStripe(env:StripeEnv,config:Data){
 const account=await stripeApi(env,'/account',undefined,undefined,config.account_id);
 insist(account.id===config.account_id&&account.controller?.fees?.payer==='application'&&account.controller?.losses?.payments==='application'&&account.settings?.payouts?.debit_negative_balances===false,'Verified protection changed; trust collection is refused',409);
 const bank=await stripeApi(env,'/accounts/'+encodeURIComponent(config.account_id)+'/external_accounts/'+encodeURIComponent(config.external_bank_id));
 insist(bank.object==='bank_account'&&bank.status==='verified'&&bank.currency==='usd'&&bank.default_for_currency===true,'Verified trust settlement destination changed; collection is refused',409);
}

export async function assertStripeEnvironment(env:StripeEnv){const realm=await stmt(env.DB,'SELECT mode FROM s_stripe_environment WHERE id=1').first<Data>();insist(!realm||realm.mode===(env.STRIPE_MODE==='live'?'live':'test'),'This installation contains a different payment environment. Restore its configured mode; use a separate installation for production funds.',409);}
