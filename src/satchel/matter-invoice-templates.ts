import {atomic,audit,human,id,insist,matter,need,now,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
export async function currentInvoiceTemplate(db:D1Database,matterId:string){
 const direct=await stmt(db,'SELECT a.*,t.version template_version FROM s_matter_invoice_templates a JOIN s_invoice_templates t ON t.id=a.template_id WHERE a.matter_id=? ORDER BY a.sequence DESC LIMIT 1',matterId).first<Data>();
 if(direct)return {...direct,scope:'matter'};
 return stmt(db,`SELECT a.*,t.version template_version FROM s_invoice_template_defaults a JOIN s_invoice_templates t ON t.id=a.template_id WHERE (a.scope='client' AND a.target=(SELECT client FROM s_matters WHERE id=?)) OR a.scope='firm' ORDER BY CASE a.scope WHEN 'client' THEN 1 ELSE 0 END DESC,a.sequence DESC LIMIT 1`,matterId).first<Data>();
}
export async function matterInvoiceTemplate(db:D1Database,actor:Actor,matterId:string,body?:Data){
 human(actor);need(actor,'owner','lawyer','billing');await matter(db,actor,matterId);
 if(body){
  need(actor,'owner','lawyer','billing');const resolved=await currentInvoiceTemplate(db,matterId),current=resolved?.scope==='matter'?resolved:null;
  insist((body.previousId??null)===(current?.id??null),'Template assignment changed; refresh before assigning',409);
  const templateId=text(body.templateId,'Invoice template revision',100),template=await stmt(db,'SELECT id FROM s_invoice_templates WHERE id=? AND NOT EXISTS(SELECT 1 FROM s_invoice_template_retirements r WHERE r.template_id=s_invoice_templates.id)',templateId).first<Data>();insist(template,'Approved template revision not found',404);
  const assignmentId=id(),at=now(),reason=text(body.reason,'Assignment reason',2000);
  await atomic(db,actor,[accessGuard(db,actor,matterId),guard(db,'NOT EXISTS(SELECT 1 FROM s_invoice_template_retirements WHERE template_id=?)',templateId),guard(db,"COALESCE((SELECT id FROM s_matter_invoice_templates WHERE matter_id=? ORDER BY sequence DESC LIMIT 1),'')=?",matterId,current?.id??''),stmt(db,'INSERT INTO s_matter_invoice_templates(id,matter_id,template_id,previous_id,reason,assigned_by,assigned_at) VALUES(?,?,?,?,?,?,?)',assignmentId,matterId,templateId,current?.id??null,reason,actor.email,at),audit(db,actor,'invoice.template_assigned',assignmentId,JSON.stringify({matterId,templateId,reason}),{matterId})]);
 }
 return {assignment:await currentInvoiceTemplate(db,matterId),clientDefault:await stmt(db,"SELECT * FROM s_invoice_template_defaults WHERE scope='client' AND target=(SELECT client FROM s_matters WHERE id=?) ORDER BY sequence DESC LIMIT 1",matterId).first<Data>()};
}

export async function invoiceTemplateDefaults(db:D1Database,actor:Actor,body?:Data){
 human(actor);need(actor,'owner','lawyer','billing');
 if(body){
  insist(body.scope==='firm'||body.scope==='client','Choose a firm or client default');
  const m=body.scope==='client'?await matter(db,actor,text(body.matterId,'Client matter',100)):null,target=m?.client??'firm';
  const current=await stmt(db,'SELECT id FROM s_invoice_template_defaults WHERE scope=? AND target=? ORDER BY sequence DESC LIMIT 1',body.scope,target).first<Data>();
  insist((body.previousId??null)===(current?.id??null),'Template default changed; refresh before assigning',409);
  const templateId=text(body.templateId,'Template revision',100),reason=text(body.reason,'Default assignment reason',2000),assignmentId=id();
  insist(await stmt(db,'SELECT id FROM s_invoice_templates WHERE id=?',templateId).first(),'Approved template not found',404);
  await atomic(db,actor,[...(m?[accessGuard(db,actor,m.id)]:[]),guard(db,"COALESCE((SELECT id FROM s_invoice_template_defaults WHERE scope=? AND target=? ORDER BY sequence DESC LIMIT 1),'')=?",body.scope,target,current?.id??''),guard(db,'NOT EXISTS(SELECT 1 FROM s_invoice_template_retirements WHERE template_id=?)',templateId),stmt(db,'INSERT INTO s_invoice_template_defaults(id,scope,target,template_id,previous_id,reason,assigned_by,assigned_at) VALUES(?,?,?,?,?,?,?,?)',assignmentId,body.scope,target,templateId,current?.id??null,reason,actor.email,now()),audit(db,actor,'invoice.template_default',assignmentId,JSON.stringify({scope:body.scope,templateId,reason}),m?{matterId:m.id}:{})]);
 }
 const firm=await stmt(db,"SELECT a.*,t.version template_version FROM s_invoice_template_defaults a JOIN s_invoice_templates t ON t.id=a.template_id WHERE scope='firm' ORDER BY sequence DESC LIMIT 1").first<Data>();
 // Client defaults are returned only through a matter the reader may access.
 return {firm};
}
