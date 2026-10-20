import {api,dollars,Field,Form,type Row,type Run} from './common';
// TIME-007: firm UTBMS code sets, LEDES timekeeper IDs, the client's billing guideline,
// and each LEDES invoice's export and imported e-billing outcomes.
const kinds:Row={task:'Task',activity:'Activity',expense:'Expense'};
const yes=(v:boolean)=>v?'required':'optional';

export function LedesPanel({matterId,actor,run,state,setState}:{matterId:string;actor:Row;run:Run;state:Row|null;setState:(s:Row)=>void}){
 const owner=actor.role==='owner',g=state?.guideline;
 const save=(path:string,body:Row,message:string)=>run(async()=>{await api(path,body);setState(await api('/matters/'+matterId+'/ledes'));},message);
 return <section className="panel" aria-busy={!state} aria-label="LEDES and UTBMS"><h2>LEDES and UTBMS</h2>{!state?<p>Opening billing guidelines…</p>:<>
  {!g?<p>No billing guideline for {state.client}. Bills for this client stay plain reviewed bills without a LEDES invoice.</p>:<article className="record" aria-label={`Guideline version ${g.version}`}><strong>{state.client} guideline · version {g.version}</strong><p>LEDES 1998B · client ID {g.clientLedesId} · law firm ID {g.lawFirmId}</p><p>Task codes {yes(g.requireTask)} · activity codes {yes(g.requireActivity)} · expense codes {yes(g.requireExpense)} · timekeeper IDs required · narratives at least {g.narrativeMin} characters{g.incrementMinutes?` · ${g.incrementMinutes}-minute increments`:''}</p>{g.bannedPhrases.length>0&&<p>Narratives may not use: {g.bannedPhrases.join(', ')}</p>}{Object.keys(g.maxRates).length>0&&<p>Maximum rates: {Object.entries(g.maxRates).map(([k,v])=>`${k} ${dollars(v as number)}/h`).join(' · ')}</p>}<small>{g.note} · set by {g.createdBy}</small></article>}
  {owner&&<details><summary>{g?'Record a new guideline version':'Add a billing guideline'}</summary><Form label="Save guideline" submit={d=>save('/matters/'+matterId+'/ledes-guideline',{clientLedesId:d.clientLedesId,lawFirmId:d.lawFirmId,requireTask:d.requireTask==='on',requireActivity:d.requireActivity==='on',requireExpense:d.requireExpense==='on',narrativeMin:Number(d.narrativeMin),bannedPhrases:String(d.bannedPhrases).split(',').map(s=>s.trim()).filter(Boolean),maxRates:Object.fromEntries(String(d.maxRates).split(',').map(s=>s.trim().split('=')).filter(p=>p.length===2).map(([k,v])=>[k.trim().toUpperCase(),Number(v)])),incrementMinutes:Number(d.incrementMinutes),note:d.note},'Guideline saved')}>
   <div className="inline"><Field label="LEDES client ID" name="clientLedesId" value={g?.clientLedesId}/><Field label="LEDES law firm ID" name="lawFirmId" value={g?.lawFirmId}/></div>
   <label className="check"><input type="checkbox" name="requireTask" defaultChecked/>Task codes required</label><label className="check"><input type="checkbox" name="requireActivity" defaultChecked/>Activity codes required</label><label className="check"><input type="checkbox" name="requireExpense" defaultChecked/>Expense codes required</label>
   <div className="inline"><Field label="Minimum narrative length" name="narrativeMin" type="number" value={g?.narrativeMin??0}/><Field label="Required increment (minutes, 0 for none)" name="incrementMinutes" type="number" value={g?.incrementMinutes??0}/></div>
   <Field label="Banned narrative phrases (comma separated)" name="bannedPhrases" required={false} value={g?.bannedPhrases.join(', ')}/>
   <Field label="Maximum hourly rates in USD cents (e.g. PT=40000, AS=30000)" name="maxRates" required={false} value={g?Object.entries(g.maxRates).map(([k,v])=>`${k}=${v}`).join(', '):''}/>
   <Field label="Guideline source" name="note"/></Form></details>}
  <h3>Firm code sets</h3>{!state.codes.length?<p>No firm codes yet: UTBMS codes are checked for format only.</p>:<div className="table-scroll"><table><thead><tr><th>Code</th><th>Kind</th><th>Label</th><th>State</th></tr></thead><tbody>{state.codes.map((c:Row)=><tr key={c.kind+c.code}><td>{c.code}</td><td>{kinds[c.kind]}</td><td>{c.label}</td><td>{c.active?'active':'retired'}</td></tr>)}</tbody></table></div>}
  {owner&&<details><summary>Add or retire a code</summary><Form label="Save code" submit={d=>save('/ledes/codes',{kind:d.kind,code:d.code,label:d.label,active:d.active==='on'},'Code saved')}><div className="inline"><Field label="Kind" name="kind"><select name="kind"><option value="task">Task</option><option value="activity">Activity</option><option value="expense">Expense</option></select></Field><Field label="Code" name="code"/></div><Field label="Code label" name="label"/><label className="check"><input type="checkbox" name="active" defaultChecked/>Active</label></Form></details>}
  <h3>Timekeeper IDs</h3>{!state.timekeepers.length?<p>No LEDES timekeeper IDs yet.</p>:<ul>{state.timekeepers.map((t:Row)=><li key={t.email}>{t.timekeeperId} · {t.name} · {t.classification} · {t.email}</li>)}</ul>}
  {owner&&<details><summary>Set a timekeeper ID</summary><Form label="Save timekeeper" submit={d=>save('/ledes/timekeepers',{email:d.email,timekeeperId:d.timekeeperId,name:d.name,classification:d.classification},'Timekeeper saved')}><Field label="Team member email" name="email" type="email"/><div className="inline"><Field label="LEDES timekeeper ID" name="timekeeperId"/><Field label="Classification" name="classification"><select name="classification"><option value="PT">PT partner</option><option value="AS">AS associate</option><option value="OC">OC of counsel</option><option value="PL">PL paralegal</option><option value="LA">LA legal assistant</option><option value="OT">OT other</option></select></Field></div><Field label="Name as billed (Last, First)" name="name"/></Form></details>}
 </>}</section>;
}

