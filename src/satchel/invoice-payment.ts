import {offlinePaidSql,writeoffSql} from './offline-balances';
import {verifyProtectedStripe} from './stripe-config';
import {sourceDocument} from './trust';
import {stripePaidSql,stripeReservedSql} from './processor-balances';
import {deliveredInvoice} from './invoice-delivery';
import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard,accessGuard} from './trust-guards';
import {portalAccess} from './portal';
import {invoiceFunds} from './trust-transfers';
import {requireProviderReview} from './providers';
import {paymentPath,stripeApi,type StripeEnv} from './stripe-api';
export async function paymentInvoice(db:D1Database,actor:Actor,billId:string){
 human(actor);const b=await stmt(db,'SELECT b.*,i.number,i.issued_at,t.snapshot tax_snapshot FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id LEFT JOIN s_bill_tax_approvals t ON t.bill_id=b.id WHERE b.id=?',billId).first<Data>();insist(b,'Invoice not found',404);
 if(actor.role==='client')insist(await stmt(db,`SELECT 1 WHERE ${portalAccess('?',['client','co_client','payer'])}`,actor.email,b.matter_id).first(),'Invoice not found',404);
 else{need(actor,'owner','lawyer','billing');await matter(db,actor,b.matter_id);}
 return b;
}
export function paymentAccess(db:D1Database,actor:Actor,matterId:string){return actor.role==='client'?guard(db,portalAccess('?',['client','co_client','payer']),actor.email,matterId):accessGuard(db,actor,matterId);}
export async function invoicePayment(env:StripeEnv,actor:Actor,billId:string){
 const b=await paymentInvoice(env.DB,actor,billId),s=JSON.parse(b.tax_snapshot??b.snapshot),funds=await invoiceFunds(env.DB,billId);
 const attempts=await rows(env.DB,"SELECT id,cents,purpose,status,created_at,updated_at FROM s_stripe_checkouts WHERE bill_id=? AND (?<>'client' OR purpose='operating') ORDER BY created_at,id",billId,actor.role);
 const delivered=await deliveredInvoice(env.DB,billId,actor);
 const replacements:Data[]=[];
 if(b.status==='void')for(const r of await rows(env.DB,'SELECT i.bill_id id,i.number FROM s_invoice_replacements r JOIN s_invoice_issues i ON i.bill_id=r.replacement_bill_id WHERE r.bill_id=?',billId)){try{await paymentInvoice(env.DB,actor,r.id);replacements.push(r);}catch{}}

 return {id:b.id,number:b.number,status:b.status==='void'?'void':attempts.some(a=>['creating','open','pending','uncertain'].includes(a.status)&&a.purpose==='operating')?'pending':s.totalCents-funds.paid_cents-funds.written_off_cents<=0?'paid':attempts.some(a=>a.status==='returned')?'returned':'unpaid',totalCents:s.totalCents,dueCents:Math.max(0,s.totalCents-funds.paid_cents-funds.written_off_cents),paidCents:funds.paid_cents,reservedCents:funds.reserved_cents,issuedAt:b.issued_at,attempts,resumeId:attempts.find(a=>a.status==='open'&&a.purpose==='operating')?.id??null,replacements,deliveryPdfUrl:delivered?.pdfUrl??null,owner:actor.role==='owner',trustLedgers:actor.role==='owner'?await rows(env.DB,'SELECT l.id,a.name FROM s_trust_ledgers l JOIN s_trust_accounts a ON a.id=l.account_id WHERE l.matter_id=?',b.matter_id):[],pdfUrl:actor.role==='client'?'/api/satchel/portal/invoices/'+billId+'/pdf':'/api/satchel/bills/'+billId+'/invoice.pdf',canPay:b.status!=='void'&&s.totalCents-funds.paid_cents-funds.written_off_cents-funds.reserved_cents>0&&!attempts.some(a=>['creating','open','pending','uncertain'].includes(a.status)&&a.purpose==='operating'),sandbox:env.STRIPE_MODE!=='live'};
}
export async function startCheckout(env:StripeEnv,actor:Actor,billId:string,b:Data){
 const bill=await paymentInvoice(env.DB,actor,billId);insist(bill.status!=='void','This invoice is void; open its replacement invoice',409);await requireProviderReview(env.DB,'stripe');
 const requestKey=text(b.requestKey,'Payment decision reference',100),purpose=b.purpose==='trust'?'trust':'operating';
 if(purpose==='trust')need(actor,'owner');
 const prior=await stmt(env.DB,b.attemptId?'SELECT * FROM s_stripe_checkouts WHERE id=?':'SELECT * FROM s_stripe_checkouts WHERE request_key=?',b.attemptId?text(b.attemptId,'Existing payment attempt',100):requestKey).first<Data>();
 insist(!b.attemptId||prior,'Payment attempt not found',404);
 if(prior){insist(prior.bill_id===billId&&prior.purpose===purpose,'Payment reference already belongs to another decision',409);return checkoutResult(env,prior);}
 const config=await stmt(env.DB,'SELECT * FROM s_stripe_config WHERE kind=? ORDER BY approved_at DESC,id DESC LIMIT 1',purpose).first<Data>();insist(config&&config.mode===(env.STRIPE_MODE==='live'?'live':'test'),'The principal must approve this Stripe collection arrangement in the current environment',409);
 const funds=await invoiceFunds(env.DB,billId);let ledger:Data|null=null;
 const snapshot=JSON.parse(bill.tax_snapshot??bill.snapshot);
 const cents=purpose==='operating'?snapshot.totalCents-funds.paid_cents-funds.written_off_cents-funds.reserved_cents:integer(b.cents,'Trust deposit in USD cents',1,100000000);
 insist(cents>0&&snapshot.totalCents-funds.paid_cents-funds.written_off_cents>0,'This invoice has no unreserved unpaid balance',409);
 if(purpose==='trust'){
  await verifyProtectedStripe(env,config);
  const protection=await sourceDocument(env.DB,actor,config.protection_document_id);insist(protection.digest===config.protection_digest,'Trust protection evidence changed; collection is refused',409);
  insist(await stmt(env.DB,'SELECT 1 FROM s_documents d JOIN s_document_versions v ON v.document_id=d.id AND v.version=d.current_version WHERE d.id=? AND d.erased_at IS NULL AND v.sha256=?',config.protection_document_id,config.protection_digest).first(),'Trust protection evidence must remain available and unchanged',409);
  insist(config.protection_digest&&config.protection_reference,'Trust protection has not been verified',409);
  ledger=await stmt(env.DB,'SELECT * FROM s_trust_ledgers WHERE id=? AND account_id=? AND matter_id=?',text(b.ledgerId,'Trust ledger',100),config.bank_account_id,bill.matter_id).first<Data>();insist(ledger,'Choose this matter’s protected trust ledger',409);
 }
 const checkoutId=id(),at=now();
 await atomic(env.DB,actor,[paymentAccess(env.DB,actor,bill.matter_id),guard(env.DB,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status<>'void')",billId,bill.revision),...(purpose==='operating'?[guard(env.DB,`EXISTS(SELECT 1 FROM s_bills b LEFT JOIN s_bill_tax_approvals tax ON tax.bill_id=b.id WHERE b.id=? AND CAST(json_extract(COALESCE(tax.snapshot,b.snapshot),'$.totalCents') AS INTEGER)-${stripePaidSql('b.id')}-${offlinePaidSql('b.id')}-${writeoffSql('b.id')}-${stripeReservedSql('b.id')}-COALESCE((SELECT SUM(p.cents-COALESCE((SELECT SUM(r.cents) FROM s_operating_payment_reversals r WHERE r.payment_id=p.id),0)) FROM s_operating_payments p WHERE p.bill_id=b.id),0)-COALESCE((SELECT SUM(t.cents) FROM s_trust_transfers t WHERE t.bill_id=b.id AND NOT EXISTS(SELECT 1 FROM s_trust_transfer_actions a WHERE a.transfer_id=t.id AND a.kind IN('declined','cleared','not_executed'))),0)=?)`,billId,cents)]:[]),guard(env.DB,"NOT EXISTS(SELECT 1 FROM s_stripe_checkouts WHERE bill_id=? AND purpose=? AND status IN('creating','open','pending','uncertain'))",billId,purpose),stmt(env.DB,"INSERT INTO s_stripe_checkouts VALUES(?,?,?,?,'usd','creating',?,?,?,NULL,NULL,?,?,?)",checkoutId,requestKey,billId,cents,purpose,ledger?.id??null,config.id,actor.email,at,at),audit(env.DB,actor,'stripe.checkout_requested',checkoutId,JSON.stringify({billId,cents,purpose,configId:config.id}),{matterId:bill.matter_id})]);
 const params=new URLSearchParams({'adaptive_pricing[enabled]':'false',mode:'payment',success_url:env.AUTH_ORIGIN+paymentPath(billId),cancel_url:env.AUTH_ORIGIN+paymentPath(billId),client_reference_id:checkoutId,'metadata[satchel_checkout]':checkoutId,'payment_intent_data[metadata][satchel_checkout]':checkoutId,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(cents),'line_items[0][price_data][product_data][name]':'Invoice payment','line_items[0][quantity]':'1'});
 try{
  const session=await stripeApi(env,'/checkout/sessions',params,'satchel-'+checkoutId,purpose==='trust'?config.account_id:undefined);
  insist(session.livemode===(config.mode==='live')&&session.amount_total===cents&&session.currency==='usd'&&session.client_reference_id===checkoutId,'Stripe session does not match this invoice allocation',502);
  insist(Array.isArray(session.payment_method_types)&&session.payment_method_types.includes('card')&&session.payment_method_types.includes('us_bank_account'),'Enable hosted card and ACH in the Stripe payment configuration',409);
  await env.DB.batch([stmt(env.DB,"UPDATE s_stripe_checkouts SET session_id=?,status='open',updated_at=? WHERE id=? AND status='creating'",session.id,now(),checkoutId)]);
  return checkoutResult(env,{id:checkoutId,session_id:session.id,status:'open'},session);
 }catch(error){await stmt(env.DB,"UPDATE s_stripe_checkouts SET status='uncertain',updated_at=? WHERE id=? AND status='creating'",now(),checkoutId).run();throw error;}
}
async function checkoutResult(env:StripeEnv,attempt:Data,known?:Data){
 insist(attempt.session_id,'The provider acknowledgment is uncertain. The principal must reconcile before another collection',409);
 insist(attempt.status==='open','This attempt is already pending or completed; refresh the invoice',409);
 const config=!known?await stmt(env.DB,'SELECT * FROM s_stripe_config WHERE id=?',attempt.config_id).first<Data>():null;
 if(config?.kind==='trust')await verifyProtectedStripe(env,config);
 const session=known??await stripeApi(env,'/checkout/sessions/'+encodeURIComponent(attempt.session_id),undefined,undefined,config?.kind==='trust'?config.account_id:undefined);
 insist(session.status==='open','This hosted checkout is closed; refresh the invoice',409);
 const url=new URL(session.url);insist(url.protocol==='https:'&&url.hostname==='checkout.stripe.com','Invalid hosted checkout destination',502);
 return {id:attempt.id,url:url.href,status:attempt.status};
}
