import {api,Empty,Field,Form,type Row,type Run} from './common';

function ReceiverEvidence({record}:{record:Row}){
 return <div className="review">
  <p><strong>Principal recorded: {record.decision==='received'?'Received':'Not received'}</strong></p>
  <p>This is a human-recorded receiver outcome, not independently verified.</p>
  <dl><dt>External reference</dt><dd>{record.external_reference}</dd>
   <dt>Evidence from receiver</dt><dd style={{whiteSpace:'pre-wrap'}}>{record.evidence}</dd>
   <dt>Recorded by</dt><dd>{record.recorded_by}</dd>
   <dt>Recorded at</dt><dd>{record.recorded_at}</dd></dl>
 </div>;
}

function DeliveryRecord({integration,delivery,reconciliations,run,reload}:{integration:Row;delivery:Row;reconciliations:Row[];run:Run;reload:()=>Promise<void>}){
 return <article className="record" aria-label={'Delivery '+delivery.event_id}>
  <strong>{delivery.kind} · {delivery.status}</strong>
  <p>Delivery status: <span className="badge">{String(delivery.status).replaceAll('_',' ')}</span></p>
  <dl><dt>Event ID</dt><dd>{delivery.event_id}</dd>
   <dt>Source matter ID</dt><dd>{delivery.matter_id??'No matter source'}</dd>
   <dt>Source record ID</dt><dd>{delivery.object_id??'No record source'}</dd>
   <dt>Latest attempt</dt><dd>{delivery.lastAttemptSequence??'No attempt recorded'}</dd></dl>
  <p><strong>Next action:</strong> {delivery.nextAction}</p>
  {delivery.completionEvidence&&<p style={{whiteSpace:'pre-wrap'}}><strong>Completion evidence:</strong> {delivery.completionEvidence}<br/><small>Not independently verified.</small></p>}
  {reconciliations.map((record,index)=><ReceiverEvidence key={record.recorded_at+':'+index} record={record}/>)}
  {delivery.status==='uncertain'&&<>
   <p className="notice">No automatic resend occurs while this delivery is uncertain. Ask the receiver to check this event ID, then record their outcome and evidence.</p>
   {!integration.revoked&&<Form key={delivery.event_id+':'+delivery.lastAttemptSequence} label="Record receiver reconciliation" submit={data=>run(async()=>{
    await api('/integrations/'+integration.id+'/reconcile',{eventId:delivery.event_id,attemptSequence:delivery.lastAttemptSequence,decision:data.decision,externalReference:data.externalReference,evidence:data.evidence});
    await reload();
   },'Receiver outcome recorded by the principal; inspect the next delivery action')}>
    <Field label="Receiver outcome" name="decision"><select required name="decision" aria-label="Receiver outcome" defaultValue=""><option value="">Choose the receiver outcome</option><option value="received">Received</option><option value="not_received">Not received</option></select></Field>
    <Field label="External reference" name="externalReference"/>
    <Field label="Evidence from receiver" name="evidence"><textarea required name="evidence" aria-label="Evidence from receiver" rows={4}/></Field>
    <small>This records the principal’s assessment of the receiver’s evidence. Satchel does not independently verify it.</small>
   </Form>}
  </>}
  {!integration.revoked&&delivery.status==='delivered'&&<div className="actions"><button className="quiet" onClick={()=>run(async()=>{
   await api('/integrations/'+integration.id+'/dispatch',{eventId:delivery.event_id});await reload();
  },'Event re-delivery attempted with the same event ID; inspect the recorded outcome')}>Re-deliver event</button><small>The event ID stays the same so the receiver can deduplicate it.</small></div>}
 </article>;
}

export function ConnectorJournal({integration,journal,run,reload}:{integration:Row;journal:Row;run:Run;reload:()=>Promise<void>}){
 const health=journal.health;
 return <div className="review" aria-label="Integration delivery journal" style={{overflowWrap:'anywhere'}}>
  <h3>Connection health</h3>
  <dl><dt>Last receiver HTTP acceptance</dt><dd>{health.lastSuccessfulSync??'No HTTP acceptance recorded'}</dd>
   <dt>Last principal-recorded confirmation</dt><dd>{health.lastHumanConfirmation??'No human confirmation recorded'}</dd>
   <dt>Queued deliveries</dt><dd>{health.queued}</dd>
   <dt>Uncertain deliveries</dt><dd>{health.uncertain}</dd>
   <dt>Failed deliveries</dt><dd>{health.failed}</dd></dl>
  <p>HTTP acceptance records the receiver’s response. Principal-recorded confirmation comes from receiver evidence entered by a person and is not independently verified.</p>
  <p className="notice"><strong>Next action:</strong> {health.nextAction}</p>
  <h3>Deliveries and receiver evidence</h3>
  {!journal.deliveries.length&&<Empty>No delivery events recorded.</Empty>}
  {journal.deliveries.map((delivery:Row)=><DeliveryRecord key={delivery.event_id} integration={integration} delivery={delivery} reconciliations={journal.reconciliations.filter((record:Row)=>record.event_id===delivery.event_id)} run={run} reload={reload}/>)}
  <h3>Delivery attempts</h3>
  {!journal.attempts.length?<p>No delivery attempts recorded.</p>:<div className="table-scroll"><table><thead><tr><th>Attempt</th><th>Event ID</th><th>Recorded at</th><th>Outcome</th><th>HTTP status</th></tr></thead><tbody>{journal.attempts.map((attempt:Row)=><tr key={attempt.sequence}><td>{attempt.sequence}</td><td>{attempt.event_id}</td><td>{attempt.at}</td><td>{String(attempt.outcome).replaceAll('_',' ')}</td><td>{attempt.http_status??'No response recorded'}</td></tr>)}</tbody></table></div>}
  {!integration.revoked&&integration.matterIds.length>0&&<details><summary>Remove matter authorization</summary>
   <p>Remove the integration’s access to a matter. Information already received remains with the receiver.</p>
   <Form key={integration.generation} label="Remove matter from integration" submit={data=>run(async()=>{
    await api('/integrations/'+integration.id+'/matter-access',{matterId:data.matterId,generation:integration.generation});await reload();
   },'Matter authorization removed; inspect the updated integration and delivery journal')}>
    <Field label="Matter to remove" name="matterId"><select required name="matterId" aria-label="Matter to remove" defaultValue=""><option value="">Choose a permitted matter</option>{integration.matterIds.map((matterId:string)=><option key={matterId} value={matterId}>{matterId}</option>)}</select></Field>
   </Form>
  </details>}
 </div>;
}
