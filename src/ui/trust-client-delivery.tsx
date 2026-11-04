import {useEffect,useState} from 'react';
import {api,dollars,Field,Form,type Row,type Run} from './common';

export function TrustClientDelivery({ledgers,run,tick}:{ledgers:Row[];run:Run;tick:number}){
 const [ledgerId,setLedgerId]=useState('');
 return <section className="panel" aria-label="Client trust delivery"><h2>Client trust delivery</h2>
  <p>Explicit principal approval publishes one exact statement or replenishment request to one current client or co-client. Publication sends no mail and moves no money.</p>
  <Field label="Client delivery ledger" name="deliveryLedger"><select value={ledgerId} onChange={e=>setLedgerId(e.target.value)}><option value="">Choose a client ledger</option>{ledgers.map(l=><option key={l.id} value={l.id}>{l.matter_number} · {l.client}</option>)}</select></Field>
  {ledgerId&&<LedgerDelivery key={ledgerId} ledgerId={ledgerId} run={run} tick={tick}/>}
 </section>;
}
function LedgerDelivery({ledgerId,run,tick}:{ledgerId:string;run:Run;tick:number}){
 const [view,setView]=useState<Row>(),[error,setError]=useState(''),[packetId,setPacketId]=useState('');
 const door='/trust/ledgers/'+ledgerId;
 useEffect(()=>{let active=true;setView(undefined);setError('');api(door+'/client-review').then(v=>{if(active)setView(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[ledgerId,tick]);
 const act=(job:()=>Promise<any>,notice:string)=>run(async()=>{setError('');try{return await job();}catch(e){setError((e as Error).message);throw e;}},notice);
 if(error&&!view)return <p role="alert" className="error">{error}</p>;
 if(!view)return <p>Opening exact client records…</p>;
 const packet=view.packets.find((p:Row)=>p.id===packetId),alert=view.alert;
 const recipient=<Field label="Trust publication recipient" name="recipient"><select name="recipient" required defaultValue=""><option value="" disabled>Choose a current client grant</option>{view.recipients.map((g:Row)=><option key={g.id} value={g.email}>{g.name} · {g.kind==='co_client'?'Co-client':'Client'}</option>)}</select></Field>;
 return <div style={{overflowWrap:'anywhere'}}>{error&&<p role="alert" className="error">{error}</p>}
  <h3>Signed statement release</h3><p>Only this client ledger is published. Account packets, bank references and supporting originals remain staff-only.</p>
  <Field label="Signed client statement" name="releasePacket"><select value={packetId} onChange={e=>setPacketId(e.target.value)}><option value="">Choose a current signed packet</option>{view.packets.map((p:Row)=><option key={p.id} value={p.id}>{p.start_date} to {p.end_date} · version {p.version}</option>)}</select></Field>
  {!view.packets.length&&<p>Sign a reconciliation packet before releasing its client statement.</p>}
  {!view.recipients.length&&<p>No eligible client grant. Review client portal sharing in Team &amp; safety.</p>}
  {packet&&<><p>Through {packet.statement.cutoffDate} · closing {dollars(packet.statement.closingBalanceCents)}</p><p>Officer signed {packet.signed_at} · {packet.signed_by}<br/>Packet SHA-256 {packet.digest}</p>
   <details><summary>Exact statement entries</summary><StatementEntries entries={packet.statement.entries.map((e:Row)=>({date:e.effective_date,kind:e.kind,cents:e.cents,runningBalanceCents:e.runningBalanceCents,id:e.id}))}/></details>
   {view.recipients.length>0&&<Form label="Release exact client statement" submit={b=>act(()=>api(door+'/releases',{...b,packetId:packet.id,packetDigest:packet.digest,confirmed:b.confirmed==='on'}),'Exact client statement published')}>{recipient}<Field label="Statement release reason" name="reason"/><label><input type="checkbox" name="confirmed" required/>I approve this exact signed client statement and recipient</label></Form>}
  </>}
  <details><summary>Statement publication history</summary>{!view.releases.length?<p>No statement has been released.</p>:view.releases.map((r:Row)=><article className="record" key={r.id}><strong>{r.revoked_at?'Withdrawn statement':'Published statement'} · {r.recipient}</strong><p>{r.created_by} · {r.created_at}</p>{r.revoked_at?<p>{r.revoked_by} · {r.revoked_at} · {r.revoke_reason}</p>:<Form label="Withdraw statement release" danger submit={b=>act(()=>api('/trust/statement-releases/'+r.id+'/revoke',b),'Statement release withdrawn')}><Field label="Statement withdrawal reason" name="reason"/></Form>}</article>)}</details>
  <h3>Retainer balance alert</h3>{!alert?<p>No approved retainer policy. Record one in Settings below.</p>:<><p><strong>{alert.low?'Below the approved threshold':'At or above the approved threshold'}</strong></p><dl><dt>Posted client balance</dt><dd>{dollars(alert.balanceCents)}</dd><dt>Low balance threshold</dt><dd>{dollars(alert.thresholdCents)}</dd><dt>Retainer target</dt><dd>{dollars(alert.targetCents)}</dd><dt>Requested replenishment</dt><dd>{dollars(alert.requestedCents)}</dd></dl>
   {alert.low&&alert.crossingEntryId&&view.recipients.length>0?<Form label="Publish exact replenishment request" submit={b=>act(()=>api(door+'/replenishments',{...b,reviewDigest:alert.reviewDigest,confirmed:b.confirmed==='on'}),'Approved replenishment request published')}>{recipient}<Field label="Replenishment approval reason" name="reason"/><label><input type="checkbox" name="confirmed" required/>I approve this exact balance alert, amount and recipient; this request authorizes no debit</label></Form>:<p>A posted transaction must cross the approved threshold before a request can be published.</p>}
  </>}
  <details><summary>Replenishment publication history</summary>{!view.requests.length?<p>No request has been published.</p>:view.requests.map((r:Row)=><article className="record" key={r.id}><strong>{dollars(r.snapshot.requestedCents)} requested · {r.recipient}</strong><p>Balance at approval {dollars(r.snapshot.balanceCents)} · {r.created_by} · {r.created_at}</p><p>{r.reason}. Historical publication; current recipient authority is rechecked at every client read.</p></article>)}</details>
  <details><summary>Settings</summary><h3>Retainer policy</h3><p>The principal approves each new threshold and target. Earlier versions remain in history. This policy grants no collection authority.</p><Form label="Approve retainer policy" submit={b=>act(()=>api(door+'/retainer-policy',{...b,thresholdCents:Number(b.thresholdCents),targetCents:Number(b.targetCents),confirmed:b.confirmed==='on'}),'Retainer policy version approved')}><Field label="Low retainer USD cents" name="thresholdCents" type="number"/><Field label="Target retainer USD cents" name="targetCents" type="number"/><Field label="Retainer policy reason" name="reason"/><label><input type="checkbox" name="confirmed" required/>I approve these exact retainer terms</label></Form>{view.policies.map((p:Row,i:number)=><p key={p.id}>{i===0?'Current':'Earlier'}: threshold {dollars(p.threshold_cents)} · target {dollars(p.target_cents)} · {p.approved_by} · {p.approved_at} · {p.reason}</p>)}</details>
 </div>;
}
function StatementEntries({entries}:{entries:Row[]}){
 return <ul>{entries.map(e=><li key={e.id}>{e.date} · {e.kind.replaceAll('_',' ')} · {dollars(e.cents)} · balance {dollars(e.runningBalanceCents)}</li>)}</ul>;
}
export function PortalTrustRecords({matterId}:{matterId:string}){
 const [view,setView]=useState<Row>(),[error,setError]=useState('');
 const load=async()=>{setView(undefined);setError('');try{const [statements,requests]=await Promise.all([api('/portal/matters/'+matterId+'/trust-statements'),api('/portal/matters/'+matterId+'/replenishments')]);setView({...statements,...requests});}catch(e){setError((e as Error).message);}};
 useEffect(()=>{void load();},[matterId]);
 return <section aria-label="Your trust records"><h3>Your trust records</h3><button type="button" className="quiet" onClick={()=>void load()}>Refresh trust records</button>{error&&<p role="alert" className="error">{error}</p>}
  {!view&&!error?<p>Opening published trust records…</p>:view&&<><h4>Released client statements</h4>{!view.statements.length?<p>No client trust statement is currently released to you.</p>:view.statements.map((s:Row)=><article className="record" key={s.id}><strong>Statement through {s.cutoffDate} · {dollars(s.closingBalanceCents)}</strong><p>Opening {dollars(s.openingBalanceCents)} · released {s.releasedAt}</p><StatementEntries entries={s.entries}/></article>)}
   <h4>Approved balance alerts and replenishment requests</h4>{!view.requests.length?<p>No approved replenishment request is currently published to you.</p>:view.requests.map((r:Row)=><article className="record" key={r.id}><strong>Requested replenishment {dollars(r.requestedCents)}</strong><p>Balance at approval {dollars(r.balanceCents)} · retainer target {dollars(r.targetCents)}</p><p>Published {r.deliveredAt}. This is a request only; it does not charge you or authorize a withdrawal. Contact your firm to arrange funding.</p></article>)}</>}
 </section>;
}
