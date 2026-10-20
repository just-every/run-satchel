import {atomic,audit,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';

function principal(actor:Actor) {human(actor);need(actor,'owner');}
async function connector(db:D1Database,integrationId:string) {
 const record=await stmt(db,'SELECT id,matter_ids,event_types,enabled_at,endpoint,revoked,paused,generation FROM s_integrations WHERE id=?',integrationId).first<Data>();
 insist(record,'Integration not found',404);return record;
}
function currentStatus(delivery:Data,at:string) {
 return delivery.status==='sending'&&(!delivery.lease_until||delivery.lease_until<=at)?'uncertain':delivery.status;
}
function action(status:string,record:Data) {
 if(status==='uncertain')return 'Confirm receipt with the receiver and record the external reference and evidence before deciding whether to retry.';
 if(status==='sending')return 'Wait for the active delivery attempt to finish; if its lease expires, confirm receipt with the receiver.';
 if(status==='delivered')return 'No delivery action required; HTTP acceptance or a principal confirmation does not verify downstream completion.';
 if(status==='refused')return 'Delivery is refused under the current integration or matter authorization.';
 if(record.revoked)return 'Integration is revoked; no further delivery is permitted.';
 if(record.paused)return 'Review the receiver and resume delivery when ready.';
 if(status==='failed')return 'Review the HTTP reply and receiver before explicitly retrying the stable event ID.';
 return 'Dispatch the queued event using its stable event ID.';
}

/** Read-only projection of durable source events, delivery state and human evidence. */
export async function connectorJournal(db:D1Database,actor:Actor,integrationId:string) {
 principal(actor);
 const record=await connector(db,integrationId),at=now(),allowed=new Set<string>(JSON.parse(record.matter_ids));
 const [attempts,reconciliations,sources]=await Promise.all([
  rows(db,`SELECT a.*,e.kind,e.matter_id,e.object_id FROM s_webhook_attempts a LEFT JOIN s_integration_events e ON e.id=a.event_id WHERE a.integration_id=? ORDER BY a.sequence`,integrationId),
  rows(db,'SELECT * FROM s_connector_reconciliations WHERE integration_id=? ORDER BY recorded_at,attempt_sequence',integrationId),
  rows(db,`SELECT e.id event_id,e.kind,e.matter_id,e.object_id,e.sequence source_sequence,e.at source_at,
   d.status,d.lease_until FROM s_integration_events e LEFT JOIN s_webhook_deliveries d ON d.event_id=e.id AND d.integration_id=?
   WHERE d.event_id IS NOT NULL OR (? IS NOT NULL AND e.at>=? AND e.kind IN(SELECT value FROM json_each(?))) ORDER BY e.sequence`,
   integrationId,record.endpoint,record.enabled_at,record.event_types),
 ]);
 const latest=new Map<string,Data>(),confirmation=new Map<string,Data>();
 for(const attempt of attempts)latest.set(attempt.event_id,attempt);
 for(const reconciliation of reconciliations)confirmation.set(reconciliation.event_id,reconciliation);
 const deliveries=sources.map(source=>{
  const last=latest.get(source.event_id),humanEvidence=confirmation.get(source.event_id);
  const virtual=source.status===null;
  const status=currentStatus({...source,status:virtual?(record.revoked||!allowed.has(source.matter_id)?'refused':'queued'):source.status},at);
  let completionEvidence:string|null=null;
  if(status==='delivered'&&last?.outcome==='reconciled_received'&&humanEvidence?.decision==='received') {
   completionEvidence=`Principal-recorded receipt confirmation by ${humanEvidence.recorded_by} at ${humanEvidence.recorded_at}; reference ${humanEvidence.external_reference}. ${humanEvidence.evidence} Provider completion has not been independently verified.`;
  } else if(status==='delivered'&&last?.outcome==='delivered') {
   completionEvidence=`Receiver returned HTTP ${last.http_status} at ${last.at}. This records HTTP acceptance; downstream completion is not verified.`;
  }
  return {...source,integration_id:integrationId,status,virtual,lastAttemptSequence:last?.sequence??0,lastAttemptAt:last?.at??null,
   http_status:last?.http_status??null,httpReply:last?.http_status?`HTTP ${last.http_status}`:null,
   completionEvidence,nextAction:action(status,record)};
 });
 const successful=attempts.filter(a=>a.outcome==='delivered');
 const health={lastSuccessfulSync:successful.at(-1)?.at??null,lastHumanConfirmation:reconciliations.at(-1)?.recorded_at??null,
  queued:deliveries.filter(d=>d.status==='queued').length,uncertain:deliveries.filter(d=>d.status==='uncertain').length,
  failed:deliveries.filter(d=>d.status==='failed').length,nextAction:''};
 health.nextAction=health.uncertain?action('uncertain',record):health.failed?action('failed',record):health.queued?action('queued',record):record.revoked?action('refused',record):record.paused?action('queued',record):'No queued, uncertain or failed deliveries require action.';
 return {attempts,deliveries,reconciliations,health};
}

/** Human evidence resolves one exact uncertain attempt; this does not contact the provider. */
export async function reconcileConnector(db:D1Database,actor:Actor,integrationId:string,body:Data) {
 principal(actor);
 const eventId=text(body.eventId,'Source event ID',100),attemptSequence=integer(body.attemptSequence,'Attempt sequence',1,Number.MAX_SAFE_INTEGER);
 insist(body.decision==='received'||body.decision==='not_received','Choose received or not_received');
 const decision=body.decision as 'received'|'not_received',externalReference=text(body.externalReference,'External reference',1000),evidence=text(body.evidence,'Human confirmation evidence',4000);
 await connector(db,integrationId);
 const at=now(),delivery=await stmt(db,`SELECT d.*,e.matter_id,
  (SELECT MAX(sequence) FROM s_webhook_attempts WHERE integration_id=d.integration_id AND event_id=d.event_id) last_sequence
  FROM s_webhook_deliveries d JOIN s_integration_events e ON e.id=d.event_id WHERE d.integration_id=? AND d.event_id=?`,integrationId,eventId).first<Data>();
 insist(delivery&&delivery.last_sequence===attemptSequence&&currentStatus(delivery,at)==='uncertain','The delivery or attempt changed. Refresh before recording confirmation.',409);
 const fence=id();
 const reconciliation={integration_id:integrationId,event_id:eventId,attempt_sequence:attemptSequence,decision,external_reference:externalReference,evidence,evidence_source:'principal-recorded',recorded_by:actor.email,recorded_at:at};
 await atomic(db,actor,[
  stmt(db,`INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(
   SELECT 1 FROM s_webhook_deliveries d WHERE d.integration_id=? AND d.event_id=?
   AND (d.status='uncertain' OR (d.status='sending' AND (d.lease_until IS NULL OR d.lease_until<=?)))
   AND (SELECT MAX(a.sequence) FROM s_webhook_attempts a WHERE a.integration_id=d.integration_id AND a.event_id=d.event_id)=?
   AND EXISTS(SELECT 1 FROM s_integrations i WHERE i.id=d.integration_id)
  ) THEN 1 ELSE 0 END`,fence,integrationId,eventId,at,attemptSequence),
  stmt(db,`INSERT INTO s_connector_reconciliations(integration_id,event_id,attempt_sequence,decision,external_reference,evidence,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?)`,integrationId,eventId,attemptSequence,decision,externalReference,evidence,actor.email,at),
  stmt(db,`UPDATE s_webhook_deliveries SET status=CASE WHEN ?='received' THEN 'delivered'
   WHEN EXISTS(SELECT 1 FROM s_integrations i JOIN s_integration_events e ON e.id=? WHERE i.id=? AND i.revoked=0
    AND e.matter_id IN(SELECT value FROM json_each(i.matter_ids))) THEN 'queued' ELSE 'refused' END,
   claim=NULL,lease_until=NULL WHERE integration_id=? AND event_id=?`,decision,eventId,integrationId,integrationId,eventId),
  stmt(db,`INSERT INTO s_webhook_attempts(integration_id,event_id,at,outcome) VALUES(?,?,?,?)`,integrationId,eventId,at,'reconciled_'+decision),
  audit(db,actor,'integration.reconciled',integrationId,JSON.stringify({...reconciliation,providerVerified:false}),{matterId:delivery.matter_id}),
  stmt(db,'DELETE FROM s_guard WHERE id=?',fence),
 ]);
 const result=await stmt(db,'SELECT status FROM s_webhook_deliveries WHERE integration_id=? AND event_id=?',integrationId,eventId).first<Data>();
 return {ok:true,status:result!.status,reconciliation};
}

/** Narrow the existing explicit allowlist without rotating credentials or adding permissions. */
export async function revokeConnectorMatter(db:D1Database,actor:Actor,integrationId:string,body:Data) {
 principal(actor);
 const matterId=text(body.matterId,'Matter ID',100),generation=integer(body.generation,'Integration generation',1,Number.MAX_SAFE_INTEGER);
 const record=await connector(db,integrationId),matterIds=JSON.parse(record.matter_ids) as string[];
 insist(record.generation===generation&&matterIds.includes(matterId),'The permitted matters changed. Refresh before removing access.',409);
 const narrowed=matterIds.filter(value=>value!==matterId),fence=id();
 await atomic(db,actor,[
  stmt(db,`INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_integrations WHERE id=? AND generation=?
   AND ? IN(SELECT value FROM json_each(matter_ids))) THEN 1 ELSE 0 END`,fence,integrationId,generation,matterId),
  stmt(db,'UPDATE s_integrations SET matter_ids=?,generation=generation+1 WHERE id=? AND generation=?',JSON.stringify(narrowed),integrationId,generation),
  stmt(db,`UPDATE s_webhook_deliveries SET status='refused',claim=NULL,lease_until=NULL WHERE integration_id=?
   AND status IN('queued','failed') AND event_id IN(SELECT id FROM s_integration_events WHERE matter_id=?)`,integrationId,matterId),
  audit(db,actor,'integration.matter_revoked',integrationId,JSON.stringify({matterId,generation:generation+1}),{matterId}),
  stmt(db,'DELETE FROM s_guard WHERE id=?',fence),
 ]);
 return {ok:true,id:integrationId,matterIds:narrowed,generation:generation+1};
}
