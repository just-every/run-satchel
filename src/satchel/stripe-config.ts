import {atomic,audit,human,id,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {requireProviderReview} from './providers';
import {sourceDocument,sourceGuard} from './trust';
import {stripeApi,type StripeEnv} from './stripe-api';
export async function stripeSettings(env:StripeEnv,actor:Actor){
 human(actor);need(actor,'owner');return {configurations:await rows(env.DB,'SELECT * FROM s_stripe_config ORDER BY approved_at,id'),accounts:await rows(env.DB,'SELECT id,name,kind FROM s_trust_accounts ORDER BY name'),sandbox:true};
}
export async function approveStripe(env:StripeEnv,actor:Actor,b:Data){
 human(actor);need(actor,'owner');await requireProviderReview(env.DB,'stripe');
 insist(b.confirmed===true,'The principal must approve this processor arrangement');
 insist(['operating','trust'].includes(b.kind),'Choose operating or protected trust collection');
 const account=await stripeApi(env,'/account');insist(account.country==='US','This connector requires a United States Stripe account',409);
 const configId=id(),at=now();let bank:string|null=null,document:Awaited<ReturnType<typeof sourceDocument>>|null=null,reference:string|null=null;
 if(b.kind==='trust'){
  insist(b.feesFromOperating===true&&b.chargebacksFromOperating===true&&b.principalProtected===true,'Trust collection requires verified protection of all client principal from fees and chargebacks',409);
  bank=text(b.bankAccountId,'Protected trust bank account',100);insist(await stmt(env.DB,"SELECT 1 FROM s_trust_accounts WHERE id=? AND kind='trust'",bank).first(),'Choose a trust bank account');
  document=await sourceDocument(env.DB,actor,b.documentId);reference=text(b.protectionReference,'Verified bank and processor protection arrangement',2000);
 }
 await atomic(env.DB,actor,[...(document?[sourceGuard(env.DB,document,actor)]:[]),stmt(env.DB,'INSERT INTO s_stripe_config VALUES(?,?,?,?,?,?,?,?,?)',configId,account.id,b.kind,bank,document?.id??null,document?.digest??null,reference,actor.email,at),audit(env.DB,actor,'stripe.arrangement_approved',configId,JSON.stringify({kind:b.kind,accountId:account.id,bankAccountId:bank,protectionReference:reference,sourceDigest:document?.digest??null,testMode:true}))]);
 return stripeSettings(env,actor);
}