// Per-line codes chosen at preparation; blank keeps the entry's recorded code.
export function CodingFields({entries}:{entries:Row[]}){
 return <fieldset><legend>LEDES line coding (blank keeps the recorded code)</legend>{entries.map((e:Row)=>e.kind==='time'?<div className="inline" key={e.id}><Field label={`Task · ${e.description}`} name={`task:${e.id}`} required={false} value={e.utbmsTask??''}/><Field label={`Activity · ${e.description}`} name={`activity:${e.id}`} required={false} value={e.utbmsActivity??''}/></div>:<Field key={e.id} label={`Expense · ${e.description}`} name={`expense:${e.id}`} required={false} value={e.utbmsExpense??''}/>)}</fieldset>;
}
export function coding(d:Row,entries:Row[]){
 const pick=(k:string,id:string)=>{const v=String(d[`${k}:${id}`]??'').trim();return v||undefined;};
 return Object.fromEntries(entries.map((e:Row)=>[e.id,{utbmsTask:pick('task',e.id),utbmsActivity:pick('activity',e.id),utbmsExpense:pick('expense',e.id)}]));
}

export function LedesBill({bill,actor,run}:{bill:Row;actor:Row;run:Run}){
 const l=bill.ledes,counsel=['owner','lawyer'].includes(actor.role);
 if(!l)return null;
 return <div className="ledes" aria-label={`LEDES invoice ${l.invoiceNumber}`}><p>LEDES 1998B invoice {l.invoiceNumber}{bill.snapshot.ledes?.replaces?` · replaces ${bill.snapshot.ledes.replaces}`:''} · e-billing status: <span className="badge">{l.status}</span></p>
  {l.rejections.map((r:Row,i:number)=><p className="notice" role="alert" key={i}>Rejected{r.lineNumber?` line ${r.lineNumber}`:' invoice'}: {r.reason}</p>)}
  {l.outcomes.length>0&&<small>Imported from the e-billing file, not verified with the vendor.</small>}
  {counsel&&l.ready&&<div className="actions"><button onClick={()=>run(async()=>{const response=await fetch('/api/satchel/bills/'+bill.id+'/ledes');if(!response.ok)throw new Error(((await response.json()) as Row).error);const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=l.invoiceNumber+'.ledes.txt';a.click();URL.revokeObjectURL(url);},'LEDES invoice exported')}>Download LEDES 1998B</button></div>}
  {counsel&&bill.status==='exported'&&<details><summary>Import e-billing outcome</summary><Form label="Record outcome" submit={d=>run(()=>api('/bills/'+bill.id+'/ledes-outcomes',{fileName:d.fileName,content:d.content}),'Outcome recorded from the imported file')}><Field label="File name" name="fileName"/><Field label="Outcome rows (INVOICE_NUMBER|LINE_ITEM_NUMBER|STATUS|REASON)" name="content"><textarea name="content" required rows={4}/></Field></Form></details>}
 </div>;
}

export function LedesCorrectionFields(){
 return <><div className="inline"><Field label="Corrected task code (blank: unchanged)" name="utbmsTask" required={false}/><Field label="Corrected activity code (blank: unchanged)" name="utbmsActivity" required={false}/></div><Field label="Corrected expense code (blank: unchanged)" name="utbmsExpense" required={false}/><Field label="Corrected narrative (blank: unchanged)" name="description" required={false}/></>;
}
export function correctionBody(d:Row,ledes:boolean){
 const keep=(v:unknown)=>String(v??'').trim()||undefined;
 return ledes?{utbmsTask:keep(d.utbmsTask),utbmsActivity:keep(d.utbmsActivity),utbmsExpense:keep(d.utbmsExpense),description:keep(d.description),correctedAmountCents:d.correctedAmountCents===''?undefined:Number(d.correctedAmountCents)}:{correctedAmountCents:Number(d.correctedAmountCents)};
}
