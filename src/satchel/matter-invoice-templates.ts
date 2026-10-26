import {atomic,audit,human,id,insist,matter,need,now,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
export async function currentInvoiceTemplate(db:D1Database,matterId:string){
 return stmt(db,'SELECT a.*,t.version template_version FROM s_matter_invoice_templates a JOIN s_invoice_templates t ON t.id=a.template_id WHERE a.matter_id=? ORDER BY a.sequence DESC LIMIT 1',matterId).first<Data>();
}
export async function matterInvoiceTemplate(db:D1Database,actor:Actor,matterId:string,body?:Data){
 human(actor);need(actor,'owner','lawyer','billing');await matter(db,actor,matterId);
 if(body){
  need(actor,'owner','lawyer');const current=await currentInvoiceTemplate(db,matterId);
  insist((body.previousId??null)===(current?.id??null),'Template assignment changed; refresh before assigning',409);
  const templateId=text(body.templateId,'Invoice template revision',100),template=await stmt(db,'SELECT id FROM s_invoice_templates WHERE id=?',templateId).first<Data>();insist(template,'Approved template revision not found',404);
  const assignmentId=id(),at=now(),reason=text(body.reason,'Assignment reason',2000);
  await atomic(db,actor,[accessGuard(db,actor,matterId),guard(db,"COALESCE((SELECT id FROM s_matter_invoice_templates WHERE matter_id=? ORDER BY sequence DESC LIMIT 1),'')=?",matterId,current?.id??''),stmt(db,'INSERT INTO s_matter_invoice_templates(id,matter_id,template_id,previous_id,reason,assigned_by,assigned_at) VALUES(?,?,?,?,?,?,?)',assignmentId,matterId,templateId,current?.id??null,reason,actor.email,at),audit(db,actor,'invoice.template_assigned',assignmentId,JSON.stringify({matterId,templateId,reason}),{matterId})]);
 }
 return {assignment:await currentInvoiceTemplate(db,matterId)};
}
