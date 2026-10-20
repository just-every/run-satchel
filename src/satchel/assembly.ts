import {atomic,audit,digest,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {matterGuard,documentFile} from './documents';
import {guard} from './trust-guards';
import {typeVersion} from './matter-types';
import {questionnaire,render,templateDefinition,type Template} from './assembly-template';
import {docx,pdf} from './assembly-formats';
async function outputs(title:string,paragraphs:string[]){
 try{return [{format:'docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes:docx(title,paragraphs)},{format:'pdf',mime:'application/pdf',bytes:await pdf(title,paragraphs)}];}
 catch(error){insist(false,(error as Error).message);}
}
const templateJson=(v:Data)=>({id:v.id,version:v.version,name:v.name,definition:JSON.parse(v.definition),createdBy:v.created_by,createdAt:v.created_at});
export async function assemblyTemplates(db:D1Database){
 const versions=await rows(db,'SELECT * FROM s_assembly_templates ORDER BY name,id,version');
 return {templates:[...new Set(versions.map(v=>v.id))].map(id=>{const own=versions.filter(v=>v.id===id);return {...templateJson(own.at(-1)!),versions:own.map(templateJson)};})};
}
export async function saveAssemblyTemplate(db:D1Database,actor:Actor,body:Data){
 human(actor);const templateId=body.id?text(body.id,'Template',100):id();
 const latest=await stmt(db,'SELECT * FROM s_assembly_templates WHERE id=? ORDER BY version DESC LIMIT 1',templateId).first<Data>();
 insist(!body.id||latest,'Template not found',404);if(latest)insist(body.expectedVersion===latest.version,'The template changed. Refresh before saving.',409);
 const name=text(body.name,'Template name',160),definition=templateDefinition(body.definition),version=(latest?.version??0)+1,at=now();
 await atomic(db,actor,[guard(db,'COALESCE((SELECT MAX(version) FROM s_assembly_templates WHERE id=?),0)=?',templateId,version-1),stmt(db,'INSERT INTO s_assembly_templates(id,version,name,definition,created_by,created_at) VALUES(?,?,?,?,?,?)',templateId,version,name,JSON.stringify(definition),actor.email,at),audit(db,actor,'assembly.template_versioned',templateId,JSON.stringify({name,version,jurisdiction:definition.jurisdiction,formVersion:definition.formVersion}))]);
 return (await assemblyTemplates(db)).templates.find(t=>t.id===templateId)!;
}
async function revision(db:D1Database,actor:Actor,revisionId:string){
 const r=await stmt(db,'SELECT r.*,a.matter_id,a.title FROM s_assembly_revisions r JOIN s_assemblies a ON a.id=r.assembly_id WHERE r.id=?',revisionId).first<Data>();insist(r,'Assembly revision not found',404);await matter(db,actor,r.matter_id);return r;
}
async function revisionJson(db:D1Database,r:Data){
 const t=await stmt(db,'SELECT * FROM s_assembly_templates WHERE id=? AND version=?',r.template_id,r.template_version).first<Data>();
 const answers=JSON.parse(r.answers),snapshot=JSON.parse(r.snapshot),rendered=render(JSON.parse(t!.definition),answers,snapshot);
 const a=await stmt(db,'SELECT * FROM s_assembly_approvals WHERE revision_id=?',r.id).first<Data>();
 return {id:r.id,number:r.number,templateId:r.template_id,templateVersion:r.template_version,templateName:t!.name,definition:JSON.parse(t!.definition),answers,snapshot,...rendered,sha256:r.sha256,createdBy:r.created_by,createdAt:r.created_at,approved:a?{by:a.approved_by,at:a.approved_at,docxId:a.docx_id,pdfId:a.pdf_id}:null};
}
export async function assemblyState(db:D1Database,actor:Actor,matterId:string){
 await matter(db,actor,matterId);const assemblies=await rows(db,'SELECT * FROM s_assemblies WHERE matter_id=? ORDER BY created_at,id',matterId);
 return {assemblies:await Promise.all(assemblies.map(async a=>({id:a.id,title:a.title,revisions:await Promise.all((await rows(db,'SELECT * FROM s_assembly_revisions WHERE assembly_id=? ORDER BY number',a.id)).map(r=>revisionJson(db,r)))})))};
}
export async function prepareAssembly(db:D1Database,actor:Actor,matterId:string,body:Data){
 human(actor);const m=await matter(db,actor,matterId),templateId=text(body.templateId,'Template',100),version=integer(body.templateVersion,'Template version',1);
 const t=await stmt(db,'SELECT * FROM s_assembly_templates WHERE id=? AND version=?',templateId,version).first<Data>();insist(t,'Template version not found',404);
 const template:Template=JSON.parse(t.definition),answers=questionnaire(template,body.answers);
 const existing=body.assemblyId?await stmt(db,'SELECT * FROM s_assemblies WHERE id=? AND matter_id=?',text(body.assemblyId,'Assembly',100),matterId).first<Data>():null;
 insist(!body.assemblyId||existing,'Assembly not found',404);
 const previous=existing?await stmt(db,'SELECT * FROM s_assembly_revisions WHERE assembly_id=? ORDER BY number DESC LIMIT 1',existing.id).first<Data>():null;
 if(previous)insist(body.expectedRevision===previous.number,'The questionnaire changed. Refresh before saving.',409);
 const [profile,parties,partyState]=await Promise.all([stmt(db,'SELECT * FROM s_matter_fields WHERE matter_id=?',matterId).first<Data>(),rows(db,'SELECT p.id,p.name,mp.relation FROM s_matter_parties mp JOIN s_parties p ON p.id=mp.party_id WHERE mp.matter_id=? ORDER BY mp.relation,p.name,p.id',matterId),stmt(db,'SELECT party_revision FROM s_meta WHERE id=1').first<Data>()]);
 const pinned=profile?.type_id?await typeVersion(db,profile.type_id,profile.type_version):null,custom=JSON.parse(profile?.custom??'{}'),fields:Data={'matter.title':m.title,'matter.number':m.matter_number,'matter.client':m.client,'matter.caseNumber':profile?.case_number,'matter.court':profile?.court,'matter.feeArrangement':profile?.fee_arrangement,'matter.feeTerms':profile?.fee_terms,'matter.insuranceLimit':profile?.insurance_limit_cents==null?null:(profile.insurance_limit_cents/100).toFixed(2)};
 for(const f of pinned?.definition.fields??[])fields['custom.'+f.key]=f.type==='money'&&custom[f.key]!==undefined?(custom[f.key]/100).toFixed(2):custom[f.key];
 const artifacts=await outputs(t.name,render(template,answers,{fields,parties}).paragraphs);
 const hashes=Object.fromEntries(await Promise.all(artifacts.map(async f=>[f.format,await digest(f.bytes)])));
 const snapshot={title:t.name,fields,parties,hashes,typeId:profile?.type_id??null,typeVersion:profile?.type_version??null,profileRevision:profile?.revision??null},rendered=render(template,answers,snapshot);
 const assemblyId=existing?.id??id(),revisionId=id(),number=(previous?.number??0)+1,at=now(),sha256=await digest(JSON.stringify({templateId,version,answers,snapshot,rendered}));
 await atomic(db,actor,[...matterGuard(db,actor,matterId),guard(db,'(SELECT party_revision FROM s_meta WHERE id=1)=?',partyState!.party_revision),guard(db,'COALESCE((SELECT revision FROM s_matter_fields WHERE matter_id=?),\'\')=?',matterId,profile?.revision??''),guard(db,'COALESCE((SELECT MAX(number) FROM s_assembly_revisions WHERE assembly_id=?),0)=?',assemblyId,number-1),...(existing?[]:[stmt(db,'INSERT INTO s_assemblies(id,matter_id,title,created_by,created_at) VALUES(?,?,?,?,?)',assemblyId,matterId,t.name,actor.email,at)]),stmt(db,'INSERT INTO s_assembly_revisions(id,assembly_id,number,template_id,template_version,answers,snapshot,sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',revisionId,assemblyId,number,templateId,version,JSON.stringify(answers),JSON.stringify(snapshot),sha256,actor.email,at),audit(db,actor,'assembly.questionnaire_recorded',revisionId,JSON.stringify({matterId,assemblyId,number,templateId,version,sha256,unresolved:rendered.unresolved}),{matterId})]);
 return revisionJson(db,(await revision(db,actor,revisionId)));
}
export async function approveAssembly(db:D1Database,actor:Actor,revisionId:string,body:Data){
 human(actor);need(actor,'owner','lawyer');const r=await revision(db,actor,revisionId),v=await revisionJson(db,r);
 insist(body.sha256===v.sha256,'Review the exact questionnaire revision before approval',409);
 insist(!v.unresolved.length,'Resolve required fields before delivery: '+v.unresolved.join(', '),409);insist(!v.approved,'This revision is already approved',409);
 insist(await digest(JSON.stringify({templateId:r.template_id,version:r.template_version,answers:v.answers,snapshot:v.snapshot,rendered:{paragraphs:v.paragraphs,unresolved:v.unresolved}}))===v.sha256,'Assembly failed its integrity check',503);
 const title=v.snapshot.title,artifacts=await outputs(title,v.paragraphs),at=now(),writes=[...matterGuard(db,actor,r.matter_id),guard(db,'(SELECT MAX(number) FROM s_assembly_revisions WHERE assembly_id=?)=?',r.assembly_id,r.number)];
 const ids:string[]=[];
 for(const output of artifacts){
  insist(await digest(output.bytes)===v.snapshot.hashes[output.format],'Generated file differs from the reviewed preview',503);const documentId=id(),name=title.replace(/[\x00-\x1f/\\]/g,'_').slice(0,160)+`-revision-${r.number}.${output.format}`,sha256=await digest(output.bytes);insist(output.bytes.length<=1048576,'Generated file exceeds the original-file limit');let raw='';for(const b of output.bytes)raw+=String.fromCharCode(b);ids.push(documentId);
  writes.push(stmt(db,'INSERT INTO s_documents(id,matter_id,title,visibility,created_by,created_at,current_version,revision,updated_by,updated_channel,updated_at) VALUES(?,?,?,?,?,?,1,?,?,?,?)',documentId,r.matter_id,name,'matter',actor.email,at,id(),actor.email,actor.channel,at),stmt(db,'INSERT INTO s_document_versions(document_id,version,name,mime,declared_mime,size,sha256,content_base64,created_by,created_channel,created_at) VALUES(?,1,?,?,?,?,?,?,?,?,?)',documentId,name,output.mime,output.mime,output.bytes.length,sha256,btoa(raw),actor.email,actor.channel,at));
 }
 writes.push(stmt(db,'INSERT INTO s_assembly_approvals(revision_id,docx_id,pdf_id,approved_by,approved_at) VALUES(?,?,?,?,?)',revisionId,...ids,actor.email,at),audit(db,actor,'assembly.approved',revisionId,JSON.stringify({matterId:r.matter_id,sha256:r.sha256,docxId:ids[0],pdfId:ids[1]}),{matterId:r.matter_id}));
 await atomic(db,actor,writes);return revisionJson(db,r);
}
export async function assemblyFile(db:D1Database,actor:Actor,revisionId:string,format:string){
 const r=await revision(db,actor,revisionId);insist(format==='docx'||format==='pdf','Choose DOCX or PDF');const a=await stmt(db,'SELECT * FROM s_assembly_approvals WHERE revision_id=?',r.id).first<Data>();insist(a,'Approve the resolved exact revision before delivery',409);
 return documentFile(db,actor,format==='docx'?a.docx_id:a.pdf_id,1);
}

export async function assemblyPreview(db:D1Database,actor:Actor,revisionId:string,format:string){
 const r=await revision(db,actor,revisionId),v=await revisionJson(db,r);insist(format==='docx'||format==='pdf','Choose DOCX or PDF');
 if(v.approved)return documentFile(db,actor,format==='docx'?v.approved.docxId:v.approved.pdfId,1);
 const file=(await outputs(v.snapshot.title,v.paragraphs)).find(f=>f.format===format)!;
 insist(await digest(file.bytes)===v.snapshot.hashes[format],'Generated preview failed its integrity check',503);
 await atomic(db,actor,[...matterGuard(db,actor,r.matter_id),audit(db,actor,'assembly.previewed',revisionId,JSON.stringify({matterId:r.matter_id,format,sha256:v.snapshot.hashes[format]}),{matterId:r.matter_id})]);
 return new Response(file.bytes as Uint8Array<ArrayBuffer>,{headers:{'content-type':file.mime,'content-disposition':`attachment; filename="review-revision-${r.number}.${format}"`,'cache-control':'no-store','x-content-type-options':'nosniff','x-satchel-review-sha256':v.snapshot.hashes[format],'content-security-policy':"sandbox; default-src 'none'",'referrer-policy':'no-referrer'}});
}
