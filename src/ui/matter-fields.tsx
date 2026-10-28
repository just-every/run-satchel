import {useEffect,useState} from 'react';
import {api,dollars,Field,Form,type Row,type Run} from './common';
const standard:[string,string][]=[['caseNumber','Case number'],['court','Court'],['insuranceLimit','Insurance limit'],['feeArrangement','Fee arrangement']];
const fees=['hourly','flat_fee','contingency','hybrid','pro_bono'];
// One custom field per line: Label | type | required | choice/choice
const fieldLines=(def?:Row)=>(def?.fields??[]).map((f:Row)=>[f.label,f.type,f.required?'required':'optional',...(f.options?[f.options.join('/')]:[])].join(' | ')).join('\n');
function parseDefinition(d:Row,previous?:Row){
 const fields=String(d.fields??'').split('\n').map(l=>l.trim()).filter(Boolean).map(line=>{const [label,type='text',req='optional',options]=line.split('|').map(v=>v.trim());const old=previous?.fields.find((f:Row)=>f.label===label);return {...(old?{key:old.key}:{}),label,type,required:req==='required',...(type==='choice'?{options:String(options??'').split('/').map(v=>v.trim()).filter(Boolean)}:{})};});
 return {required:standard.map(([k])=>k).filter(k=>d['required:'+k]==='on'),fields,records:String(d.records??'').split(',').map(v=>v.trim()).filter(Boolean)};
}
function TypeForm({label,type,areas,run}:{label:string;type?:Row;areas:Row[];run:Run}){
 return <Form label={label} submit={d=>run(()=>api('/matter-types',{...(type?{id:type.id,revision:type.revision}:{}),name:d.name,practiceCode:d.practiceCode,definition:parseDefinition(d,type?.definition)}),type?'Matter type version saved':'Matter type created')}>
  <Field label="Matter type name" name="name" value={type?.name}/>
  <Field label="Practice area" name="practiceCode"><select name="practiceCode" defaultValue={type?.practiceCode}>{areas.map((p:Row)=><option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}</select></Field>
  <fieldset><legend>Required standard fields</legend>{standard.map(([k,l])=><label className="check" key={k}><input type="checkbox" name={'required:'+k} defaultChecked={type?.definition.required.includes(k)}/>{l}</label>)}</fieldset>
  <label>Custom fields, one per line (Label | text, number, date, money, choice or yesno | required or optional | choices separated by /)<textarea name="fields" rows={4} defaultValue={fieldLines(type?.definition)}/></label>
  <Field label="Required record types, separated by commas" name="records" value={type?.definition.records.join(', ')} required={false}/>
 </Form>;
}
function CustomInput({field,value}:{field:Row;value:unknown}){
 const name='custom:'+field.key,v=value===undefined||value===null?'':field.type==='money'?(Number(value)/100).toFixed(2):field.type==='yesno'?(value?'yes':'no'):String(value);
 if(field.type==='choice'||field.type==='yesno')return <Field label={field.label} name={name}><select name={name} defaultValue={v}><option value="">Not recorded</option>{(field.type==='yesno'?['yes','no']:field.options).map((o:string)=><option key={o} value={o}>{o}</option>)}</select></Field>;
 return <Field label={field.label} name={name} type={field.type==='date'?'date':'text'} value={v} required={false}/>;
}
export function MatterFields({matterId,state,run,tick}:{matterId:string;state:Row;run:Run;tick:number}){
 const [detail,setDetail]=useState<Row>(),[types,setTypes]=useState<Row[]>([]),[loaded,setLoaded]=useState(''),[choice,setChoice]=useState('');
 useEffect(()=>{setDetail(undefined);},[matterId]);
 useEffect(()=>{let active=true;if(matterId)Promise.all([api('/matters/'+matterId+'/fields'),api('/matter-types')]).then(([d,t])=>{if(active){setDetail(d);setTypes(t.types);setChoice(d.profile.typeId??'');setLoaded(matterId+':'+tick);}}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[matterId,tick]);
 const edit=['owner','lawyer'].includes(state.actor.role),ready=loaded===matterId+':'+tick;
 const selected=types.find(t=>t.id===choice),adopting=selected&&(selected.id!==detail?.profile.typeId||selected.version!==detail?.profile.typeVersion);
 const fields=(adopting?selected.definition:detail?.type?.definition)?.fields??[],p=detail?.profile;
 return <section className="panel"><h2>Matter type and fields</h2><fieldset className="content" disabled={Boolean(matterId)&&!ready} aria-busy={Boolean(matterId)&&!ready}>{!detail?<p>Choose a matter to inspect its type and fields.</p>:<>
  <p>Matter type: {detail.type?`${detail.type.name} · version ${detail.type.version}`:'None'}{detail.latestVersion&&detail.latestVersion!==p.typeVersion?` (version ${detail.latestVersion} available)`:''}</p>
  {edit&&<Form key={p.revision??'empty'} label="Save matter fields" submit={d=>run(()=>api('/matters/'+matterId+'/fields',{revision:p.revision,...(selected?{typeId:selected.id,typeVersion:adopting?selected.version:p.typeVersion}:{}),caseNumber:d.caseNumber,court:d.court,insuranceLimit:d.insuranceLimit,feeArrangement:d.feeArrangement,feeTerms:d.feeTerms,custom:Object.fromEntries(Object.entries(d).filter(([k])=>k.startsWith('custom:')).map(([k,v])=>[k.slice(7),v]))}),'Matter fields saved')}>
   <label>Matter type<select value={choice} onChange={e=>setChoice(e.target.value)}><option value="">No matter type</option>{types.filter(t=>!detail.practiceCode||t.practiceCode===detail.practiceCode).map(t=><option key={t.id} value={t.id}>{t.practiceCode} · {t.name} · version {t.version}</option>)}</select></label>
   <Field label="Case number" name="caseNumber" value={p.caseNumber??''} required={false}/><Field label="Court" name="court" value={p.court??''} required={false}/>
   <Field label="Insurance limit (USD)" name="insuranceLimit" value={p.insuranceLimitCents===null?'':(p.insuranceLimitCents/100).toFixed(2)} required={false}/>
   <Field label="Fee arrangement" name="feeArrangement"><select name="feeArrangement" defaultValue={p.feeArrangement??''}><option value="">Not recorded</option>{fees.map(f=><option key={f} value={f}>{f.replace('_',' ')}</option>)}</select></Field>
   <Field label="Fee terms" name="feeTerms" value={p.feeTerms??''} required={false}/>
   {fields.map((f:Row)=><CustomInput key={choice+f.key} field={f} value={adopting?undefined:p.custom[f.key]}/>)}
  </Form>}
  {!edit&&<dl>{[['Case number',p.caseNumber],['Court',p.court],['Insurance limit',p.insuranceLimitCents===null?null:dollars(p.insuranceLimitCents)],['Fee arrangement',p.feeArrangement]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v??'—'}</dd></div>)}{(detail.type?.definition.fields??[]).map((f:Row)=><div key={f.key}><dt>{f.label}</dt><dd>{String(p.custom[f.key]??'—')}</dd></div>)}</dl>}
  {!!detail.collections?.length&&<details><summary>Imported collection rows ({detail.collections.length})</summary>{detail.collections.map((r:Row)=><article className="record" key={r.section+':'+r.sourceId}><h3>{r.section} · {r.sourceId}</h3><dl>{r.fields.map((f:Row)=><div key={f.key}><dt>{f.label}</dt><dd>{r.values[f.key]===undefined?'Not recorded':f.type==='money'?dollars(r.values[f.key]):f.type==='yesno'?(r.values[f.key]?'Yes':'No'):String(r.values[f.key])}</dd></div>)}</dl><p>Source type version {r.typeVersion} · {r.source.file} · row {r.source.line}</p></article>)}</details>}
  <h3>Required records</h3>{detail.records.length?detail.records.map((r:Row)=><p key={r.type}>{r.type}: {r.status}{r.documents.map((d:Row)=>` · ${d.title} version ${d.version}`).join('')}</p>):<p>No required records for this type.</p>}
  <article className="record" aria-label="Docket"><h3>Docket</h3><dl><dt>Court</dt><dd>{p.court??'—'}</dd><dt>Case number</dt><dd>{p.caseNumber??'—'}</dd><dt>Opponents</dt><dd>{detail.opponents.join('; ')||'—'}</dd></dl>
   {detail.docket.length?detail.docket.map((d:Row)=><div key={d.id}><strong>{d.title}</strong><p>{d.date} · {d.timezone} · {d.status}</p><p>Citation: {d.citation}</p>{d.documentId&&<a href={'/api/satchel/documents/'+d.documentId+'/file?version='+d.version}>{d.documentTitle} · version {d.version}</a>}</div>):<p>No docket dates yet.</p>}
  </article>
  <details><summary>Field history</summary>{detail.history.map((e:Row)=><p key={e.id}>{e.kind} · {e.actor} · {e.at}</p>)}</details>
 </>}
 {state.actor.role==='owner'&&<details><summary>Configure matter types</summary>{types.map(t=><TypeForm key={t.revision} label={'Save new version of '+t.name} type={t} areas={state.firm?.practiceAreas??[]} run={run}/>)}<TypeForm label="Create matter type" areas={state.firm?.practiceAreas??[]} run={run}/></details>}
 </fieldset></section>;
}
