import {Fault,matter,rows,type Actor,type Data} from './model';
// Effective work dates and immutable issued source snapshots reconstruct whether
// recorded work was still unbilled at cutoff, including later void and rebill.
export async function unbilledWork(db:D1Database,a:Actor,matterId:string,asOf:string){
 const entries=await rows(db,"SELECT e.* FROM s_entries e WHERE e.date<=? AND (e.matter_id=? OR EXISTS(SELECT 1 FROM s_entry_edits x WHERE x.entry_id=e.id AND (json_extract(x.changes,'$.matterId.before')=? OR json_extract(x.changes,'$.matterId.after')=?))) ORDER BY e.date,e.created_at,e.id",asOf,matterId,matterId,matterId),result:Data[]=[];
 for(const e of entries){try{await matter(db,a,e.matter_id);}catch(error){if(error instanceof Fault&&error.status===404)continue;throw error;}
  const at:Data={matterId:e.matter_id,amountCents:e.amount_cents,description:e.description};const edits=await rows(db,'SELECT changes FROM s_entry_edits WHERE entry_id=? AND substr(at,1,10)>? ORDER BY rowid DESC',e.id,asOf);
  for(const edit of edits)for(const [key,change] of Object.entries(JSON.parse(edit.changes)) as [string,Data][])if(key in at)at[key]=change.before;
  if(at.matterId!==matterId||e.billable===0)continue;
  const billed=await rows(db,"SELECT b.id FROM s_bills b LEFT JOIN s_bill_tax_approvals t ON t.bill_id=b.id LEFT JOIN s_invoice_issues i ON i.bill_id=b.id WHERE json_extract(b.snapshot,'$.date')<=? AND (b.voided_at IS NULL OR substr(b.voided_at,1,10)>?) AND (i.bill_id IS NOT NULL OR (json_extract(COALESCE(t.snapshot,b.snapshot),'$.numberingCutover') IS NOT 1 AND b.approved_at IS NOT NULL AND b.artifact IS NOT NULL)) AND EXISTS(SELECT 1 FROM json_each(b.snapshot,'$.lines') l WHERE json_extract(l.value,'$.sourceId')=?)",asOf,asOf,e.id);
  if(!billed.length)result.push({id:e.id,kind:e.kind,date:e.date,description:at.description,cents:at.amountCents,matterId});
 }
 return result;
}
