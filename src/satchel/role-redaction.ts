import {rows,type Actor,type Data} from './model';
import {localPath} from './role-doors';
// FIRM-008: rate and bank visibility applied to every JSON response of a member whose custom role
// narrows them. Redaction nulls the value and marks the object, so a hidden figure is never mistaken for zero.
const hourly=['rateCents','amountCents','priorAmountCents','correctedAmountCents','discountBps','unitCostCents','rateSource','rateRuleId','adjustmentCents','baseCents','currentAmountCents','priorBaseCents','correctedBaseCents','taxCents','priorTaxCents','correctedTaxCents','totalCents'];
// Frozen CSV, LEDES and XML text carries every timekeeper's rate and cannot be redacted line by line.
const frozenText=['artifact','xml'];
const objectOwnerKeys=['timekeeperEmail','createdBy','ownerEmail','owner_email','timekeeper'];
const isObject=(v:unknown):v is Data=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
function collect(value:unknown,ids:Set<string>){
 if(Array.isArray(value)){for(const v of value)collect(v,ids);return;}
 if(!isObject(value))return;
 if((typeof value.sourceId==='string'||'rateCents' in value||'unitCostCents' in value||'minutes' in value)&&typeof (value.sourceId??value.id)==='string')ids.add(String(value.sourceId??value.id));
 for(const v of Object.values(value))collect(v,ids);
}
// Who recorded the time behind an entry, draft or bill line: the only attribution rate visibility needs.
async function owners(db:D1Database,ids:Set<string>){
 if(!ids.size)return new Map<string,{owner:string;kind:string}>();
 const found=await rows(db,"SELECT id,COALESCE(timekeeper_email,created_by) owner,kind FROM s_entries WHERE id IN (SELECT value FROM json_each(?)) UNION ALL SELECT id,owner_email owner,'time' kind FROM s_time_drafts WHERE id IN (SELECT value FROM json_each(?))",JSON.stringify([...ids]),JSON.stringify([...ids]));
 return new Map(found.map(r=>[r.id as string,{owner:r.owner as string,kind:r.kind as string}]));
}
function ownedBy(o:Data,email:string,map:Map<string,{owner:string;kind:string}>){
 for(const k of objectOwnerKeys)if(k in o&&k==='timekeeperEmail')return o[k]===null||o[k]===email;
 for(const k of objectOwnerKeys)if(typeof o[k]==='string')return o[k]===email;
 const mapped=map.get(String(o.sourceId??o.id));
 return mapped?.owner===email;
}
function rates(value:unknown,actor:Actor,map:Map<string,{owner:string;kind:string}>,mode:'none'|'own',parent=''):unknown{
 if(Array.isArray(value))return value.map(v=>rates(v,actor,map,mode,parent));
 if(!isObject(value))return value;
 const out:Data={};
 const timeLike=map.get(String(value.sourceId??value.id))?.kind==='time'||value.kind==='time'||typeof value.unitCostCents==='number'||(!('kind' in value)&&typeof value.rateCents==='number');
 const hide=timeLike&&parent!=='firmDefault'&&(mode==='none'||!ownedBy(value,actor.email,map));
 for(const [k,v] of Object.entries(value)){
  if(frozenText.includes(k)&&typeof v==='string'){out[k]=null;continue;}
  if(k==='defaultRateCents'&&mode==='none'){out[k]=null;continue;}
  if(parent==='firmDefault'&&k==='rateCents'&&mode==='none'){out[k]=null;continue;}
  if(hide&&hourly.includes(k)){out[k]=null;continue;}
  out[k]=rates(v,actor,map,mode,k);
 }
 if(hide)out.rateRedacted=true;
 return out;
}
const accountKeys=['id','name','kind','balance_cents'],ledgerKeys=['id','account_id','matter_id','title','matter_number','client','balance_cents','available_cents'];
const pick=(r:Data,keys:string[])=>Object.fromEntries(keys.filter(k=>k in r).map(k=>[k,r[k]]));
function bankView(path:string,value:unknown,level:string):unknown{
 if(level==='full')return value;
 if(path==='/trust'&&isObject(value))return {accounts:(value.accounts as Data[]).map(a=>pick(a,accountKeys)),ledgers:(value.ledgers as Data[]).map(l=>pick(l,ledgerKeys)),openings:[],entries:[],clearings:[]};
 return value;
}
// Trust custody inside a bill row is bank data; a role without full bank access sees that no transfer is shown, not its figures.
function withoutTrust(value:unknown):unknown{
 if(Array.isArray(value))return value.map(withoutTrust);
 if(!isObject(value))return value;
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['trustPayment','trustBalanceCents','trustLedgers','payment_snapshot','paymentSnapshot'].includes(k)?null:withoutTrust(v)]));
}
function firmView(value:unknown):unknown{
 if(!isObject(value)||!isObject(value.firm))return value;
 const f=value.firm,s=isObject(f.settings)?f.settings:f;
 return {...value,firm:{name:s.name,timezone:s.timezone,currency:s.currency}};
}
export async function redact(db:D1Database,actor:Actor,path:string,result:unknown):Promise<unknown>{
 const g=actor.grants;if(!g||result instanceof Response)return result;
 const p=localPath(path);let out=result;
 if(g.bank!=='full'){out=bankView(p,out,g.bank);out=withoutTrust(out);}
 if(g.settings==='none'&&(p==='/state'||p==='/agent/context'))out=firmView(out);
 if(g.rates!=='all'){const ids=new Set<string>();collect(out,ids);out=rates(out,actor,await owners(db,ids),g.rates);}
 return out;
}
