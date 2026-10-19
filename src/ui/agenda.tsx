import {useEffect,useState} from 'react';
import {api,Empty,Field,Form,today,type Row,type Run} from './common';
// CAL-008: agenda with owners, conflicts, unconfirmed dates and absence coverage.
function plus(day:string,days:number){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function Item({i,actor,staff,run}:{i:Row;actor:Row;staff:Row[];run:Run}){
 return <article className="record"><strong>{i.title}</strong><small>{i.date}{i.time&&' '+i.time} {i.timezone} · {i.kind} · Matter {i.matterNumber}</small><p>Source: {i.source}</p><p>Owner: {i.ownerName??'unassigned'} · <span className="badge">{i.confirmation}</span></p>
  {i.coverage&&<p>{i.ownerName} absent; {i.coverage.coveredBy?`covered by ${i.coverage.coveredByName}`:'uncovered'}</p>}
  {i.conflicts.length>0&&<p>Conflicts with {i.conflicts.map((c:Row)=>`${c.title} (Matter ${c.matterNumber})`).join(', ')}</p>}
  <p><strong>Next action:</strong> {i.nextAction}</p>
  {i.type==='deadline'&&i.status!=='done'&&['owner','lawyer'].includes(actor.role)&&<Form label={`Set owner for ${i.title}`} submit={b=>run(()=>api('/deadlines/'+i.id+'/owner',b),'Owner assigned')}><Field name="email" label="Responsible person"><select name="email" required defaultValue={i.owner??''}>{[<option key="" value="" disabled>Choose a person</option>,...staff.map(s=><option key={s.email} value={s.email}>{s.name}</option>)]}</select></Field></Form>}</article>;
}
export function Agenda({actor,members,run,tick}:{actor:Row;members:Row[];run:Run;tick:number}){
 const [range,setRange]=useState({from:today(),to:plus(today(),60)}),[view,setView]=useState<Row>(),[absences,setAbsences]=useState<Row[]>([]);
 useEffect(()=>{Promise.all([api(`/agenda?from=${range.from}&to=${range.to}`),api('/absences')]).then(([a,b])=>{setView(a);setAbsences(b.absences);}).catch(e=>run(async()=>{throw e;}));},[range,tick]);
 const staff=[{email:actor.role==='owner'?actor.email:'',name:actor.role==='owner'?actor.name:''},...members.filter(m=>m.active)].filter(s=>s.email);
 const people=actor.role==='owner'?staff:[{email:actor.email,name:actor.name}];
 return <div className="grid">
  <section className="panel"><h2>Agenda and coverage</h2><p>Every matter you may see, with each date’s source, owner, confirmation and next action. Proposed and extracted dates stay unconfirmed until a lawyer confirms them.</p>
   <Form label="Show agenda" submit={async b=>setRange({from:b.from,to:b.to})}><Field name="from" label="Agenda from" type="date" value={range.from}/><Field name="to" label="Agenda to" type="date" value={range.to}/></Form>
   <p><a href={`/api/satchel/agenda/export?from=${range.from}&to=${range.to}`} download>Export agenda CSV</a></p>
   {view&&!view.items.length&&<Empty>Nothing on the agenda in this range.</Empty>}
   {view?.items.map((i:Row)=><Item key={i.id} i={i} actor={actor} staff={staff} run={run}/>)}
   <h3>Upcoming limitation dates</h3>{view?.limitations.length?view.limitations.map((l:Row)=><p key={l.id}>{l.date} · Matter {l.matterNumber} · {l.title} <span className="badge">{l.confirmation}</span></p>):<p>None recorded.</p>}
  </section>
  <section className="panel"><h2>Absences</h2><p>Coverage names who acts while someone is out; it grants no matter access.</p>
   {!absences.length&&<Empty>No absences recorded.</Empty>}
   {absences.map(a=><article className="record" key={a.id}><strong>{a.name??a.email}</strong><small>{a.startDate} to {a.endDate}</small>{a.reason&&<p>Reason: {a.reason}</p>}<p>{a.coveredBy?`Covered by ${a.coveredByName??a.coveredBy}`:'No coverage assigned'}</p>
    {(actor.role==='owner'||actor.email===a.email)&&<Form label={`Assign coverage for ${a.name??a.email}`} submit={b=>run(()=>api('/absences/'+a.id+'/coverage',b),'Coverage assigned')}><Field name="email" label="Covering colleague"><select name="email" required defaultValue="">{[<option key="" value="" disabled>Choose a colleague</option>,...staff.filter(s=>s.email!==a.email).map(s=><option key={s.email} value={s.email}>{s.name}</option>)]}</select></Field></Form>}</article>)}
   <Form label="Record absence" submit={b=>run(()=>api('/absences',b),'Absence recorded')}><Field name="email" label="Absent person"><select name="email" required defaultValue={actor.email}>{people.map(s=><option key={s.email} value={s.email}>{s.name}</option>)}</select></Field><Field name="startDate" label="First day away" type="date" value={today()}/><Field name="endDate" label="Last day away" type="date" value={today()}/><Field name="reason" label="Reason (seen by the principal and you)"/></Form>
  </section>
 </div>;
}
