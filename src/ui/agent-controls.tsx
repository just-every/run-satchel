import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';

function AgreementForm({keys,run}:{keys:Row[];run:Run}){
 return <details><summary>Review processing agreements</summary><Form label="Approve processing agreement" submit={d=>run(()=>api('/agent-agreements',{...d,confirmed:d.confirmed==='on',trainingAllowed:false}),'Processing agreement approved')}>
 <Field label="Agent key" name="keyId"><select aria-label="Agent key" name="keyId" required>{keys.filter(k=>!k.revoked).map(k=><option key={k.id} value={k.id}>{k.label}</option>)}</select></Field>
 <Field label="Named processor" name="processor"/><Field label="Model or native preparation revision" name="modelRevision"/>
 <Field label="Reviewed agreement reference" name="agreementReference"/><Field label="Retention and deletion terms" name="retentionTerms"/><Field label="No-training terms" name="trainingTerms"/>
 <Field label="Health-data agreement reference" name="healthReference" required={false}/><Field label="Agreement expiry (ISO instant)" name="expiresAt"/>
 <label className="check"><input type="checkbox" name="confirmed" required/>I reviewed the applicable terms, access and subprocessors. Firm data may not be used for training.</label>
 </Form></details>;
}
function DelegationForm({state,controls,keys,run}:{state:Row;controls:Row;keys:Row[];run:Run}){
 const [matterId,setMatterId]=useState(''),[documents,setDocuments]=useState<Row[]>([]),[sources,setSources]=useState<Record<string,Row>>({});
 useEffect(()=>{setSources({});setDocuments([]);if(matterId)api('/matters/'+matterId+'/documents').then(setDocuments).catch(e=>run(async()=>{throw e;}));},[matterId]);
 return <details><summary>Approve a bounded delegation</summary><Form label="Approve agent delegation" submit={d=>run(()=>api('/agent-delegations',{...d,matterId,actions:String(d.actions).split(',').map(v=>v.trim()).filter(Boolean),recipients:[d.recipient],maxJobs:Number(d.maxJobs),spendCents:0,escalationEmail:state.actor.email,confirmed:d.confirmed==='on',sources:Object.values(sources)}),'Agent delegation approved')}>
 <Field label="Delegated agent key" name="keyId"><select aria-label="Delegated agent key" name="keyId" required>{keys.filter(k=>!k.revoked).map(k=><option key={k.id} value={k.id}>{k.label}</option>)}</select></Field>
 <Field label="Processing agreement" name="agreementId"><select aria-label="Processing agreement" name="agreementId" required>{controls.agreements.filter((a:Row)=>!a.withdrawn_at).map((a:Row)=><option key={a.id} value={a.id}>{a.processor} · {a.model_revision} · {a.approved_at}</option>)}</select></Field>
 <label>Delegated matter<select value={matterId} onChange={e=>setMatterId(e.target.value)} required><option value="">Choose a matter</option>{state.matters.map((m:Row)=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
 <Field label="Permitted preparation actions (comma separated)" name="actions" value="context,prepare-deadline"/>
 <Field label="Preparation recipient" name="recipient" value={state.actor.email}/><Field label="Maximum executions" name="maxJobs" type="number" value={1}/>
 <p>Spend limit: $0.00. Preparations require human review. Sends, transfers and provider execution are refused.</p>
 <Field label="Delegation expiry (ISO instant)" name="expiresAt"/><Field label="Stop and escalation rule" name="stopRule"/>
 <p>Stopped work is retained for {state.actor.name} to inspect; it sends no automatic escalation message.</p>
 <details><summary>Choose exact context sources</summary>{documents.filter(d=>!d.erasedAt).map(d=><article className="record" key={d.id}>
 <label className="check"><input type="checkbox" checked={Boolean(sources[d.id])} onChange={e=>setSources(previous=>{const next={...previous};if(e.target.checked)next[d.id]={documentId:d.id,version:d.currentVersion,kind:'matter'};else delete next[d.id];return next;})}/>{d.title}</label>
 {sources[d.id]&&<><label>Source version<select value={sources[d.id].version} onChange={e=>setSources(p=>({...p,[d.id]:{...p[d.id],version:Number(e.target.value)}}))}>{d.versions.map((v:Row)=><option key={v.version} value={v.version}>{v.version} · {v.sha256.slice(0,12)}</option>)}</select></label>
 <label>Source classification<select value={sources[d.id].kind} onChange={e=>setSources(p=>({...p,[d.id]:{...p[d.id],kind:e.target.value}}))}><option value="matter">Matter evidence</option><option value="research">Licensed research</option><option value="health">Health data</option></select></label>
 {sources[d.id].kind==='research'&&['licenseReference','licenseExpiresAt','permittedUse'].map((field,i)=><label key={field}>{['Research entitlement and provenance','Research entitlement expiry (ISO instant)','Licensed processing use'][i]}<input required value={sources[d.id][field]??''} onChange={e=>setSources(p=>({...p,[d.id]:{...p[d.id],[field]:e.target.value}}))}/></label>)}</>}
 </article>)}</details>
 <label className="check"><input type="checkbox" name="confirmed" required/>I approve these actions, sources, recipient, limits and stop rule.</label>
 </Form></details>;
}
export function AgentControls({state,keys,run,tick}:{state:Row;keys:Row[];run:Run;tick:number}){
 const [controls,setControls]=useState<Row>({agreements:[],delegations:[],jobs:[]}),[preview,setPreview]=useState<Record<string,Row>>({});
 useEffect(()=>{setPreview({});api('/agent-controls').then(setControls).catch(e=>run(async()=>{throw e;}));},[tick]);
 return <section className="panel agent-controls"><h2>Agent data & execution</h2>
 <p>Recorded agreements and explicit delegations bound every agent key. Uploaded content grants no authority.</p>
 {state.actor.role==='owner'&&<><AgreementForm keys={keys} run={run}/><DelegationForm state={state} controls={controls} keys={keys} run={run}/></>}
 <details><summary>Recorded processing agreements</summary>{controls.agreements.map((a:Row)=><article className="record" key={a.id}><strong>{a.processor} · {a.model_revision}</strong><p>{a.agreement_reference}</p><p>Retention: {a.retention_terms}</p><p>Training: {a.training_terms}</p><p>Health data: {a.health_reference??'Not authorized'}</p><p>Expires {a.expires_at} · {a.withdrawn_at?'Withdrawn':'Reviewed by '+a.approved_by}</p>{state.actor.role==='owner'&&!a.withdrawn_at&&<Form label="Withdraw processing agreement" submit={d=>run(()=>api('/agent-agreements/'+a.id+'/withdraw',d),'Processing agreement withdrawn')}><Field label="Withdrawal reason" name="reason"/></Form>}</article>)}</details>
 {controls.delegations.map((d:Row)=><article className="record agent-delegation" key={d.id}><strong>Delegation · {state.matters.find((m:Row)=>m.id===d.matter_id)?.title}</strong><p>{d.actions.join(', ')} · {d.revoked_at?'Revoked':`${d.used_jobs} of ${d.max_jobs} executions reserved`}</p><p>Recipient: {d.recipients.join(', ')} · Spend: $0.00</p><p>Expires {d.expires_at}</p><p>Stop: {d.stop_rule} · Escalate to {d.escalation_email}</p><p>{d.sources.length} selected source versions · Agreement {d.agreement_id}</p>
 {!d.revoked_at&&<button className="quiet" onClick={()=>{api('/agent-delegations/'+d.id+'/context').then(result=>setPreview(p=>({...p,[d.id]:result}))).catch(e=>run(async()=>{throw e;}));}}>Inspect redacted context</button>}
 {preview[d.id]&&<pre>{JSON.stringify(preview[d.id],null,2)}</pre>}
 {state.actor.role==='owner'&&!d.revoked_at&&<Form danger label="Revoke agent delegation" submit={b=>run(()=>api('/agent-delegations/'+d.id+'/revoke',b),'Delegation revoked; queued authority cancelled')}><Field label="Revocation reason" name="reason"/></Form>}
 {controls.jobs.filter((j:Row)=>j.delegation_id===d.id).map((j:Row)=><div className="record agent-job" key={j.id}><strong>{j.action} · {j.status}</strong><p>{j.outcome} · Due {j.due_at}</p>{j.proposal_id&&<p>Preserved proposal {j.proposal_id}</p>}{state.actor.role==='owner'&&j.status==='queued'&&<button className="quiet" onClick={()=>run(()=>api('/agent-jobs/'+j.id+'/run',{}),'Due preparation checked')}>Run due preparation</button>}</div>)}</article>)}
 </section>;
}
