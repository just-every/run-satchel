import {useEffect,useState} from 'react';
import {api,Empty,Field,Form,type Row,type Run} from './common';
// FIRM-006: counsel places holds and schedules on the current matter.
export function MatterRetention({matterId,documents,run,tick}:{matterId:string;documents:Row[];run:Run;tick:number}){
 const [state,setState]=useState<Row>({holds:[],schedules:[],disposals:[]});
 useEffect(()=>{api('/retention?matter='+matterId).then(setState).catch(e=>run(async()=>{throw e;}));},[matterId,tick]);
 const title=(documentId:string|null)=>documentId?(documents.find(d=>d.id===documentId)?.title??'A document'):'Whole matter';
 const scope=<Field label="Applies to" name="documentId"><select name="documentId"><option value="">Whole matter</option>{documents.filter(d=>!d.erasedAt).map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>;
 const current=state.schedules.filter((s:Row)=>!s.superseded_at);
 return <section className="panel"><h2>Legal holds & retention</h2><p>A hold stops erasure and scheduled disposal of the matter or document until counsel releases it. When a schedule expires, the principal is asked to approve disposal.</p>
  <h3>Holds</h3>{!state.holds.length&&<Empty>No holds on this matter.</Empty>}{state.holds.map((h:Row)=><article className="record" key={h.id}><strong>{title(h.document_id)}</strong><p><span className="badge">{h.active?'on hold':'released'}</span> · {h.reason}<br/><small>Placed by {h.placed_by} · {h.placed_at.slice(0,10)}{h.released_at&&` · released by ${h.released_by}: ${h.release_reason}`}</small></p>{h.active&&<details><summary>Release hold</summary><Form label="Release hold" submit={d=>run(()=>api('/holds/'+h.id+'/release',d),'Hold released')}><Field label="Release reason" name="reason"/></Form></details>}</article>)}
  <details><summary>Place a legal hold</summary><Form label="Place hold" submit={d=>run(()=>api('/holds',{...d,matterId,documentId:d.documentId||undefined}),'Legal hold placed')}>{scope}<Field label="Hold reason" name="reason"/></Form></details>
  <h3>Retention schedules</h3>{!current.length&&<Empty>No retention schedule on this matter.</Empty>}{current.map((s:Row)=><p key={s.id}><strong>{title(s.document_id)}</strong>: keep until {s.dispose_after} · {s.basis}<br/><small>{s.set_by} · {s.set_at.slice(0,10)}</small></p>)}
  <details><summary>Set a retention schedule</summary><Form label="Save schedule" submit={d=>run(()=>api('/retention',{...d,matterId,documentId:d.documentId||undefined}),'Retention schedule saved')}>{scope}<Field label="Dispose after" name="disposeAfter" type="date"/><Field label="Basis (rule or engagement term)" name="basis"/></Form></details>
  {state.disposals.length>0&&<><h3>Disposal journal</h3>{state.disposals.map((d:Row)=><p key={d.id}>{d.title} · {d.journal.originals.length} original versions removed · {d.approved_by} · {d.approved_at.slice(0,10)}</p>)}</>}</section>;
}
// The principal approves disposal once a schedule has expired and no hold applies.
export function DisposalQueue({run,tick}:{run:Run;tick:number}){
 const [state,setState]=useState<Row>({due:[],held:[],disposals:[]});
 useEffect(()=>{api('/retention').then(setState).catch(e=>run(async()=>{throw e;}));},[tick]);
 return <section className="panel disposal"><h2>Retention disposal</h2><p>These documents passed their retention date. Approving removes every original version; names, hashes and this journal remain.</p>{!state.due.length&&<Empty>No disposal is waiting for approval.</Empty>}{state.due.map((d:Row)=><details key={d.id}><summary>{d.title} · {d.matter_title} · kept until {d.dispose_after}</summary><p>{d.basis}</p><Form danger label="Approve disposal" submit={b=>run(()=>api('/documents/'+d.id+'/dispose',b),'Disposal approved and journaled')}><Field label="Document name to confirm" name="confirm"/><Field label="Disposal reason" name="reason"/></Form></details>)}{state.held.length>0&&<><h3>Expired but on hold</h3>{state.held.map((d:Row)=><p key={d.id}>{d.title} · {d.matter_title} · kept until {d.dispose_after}</p>)}</>}{state.disposals.length>0&&<><h3>Disposal journal</h3>{state.disposals.map((d:Row)=><p key={d.id}>{d.title} · {d.journal.originals.length} original versions removed · {d.approved_by} · {d.approved_at.slice(0,10)} · {d.reason}</p>)}</>}</section>;
}
