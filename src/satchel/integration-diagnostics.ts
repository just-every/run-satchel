import {rows,type Actor,type Data} from './model';
import {integrationState} from './integrations';
import {connectorJournal} from './integration-journal';
import {agentRoles} from './role-doors';

// These are installation grants and receiver acknowledgments, never evidence
// that a receiver completed its own work. Do not return credentials or endpoints.
export async function integrationDiagnostics(db:D1Database,actor:Actor){
 const {integrations}=await integrationState(db,actor),observations=await rows(db,`SELECT i.id,o.status sponsor_status,
  CASE WHEN o.role='owner' THEN 'owner' ELSE m.role END sponsor_role
  FROM s_integrations i LEFT JOIN oa_operators o ON o.id=i.owner_id LEFT JOIN s_members m ON m.email=o.email AND m.active=1`);
 const connectors=[],work=[];
 for(const i of integrations as Data[]){
  const observation=observations.find(o=>o.id===i.id)!;
  const authorization=i.revoked?'revoked':observation.sponsor_status!=='active'||!agentRoles.includes(observation.sponsor_role)?'reauthorization_required':'authorized';
  const journal=await connectorJournal(db,actor,i.id);
  work.push(...(journal.deliveries as Data[]).map(d=>({status:d.status,due_at:d.source_at})));
  connectors.push({id:'integration:'+i.id,name:i.label,authorization,deliveryPaused:!!i.paused,tokenExpiresAt:null,lastSuccessfulReadAt:null,
   lastAcceptedAt:journal.health.lastSuccessfulSync,lastHttpStatus:journal.attempts.at(-1)?.http_status??null,reviewedAt:null,costCents:null,
   nextAction:authorization==='revoked'?'Create a fresh scoped integration only after reviewing its sponsor and permitted matters.':authorization==='reauthorization_required'?'Review the current sponsor and create a fresh scoped integration with an active principal.':i.paused?'Open the integration journal, reconcile uncertain deliveries and explicitly resume only after the receiver is ready.':'Open the integration journal to inspect receiver acknowledgments and reconcile downstream completion. Receiver costs and credential expiry are not observed.'});
 }
 return {connectors,work};
}
