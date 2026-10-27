import {atomic,audit,human,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
export async function settlementEpoch(db:D1Database){return (await stmt(db,'SELECT epoch FROM s_settlement_authority WHERE id=1').first<Data>())!.epoch as string;}
export async function currentSettlementPolicy(db:D1Database){
 const epoch=await settlementEpoch(db),p=await stmt(db,'SELECT * FROM s_settlement_policy WHERE authority_epoch=? ORDER BY version DESC LIMIT 1',epoch).first<Data>();
 return p?{version:p.version,solePractitionerEnabled:Boolean(p.enabled),reason:p.reason,scope:p.scope,actor:p.actor,effectiveAt:p.at,epoch}:{version:0,solePractitionerEnabled:false,reason:'Separate people required by default',scope:'All firm contingency settlements',actor:null,effectiveAt:null,epoch};
}
export async function settlementPolicy(db:D1Database,a:Actor){human(a);need(a,'owner');const {epoch,...current}=await currentSettlementPolicy(db);return {...current,history:await rows(db,'SELECT version,enabled,reason,scope,actor,at FROM s_settlement_policy ORDER BY version DESC')};}
export async function saveSettlementPolicy(db:D1Database,a:Actor,b:Data){
 human(a);need(a,'owner');const current=await currentSettlementPolicy(db);
 insist(b.previousVersion===current.version,'Review the current settlement approval setting',409);insist(typeof b.solePractitionerEnabled==='boolean','Choose the settlement approval separation setting');
 const reason=text(b.reason,'Reason for the recorded separation setting',2000),scope=text(b.scope,'Scope of the recorded separation setting',1000),max=(await stmt(db,'SELECT COALESCE(MAX(version),0) version FROM s_settlement_policy').first<Data>())!.version,at=now();
 await atomic(db,a,[guard(db,'COALESCE((SELECT MAX(version) FROM s_settlement_policy),0)=?',max),stmt(db,'INSERT INTO s_settlement_policy VALUES(?,?,?,?,?,?,?)',max+1,b.solePractitionerEnabled?1:0,reason,scope,a.email,at,current.epoch),audit(db,a,'settlement.policy_recorded',String(max+1),'',{version:max+1,enabled:b.solePractitionerEnabled,scope,reason})]);
 return settlementPolicy(db,a);
}
export function settlementPolicyGuard(db:D1Database,version:number,epoch:string){return guard(db,'(SELECT epoch FROM s_settlement_authority WHERE id=1)=? AND COALESCE((SELECT MAX(version) FROM s_settlement_policy WHERE authority_epoch=?),0)=?',epoch,epoch,version);}
