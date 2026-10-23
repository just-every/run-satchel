import {atomic,audit,human,id,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
// OSS-001: Satchel software is free; every provider below bills the firm directly under its own terms.
// Satchel adds no software, license, seat, matter or resale charge to any of them. A provider is connected
// only after the principal records the provider's own terms page and confirms that direct billing.
export const disclosureVersion=1;
export const statement='Satchel is free, MIT-licensed software with no license fee, subscription, paywall, seat charge or matter limit. Providers bill the firm directly under their own terms, and Satchel adds no charge or markup to them.';
export const providers=[
 {id:'cloudflare',name:'Cloudflare',kind:'Hosting'},
 {id:'mail',name:'Mail provider (MAIL_PROVIDER)',kind:'Email'},
 {id:'sms',name:'SMS provider',kind:'Text messages'},
 {id:'lawpay',name:'LawPay',kind:'Payments'},
 {id:'stripe',name:'Stripe',kind:'Payments'},
 {id:'docusign',name:'DocuSign',kind:'E-signature'},
 {id:'inkwell',name:'Inkwell',kind:'E-signature'},
 {id:'quickbooks-online',name:'QuickBooks Online',kind:'Accounting'},
 {id:'xero',name:'Xero',kind:'Accounting'},
 {id:'court-rules',name:'Court-rule and filing providers',kind:'Court rules and filing'},
] as const;
export type ProviderId=typeof providers[number]['id'];
const known=(provider:string)=>{const p=providers.find(x=>x.id===provider);insist(p,'Unknown provider',404);return p;};
export async function providerState(db:D1Database,actor:Actor) {
 human(actor);need(actor,'owner');
 const reviews=await rows(db,'SELECT r.* FROM s_provider_reviews r WHERE r.reviewed_at=(SELECT MAX(x.reviewed_at) FROM s_provider_reviews x WHERE x.provider_id=r.provider_id)');
 return {statement,disclosureVersion,providers:providers.map(p=>{const r=reviews.find(x=>x.provider_id===p.id);return {...p,billing:'Billed to the firm directly by the provider under its own terms',satchelCharge:'none',review:r&&r.disclosure_version===disclosureVersion?{termsUrl:r.terms_url,reviewedBy:r.reviewed_by,reviewedAt:r.reviewed_at}:null};})};
}
export async function reviewProvider(db:D1Database,actor:Actor,providerId:string,body:Data) {
 human(actor);need(actor,'owner');const p=known(providerId);
 insist(body.confirmed===true,'Confirm that you inspected the provider’s own terms and that it bills the firm directly');
 let url:URL;try{url=new URL(text(body.termsUrl,'Provider terms page',500));}catch{insist(false,'Enter the provider’s own terms page as an https address');}
 insist(url.protocol==='https:'&&!url.username&&!url.password,'Enter the provider’s own terms page as an https address');
 const reviewId=id(),at=now();
 await atomic(db,actor,[stmt(db,'INSERT INTO s_provider_reviews(id,provider_id,terms_url,disclosure_version,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?)',reviewId,p.id,url.href,disclosureVersion,actor.email,at),audit(db,actor,'provider.reviewed',p.id,`Provider terms and direct firm billing reviewed; Satchel charge none: ${url.href}`)]);
 return {id:reviewId,providerId:p.id,termsUrl:url.href,reviewedAt:at};
}
// Every connector or sender checks this before it contacts a provider; a missing or outdated review refuses it.
export async function requireProviderReview(db:D1Database,providerId:ProviderId) {
 const p=known(providerId),r=await stmt(db,'SELECT 1 ok FROM s_provider_reviews WHERE provider_id=? AND disclosure_version=?',p.id,disclosureVersion).first();
 insist(r,`Review ${p.name} terms and its direct firm billing in Provider charges before connecting it`,409);
}
