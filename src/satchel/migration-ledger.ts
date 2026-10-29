import {sourceMoneyEffect} from './imports/financial';
import {date,insist,rows,stmt,type Data} from './model';

const live=(s:Data)=>['imported','preserved'].includes(s.disposition);
const day=(value:string)=>value.slice(0,10);
const sum=(items:Data[],key:string)=>items.reduce((n,r)=>n+Number(r[key]??0),0);
const empty=()=>({billedCents:0,paidCents:0,creditedCents:0,voidedCents:0,unbilledCents:0,unappliedCreditCents:0,trustHeldCents:0,pendingCents:0,disputedCents:0,interestCents:0,lateFeeCents:0,dueCents:0,overdueCents:0});
const fields=Object.keys(empty());
const csv=(values:unknown[][])=>values.map(row=>row.map(v=>{let s=String(v??'');if(typeof v==='string'&&/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n')+'\r\n';

// Read only. Incumbent facts remain evidence; they never become a new collection,
// bank deposit, consent, permission or trust movement. Caller checks the active
// principal and whole-firm walls before selecting the source account.
export async function migrationLedger(db:D1Database,job:Data,asOf:unknown){
 const selected=date(asOf),header=JSON.parse(job.package_json),sources=(await rows(db,'SELECT * FROM s_move_sources WHERE account=?',job.account)).filter(live);
 const matterSources=sources.filter(s=>s.kind==='matters'),matterIds=matterSources.map(s=>s.target_id),ids=JSON.stringify(matterIds);
 const matters=await rows(db,'SELECT m.*,p.lawyer_email FROM s_matters m LEFT JOIN s_matter_stage_profiles p ON p.matter_id=m.id WHERE m.id IN(SELECT value FROM json_each(?))',ids);
 const invoices=await rows(db,`SELECT b.*,COALESCE(t.snapshot,b.snapshot) retained_snapshot,i.number,i.issued_at,
  (SELECT MIN(due_date) FROM s_invoice_deliveries d WHERE d.bill_id=b.id AND substr(d.created_at,1,10)<=?) delivered_due
  FROM s_bills b LEFT JOIN s_bill_tax_approvals t ON t.bill_id=b.id LEFT JOIN s_invoice_issues i ON i.bill_id=b.id
  WHERE b.matter_id IN(SELECT value FROM json_each(?))`,selected,ids);
 const invoiceById=new Map(invoices.map(b=>[b.id,b])),sourceByTarget=new Map(sources.map(s=>[s.target_id,s]));
 const transactions:Data[]=[],gaps:string[]=[];
 if(job.state!=='completed')gaps.push('Package apply is not complete');
 for(const [kind,count] of Object.entries(header.counts??{}))if(sources.filter(s=>s.kind===kind).length!==count)gaps.push(kind+': source count does not reconcile');
 const add=(r:Data)=>{if(r.date<=selected)transactions.push({...r,cents:Number(r.cents)});};
 const sourceFacts=await rows(db,"SELECT f.*,s.source_id,s.source_json FROM s_move_financial_activity f JOIN s_move_sources s ON s.target_id=f.id AND s.kind='financial' WHERE s.account=? AND s.disposition IN('imported','preserved') ORDER BY f.date,f.id",job.account);
 const sourceInvoiceFacts=sourceFacts.filter(f=>f.ledger==='ar');
 for(const b of invoices){
  const s=JSON.parse(b.retained_snapshot),source=sourceByTarget.get(b.id),original=source?JSON.parse(source.source_json):null;
  const effective=original?.date??day(b.issued_at??(!s.numberingCutover?b.approved_at:null)??'9999-12-31');
  if(effective>selected)continue;
  const cents=Number(s.totalCents),dueDate=original?.due_date||b.delivered_due||null;
  b.statement={date:effective,dueDate,payer:s.client,number:b.number??b.id,totalCents:cents};
  add({id:'invoice:'+b.id,date:effective,kind:cents<0?'invoice_credit':'invoice',billId:b.id,matterId:b.matter_id,cents:Math.abs(cents),billedCents:Math.max(0,cents),creditedCents:Math.max(0,-cents),dueCents:cents,source:{table:'s_bills',id:b.id,number:b.number??null,originalPdf:'/api/satchel/bills/'+encodeURIComponent(b.id)+'/invoice.pdf'}});
  if(original){
   const facts=sourceInvoiceFacts.filter(f=>f.invoice_id===b.id);
   if(!facts.length){
    const paid=Number((await stmt(db,'SELECT paid_cents FROM s_move_invoice_balances WHERE bill_id=?',b.id).first<Data>())?.paid_cents??0);
    gaps.push('Invoice '+original.id+': historical payment and credit breakdown unavailable');
    if(paid)add({id:'source-balance:'+b.id,date:day(header.extractedAt),kind:'unclassified_source_adjustment',billId:b.id,matterId:b.matter_id,cents:paid,dueCents:-paid,source:{table:'s_move_invoice_balances',id:b.id}});
   }
  }
  if(b.voided_at&&day(b.voided_at)<=selected){
   const lineIds=new Set((s.lines??[]).map((l:Data)=>l.sourceId));
   const replacements=invoices.filter(n=>n.id!==b.id&&!n.corrects_bill_id&&n.created_at>=b.voided_at&&JSON.parse(n.retained_snapshot).lines?.some((l:Data)=>lineIds.has(l.sourceId))).map(n=>({id:n.id,number:n.number??null}));
   add({id:'void:'+b.id,date:day(b.voided_at),kind:'invoice_void',billId:b.id,matterId:b.matter_id,cents:Math.abs(cents),voidedCents:cents,dueCents:-cents,reason:b.void_reason,replacements,source:{table:'s_invoice_voids',id:b.id}});
  }
 }
 for(const f of sourceFacts){
  if(f.date>selected)continue;
  const b=f.invoice_id?invoiceById.get(f.invoice_id):null,trust=f.ledger==='trust';
  const effect=trust?{trustHeldCents:['opening','deposit'].includes(f.kind)?f.amount_cents:-f.amount_cents}:f.kind==='invoice'?{}:sourceMoneyEffect(f.kind,Number(f.amount_cents));
  const original=await stmt(db,'SELECT v.version,v.sha256 FROM s_documents d JOIN s_document_versions v ON v.document_id=d.id AND v.version=1 WHERE d.id=? AND d.erased_at IS NULL AND v.content_base64 IS NOT NULL',f.document_id).first<Data>();
  if(!original)gaps.push('Financial '+f.source_id+': retained source statement original unavailable');
  add({id:f.id,date:f.date,kind:'source_'+f.kind,ledger:f.ledger,billId:b?.id??null,matterId:f.matter_id,cents:f.amount_cents,...effect,source:{table:'s_move_financial_activity',id:f.id,sourceId:f.source_id,relatedSourceId:JSON.parse(f.source_json).related_id??null,reference:f.source_reference,documentId:f.document_id,version:original?.version??null,sha256:original?.sha256??null}});
 }
 const inScope='IN(SELECT value FROM json_each(?))';
 const receipts=await rows(db,`SELECT * FROM s_offline_receipts WHERE payer IN(SELECT client FROM s_matters WHERE id ${inScope})`,ids);
 for(const r of receipts){
  // A receipt belongs to a payer, rather than silently to its first invoice.
  add({id:r.id,date:r.received_date,kind:'offline_receipt',payer:r.payer,cents:r.cents,unappliedCreditCents:r.cents,reference:r.reference,source:{table:'s_offline_receipts',id:r.id}});
  const actions=await rows(db,'SELECT * FROM s_offline_actions WHERE receipt_id=? ORDER BY at,id',r.id);
  const allocations=await rows(db,'SELECT a.*,x.at FROM s_offline_allocations a JOIN s_offline_actions x ON x.id=a.action_id WHERE a.receipt_id=?',r.id);
  for(const a of allocations){
   const b=invoiceById.get(a.bill_id);if(!b)gaps.push('Receipt '+r.id+': allocations extend beyond this migration account');
   add({id:a.id,date:day(a.at),kind:b?'offline_allocation':'outside_scope_allocation',...(b?{billId:b.id,matterId:b.matter_id,paidCents:a.cents,dueCents:-a.cents}:{}),payer:r.payer,cents:a.cents,unappliedCreditCents:-a.cents,source:{table:'s_offline_allocations',id:a.id,receiptId:r.id,actionId:a.action_id}});
   const release=await stmt(db,'SELECT a.* FROM s_offline_releases r JOIN s_offline_actions a ON a.id=r.action_id WHERE r.allocation_id=?',a.id).first<Data>();
   if(release)add({id:'release:'+a.id,date:day(release.at),kind:'offline_'+release.kind,...(b?{billId:b.id,matterId:b.matter_id,paidCents:-a.cents,dueCents:a.cents}:{}),payer:r.payer,cents:a.cents,unappliedCreditCents:a.cents,reason:release.reason,source:{table:'s_offline_releases',id:a.id,receiptId:r.id,actionId:release.id}});
  }
  const bounce=actions.find(a=>a.kind==='bounce');if(bounce)add({id:bounce.id,date:day(bounce.at),kind:'returned_receipt',payer:r.payer,cents:r.cents,unappliedCreditCents:-r.cents,reason:bounce.reason,source:{table:'s_offline_actions',id:bounce.id,receiptId:r.id}});
 }
 for(const w of await rows(db,`SELECT * FROM s_invoice_writeoffs WHERE bill_id IN(SELECT id FROM s_bills WHERE matter_id ${inScope})`,ids)){
  const b=invoiceById.get(w.bill_id)!;add({id:w.id,date:day(w.at),kind:'writeoff',billId:b.id,matterId:b.matter_id,cents:w.cents,creditedCents:w.cents,dueCents:-w.cents,reason:w.reason,source:{table:'s_invoice_writeoffs',id:w.id}});
 }
 const pairedTrust=new Set<string>();
 for(const p of await rows(db,`SELECT p.* FROM s_operating_payments p JOIN s_bills b ON b.id=p.bill_id WHERE b.matter_id ${inScope}`,ids)){
  const b=invoiceById.get(p.bill_id)!;pairedTrust.add(p.trust_entry_id);
  add({id:p.id,date:p.bank_date,kind:'trust_application',billId:b.id,matterId:b.matter_id,cents:p.cents,paidCents:p.cents,dueCents:-p.cents,trustHeldCents:-p.cents,source:{table:'s_operating_payments',id:p.id,transferId:p.transfer_id,trustEntryId:p.trust_entry_id,operatingEntryId:p.operating_entry_id}});
  for(const r of await rows(db,'SELECT * FROM s_operating_payment_reversals WHERE payment_id=?',p.id)){
   pairedTrust.add(r.trust_entry_id);add({id:r.id,date:r.bank_date,kind:'trust_application_reversal',billId:b.id,matterId:b.matter_id,cents:r.cents,paidCents:-r.cents,dueCents:r.cents,trustHeldCents:r.cents,source:{table:'s_operating_payment_reversals',id:r.id,paymentId:p.id,trustEntryId:r.trust_entry_id,operatingEntryId:r.operating_entry_id}});
  }
 }
 for(const e of await rows(db,`SELECT e.*,l.matter_id FROM s_trust_entries e JOIN s_trust_ledgers l ON l.id=e.ledger_id WHERE l.matter_id ${inScope}`,ids)){
  if(pairedTrust.has(e.id))continue;
  const imported=sources.find(s=>s.kind==='trust'&&JSON.parse(s.source_json).matter_id===matterSources.find(m=>m.target_id===e.matter_id)?.source_id);
  if(imported&&e.source_id===imported.target_id+':opening'&&sourceFacts.some(f=>f.ledger==='trust'&&f.matter_id===e.matter_id))continue;
  add({id:e.id,date:e.effective_date,kind:'trust_'+e.kind,matterId:e.matter_id,cents:Math.abs(e.cents),trustHeldCents:e.cents,source:{table:'s_trust_entries',id:e.id,ledgerId:e.ledger_id,sourceId:e.source_id}});
 }
 for(const c of await rows(db,`SELECT c.* FROM s_stripe_checkouts c JOIN s_bills b ON b.id=c.bill_id WHERE b.matter_id ${inScope}`,ids)){
  const b=invoiceById.get(c.bill_id)!,events=await rows(db,'SELECT rowid sequence,* FROM s_stripe_events WHERE checkout_id=? AND substr(at,1,10)<=? ORDER BY at,rowid',c.id,selected),paid=events.find(e=>['paid','returned'].includes(e.status)),latest=events.at(-1);
  if(c.purpose==='operating'&&paid){
   add({id:'processor:'+c.id,date:day(paid.at),kind:'processor_payment',billId:b.id,matterId:b.matter_id,cents:c.cents,paidCents:c.cents,dueCents:-c.cents,source:{table:'s_stripe_events',id:paid.id,checkoutId:c.id}});
   for(const a of await rows(db,'SELECT * FROM s_stripe_adjustments WHERE checkout_id=?',c.id))add({id:a.id,date:day(a.at),kind:'processor_'+a.kind,billId:b.id,matterId:b.matter_id,cents:a.cents,paidCents:-a.cents,dueCents:a.cents,...(a.kind==='dispute'?{disputedCents:a.cents}:{}),source:{table:'s_stripe_adjustments',id:a.id,checkoutId:c.id,providerReference:a.provider_ref}});
  }
  const status=latest?.status??(day(c.created_at)<=selected?'unobserved':null);
  if(status&&['unobserved','creating','open','pending','uncertain'].includes(status))add({id:'pending:'+c.id,date:day(latest?.at??c.created_at),kind:c.purpose==='trust'?'pending_trust_collection':'pending_operating_collection',billId:b.id,matterId:b.matter_id,cents:c.cents,pendingCents:c.cents,source:{table:'s_stripe_checkouts',id:c.id,eventId:latest?.id??null}});
 }
 for(const e of await rows(db,`SELECT * FROM s_entries WHERE matter_id ${inScope}`,ids)){
  // Reconstruct a later reviewed rate or matter edit before deciding unbilled work.
  const later=await stmt(db,'SELECT before_json FROM s_entry_edits WHERE entry_id=? AND substr(at,1,10)>? ORDER BY at,id LIMIT 1',e.id,selected).first<Data>();
  const atDate={...e,...(later?JSON.parse(later.before_json):{})};
  if(!matterIds.includes(atDate.matter_id)||atDate.date>selected||atDate.billable===0)continue;
  const billed=invoices.some(b=>b.statement&&(!b.voided_at||day(b.voided_at)>selected)&&JSON.parse(b.retained_snapshot).lines?.some((l:Data)=>l.sourceId===e.id));
  if(!billed)add({id:'unbilled:'+e.id,date:atDate.date,kind:'unbilled_work',matterId:atDate.matter_id,cents:atDate.amount_cents,unbilledCents:atDate.amount_cents,source:{table:'s_entries',id:e.id}});
 }
 for(const f of sources.filter(s=>s.kind==='fees')){
  const v=JSON.parse(f.source_json),b=v.invoice_id?invoices.find(i=>sourceByTarget.get(i.id)?.source_id===v.invoice_id):null;
  if(v.invoice_id&&!v.fee_type)gaps.push('Fee '+f.source_id+': historical fee category not supplied');
  if(b?.statement&&['interest','late_fee'].includes(v.fee_type))add({id:'fee-component:'+f.target_id,date:v.date,kind:'historical_'+v.fee_type+'_component',billId:b.id,matterId:b.matter_id,cents:Number(v.amount_cents),[v.fee_type==='interest'?'interestCents':'lateFeeCents']:Number(v.amount_cents),source:{table:'s_move_fee_lines',id:f.target_id,sha256:JSON.parse(b.retained_snapshot).originalPdfDigest,originalPdf:'/api/satchel/bills/'+encodeURIComponent(b.id)+'/invoice.pdf'}});

  const fee=await stmt(db,'SELECT native_plan_id FROM s_move_fee_lines WHERE id=?',f.target_id).first<Data>();
  const occurrences=fee?.native_plan_id?await rows(db,'SELECT bill_id FROM s_fee_occurrences WHERE plan_id=?',fee.native_plan_id):[];
  const reserved=occurrences.some(o=>invoices.some(i=>i.id===o.bill_id&&i.statement&&(!i.voided_at||day(i.voided_at)>selected)));
  if((!b?.statement||b.voided_at&&day(b.voided_at)<=selected)&&!reserved)add({id:'unbilled:'+f.target_id,date:v.date,kind:'unbilled_source_fee',matterId:matters.find(m=>m.id===matterSources.find(s=>s.source_id===v.matter_id)?.target_id)?.id,cents:Number(v.amount_cents),unbilledCents:Number(v.amount_cents),source:{table:'s_move_fee_lines',id:f.target_id}});
 }
 const rootInvoice=(id:string)=>{const seen=new Set<string>();let current=id;while(invoiceById.get(current)?.corrects_bill_id&&!seen.has(current)){seen.add(current);current=invoiceById.get(current)!.corrects_bill_id;}return current;};
 const invoiceRows=invoices.filter(b=>b.statement).map(b=>{
  const root=rootInvoice(b.id),related=root===b.id?transactions.filter(t=>t.billId&&rootInvoice(t.billId)===b.id):transactions.filter(t=>t.billId===b.id),dueCents=root===b.id?sum(related,'dueCents'):0,voided=related.some(t=>t.kind==='invoice_void');
  if(!b.statement.dueDate&&!voided&&dueCents>0)gaps.push('Invoice '+b.statement.number+': source due date unavailable; aging is unknown');
  const age=b.statement.dueDate?Math.max(0,Math.floor((Date.parse(selected)-Date.parse(b.statement.dueDate))/86400000)):null;
  return {id:b.id,matterId:b.matter_id,appliedTo:root===b.id?null:root,...b.statement,dueCents:Math.max(0,dueCents),creditCents:Math.max(0,-dueCents),voided,agingDays:age,overdueCents:!voided&&age!==null&&age>0?Math.max(0,dueCents):0,transactions:related.map(t=>t.id)};
 });
 const totals={...empty(),...Object.fromEntries(fields.map(k=>[k,sum(transactions,k)]))};
 totals.overdueCents=sum(invoiceRows,'overdueCents');totals.dueCents=sum(invoiceRows,'dueCents');
 const group=(key:string)=>{
  const map=new Map<string,Data>();
  for(const i of invoiceRows){const m=matters.find(m=>m.id===i.matterId)!,name=key==='payer'?i.payer:key==='matter'?m.matter_number:m.lawyer_email??'Unassigned';if(!map.has(name))map.set(name,{name,currentCents:0,days1to30Cents:0,days31to60Cents:0,days61to90Cents:0,daysOver90Cents:0,unknownCents:0,invoices:[]});const g=map.get(name)!,age=i.agingDays;g[age===null?'unknownCents':age===0?'currentCents':age<=30?'days1to30Cents':age<=60?'days31to60Cents':age<=90?'days61to90Cents':'daysOver90Cents']+=i.dueCents;g.invoices.push(i.id);}
  return [...map.values()];
 };
 const aging={payer:group('payer'),matter:group('matter'),lawyer:group('lawyer')};
 for(const amount of Object.values(totals))insist(Number.isSafeInteger(amount),'Statement exceeds exact integer money range',409);
 transactions.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 return {account:job.account,asOf:selected,currency:'USD',basis:'Inclusive effective dates; native allocations, refunds and provider observations use their recorded UTC dates. Imported facts are source evidence, never provider verification.',totals,invoices:invoiceRows,transactions,aging,gaps:[...new Set(gaps)],coverageGaps:header.coverageGaps??[],boundary:'Historical interest and late-fee components require explicit source fee categories and are included in the original invoice total, never charged twice. No new assessment is created. Complete native assessments and historical responsible-lawyer assignments remain unavailable; zero amounts do not certify missing data.'};
}
export function migrationLedgerCsv(report:Awaited<ReturnType<typeof migrationLedger>>,group:unknown){
 if(group==='transactions')return new Response(csv([
  ['as of','transaction ID','date','kind','matter ID','invoice ID','invoice number','USD cents',...fields.map(k=>k+' delta'),'source table','source ID','reference','document ID','source version','source SHA-256','original invoice PDF'],
  ...report.transactions.map(t=>[report.asOf,t.id,t.date,t.kind,t.matterId,t.billId,report.invoices.find(i=>i.id===t.billId)?.number,t.cents,...fields.map(k=>t[k]??0),t.source.table,t.source.id,t.source.reference??t.reference,t.source.documentId,t.source.version,t.source.sha256,t.source.originalPdf]),
 ]),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="migration-transactions.csv"','cache-control':'no-store'}});
 insist(['payer','matter','lawyer'].includes(String(group)),'Choose payer, matter or lawyer aging');
 const records=report.aging[group as keyof typeof report.aging];
 return new Response(csv([['as of','group','name','current USD cents','1 to 30 USD cents','31 to 60 USD cents','61 to 90 USD cents','over 90 USD cents','unknown due date USD cents','invoice IDs'],...records.map(r=>[report.asOf,group,r.name,r.currentCents,r.days1to30Cents,r.days31to60Cents,r.days61to90Cents,r.daysOver90Cents,r.unknownCents,r.invoices.join('; ')])]),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="migration-aging.csv"','cache-control':'no-store'}});
}
