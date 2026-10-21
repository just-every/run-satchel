import {matterScope,wallAllows} from './matter-scope';
import {atomic,audit,authority,date,human,insist,integer,matter,need,rows,stmt,text,type Actor,type Data} from './model';
type Filters={matterId?:string;from?:string;to?:string;actor?:string;action?:string;offset?:string;limit?:string};
async function query(db:D1Database,actor:Actor,f:Filters){
 human(actor);need(actor,'owner','lawyer');if(actor.role!=='owner')insist(await stmt(db,'SELECT 1 FROM s_ethical_walls WHERE custodian_email=? AND dissolved_at IS NULL',actor.email).first(),'Only an authorized custodian may inspect the audit',403);const clauses:string[]=[`(matter_id IS NOT NULL AND ${matterScope('s_audit.matter_id')} OR matter_id IS NULL AND NOT EXISTS(SELECT 1 FROM s_matters am WHERE NOT ${matterScope('am.id')}))`],values:any[]=[actor.role,actor.email,actor.role,actor.email];
 if(actor.role!=='owner'){clauses.push('EXISTS(SELECT 1 FROM s_ethical_walls custody WHERE custody.matter_id=s_audit.matter_id AND custody.custodian_email=? AND custody.dissolved_at IS NULL)');values.push(actor.email);}
 clauses.push(`NOT EXISTS(SELECT 1 FROM s_ethical_walls excluded_wall WHERE NOT ${wallAllows('excluded_wall.matter_id','?')} AND (instr(COALESCE(s_audit.evidence,''),excluded_wall.matter_id)>0 OR instr(s_audit.detail,excluded_wall.matter_id)>0 OR EXISTS(SELECT 1 FROM s_documents excluded_source WHERE excluded_source.matter_id=excluded_wall.matter_id AND (instr(COALESCE(s_audit.evidence,''),excluded_source.id)>0 OR instr(s_audit.detail,excluded_source.id)>0))))`);values.push(actor.email,actor.email);
 if(f.matterId){await matter(db,actor,f.matterId);clauses.push('matter_id=?');values.push(f.matterId);}
 if(f.from){clauses.push('at>=?');values.push(date(f.from)+'T00:00:00.000Z');}if(f.to){clauses.push('at<=?');values.push(date(f.to)+'T23:59:59.999Z');}
 if(f.from&&f.to)insist(f.from<=f.to,'From date cannot follow to date');
 if(f.actor){clauses.push('actor=?');values.push(text(f.actor,'Actor',254));}if(f.action){clauses.push('action=?');values.push(text(f.action,'Action',150));}
 return {where:clauses.length?' WHERE '+clauses.join(' AND '):'',values};
}
function record(r:Data){let detail:unknown=r.detail;try{detail=JSON.parse(r.detail);}catch{}return {id:r.id,at:r.at,actor:{id:r.actor_id,email:r.actor,role:r.role,channel:r.channel},action:r.action,objectId:r.object_id,matterId:r.matter_id,revision:r.revision,evidence:r.evidence?JSON.parse(r.evidence):null,detail,legacy:r.evidence===null};}
export async function actionAudit(db:D1Database,actor:Actor,f:Filters){const q=await query(db,actor,f),offset=f.offset===undefined?0:integer(Number(f.offset),'Audit offset',0,100000000),limit=f.limit===undefined?50:integer(Number(f.limit),'Audit page size',1,200);const count=await stmt(db,'SELECT COUNT(*) total FROM s_audit'+q.where,...q.values).first<Data>();return {records:(await rows(db,'SELECT * FROM s_audit'+q.where+' ORDER BY at,id LIMIT ? OFFSET ?',...q.values,limit,offset)).map(record),total:count!.total,offset,limit};}
export async function exportActionAudit(db:D1Database,actor:Actor,f:Filters){
 const q=await query(db,actor,f),upper=(await stmt(db,'SELECT COALESCE(MAX(rowid),0) n FROM s_audit').first<Data>())!.n;
 const fence=q.where+(q.where?' AND ':' WHERE ')+'rowid<=?',base=[...q.values,upper],count=(await stmt(db,'SELECT COUNT(*) n FROM s_audit'+fence,...base).first<Data>())!.n;
 await atomic(db,actor,[audit(db,actor,'audit.export_requested','audit',JSON.stringify({matterId:f.matterId??null,filters:f,recordCount:count,source:'Frozen append-only audit snapshot; delivery is not asserted'}))]);
 let cursor:{at:string;id:string}|undefined;const encoder=new TextEncoder();
 const stream=new ReadableStream<Uint8Array>({async pull(controller){try{
  const a=authority(actor);insist(await stmt(db,`SELECT 1 WHERE ${a.sql}`,...a.params).first(),'Audit authority was revoked',403);
  const page=await rows(db,'SELECT * FROM s_audit'+fence+(cursor?' AND (at>? OR (at=? AND id>?))':'')+' ORDER BY at,id LIMIT 200',...base,...(cursor?[cursor.at,cursor.at,cursor.id]:[]));
  if(page.length){controller.enqueue(encoder.encode(page.map(r=>JSON.stringify(record(r))).join('\n')+'\n'));cursor={at:page.at(-1)!.at,id:page.at(-1)!.id};}if(page.length<200)controller.close();
 }catch(error){controller.error(error);}}});
 return new Response(stream,{headers:{'content-type':'application/x-ndjson; charset=utf-8','content-disposition':'attachment; filename="satchel-action-audit.jsonl"','cache-control':'private, no-store','x-satchel-audit-count':String(count)}});
}
