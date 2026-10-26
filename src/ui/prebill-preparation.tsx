import {useEffect,useState} from 'react';
import {api,dollars,Field,Form,today,type Row,type Run} from './common';
import {CodingFields,coding} from './ledes';

export function PrebillPreparation({matters,run,tick}:{matters:Row[];run:Run;tick:number}){
 const [selected,setSelected]=useState<string[]>([]),[data,setData]=useState<Record<string,Row>>({}),[excluded,setExcluded]=useState<string[]>([]),[start,setStart]=useState(today().slice(0,7)+'-01'),[end,setEnd]=useState(today());
 useEffect(()=>{let active=true;setData({});void Promise.all(selected.map(async id=>{const [billing,ledes,plans]=await Promise.all([api('/matters/'+id+'/billing'),api('/matters/'+id+'/ledes'),api('/matters/'+id+'/fee-plans')]);return [id,{...billing,ledes,plans:plans.plans}] as const;})).then(entries=>{if(active)setData(Object.fromEntries(entries));}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[selected.join(','),tick]);
 const entries=(id:string)=>(data[id]?.entries??[]).filter((e:Row)=>e.billable&&!e.reservedBy&&e.date>=start&&e.date<=end);
 return <details><summary>Prepare a prebill run</summary><Form label="Prepare selected matters" submit={d=>run(()=>api('/prebill-runs',{title:d.title,date:d.date,items:selected.map(matterId=>{const current=data[matterId],lines=entries(matterId).filter((e:Row)=>!excluded.includes(e.id)),plan=current.plans.find((p:Row)=>p.id===d['plan.'+matterId]);return {matterId,payer:d['payer.'+matterId],periodStart:start,periodEnd:end,arrangement:plan?.kind??'hourly',entryIds:lines.map((e:Row)=>e.id),feePlanId:plan?.id,exceptionReason:d['exception.'+matterId]||undefined,...(current.ledes?.guideline?{coding:coding(d,lines)}:{})};})}),'Prebill run prepared; sources reserved for exact review')}>
  <Field label="Prebill run title" name="title"/><Field label="Prebill date" name="date" type="date" value={today()}/>
  <div className="inline"><label>Period starts<input name="periodStart" type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>Period ends<input name="periodEnd" type="date" required value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
  <fieldset><legend>Matters in this run</legend>{matters.map(m=><label key={m.id}><input type="checkbox" checked={selected.includes(m.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,m.id]:ids.filter(id=>id!==m.id))}/>{m.matter_number} · {m.title}</label>)}</fieldset>
  {selected.map(id=>{const m=matters.find(m=>m.id===id)!,current=data[id];return <fieldset key={id}><legend>{m.matter_number} · {m.title}</legend>{!current?<p>Loading available work…</p>:<>
   <Field label={'Payer for '+m.matter_number} name={'payer.'+id} value={m.client}/>
   <Field label={'Arrangement for '+m.matter_number} name={'plan.'+id}><select aria-label={'Arrangement for '+m.matter_number} name={'plan.'+id}><option value="">Hourly work</option>{current.plans.filter((p:Row)=>['capped','blended'].includes(p.kind)).map((p:Row)=><option key={p.id} value={p.id}>{p.title} · {p.kind}</option>)}</select></Field>
   <Field label={'Reviewed exception for '+m.matter_number} name={'exception.'+id} required={false}/>
   {entries(id).length?entries(id).map((e:Row)=><label key={e.id}><input type="checkbox" checked={!excluded.includes(e.id)} onChange={v=>setExcluded(ids=>v.target.checked?ids.filter(id=>id!==e.id):[...ids,e.id])}/>{e.date} · {e.description} · {dollars(e.amountCents)}</label>):<p>No available billable work in this period.</p>}
   {current.ledes?.guideline&&<CodingFields entries={entries(id).filter((e:Row)=>!excluded.includes(e.id))}/>}
  </>}</fieldset>;})}
  {!selected.length&&<p>Select the matters to prepare together.</p>}
 </Form></details>;
}
