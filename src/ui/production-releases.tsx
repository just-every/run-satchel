import {api,Field,Form,type Row,type Run} from './common';

export function ProductionReleases({packet,actor,run}:{packet:Row;actor:Row;run:Run}){
 return <section aria-label="Recipient releases"><h4>Recipient releases</h4>
  {packet.status==='approved'&&actor.role==='owner'&&<>
   <button type="button" onClick={()=>run(()=>api('/productions/'+packet.id+'/invite-recipient',{}),'Recipient invitation requested')}>Invite named recipient</button>
   <p>Invite the named recipient to authenticate, then authorize this exact packet. Send the release address to that recipient separately.</p>
   <Form label="Authorize recipient release" submit={data=>run(()=>api('/productions/'+packet.id+'/release',{sha256:packet.sha256,recipientEmail:packet.snapshot.recipient.email,expiresAt:new Date(String(data.expiresAt)).toISOString(),reason:data.reason}),'Exact packet released to named recipient')}>
    <Field label="Recipient access expires" name="expiresAt" type="datetime-local"/>
    <Field label="Principal release authorization" name="reason"/>
   </Form>
  </>}
  {(packet.shares??[]).map((share:Row)=><div className="record" key={share.id}>
   <strong>{share.recipientEmail} · {share.status}</strong>
   <p>Expires {new Date(share.expiresAt).toLocaleString()}</p>
   <a href={share.recipientPath}>Open recipient release</a>
   <p className="document-hash">Exact packet SHA-256 {share.sha256}</p>
   {share.openedAt&&<p>Opened {share.openedAt}. Disclosure remains recorded.</p>}
   {share.receipts.map((receipt:Row)=><p className="document-hash" key={receipt.id}>Delivery receipt {receipt.id} · {receipt.size} bytes · {receipt.servedAt} · SHA-256 {receipt.sha256}</p>)}
   {!share.openedAt&&!share.recalledAt&&actor.role==='owner'&&<Form label="Recall unopened release" submit={data=>run(()=>api('/production-shares/'+share.id+'/recall',{reason:data.reason}),'Unopened recipient release recalled')}><Field label="Recipient recall reason" name="reason"/></Form>}
   {share.recalledAt&&<p>Recalled {share.recalledAt}: {share.recallReason}</p>}
  </div>)}
 </section>;
}
