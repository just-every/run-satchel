import {digest,insist,stmt,type Data} from './model';

const refusal='Confidential economics must stay in authenticated internal reporting';
// This classifies native bytes and structured native cost records. It grants no
// authority and makes no claim to stop a person transcribing a downloaded copy.
export async function refuseEconomicsCapture(db:D1Database,bytes:Uint8Array,knownHash?:string,references=new Set<string>()){
 const hash=knownHash??await digest(bytes);
 insist(!await stmt(db,'SELECT 1 FROM s_economics_artifact_fences WHERE artifact_sha256=?',hash).first(),refusal,422);
 let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return;}
 insist(!value||typeof value!=='object'||Array.isArray(value)||(value as Data).kind!=='satchel.economics',refusal,422);
 const encoded=JSON.stringify(value),payloadHash=await digest(encoded);
 insist(!await stmt(db,'SELECT 1 FROM s_economics_artifact_fences WHERE payload_sha256=?',payloadHash).first(),refusal,422);
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const {manifest,...payload}=value as Data;
  if(manifest&&typeof manifest==='object'&&typeof manifest.payloadSha256==='string'&&await digest(JSON.stringify(payload))===manifest.payloadSha256)
   insist(!await stmt(db,'SELECT 1 FROM s_economics_artifact_fences WHERE payload_sha256=?',manifest.payloadSha256).first(),refusal,422);
 }
 await refuseEconomicsValue(db,value,references);
}
// Every native JSON mutation uses this boundary before retaining user content.
// It also covers nested report objects, structured text and encoded originals;
// native archives have their separate principal-only custody door.
export async function refuseEconomicsValue(db:D1Database,value:unknown,references=new Set<string>()){
 const pending:unknown[]=[value];
 while(pending.length){
  const item=pending.pop();
  if(typeof item==='string'){
   if(/^[\s]*[\[{]/.test(item)){try{pending.push(JSON.parse(item));}catch{}}
   continue;
  }
  if(!item||typeof item!=='object')continue;
  if(Array.isArray(item)){for(const child of item)pending.push(child);continue;}
  const row=item as Data;
  insist(row.kind!=='satchel.economics'&&!(row.formulas&&row.totals&&Array.isArray(row.matters)&&row.totals.costCoverage&&row.totals.metricBasis),refusal,422);
  if(('hourly_cents'in row||'hourlyCents'in row)){
   const reference=row.revision??row.id??row.approvalId;if(typeof reference==='string'&&reference.length<=100)references.add(reference);
  }
  for(const [key,v] of Object.entries(row)){
   if(['contentBase64','content_base64'].includes(key)&&typeof v==='string'&&v.length>0&&v.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(v)){
    let bytes:Uint8Array|undefined;try{bytes=Uint8Array.from(atob(v),c=>c.charCodeAt(0));}catch{}
    if(bytes)await refuseEconomicsCapture(db,bytes,undefined,references);
   }else if(v&&(['object','string'].includes(typeof v)))pending.push(v);
  }
 }
 if(references.size)insist(!await stmt(db,'SELECT 1 FROM s_staff_cost_revisions WHERE id IN(SELECT value FROM json_each(?)) UNION ALL SELECT 1 FROM s_staff_cost_rates WHERE id IN(SELECT value FROM json_each(?)) LIMIT 1',JSON.stringify([...references]),JSON.stringify([...references])).first(),refusal,422);
}
export async function refuseEconomicsText(db:D1Database,value:string){
 // Ordinary letters and messages take no extra database read.
 if(/^[\s]*[\[{]/.test(value))await refuseEconomicsCapture(db,new TextEncoder().encode(value));
}
