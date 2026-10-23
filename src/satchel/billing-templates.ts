import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {firmSettings} from './firm';
import {invoiceFunds} from './trust-transfers';
const staff=(a:Actor)=>{human(a);need(a,'owner','billing');};
const fields=['detail','hours','rates','timekeepers','utbms','noCharge','discounts'] as const;
const parsed=(r:Data)=>({...r,settings:JSON.parse(r.settings)});
export async function templateState(db:D1Database,a:Actor,matterId:string){
 staff(a);const m=await matter(db,a,matterId);
 return {templates:(await rows(db,'SELECT t.*,r.at retired_at FROM s_invoice_templates t LEFT JOIN s_invoice_template_retirements r ON r.template_key=t.template_key ORDER BY t.at,t.version,t.id')).map(parsed),assignments:await rows(db,"SELECT * FROM s_invoice_template_assignments WHERE scope='firm' OR (scope='client' AND client=?) OR (scope='matter' AND matter_id=?) ORDER BY sequence",m.client,matterId),client:m.client};
}
export async function saveTemplate(db:D1Database,a:Actor,b:Data){
 staff(a);const f=await firmSettings(db);insist(f.settings,'Enter the firm name and US address in Firm first',422);
 const templateKey=b.templateKey?text(b.templateKey,'Template identity',100):id(),previous=await stmt(db,'SELECT * FROM s_invoice_templates WHERE template_key=? ORDER BY version DESC LIMIT 1',templateKey).first<Data>();
 insist((b.previousId??null)===(previous?.id??null),'Template changed; review its current version',409);insist(!await stmt(db,'SELECT 1 FROM s_invoice_template_retirements WHERE template_key=?',templateKey).first(),'Retired templates cannot be changed',409);
 const options=b.options;insist(options&&['summary','detailed'].includes(options.layout),'Choose summary or detailed layout');
 for(const key of fields)insist(typeof options[key]==='boolean','Choose whether to show '+key);
 insist(['hide','balance'].includes(options.trust)&&['hide','balance'].includes(options.prior),'Choose trust and prior-balance display');
 if(options.trust==='balance')insist(a.role==='owner'&&(!a.grants||a.grants.bank==='full'),'Only the principal may authorize trust-balance disclosure in an invoice template',403);
 insist(!options.paymentLink&&!options.qr,'Payment links and QR codes require an authorized payment-page door; none is enabled',422);
 let logo:Data|null=null;
 if(b.logo){const base64=text(b.logo.base64,'Invoice logo bytes',1_500_000),mime=b.logo.mime;insist(['image/png','image/jpeg'].includes(mime),'Choose a PNG or JPEG logo');let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch{insist(false,'Logo must contain valid base64 image bytes');}
  insist(bytes.length<=1_048_576&&bytes.length>8,'Invoice logo is limited to 1 MiB');insist(mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:bytes[0]===255&&bytes[1]===216&&bytes[2]===255,'Logo bytes do not match its image type');logo={mime,base64};
 }
 const name=text(b.name,'Template name',100),settings={firm:f.settings,logo,remittance:text(b.remittance,'Remittance block',1500),terms:text(b.terms,'Payment terms',1000),termsDays:integer(b.termsDays,'Payment terms days',0,365),options:Object.fromEntries(['layout',...fields,'trust','prior'].map(k=>[k,options[k]]))},templateId=id(),version=(previous?.version??0)+1;
 await atomic(db,a,[guard(db,'COALESCE((SELECT id FROM s_invoice_templates WHERE template_key=? ORDER BY version DESC LIMIT 1),\'\')=?',templateKey,previous?.id??''),guard(db,'NOT EXISTS(SELECT 1 FROM s_invoice_template_retirements WHERE template_key=?)',templateKey),guard(db,'EXISTS(SELECT 1 FROM s_firm WHERE revision=?)',f.revision),stmt(db,'INSERT INTO s_invoice_templates VALUES(?,?,?,?,?,?,?)',templateId,templateKey,version,name,JSON.stringify(settings),a.email,now()),audit(db,a,'billing.template_version_saved',templateId,name)]);
 return parsed((await stmt(db,'SELECT * FROM s_invoice_templates WHERE id=?',templateId).first<Data>())!);
}
export async function assignTemplate(db:D1Database,a:Actor,matterId:string,b:Data){
 staff(a);const m=await matter(db,a,matterId),scope=b.scope,templateKey=text(b.templateKey,'Template identity',100);insist(['firm','client','matter'].includes(scope),'Choose firm, client or matter assignment');if(scope!=='matter')need(a,'owner');
 const t=await stmt(db,'SELECT * FROM s_invoice_templates WHERE template_key=? ORDER BY version DESC LIMIT 1',templateKey).first<Data>();insist(t,'Template not found',404);insist(!await stmt(db,'SELECT 1 FROM s_invoice_template_retirements WHERE template_key=?',templateKey).first(),'Choose an active template',409);
 if(JSON.parse(t.settings).options.trust==='balance')need(a,'owner');
 await atomic(db,a,[accessGuard(db,a,matterId),guard(db,'NOT EXISTS(SELECT 1 FROM s_invoice_template_retirements WHERE template_key=?)',templateKey),stmt(db,'INSERT INTO s_invoice_template_assignments(scope,client,matter_id,template_key,actor,at) VALUES(?,?,?,?,?,?)',scope,scope==='client'?m.client:null,scope==='matter'?matterId:null,templateKey,a.email,now()),audit(db,a,'billing.template_assigned',templateKey,scope,{matterId})]);return templateState(db,a,matterId);
}
export async function retireTemplate(db:D1Database,a:Actor,templateKey:string,b:Data){
 staff(a);const reason=text(b.reason,'Retirement reason',1000);insist(await stmt(db,'SELECT 1 FROM s_invoice_templates WHERE template_key=?',templateKey).first(),'Template not found',404);
 await atomic(db,a,[stmt(db,'INSERT INTO s_invoice_template_retirements VALUES(?,?,?,?)',templateKey,reason,a.email,now()),audit(db,a,'billing.template_retired',templateKey,reason)]);return {templateKey,retired:true};
}
export async function billTemplate(db:D1Database,a:Actor,matterId:string,client:string){
 const sequence=(await stmt(db,'SELECT MAX(sequence) n FROM s_invoice_template_assignments').first<Data>())!.n;
 const assignment=await stmt(db,"SELECT * FROM s_invoice_template_assignments WHERE (scope='matter' AND matter_id=?) OR (scope='client' AND client=?) OR scope='firm' ORDER BY CASE scope WHEN 'matter' THEN 3 WHEN 'client' THEN 2 ELSE 1 END DESC,sequence DESC LIMIT 1",matterId,client).first<Data>();if(!assignment)return {snapshot:null,guards:[guard(db,'COALESCE((SELECT MAX(sequence) FROM s_invoice_template_assignments),0)=?',sequence??0)]};
 insist(!await stmt(db,'SELECT 1 FROM s_invoice_template_retirements WHERE template_key=?',assignment.template_key).first(),'Assigned invoice template is retired; choose an active replacement before preparing a bill',422);
 const r=(await stmt(db,'SELECT * FROM s_invoice_templates WHERE template_key=? ORDER BY version DESC LIMIT 1',assignment.template_key).first<Data>())!,t=parsed(r),at=now();
 if(t.settings.options.trust==='balance')insist(a.role==='owner'&&(!a.grants||a.grants.bank==='full'),'Principal review is required to prepare a bill disclosing trust balances',403);
 const moneyRevision=(await stmt(db,'SELECT revision FROM s_billing_money_revision WHERE id=1').first<Data>())!.revision;
 const prior=await rows(db,"SELECT b.id FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id WHERE b.matter_id=? AND b.corrects_bill_id IS NULL AND b.status IN('approved','exported')",matterId);let priorBalance=0;
 if(t.settings.options.prior==='balance')for(const p of prior)priorBalance+=(await invoiceFunds(db,p.id)).due_cents;
 const trust=t.settings.options.trust==='balance'?await stmt(db,"SELECT COALESCE(SUM(e.cents),0) cents FROM s_trust_entries e JOIN s_trust_ledgers l ON l.id=e.ledger_id WHERE l.matter_id=?",matterId).first<Data>():null;
 return {snapshot:{id:r.id,templateKey:r.template_key,version:r.version,name:r.name,settings:t.settings,assignmentScope:assignment.scope,reviewedBalancesAt:at,priorBalanceCents:priorBalance,trustBalanceCents:trust?.cents??null},guards:[guard(db,'(SELECT id FROM s_invoice_templates WHERE template_key=? ORDER BY version DESC LIMIT 1)=?',r.template_key,r.id),guard(db,'NOT EXISTS(SELECT 1 FROM s_invoice_template_retirements WHERE template_key=?)',r.template_key),guard(db,'(SELECT MAX(sequence) FROM s_invoice_template_assignments)=?',sequence),guard(db,'(SELECT revision FROM s_billing_money_revision WHERE id=1)=?',moneyRevision)]};
}
