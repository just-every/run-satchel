import {atomic,audit,authority,date,digest,Fault,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {budgetAlerts,loadPricing,price,pricingGuard,type Pricing} from './rates';
import {checkCodes,utbmsActivity,utbmsExpense,utbmsTask} from './utbms-codes';
import {codeLine,currentGuideline} from './ledes-guidelines';
import {expenseInput,expenseInsert,expenseReceipt,expenseReplay} from './expenses';
import {requireArea} from './role-areas';

// This predicate supplies attribution eligibility, never another person's authority.
const staffSql=`EXISTS(SELECT 1 FROM oa_operators WHERE lower(email)=? AND role='owner' AND status='active') OR EXISTS(SELECT 1 FROM s_members m LEFT JOIN s_custom_roles c ON c.id=m.custom_role_id WHERE m.email=? AND m.active=1 AND m.role IN('lawyer','assistant','trust_officer') AND (m.custom_role_id IS NULL OR json_extract(c.permissions,'$.billing')='write'))`;
const canonical=(value:any):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
async function allowed(db:D1Database,actor:Actor,write=false){
 human(actor);need(actor,'owner','lawyer','assistant','trust_officer');requireArea(actor,'billing',write?'write':'read');
 const a=authority(actor);insist(await stmt(db,`SELECT 1 WHERE ${a.sql}`, ...a.params).first(),'Your authority changed',403);
 insist(await stmt(db,`SELECT 1 WHERE ${staffSql}`,actor.email,actor.email).first(),'Your role cannot record bulk work',403);
}
async function attributed(db:D1Database,actor:Actor,email:string,matterId:string){
 insist(actor.role==='owner'||email===actor.email,'Only the principal can import another timekeeper’s work',403);
 insist(await stmt(db,`SELECT 1 WHERE ${staffSql}`,email,email).first(),'Choose an active staff timekeeper with time-entry authority');
 const member=await stmt(db,"SELECT 'owner' role FROM oa_operators WHERE lower(email)=? AND role='owner' AND status='active' UNION ALL SELECT role FROM s_members WHERE email=? LIMIT 1",email,email).first<Data>();
 const person={...actor,email,role:member!.role,channel:'person'} as Actor;
 await matter(db,person,matterId);return person;
}
async function validate(db:D1Database,actor:Actor,input:Data,sourceSystem:string,pricing:Pricing,ordinal:number):Promise<{errors:string[];value:Data|null}>{
 try{
  insist(input&&typeof input==='object'&&!Array.isArray(input),'Give a work row');
  const matterId=text(input.matterId,'Matter',100),m=await matter(db,actor,matterId),timekeeperEmail=text(input.timekeeperEmail??actor.email,'Original timekeeper email',320).toLowerCase();
  await attributed(db,actor,timekeeperEmail,matterId);
  const sourceId=text(input.sourceId,'Original source row reference',200),kind=input.kind;
  insist(kind==='time'||kind==='disbursement','Choose time or disbursement');
  const day=date(input.date),description=text(input.description,'Work description',2000);
  insist(typeof input.billable==='boolean','Say whether the work is billable');
  const billable=input.expense?.category==='overhead'?false:input.billable;
  const task=kind==='time'?utbmsTask(input.utbmsTask):null,activity=kind==='time'?utbmsActivity(input.utbmsActivity):null,expense=kind==='disbursement'?utbmsExpense(input.utbmsExpense):null;
  await checkCodes(db,{task,activity,expense});
  const minutes=kind==='time'?integer(input.minutes,'Minutes',1,1440):null;
  const q=kind==='time'?price(pricing,{matterId,client:m.client,date:day,timekeeper:timekeeperEmail,task,minutes:minutes!,billable,rateCents:input.rateCents==null?undefined:integer(input.rateCents,'Hourly USD cents',0,100000000)}):null;
  const amountCents=q?q.amountCents:integer(input.amountCents,'Expense USD cents',0,1000000000000);
  let expenseMeta=null;
  if(kind==='disbursement'){
   insist(input.expense,'Give expense category, vendor, vendor reference and accounting code');
   insist(Boolean(input.expense.sourceSystem)===Boolean(input.expense.sourceId),'Give both expense source system and source charge reference');
   const e={...input.expense,sourceSystem:input.expense.sourceSystem??sourceSystem,sourceId:input.expense.sourceId??sourceId};
   expenseMeta=await expenseInput(matterId,{...input,expense:e},{date:day,description,amountCents,billable,utbmsExpense:expense});
   insist(!await expenseReplay(db,expenseMeta),'Source expense was already recorded',409);
   if(expenseMeta)await expenseReceipt(db,actor,matterId,expenseMeta);
  }
  insist(!await stmt(db,'SELECT 1 FROM s_bulk_work_sources WHERE source_system=? AND source_id=?',sourceSystem,sourceId).first(),'Source work was already recorded',409);
  const guideline=await currentGuideline(db,m.client);
  let ledes=null;
  if(guideline){const checked=await codeLine(db,guideline,{kind,date:day,created_by:timekeeperEmail,minutes,billed_minutes:q?.billedMinutes,rate_cents:q?.rateCents,utbms_task:task,utbms_activity:activity,utbms_expense:expense},undefined,ordinal,amountCents,description);insist(!checked.problems.length,checked.problems.join('; '));ledes={guidelineId:guideline.id,line:checked.line};}
  const cost=kind==='time'&&actor.role==='owner'?await stmt(db,'SELECT id,hourly_cents FROM s_staff_cost_rates WHERE email=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1',timekeeperEmail,day).first<Data>():null;
  return {errors:[] as string[],value:{matterId,matterNumber:m.matter_number,timekeeperEmail,sourceSystem,sourceId,kind,date:day,description,minutes,billable:q?q.billable:billable,amountCents,price:q,task,activity,expense,expenseMeta,ledes,costBasis:cost?{approvalId:cost.id,hourlyCents:cost.hourly_cents,costCents:Number((BigInt(minutes!)*BigInt(cost.hourly_cents)+30n)/60n)}:null}};
 }catch(e){if(!(e instanceof Fault))throw e;return {errors:[e.message],value:null};}
}
async function policyGuards(db:D1Database,actor:Actor){
 const writes:D1PreparedStatement[]=[];
 for(const table of ['s_utbms_codes','s_ledes_timekeepers','s_ledes_guidelines',...(actor.role==='owner'?['s_staff_cost_rates']:[])]){
  const snapshot=await rows(db,`SELECT * FROM ${table} ORDER BY rowid`);
  writes.push(guard(db,`(SELECT json_group_array(json(v)) FROM (SELECT json_object(${Object.keys(snapshot[0]??{}).flatMap(k=>[`'${k}'`,k]).join(',')||"'empty',0"}) v FROM ${table} ORDER BY rowid))=?`,JSON.stringify(snapshot)));
 }
 return writes;
}
async function reviews(db:D1Database,actor:Actor,list:Data[],source:string,pricing:Pricing){
 const result=await Promise.all(list.map((r,i)=>validate(db,actor,r,source,pricing,i+1)));
 const identities=new Set<string>();
 for(const r of result)if(r.value){const keys=[canonical([source,r.value.sourceId]),...(r.value.expenseMeta?[canonical([r.value.expenseMeta.detail.sourceSystem,r.value.expenseMeta.detail.sourceId])]:[])];
  if(keys.some(k=>identities.has(k))){r.errors.push('Duplicate source identity in this batch');r.value=null;}else for(const key of keys)identities.add(key);
 }
 return result;
}
async function readBatch(db:D1Database,actor:Actor,batchId:string):Promise<Data>{
 const b=await stmt(db,'SELECT * FROM s_bulk_work_batches WHERE id=? AND created_by=?',batchId,actor.email).first<Data>();insist(b,'Bulk work batch not found',404);
 const list=await rows(db,'SELECT * FROM s_bulk_work_rows WHERE batch_id=? ORDER BY ordinal',batchId);
 for(const r of list){
  await matter(db,actor,r.matter_id);
  const v=JSON.parse(r.review_json).value;
  if(v&&actor.role!=='owner'&&v.timekeeperEmail!==actor.email)throw new Fault('Bulk work batch not found',404);
  if(b.status==='posted'){
   try{await attributed(db,actor,v.timekeeperEmail,r.matter_id);}catch(e){if(!(e instanceof Fault))throw e;throw new Fault('Bulk work batch not found',404);}
  }
 }
 return {...b,list};
}
function redactedReview(json:string,actor:Actor){const r=JSON.parse(json);if(r.value&&actor.role!=='owner')r.value.costBasis=null;return r;}
function batchJson(b:Data,actor:Actor){return {id:b.id,createdBy:b.created_by,createdAt:b.created_at,sourceSystem:b.source_system,requestId:b.request_id,revision:b.revision,reviewDigest:b.review_digest,status:b.status,postedAt:b.posted_at,rows:b.list.map((r:Data)=>({id:r.id,ordinal:r.ordinal,original:JSON.parse(r.original_json),input:JSON.parse(r.input_json),...redactedReview(r.review_json,actor),entryId:r.entry_id}))};}
export async function listBulkWork(db:D1Database,actor:Actor){
 await allowed(db,actor);const batches=[];
 for(const b of await rows(db,'SELECT id FROM s_bulk_work_batches WHERE created_by=? ORDER BY created_at DESC,id',actor.email)){
  try{batches.push(batchJson(await readBatch(db,actor,b.id),actor));}catch(e){if(!(e instanceof Fault)||e.status!==404)throw e;}
 }
 return {batches};
}
export async function prepareBulkWork(db:D1Database,actor:Actor,body:Data){
 await allowed(db,actor,true);
 const requestId=text(body.requestId,'Stable import request ID',100),sourceSystem=text(body.sourceSystem,'Source system',100);
 insist(Array.isArray(body.rows)&&body.rows.length>0&&body.rows.length<=100,'Import between 1 and 100 work rows');
 const inputs=JSON.parse(canonical(body.rows)) as Data[],requestDigest=await digest(canonical({sourceSystem,rows:inputs}));
 const previous=await stmt(db,'SELECT * FROM s_bulk_work_batches WHERE created_by=? AND request_id=?',actor.email,requestId).first<Data>();
 if(previous){insist(previous.request_digest===requestDigest,'Import request ID was already used for different work',409);return batchJson(await readBatch(db,actor,previous.id),actor);}
 // Even an invalid row must name an accessible matter before we retain it.
 for(const r of inputs)await matter(db,actor,text(r.matterId,'Matter',100));
 const pricing=await loadPricing(db),review=await reviews(db,actor,inputs,sourceSystem,pricing),batchId=id(),revision=id(),at=now(),reviewDigest=await digest(canonical(review));
 await atomic(db,actor,[...inputs.map(r=>accessGuard(db,actor,r.matterId)),pricingGuard(db,pricing),
  stmt(db,"INSERT INTO s_bulk_work_batches(id,created_by,source_system,request_id,request_digest,revision,review_digest,status,created_at) VALUES(?,?,?,?,?,?,?,'review',?)",batchId,actor.email,sourceSystem,requestId,requestDigest,revision,reviewDigest,at),
  ...inputs.map((r,i)=>stmt(db,'INSERT INTO s_bulk_work_rows(id,batch_id,ordinal,matter_id,original_json,input_json,review_json) VALUES(?,?,?,?,?,?,?)',id(),batchId,i+1,r.matterId,canonical(r),canonical(r),canonical(review[i]))),
  audit(db,actor,'bulk_work.prepared',batchId,JSON.stringify({sourceSystem,rows:inputs.length,reviewDigest}))]);
 return batchJson(await readBatch(db,actor,batchId),actor);
}
export async function repairBulkRow(db:D1Database,actor:Actor,batchId:string,body:Data){
 await allowed(db,actor,true);const b=await readBatch(db,actor,batchId);
 insist(b.status==='review'&&body.revision===b.revision,'The reviewed batch changed; reopen it before repairing',409);
 const index=b.list.findIndex((r:Data)=>r.id===body.rowId);insist(index>=0,'Bulk work row not found',404);
 insist(body.row&&typeof body.row==='object'&&!Array.isArray(body.row),'Give the complete repaired row');
 const inputs=b.list.map((r:Data,i:number)=>i===index?JSON.parse(canonical(body.row)):JSON.parse(r.input_json));
 for(const r of inputs)await matter(db,actor,text(r.matterId,'Matter',100));
 const pricing=await loadPricing(db),review=await reviews(db,actor,inputs,b.source_system,pricing),revision=id(),reviewDigest=await digest(canonical(review));
 await atomic(db,actor,[guard(db,"EXISTS(SELECT 1 FROM s_bulk_work_batches WHERE id=? AND revision=? AND status='review')",batchId,b.revision),pricingGuard(db,pricing),...inputs.map((r:Data)=>accessGuard(db,actor,r.matterId)),...b.list.map((r:Data)=>accessGuard(db,actor,JSON.parse(r.original_json).matterId)),
  ...inputs.map((r:Data,i:number)=>stmt(db,'UPDATE s_bulk_work_rows SET matter_id=?,input_json=?,review_json=? WHERE id=?',r.matterId,canonical(r),canonical(review[i]),b.list[i].id)),
  stmt(db,'UPDATE s_bulk_work_batches SET revision=?,review_digest=? WHERE id=?',revision,reviewDigest,batchId),
  audit(db,actor,'bulk_work.repaired',batchId,canonical({rowId:body.rowId,before:JSON.parse(b.list[index].input_json),after:inputs[index],reviewDigest}))]);
 return batchJson(await readBatch(db,actor,batchId),actor);
}
export async function postBulkWork(db:D1Database,actor:Actor,batchId:string,body:Data){
 await allowed(db,actor,true);const b=await readBatch(db,actor,batchId),requestId=text(body.requestId,'Stable posting request ID',100);
 insist(body.revision===b.revision&&body.reviewDigest===b.review_digest,'The batch changed; review the current rows before posting',409);
 if(b.status==='posted'){insist(requestId===b.post_request_id,'This batch was posted with a different request ID',409);return batchJson(b,actor);}
 const policies=await policyGuards(db,actor),pricing=await loadPricing(db),inputs=b.list.map((r:Data)=>JSON.parse(r.input_json)),review=await reviews(db,actor,inputs,b.source_system,pricing);
 insist(review.every(r=>!r.errors.length),'Repair every invalid row before posting; no work was recorded',422);
 insist(await digest(canonical(review))===b.review_digest,'Prices, codes, costs or provenance changed; save a row to review the refreshed batch',409);
 const at=now(),writes:D1PreparedStatement[]=[guard(db,"EXISTS(SELECT 1 FROM s_bulk_work_batches WHERE id=? AND revision=? AND review_digest=? AND status='review')",batchId,b.revision,b.review_digest),pricingGuard(db,pricing),guard(db,staffSql,actor.email,actor.email)],last=new Map<string,string>();
 writes.push(...policies);
 for(let i=0;i<review.length;i++){
  const v=review[i].value!,row=b.list[i],entryId=id(),person=await attributed(db,actor,v.timekeeperEmail,v.matterId),p=v.price;
  writes.push(accessGuard(db,actor,v.matterId),accessGuard(db,actor,JSON.parse(row.original_json).matterId),accessGuard(db,person,v.matterId),guard(db,staffSql,v.timekeeperEmail,v.timekeeperEmail),guard(db,person.role==='owner'?"EXISTS(SELECT 1 FROM oa_operators WHERE lower(email)=? AND role='owner' AND status='active')":'EXISTS(SELECT 1 FROM s_members WHERE email=? AND role=? AND active=1)',...(person.role==='owner'?[v.timekeeperEmail]:[v.timekeeperEmail,person.role])),
   stmt(db,'INSERT INTO s_entries(id,matter_id,revision,kind,date,description,minutes,rate_cents,amount_cents,created_by,created_at,billable,utbms_task,utbms_activity,utbms_expense,billed_minutes,discount_bps,rate_rule_id,rate_source,timekeeper_email) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',entryId,v.matterId,id(),v.kind,v.date,v.description,v.minutes,p?.rateCents??null,v.amountCents,actor.email,at,v.billable?1:0,v.task,v.activity,v.expense,p?.billedMinutes??null,p?.discountBps??null,p?.ruleId??null,p?.rateSource??null,v.timekeeperEmail),
   stmt(db,'INSERT INTO s_bulk_work_sources(source_system,source_id,row_id,entry_id) VALUES(?,?,?,?)',b.source_system,v.sourceId,row.id,entryId),
   stmt(db,'UPDATE s_bulk_work_rows SET entry_id=? WHERE id=?',entryId,row.id),
   audit(db,actor,'billing.entry.recorded',entryId,canonical({batchId,rowId:row.id,timekeeperEmail:v.timekeeperEmail,sourceSystem:b.source_system,sourceId:v.sourceId}),{matterId:v.matterId}));
  if(v.expenseMeta)writes.push(...await expenseReceipt(db,actor,v.matterId,v.expenseMeta),expenseInsert(db,entryId,v.expenseMeta));
  last.set(v.matterId,entryId);
 }
 for(const [matterId,entryId] of last)writes.push(...budgetAlerts(db,actor,matterId,entryId,at));
 writes.push(stmt(db,"UPDATE s_bulk_work_batches SET status='posted',posted_at=?,post_request_id=? WHERE id=?",at,requestId,batchId),audit(db,actor,'bulk_work.posted',batchId,canonical({requestId,reviewDigest:b.review_digest,rows:review.length})));
 await atomic(db,actor,writes);return batchJson(await readBatch(db,actor,batchId),actor);
}
