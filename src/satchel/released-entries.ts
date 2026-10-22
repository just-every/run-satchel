import {atomic,audit,Fault,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {budgetAlerts,charge} from './rates';
import {checkCodes,utbmsActivity,utbmsExpense,utbmsTask} from './utbms-codes';

const fields:Record<string,string>={matter_id:'matterId',description:'description',rate_cents:'rateCents',amount_cents:'amountCents',utbms_task:'utbmsTask',utbms_activity:'utbmsActivity',utbms_expense:'utbmsExpense',billed_minutes:'billedMinutes',discount_bps:'discountBps',rate_rule_id:'rateRuleId',rate_source:'rateSource'};
const snapshot=(e:Data)=>Object.fromEntries(Object.keys(fields).map(key=>[key,e[key]??null]));
export const releasedSql="EXISTS(SELECT 1 FROM s_invoice_voids v JOIN s_bills b ON b.id=v.bill_id JOIN json_each(b.snapshot,'$.lines') l WHERE json_extract(l.value,'$.sourceId')=e.id)";

export async function entryEdits(db:D1Database,entryIds:string[]){
 const history=await rows(db,'SELECT id,entry_id,previous_revision,revision,changes,reason,actor,at FROM s_entry_edits WHERE entry_id IN(SELECT value FROM json_each(?)) ORDER BY rowid',JSON.stringify(entryIds));
 const byEntry=new Map<string,Data[]>();
 for(const e of history){const list=byEntry.get(e.entry_id)??[];list.push({id:e.id,previousRevision:e.previous_revision,revision:e.revision,changes:JSON.parse(e.changes),reason:e.reason,actor:e.actor,at:e.at});byEntry.set(e.entry_id,list);}
 return byEntry;
}

// BILL-016: current source and target matter access is checked before the atomic
// edit. Original invoice snapshots and the entry's recorded work never change.
export async function editReleasedEntry(db:D1Database,actor:Actor,entryId:string,b:Data){
 human(actor);need(actor,'owner','lawyer');
 const e=await stmt(db,`SELECT e.*,${releasedSql} released FROM s_entries e WHERE e.id=?`,entryId).first<Data>();
 insist(e,'Entry not found',404);const source=await matter(db,actor,e.matter_id);
 const revision=text(b.revision,'Reviewed entry revision',100),reason=text(b.reason,'Edit reason',2000);
 // A replay is the same exact prior revision and normalized requested edit.
 const targetId=b.matterId===undefined?e.matter_id:text(b.matterId,'Target matter',100),target=await matter(db,actor,targetId);
 insist(source.client===target.client,'Move work only between matters of the same recorded client',409);
 const next:Data={...snapshot(e),matter_id:targetId};
 if(b.description!==undefined)next.description=text(b.description,'Description',2000);
 if(e.kind==='time'){
  insist(b.utbmsExpense===undefined,'Time entries use task and activity codes');
  if(b.utbmsTask!==undefined)next.utbms_task=utbmsTask(b.utbmsTask);
  if(b.utbmsActivity!==undefined)next.utbms_activity=utbmsActivity(b.utbmsActivity);
  if(b.rateCents!==undefined){const rate=integer(b.rateCents,'Hourly rate in USD cents',0,100000000);if(rate!==e.rate_cents){next.rate_cents=rate;next.amount_cents=charge(e.minutes,rate,0);next.billed_minutes=e.minutes;next.discount_bps=0;next.rate_rule_id=null;next.rate_source='entry';}}
 }else{
  insist(b.rateCents===undefined&&b.utbmsTask===undefined&&b.utbmsActivity===undefined,'Expense entries use an expense code and retain their recorded cost');
  if(b.utbmsExpense!==undefined)next.utbms_expense=utbmsExpense(b.utbmsExpense);
 }
 await checkCodes(db,{task:next.utbms_task,activity:next.utbms_activity,expense:next.utbms_expense});
 const prior=await stmt(db,'SELECT * FROM s_entry_edits WHERE entry_id=? AND previous_revision=?',entryId,revision).first<Data>();
 if(prior){
  // Compare supplied fields with the retained result; omitted fields are not a
  // request to restore an earlier value. No mutation or financial retry occurs.
  const after=JSON.parse(prior.after_json),aliases:Record<string,string>={matterId:'matter_id',description:'description',rateCents:'rate_cents',utbmsTask:'utbms_task',utbmsActivity:'utbms_activity',utbmsExpense:'utbms_expense'};
  insist(prior.reason===reason&&Object.entries(aliases).every(([input,key])=>b[input]===undefined||next[key]===after[key]),'This revision was already edited differently',409);
  return {id:entryId,revision:prior.revision,replayed:true};
 }
 insist(e.revision===revision,'Entry changed; review its current revision',409);
 insist(e.released,'Only work released from a voided invoice can be edited here',409);
 const before=snapshot(e),changes:Data={};for(const [key,label] of Object.entries(fields))if(before[key]!==next[key])changes[label]={before:before[key],after:next[key]};
 insist(Object.keys(changes).length,'Change a narrative, rate, code or target matter');
 const editId=id(),nextRevision=id(),at=now();
 try{
  await atomic(db,actor,[accessGuard(db,actor,e.matter_id),accessGuard(db,actor,targetId),
   guard(db,'EXISTS(SELECT 1 FROM s_matters s JOIN s_matters t ON t.client=s.client WHERE s.id=? AND t.id=?)',e.matter_id,targetId),
   guard(db,`EXISTS(SELECT 1 FROM s_entries e WHERE e.id=? AND e.revision=? AND ${releasedSql}) AND NOT EXISTS(SELECT 1 FROM s_billing_sources WHERE entry_id=?)`,entryId,revision,entryId),
   stmt(db,'INSERT INTO s_entry_edits VALUES(?,?,?,?,?,?,?,?,?,?)',editId,entryId,revision,nextRevision,JSON.stringify(before),JSON.stringify(next),JSON.stringify(changes),reason,actor.email,at),
   stmt(db,`UPDATE s_entries SET revision=?,${Object.keys(fields).map(key=>key+'=?').join(',')} WHERE id=? AND revision=?`,nextRevision,...Object.keys(fields).map(key=>next[key]),entryId,revision),
   ...budgetAlerts(db,actor,e.matter_id,entryId,at),...(targetId===e.matter_id?[]:budgetAlerts(db,actor,targetId,entryId,at)),
   audit(db,actor,'billing.entry.edited',editId,reason,{matterId:targetId,reviewedRevision:revision}),
  ]);
 }catch(error){
  if(!(error instanceof Fault)||error.status!==409)throw error;
  const done=await stmt(db,'SELECT after_json,reason,revision FROM s_entry_edits WHERE entry_id=? AND previous_revision=?',entryId,revision).first<Data>();
  if(!done||done.reason!==reason||done.after_json!==JSON.stringify(next))throw error;
  await matter(db,actor,targetId);return {id:entryId,revision:done.revision,replayed:true};
 }
 return {id:entryId,revision:nextRevision,replayed:false};
}
