import {digest,insist,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {trustOfficer} from './trust';

// Account totals must never reveal a walled subsidiary or its source evidence.
const sourceIds=`SELECT s.source_document_id FROM s_trust_entry_sources s JOIN s_trust_entries e ON e.id=s.entry_id WHERE e.account_id=?
 UNION SELECT c.source_document_id FROM s_trust_clearings c JOIN s_trust_entries e ON e.id=c.entry_id WHERE e.account_id=?
 UNION SELECT source_document_id FROM s_trust_periods WHERE account_id=?
 UNION SELECT x.source_document_id FROM s_trust_period_events x JOIN s_trust_periods p ON p.id=x.period_id WHERE p.account_id=?`;
const accessSql=`?='owner' OR (NOT EXISTS(SELECT 1 FROM s_trust_ledgers l WHERE l.account_id=? AND NOT EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=l.matter_id AND a.email=?))
 AND NOT EXISTS(SELECT 1 FROM s_documents d WHERE d.id IN(${sourceIds}) AND (NOT EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=d.matter_id AND a.email=?) OR (d.visibility<>'matter' AND d.created_by<>?))))`;
function accessValues(actor:Actor,accountId:string){return [actor.role,accountId,actor.email,accountId,accountId,accountId,accountId,actor.email,actor.email];}
export function accountTrustGuard(db:D1Database,actor:Actor,accountId:string){return guard(db,accessSql,...accessValues(actor,accountId));}
export async function accountTrustAccess(db:D1Database,actor:Actor,accountId:string){
 await trustOfficer(db,actor);
 const account=await stmt(db,"SELECT * FROM s_trust_accounts WHERE id=? AND kind='trust'",text(accountId,'Trust account')).first<Data>();
 insist(account,'Trust account not found',404);
 insist(await stmt(db,`SELECT 1 WHERE ${accessSql}`,...accessValues(actor,accountId)).first(),'Full access to every subsidiary and source in this account is required',403);
 return account;
}

// These financial inputs are append-only. A token checked inside the signing
// batch catches any posting, clearance or period action after the report read.
export const reportStateSql=`SELECT json_object(
 'entries',COALESCE((SELECT MAX(rowid) FROM s_trust_entries WHERE account_id=?),0),
 'clearings',COALESCE((SELECT MAX(c.rowid) FROM s_trust_clearings c JOIN s_trust_entries e ON e.id=c.entry_id WHERE e.account_id=?),0),
 'ledgers',COALESCE((SELECT MAX(rowid) FROM s_trust_ledgers WHERE account_id=?),0),
 'periods',COALESCE((SELECT MAX(rowid) FROM s_trust_periods WHERE account_id=?),0),
 'packets',COALESCE((SELECT MAX(x.rowid) FROM s_trust_packets x JOIN s_trust_periods p ON p.id=x.period_id WHERE p.account_id=?),0),
 'events',COALESCE((SELECT MAX(x.sequence) FROM s_trust_period_events x JOIN s_trust_periods p ON p.id=x.period_id WHERE p.account_id=?),0)
 ) token`;
export const reportStateValues=(accountId:string)=>Array(6).fill(accountId);
export function reportStateGuard(db:D1Database,accountId:string,token:string){return guard(db,`(${reportStateSql})=?`,...reportStateValues(accountId),token);}
export function packetData(p:Data):Data{return {...p,balanced:!!p.balanced,snapshot:JSON.parse(p.snapshot)};}

export function clientStatement(ledger:Data,entries:Data[],cutoffDate:string,startDate?:string){
 const all=entries.filter(e=>e.ledger_id===ledger.id&&e.effective_date<=cutoffDate);
 let running=0,opening=0;const displayed:Data[]=[];
 for(const e of all){running+=e.cents;insist(Number.isSafeInteger(running),'Trust statement exceeds exact integer cents',409);if(startDate&&e.effective_date<startDate)opening+=e.cents;else displayed.push({...e,runningBalanceCents:running});}
 return {ledgerId:ledger.id,matterId:ledger.matter_id,accountId:ledger.account_id,startDate:startDate??null,cutoffDate,openingBalanceCents:opening,closingBalanceCents:running,entries:displayed};
}

export async function reportInputs(db:D1Database,actor:Actor,accountId:string,cutoffDate:string){
 const queries=[
  stmt(db,`SELECT CASE WHEN (${accessSql}) THEN 1 ELSE 0 END authorized`,...accessValues(actor,accountId)),
  stmt(db,reportStateSql,...reportStateValues(accountId)),
  stmt(db,'SELECT l.*,m.title,m.client,m.matter_number FROM s_trust_ledgers l JOIN s_matters m ON m.id=l.matter_id WHERE l.account_id=? ORDER BY l.created_at,l.id',accountId),
  stmt(db,'SELECT * FROM s_trust_entries WHERE account_id=? AND effective_date<=? ORDER BY effective_date,at,id',accountId,cutoffDate),
  stmt(db,`SELECT s.*,v.name document_name,d.matter_id,d.erased_at FROM s_trust_entry_sources s JOIN s_trust_entries e ON e.id=s.entry_id JOIN s_documents d ON d.id=s.source_document_id LEFT JOIN s_document_versions v ON v.document_id=s.source_document_id AND v.version=s.source_version WHERE e.account_id=? AND e.effective_date<=? ORDER BY e.effective_date,e.at,e.id,s.source_kind,s.source_record_id`,accountId,cutoffDate),
  stmt(db,'SELECT c.* FROM s_trust_clearings c JOIN s_trust_entries e ON e.id=c.entry_id WHERE e.account_id=? AND e.effective_date<=? ORDER BY c.at,c.id',accountId,cutoffDate),
  stmt(db,'SELECT x.* FROM s_trust_period_events x JOIN s_trust_periods p ON p.id=x.period_id WHERE p.account_id=? ORDER BY x.sequence',accountId),
 ];
 const result=await db.batch<Data>(queries);
 const [access,tokenRows,ledgers,rawEntries,sources,clearings,events]=result.map(r=>r.results);
 insist(access[0].authorized,'Full access to every subsidiary and source in this account is required',403);
 const sourceMap=new Map<string,Data[]>(),clearingMap=new Map(clearings.map(c=>[c.entry_id,c]));
 for(const s of sources){const list=sourceMap.get(s.entry_id)??[];list.push(s);sourceMap.set(s.entry_id,list);}
 const rawMap=new Map(rawEntries.map(e=>[e.id,e]));
 const clearanceDate=(entry:Data):string|null=>entry.cleared_date??clearingMap.get(entry.id)?.cleared_date??null;
 const entries:Data[]=rawEntries.map(e=>{
  const evidence=sourceMap.get(e.id)??[],originalId=evidence.find(s=>s.original_entry_id)?.original_entry_id;
  const original=originalId?rawMap.get(originalId):null;
  // A journal reversal corrects an allocation; it has no new bank settlement.
  const clearedDate=e.kind==='journal_reversal'&&original?clearanceDate(original):clearanceDate(e);
  return {...e,clearedDate,sources:evidence,clearance:clearingMap.get(e.id)??null,
   ...(original?{originalEntry:{...original,sources:sourceMap.get(original.id)??[],clearance:clearingMap.get(original.id)??null}}:{})};
 });
 return {stateToken:tokenRows[0].token as string,ledgers,entries,events};
}

export async function buildTrustReport(db:D1Database,actor:Actor,period:Data){
 const account=await accountTrustAccess(db,actor,period.account_id),input=await reportInputs(db,actor,period.account_id,period.end_date);
 const {entries}=input;
 const bankEntries=entries.filter(e=>e.kind!=='matter_allocation');
 const outstanding=bankEntries.filter(e=>!e.clearedDate||e.clearedDate>period.end_date);
 const outstandingDeposits=outstanding.filter(e=>e.cents>0),outstandingChecks=outstanding.filter(e=>e.cents<0);
 const sum=(list:Data[])=>list.reduce((n,e)=>n+e.cents,0);
 const registerCents=sum(bankEntries),subsidiaryCents=sum(entries.filter(e=>e.ledger_id!==null));
 const outstandingDepositsCents=sum(outstandingDeposits),outstandingChecksCents=-sum(outstandingChecks);
 const adjustedBankCents=period.closing_balance_cents+outstandingDepositsCents-outstandingChecksCents;
 const suspense=entries.filter(e=>e.ledger_id===null);
 const differences=[
  {kind:'bank_register',cents:adjustedBankCents-registerCents,entryIds:entries.map(e=>e.id)},
  {kind:'register_subsidiary',cents:registerCents-subsidiaryCents,entryIds:suspense.map(e=>e.id)},
  {kind:'bank_subsidiary',cents:adjustedBankCents-subsidiaryCents,entryIds:entries.map(e=>e.id)},
 ];
 const ledgers=input.ledgers.map(l=>({...l,balanceCents:sum(entries.filter(e=>e.ledger_id===l.id))}));
 const report={period,account,cutoffDate:period.end_date,sourceDocument:{id:period.source_document_id,version:period.source_version,digest:period.source_digest},
  bankClosingCents:period.closing_balance_cents,registerCents,subsidiaryCents,outstandingDepositsCents,outstandingChecksCents,adjustedBankCents,
  bankEntries,balanced:differences.every(d=>d.cents===0),differences,entries,outstandingDeposits,outstandingChecks,suspense,ledgers,
  clientStatements:ledgers.map(l=>clientStatement(l,entries,period.end_date,period.start_date)),events:input.events.filter(e=>e.period_id===period.id)};
 insist([registerCents,subsidiaryCents,outstandingDepositsCents,outstandingChecksCents,adjustedBankCents,...differences.map(d=>d.cents)].every(Number.isSafeInteger),'Trust totals exceed exact integer cents',409);
 return {report,reportDigest:await digest(JSON.stringify(report)),stateToken:input.stateToken};
}
