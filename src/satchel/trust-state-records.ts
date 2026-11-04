import {atomic,audit,date,digest,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {decode,documentAccess,visibleDocument} from './documents';
import {getTrustPacket} from './trust-periods';
import {accountTrustAccess,accountTrustGuard} from './trust-reports';
import {reconcilerGuard,sourceGuard,trustOfficer,officerGuard} from './trust';
import {guard} from './trust-guards';
import {californiaTrustFields,newYorkRecordCategories} from './trust-state-fields';

// These are source-grounded review packets, never a compliance certification.
// Missing original record categories remain explicit rather than invented.
export function stateTrustRecords(report:Data,state:string):Data{
 insist(state==='CA'||state==='NY','Choose CA or NY');
 const period=report.period,entryIds=report.entries.map((e:Data)=>e.id);
 const fields=[
  {name:'periodStart',value:period.start_date,sources:[{table:'s_trust_periods',id:period.id,column:'start_date'}]},
  {name:'periodEnd',value:period.end_date,sources:[{table:'s_trust_periods',id:period.id,column:'end_date'}]},
  {name:'bankStatementClosingCents',value:report.bankClosingCents,sources:[{table:'s_trust_periods',id:period.id,column:'closing_balance_cents',document:report.sourceDocument}]},
  {name:'bankRegisterCents',value:report.registerCents,sources:report.bankEntries.map((e:Data)=>({table:'s_trust_entries',id:e.id,column:'cents'}))},
  {name:'clientLedgerTotalCents',value:report.subsidiaryCents,sources:report.entries.filter((e:Data)=>e.ledger_id!==null).map((e:Data)=>({table:'s_trust_entries',id:e.id,column:'cents'}))},
  {name:'outstandingDepositCents',value:report.outstandingDepositsCents,sources:report.outstandingDeposits.map((e:Data)=>({table:'s_trust_entries',id:e.id,column:'cents',clearedDate:e.clearedDate,clearance:e.clearance}))},
  {name:'outstandingCheckCents',value:report.outstandingChecksCents,sources:report.outstandingChecks.map((e:Data)=>({table:'s_trust_entries',id:e.id,column:'cents',clearedDate:e.clearedDate,clearance:e.clearance}))},
  {name:'adjustedBankCents',value:report.adjustedBankCents,formula:'Bank statement closing plus outstanding deposits minus outstanding checks',sources:[{table:'s_trust_periods',id:period.id,column:'closing_balance_cents'},...report.outstandingDeposits.concat(report.outstandingChecks).map((e:Data)=>({table:'s_trust_entries',id:e.id,column:'cents'}))]},
 ];
 const journal=report.entries.filter((e:Data)=>e.effective_date>=period.start_date).map((e:Data)=>({entryId:e.id,ledgerId:e.ledger_id,date:e.effective_date,cents:e.cents,kind:e.kind,sourceRecordId:e.source_id,approvedBy:e.approved_by,postedAt:e.at,originals:e.sources,clearance:e.clearance,transaction:e.transaction??null}));
 const ledgers=report.ledgers.map((l:Data)=>({ledgerId:l.id,matterId:l.matter_id,client:l.client,matterNumber:l.matter_number,balanceCents:l.balanceCents,entryIds:report.entries.filter((e:Data)=>e.ledger_id===l.id).map((e:Data)=>e.id)}));
 const common={state,periodId:period.id,startDate:period.start_date,endDate:period.end_date,reviewRequired:true,complete:false,fields,journal,ledgers,statementOriginal:report.sourceDocument,entryIds,
  boundary:'Firm review is required. This packet does not certify legal compliance, file an annual report or enforce a statutory retention period.'};
 if(state==='CA')return {...common,rule:'California Rule 1.15 monthly reconciliation',reconciliation:{balanced:report.balanced,differences:report.differences},
  annualReporting:{program:'Client Trust Account Protection Program',year:period.end_date.slice(0,4),accountRecordId:report.account.id,accountName:report.account.name,bankReferenceLastFour:report.account.bank_reference,status:'Incomplete: firm must review annual answers and account registration fields'},
  missing:['Reviewed CTAPP annual answers and complete institution and account registration fields','Firm approval of the monthly state report']};
 return {...common,rule:'New York Rule 1.15(d)',requiredRetentionYears:7,
  recordIndex:{receiptsAndDisbursements:journal,clientLedgers:ledgers,bankStatement:report.sourceDocument},
  missing:['Complete retained client retainer and compensation agreements','Complete client account statements, bills and disbursement records','Complete checkbooks, check stubs, cancelled checks and duplicate deposit slips','Seven-year preservation of all required records','Firm approval of the required-records report']};
}

function stateCode(value:unknown){insist(value==='CA'||value==='NY','Choose CA or NY');return value;}
async function periodAccess(db:D1Database,actor:Actor,periodId:string){
 const period=await stmt(db,'SELECT * FROM s_trust_periods WHERE id=?',text(periodId,'Statement period')).first<Data>();
 insist(period,'Statement period not found',404);await accountTrustAccess(db,actor,period.account_id);return period;
}
const latestSql='SELECT id FROM s_trust_state_metadata WHERE period_id=? AND state=? ORDER BY version DESC LIMIT 1';
async function latestMetadata(db:D1Database,periodId:string,state:string):Promise<Data|null>{
 const m=await stmt(db,'SELECT * FROM s_trust_state_metadata WHERE period_id=? AND state=? ORDER BY version DESC LIMIT 1',periodId,state).first<Data>();
 return m?{...m,content:JSON.parse(m.snapshot)}:null;
}
function metadataGuard(db:D1Database,periodId:string,state:string,revision:string|null){return guard(db,`COALESCE((${latestSql}),'')=?`,periodId,state,revision??'');}
const currentPacketSql="EXISTS(SELECT 1 FROM s_trust_period_events e WHERE e.period_id=? AND e.sequence=(SELECT MAX(sequence) FROM s_trust_period_events WHERE period_id=e.period_id) AND e.kind='signed' AND e.packet_id=?)";
const principalSql="EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active')";

async function originalEvidence(db:D1Database,actor:Actor,value:Data){
 const documentId=text(value.documentId,'Evidence document'),version=integer(value.version,'Evidence version',1),hash=text(value.digest,'Evidence SHA-256',64);
 const d=await visibleDocument(db,actor,documentId),v=await stmt(db,'SELECT * FROM s_document_versions WHERE document_id=? AND version=?',documentId,version).first<Data>();
 insist(!d.erased_at&&v?.content_base64,'Use an available supported-size retained original; quarantined or erased originals cannot be evidence',409);
 insist(v.sha256===hash&&await digest(decode(v.content_base64))===hash,'Evidence does not match the exact retained original',409);
 return {documentId,version,digest:hash,citation:text(value.citation,'Evidence citation',1000)};
}
function evidenceSource(e:Data){return {id:e.documentId,version:e.version,digest:e.digest};}
async function availableEvidence(db:D1Database,actor:Actor,e:Data){
 const access=documentAccess(actor);
 return !!await stmt(db,`SELECT 1 FROM s_documents d JOIN s_document_versions v ON v.document_id=d.id WHERE d.id=? AND d.erased_at IS NULL AND v.version=? AND v.sha256=? AND v.content_base64 IS NOT NULL AND ${access.sql}`,e.documentId,e.version,e.digest,...access.params).first();
}

export async function saveTrustStateMetadata(db:D1Database,actor:Actor,periodId:string,b:Data){
 const p=await periodAccess(db,actor,periodId),state=stateCode(b.state),previous=await latestMetadata(db,p.id,state);
 insist((b.baseRevision??null)===(previous?.id??null),'The state metadata changed. Review its current revision first',409);
 const inputFields=b.fields??{},inputManifest=b.manifest??[];
 insist(inputFields&&typeof inputFields==='object'&&!Array.isArray(inputFields)&&Array.isArray(inputManifest),'Supply state fields and a required-record manifest');
 insist(Object.keys(inputFields).every(k=>state==='CA'&&californiaTrustFields.some(([name])=>name===k)),'Unknown California annual or account-registration field');
 insist(inputManifest.length<=newYorkRecordCategories.length&&inputManifest.every((x:Data)=>state==='NY'&&newYorkRecordCategories.some(([key])=>key===x.category)),'Unknown New York required-record category');
 insist(new Set(inputManifest.map((x:Data)=>x.category)).size===inputManifest.length,'Record each manifest category once');
 const evidence:Data[]=[],fields:Data={},manifest:Data[]=[];
 async function normalize(list:unknown,key:string){
  insist(Array.isArray(list)&&list.length<=20,'Supply at most twenty original references per field or category');
  const result:Data[]=[];
  for(const item of list){const e=await originalEvidence(db,actor,item);insist(!result.some(x=>x.documentId===e.documentId&&x.version===e.version),'Use each exact original once per field or category');result.push(e);evidence.push({...e,key});}
  return result;
 }
 for(const [key] of californiaTrustFields)if(inputFields[key]){
  const value=text(inputFields[key].value,'Practitioner-recorded field',1000);
  if(key==='reportingYear')insist(/^\d{4}$/.test(value)&&value===p.end_date.slice(0,4),'Reporting year must match this statement period');
  if(key==='openedDate')date(value);
  const refs=await normalize(inputFields[key].evidence,key);insist(refs.length,'A recorded field requires retained original evidence');fields[key]={value,evidence:refs};
 }
 for(const item of inputManifest)manifest.push({category:item.category,evidence:await normalize(item.evidence,item.category)});
 const content={fields,manifest},snapshot=JSON.stringify(content),hash=await digest(snapshot);
 if(previous?.digest===hash)return previous;
 const metadataId=id(),version=(previous?.version??0)+1,at=now();
 await atomic(db,actor,[reconcilerGuard(db,actor),accountTrustGuard(db,actor,p.account_id),metadataGuard(db,p.id,state,previous?.id??null),
  ...evidence.map(e=>sourceGuard(db,evidenceSource(e),actor)),
  stmt(db,'INSERT INTO s_trust_state_metadata VALUES(?,?,?,?,?,?,?,?,?)',metadataId,p.id,state,version,snapshot,hash,actor.email,actor.name,at),
  ...evidence.map(e=>stmt(db,'INSERT INTO s_trust_state_evidence VALUES(?,?,?,?,?,?,?)',id(),metadataId,e.key,e.documentId,e.version,e.digest,e.citation)),
  audit(db,actor,'trust.state_metadata_recorded',metadataId,JSON.stringify({periodId:p.id,state,version,digest:hash}))]);
 return latestMetadata(db,p.id,state);
}

async function stateBundle(db:D1Database,actor:Actor,packet:Data,state:string){
 const metadata=await latestMetadata(db,packet.period_id,state),content=metadata?.content??{fields:{},manifest:[]};
 const preview=stateTrustRecords(packet.snapshot,state),missing:string[]=[],annualFields:Data[]=[],manifest:Data[]=[];
 async function annotate(refs:Data[]){return Promise.all(refs.map(async e=>{const available=await availableEvidence(db,actor,e);return {...e,citation:available?e.citation:'Original unavailable',available};}));}
 if(state==='CA'){
  for(const [name,label] of californiaTrustFields){
   const f=content.fields[name],evidence=await annotate(f?.evidence??[]),present=!!f&&evidence.length>0&&evidence.every(e=>e.available);
   annualFields.push({name,label,value:present?f.value:null,evidence,missing:!present});if(!present)missing.push(label+': evidence not recorded or unavailable');
  }
  preview.annualReporting={...preview.annualReporting,fields:annualFields,status:'Practitioner-recorded review preview; no annual filing or certification'};
 }else{
  for(const [category,label] of newYorkRecordCategories){
   const refs=content.manifest.find((m:Data)=>m.category===category)?.evidence??[];
   // The signed statement already identifies its exact retained bank original.
   const bank=packet.snapshot.sourceDocument;
   const originals=await annotate(category==='bank_statements'&&!refs.length?[{documentId:bank.id,version:bank.version,digest:bank.digest,citation:'Signed period bank statement'}]:refs);
   const absent=!originals.some(e=>e.available);manifest.push({category,label,originals,missing:absent,coverage:absent?'No available original recorded':'Available originals linked; complete category coverage is not established'});
   if(absent)missing.push(label+': no available original recorded');
  }
  missing.push('Complete New York required-original coverage and seven-year preservation are not established');preview.requiredRecordManifest=manifest;
 }
 // Native monthly values are frozen in the packet. No wall-clock value enters the digest.
 const bundle={...preview,missing,packetId:packet.id,packetDigest:packet.digest,metadataRevision:metadata?.id??null,metadataVersion:metadata?.version??0,metadataDigest:metadata?.digest??null};
 return {bundle,metadata,content,bundleDigest:await digest(JSON.stringify(bundle))};
}

export async function trustStatePreview(db:D1Database,actor:Actor,packetId:string,stateValue:unknown){
 const state=stateCode(stateValue),packet=await getTrustPacket(db,actor,packetId),built=await stateBundle(db,actor,packet,state);
 const reviews=await rows(db,'SELECT id,packet_id,packet_digest,metadata_id,bundle_digest,digest,reviewer_id,reviewer_email,reviewer_name,reviewed_at,note FROM s_trust_state_reviews WHERE state=? AND packet_id IN(SELECT id FROM s_trust_packets WHERE period_id=?) ORDER BY reviewed_at,id',state,packet.period_id);
 const current=!!await stmt(db,'SELECT 1 WHERE '+currentPacketSql,packet.period_id,packet.id).first();
 const currentReview=current?reviews.find(r=>r.packet_id===packet.id&&r.bundle_digest===built.bundleDigest&&r.metadata_id===built.metadata?.id):null;
 return {...built.bundle,bundleDigest:built.bundleDigest,metadata:built.metadata?{id:built.metadata.id,version:built.metadata.version,digest:built.metadata.digest,recorded_by:built.metadata.recorded_by,recorded_name:built.metadata.recorded_name,recorded_at:built.metadata.recorded_at}:null,packetCurrent:current,reviewRequired:!currentReview,
  firmReview:currentReview??null,reviews:reviews.map(r=>({...r,current:r.id===currentReview?.id})),
  missing:[...built.bundle.missing,...(!currentReview?['Firm review of this exact current packet and metadata revision']:[])]};
}

export async function reviewTrustState(db:D1Database,actor:Actor,packetId:string,b:Data){
 human(actor);need(actor,'owner');await trustOfficer(db,actor);
 insist(await stmt(db,'SELECT 1 WHERE '+principalSql,actor.id,actor.email).first(),'The active principal must record firm review',403);
 const state=stateCode(b.state),packet=await getTrustPacket(db,actor,packetId),built=await stateBundle(db,actor,packet,state);
 insist(b.confirmed===true&&b.packetDigest===packet.digest&&b.metadataRevision===built.metadata?.id&&b.bundleDigest===built.bundleDigest,'The packet or metadata changed. Review the exact current bundle first',409);
 insist(built.metadata,'Record the practitioner metadata or manifest revision before firm review',409);
 insist(await stmt(db,'SELECT 1 WHERE '+currentPacketSql,packet.period_id,packet.id).first(),'Review only the current signed packet',409);
 const refs=await rows(db,'SELECT * FROM s_trust_state_evidence WHERE metadata_id=?',built.metadata.id);
 for(const r of refs)insist(await availableEvidence(db,actor,{documentId:r.source_document_id,version:r.source_version,digest:r.source_digest}),'A referenced original is unavailable; update the metadata before review',409);
 const prior=await stmt(db,'SELECT * FROM s_trust_state_reviews WHERE packet_id=? AND state=? AND metadata_id=? AND bundle_digest=?',packet.id,state,built.metadata.id,built.bundleDigest).first<Data>();
 const note=text(b.note,'Firm review note',2000);
 if(prior){insist(prior.note===note,'This exact bundle already has a different retained review note',409);return getTrustStateReview(db,actor,prior.id);}
 const reviewId=id(),at=now(),snapshot=JSON.stringify(built.bundle),hash=await digest(snapshot);
 await atomic(db,actor,[officerGuard(db,actor),guard(db,principalSql,actor.id,actor.email),accountTrustGuard(db,actor,packet.snapshot.account.id),
  guard(db,currentPacketSql,packet.period_id,packet.id),metadataGuard(db,packet.period_id,state,built.metadata.id),
  sourceGuard(db,packet.snapshot.sourceDocument,actor),...refs.map(r=>sourceGuard(db,{id:r.source_document_id,version:r.source_version,digest:r.source_digest},actor)),
  stmt(db,'INSERT INTO s_trust_state_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',reviewId,packet.id,state,built.metadata.id,packet.digest,built.bundleDigest,snapshot,hash,actor.id,actor.email,actor.name,at,note),
  audit(db,actor,'trust.state_reviewed',reviewId,JSON.stringify({packetId:packet.id,state,metadataId:built.metadata.id,packetDigest:packet.digest,bundleDigest:built.bundleDigest}))]);
 return getTrustStateReview(db,actor,reviewId);
}
export async function getTrustStateReview(db:D1Database,actor:Actor,reviewId:string){
 const r=await stmt(db,'SELECT * FROM s_trust_state_reviews WHERE id=?',text(reviewId,'Firm review')).first<Data>();insist(r,'Firm review not found',404);
 const packet=await getTrustPacket(db,actor,r.packet_id),bank=packet.snapshot.sourceDocument;
 insist(await availableEvidence(db,actor,{documentId:bank.id,version:bank.version,digest:bank.digest}),'The retained bank statement is unavailable',409);
 const refs=await rows(db,'SELECT * FROM s_trust_state_evidence WHERE metadata_id=?',r.metadata_id);
 for(const e of refs)insist(await availableEvidence(db,actor,{documentId:e.source_document_id,version:e.source_version,digest:e.source_digest}),'A retained review source is unavailable',409);
 return {...r,snapshot:JSON.parse(r.snapshot)};
}
