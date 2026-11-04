import {human,insist,need,rows,stmt,text,type Actor,type Data} from './model';
import {accountTrustAccess} from './trust-reports';
import {retainerAlert} from './trust-retainers';
import {listTrustStatementReleases} from './trust-statement-releases';
import {portalAccess} from './portal';

// This inspector exposes existing publication decisions, never a new grant.
export async function trustClientReview(db:D1Database,actor:Actor,ledgerId:string){
 human(actor);need(actor,'owner');
 const ledger=await stmt(db,'SELECT * FROM s_trust_ledgers WHERE id=?',text(ledgerId,'Client ledger')).first<Data>();
 insist(ledger,'Client ledger not found',404);
 await accountTrustAccess(db,actor,ledger.account_id);
 const {releases}=await listTrustStatementReleases(db,actor,ledger.id);
 const policies=await rows(db,'SELECT * FROM s_retainer_policies WHERE ledger_id=? ORDER BY rowid DESC',ledger.id);
 const packets=await rows(db,`SELECT p.id,p.version,p.digest,p.signed_by,p.signed_at,p.snapshot,t.start_date,t.end_date FROM s_trust_packets p JOIN s_trust_periods t ON t.id=p.period_id WHERE t.account_id=? AND EXISTS(SELECT 1 FROM json_each(p.snapshot,'$.clientStatements') s WHERE json_extract(s.value,'$.ledgerId')=?) AND (SELECT kind FROM s_trust_period_events WHERE period_id=t.id ORDER BY sequence DESC LIMIT 1)='signed' AND (SELECT packet_id FROM s_trust_period_events WHERE period_id=t.id ORDER BY sequence DESC LIMIT 1)=p.id ORDER BY t.end_date DESC,p.version DESC`,ledger.account_id,ledger.id);
 // Check each prospective recipient, rather than the staff inspector.
 const eligible=[];
 for(const grant of await rows(db,"SELECT g.id,g.email,g.kind,m.name FROM s_portal_grants g JOIN s_members m ON m.email=g.email WHERE g.matter_id=? AND g.revoked_at IS NULL AND g.kind IN('client','co_client') ORDER BY m.name,g.id",ledger.matter_id)){
  if(await stmt(db,'SELECT 1 WHERE '+portalAccess('?', ['client','co_client']),grant.email,ledger.matter_id).first())eligible.push(grant);
 }
 const requests=await rows(db,'SELECT id,snapshot,recipient,created_by,created_at,reason FROM s_retainer_requests WHERE ledger_id=? ORDER BY created_at,id',ledger.id);
 return {ledgerId:ledger.id,matterId:ledger.matter_id,packets:packets.map(({snapshot,...p})=>({...p,statement:JSON.parse(snapshot).clientStatements.find((s:Data)=>s.ledgerId===ledger.id)})),recipients:eligible,releases,policies,alert:policies.length?await retainerAlert(db,actor,ledger.id):null,
  requests:requests.map(r=>({...r,snapshot:JSON.parse(r.snapshot)}))};
}
