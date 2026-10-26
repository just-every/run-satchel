import {atomic,audit,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {getBill} from './billing';
import {accessGuard,guard} from './trust-guards';
import {baseCents,codeLine,currentGuideline} from './ledes-guidelines';
import {snapshotXml,xmlText} from './ledes-xml-profile';

export async function reviewPrebill(db:D1Database,actor:Actor,billId:string,body:Data){
 human(actor);need(actor,'owner','lawyer');
 const bill=await getBill(db,actor,billId);insist(bill.status==='draft'&&bill.snapshot.prebill,'Only a current draft prebill can be returned or revised',409);
 insist(body.revision===bill.revision,'Bill changed; review the exact current revision',409);
 insist(body.action==='return'||body.action==='revise','Choose return or revise');
 const note=text(body.note,'Review note',2000),before=JSON.stringify(bill.snapshot),snapshot:Data=structuredClone(bill.snapshot),excluded:string[]=[],revision=id(),reviewId=id(),at=now();
 if(body.action==='return')insist(!body.lines||body.lines.length===0,'Return the prebill with a note; revise lines separately');
 else{
  insist(body.lines===undefined||Array.isArray(body.lines),'Give reviewed line changes');
  const changes:Data[]=body.lines??[];insist(changes.length<=100&&new Set(changes.map(l=>l.sourceId)).size===changes.length,'Review each source only once');
  for(const change of changes){
   const line=snapshot.lines.find((l:Data)=>l.sourceId===change.sourceId);insist(line,'Review a current prebill source');
   insist(Object.keys(change).every(k=>['sourceId','description','amountCents','exclude'].includes(k)),'Only narratives, exclusions and write-downs may change');
   if(change.exclude!==undefined)insist(typeof change.exclude==='boolean','Choose whether to exclude this source');
   if(change.exclude){insist(!snapshot.feePlan,'Fee-plan exclusions require a new preparation under reviewed fee terms',422);excluded.push(line.sourceId);continue;}
   if(change.description!==undefined)line.description=text(change.description,'Reviewed narrative',2000);
   if(change.amountCents!==undefined){
    const amount=integer(change.amountCents,'Reviewed amount in USD cents',0,line.amountCents);
    insist(!snapshot.feePlan||amount===line.amountCents,'Fee-plan write-downs require the reviewed fee correction door',422);
    line.amountCents=amount;
   }
  }
  snapshot.lines=snapshot.lines.filter((l:Data)=>!excluded.includes(l.sourceId));insist(snapshot.lines.length,'A prebill must retain at least one source; void an entirely excluded bill');
  snapshot.totalCents=snapshot.lines.reduce((n:number,l:Data)=>n+l.amountCents,0);insist(Number.isSafeInteger(snapshot.totalCents),'Bill total exceeds exact integer range');
  if(snapshot.ledes){
   const guideline=await currentGuideline(db,snapshot.client);insist(guideline,'Current client billing guideline is required',409);
   const oldLines=snapshot.ledes.lines,entries=await rows(db,'SELECT * FROM s_entries WHERE id IN(SELECT json_extract(value,\'$.sourceId\') FROM json_each(?))',JSON.stringify(snapshot.lines));
   const coded=await Promise.all(snapshot.lines.map(async(l:Data,index:number)=>{
    const old=oldLines.find((c:Data)=>c.sourceId===l.sourceId),e=entries.find(e=>e.id===l.sourceId);
    insist(e&&old,'Source coding must still be available',409);
    const c=await codeLine(db,guideline,{...e,rate_cents:l.rateCents}, {utbmsTask:old.task,utbmsActivity:old.activity,utbmsExpense:old.expense},index+1,l.amountCents,l.description);
    insist(!c.problems.length,'Reviewed narrative or write-down violates client guidelines: '+c.problems.join('; '),422);
    return {...c.line,units4:old.units4,unitCostCents:old.unitCostCents,adjustmentCents:l.amountCents-baseCents(old.units4,old.unitCostCents)};
   }));
   snapshot.ledes={...snapshot.ledes,guidelineId:guideline.id,guidelineVersion:guideline.version,lines:coded};
   if(guideline.xmlProfile)xmlText(snapshot.title,'XML bill title',2048);
   snapshot.ledes.xml=await snapshotXml(db,guideline.xmlProfile,snapshot.client,bill.matterId,snapshot.matterNumber,snapshot.matterTitle,snapshot.ledes.invoiceNumber||'DRAFT',coded);
  }
 }
 snapshot.prebill={...snapshot.prebill,reviewState:body.action==='return'?'returned':'ready',reviewNote:note};
 const after=JSON.stringify(snapshot);
 await atomic(db,actor,[accessGuard(db,actor,bill.matterId),guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status='draft' AND artifact IS NULL)",bill.id,bill.revision),guard(db,'NOT EXISTS(SELECT 1 FROM s_invoice_issues WHERE bill_id=?)',bill.id),
  guard(db,`NOT EXISTS(SELECT 1 FROM json_each(?) l WHERE NOT EXISTS(SELECT 1 FROM s_billing_sources s JOIN s_entries e ON e.id=s.entry_id WHERE s.bill_id=? AND s.entry_id=json_extract(l.value,'$.sourceId') AND s.source_revision=json_extract(l.value,'$.sourceRevision') AND e.revision=s.source_revision))`,JSON.stringify(bill.snapshot.lines.filter((l:Data)=>l.kind!=='fee')),bill.id),
  stmt(db,'INSERT INTO s_prebill_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?)',reviewId,bill.id,bill.revision,revision,body.action,note,before,after,JSON.stringify(excluded),actor.email,at),
  stmt(db,'DELETE FROM s_billing_sources WHERE bill_id=? AND entry_id IN(SELECT value FROM json_each(?))',bill.id,JSON.stringify(excluded)),
  stmt(db,"UPDATE s_bills SET snapshot=?,revision=? WHERE id=? AND revision=? AND status='draft'",after,revision,bill.id,bill.revision),
  audit(db,actor,'prebill.'+(body.action==='return'?'returned':'revised'),bill.id,JSON.stringify({note,beforeRevision:bill.revision,revision,excluded}),{matterId:bill.matterId}),
 ]);
 return getBill(db,actor,bill.id);
}
