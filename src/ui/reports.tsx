import {useEffect,useState,type FormEvent} from 'react';
import {api,Field,type Run} from './common';
import {ReportTable,reportTotal,type ReportDashboard} from './report-table';

type Filters={practice:string;owner:string;from:string;to:string;status:string};
type ReportView={
 timezone:string;today:string;filters:Filters;cohortCount:number;
 options:{practices:{code:string;name:string}[];owners:{email:string;name:string}[]};
 dashboards:ReportDashboard[];
};
const initialFilters:Filters={practice:'',owner:'',from:'',to:'',status:''};
function query(filters:Filters){return new URLSearchParams(filters).toString();}

async function exportReport(dashboard:ReportDashboard,filters:Filters){
 const params=new URLSearchParams(query(filters));params.set('dashboard',dashboard.id);
 const response=await fetch('/api/satchel/reports/export?'+params,{credentials:'same-origin'});
 if(!response.ok){const result=await response.json().catch(()=>({})) as {error?:string};throw new Error(result.error??'The report could not be exported');}
 if(!response.headers.get('content-type')?.includes('text/csv'))throw new Error('The report export did not return CSV');
 const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
 try{link.href=url;link.download=`satchel-report-${dashboard.id}.csv`;link.click();}finally{link.remove();URL.revokeObjectURL(url);}
}

export function Reports({run,tick,choose,navigate}:{run:Run;tick:number;choose:(id:string)=>void;navigate:()=>void}){
 const [draft,setDraft]=useState<Filters>(initialFilters),[filters,setFilters]=useState<Filters>(initialFilters);
 const [view,setView]=useState<ReportView>(),[selected,setSelected]=useState('status'),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let active=true;setLoading(true);
  api('/reports?'+query(filters)).then((data:ReportView)=>{if(active){setView(data);setLoading(false);}}).catch(error=>{if(active){setView(undefined);setLoading(false);void run(async()=>{throw error;});}});
  return()=>{active=false;};
 },[filters,tick]);
 const change=(name:keyof Filters,value:string)=>setDraft(previous=>({...previous,[name]:value}));
 const apply=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setFilters({...draft});};
 const dashboard=view?.dashboards.find(item=>item.id===selected);
 return <>
  <section className="panel"><h2>Report filters</h2>
   <form aria-label="Report filters" onSubmit={apply}>
    <div className="inline">
     <Field label="Report practice" name="practice"><select name="practice" value={draft.practice} onChange={event=>change('practice',event.target.value)}><option value="">All practices</option><option value="__none__">No practice</option>{view?.options.practices.map(practice=><option key={practice.code} value={practice.code}>{practice.name}</option>)}</select></Field>
     <Field label="Report owner" name="owner"><select name="owner" value={draft.owner} onChange={event=>change('owner',event.target.value)}><option value="">All owners</option><option value="__none__">Unassigned owner</option>{view?.options.owners.map(owner=><option key={owner.email} value={owner.email}>{owner.name}</option>)}</select></Field>
    </div>
    <div className="inline"><label>Opened from<input type="date" name="from" value={draft.from} max={draft.to||undefined} onChange={event=>change('from',event.target.value)}/></label><label>Opened through<input type="date" name="to" value={draft.to} min={draft.from||undefined} onChange={event=>change('to',event.target.value)}/></label></div>
    <Field label="Report case status" name="status"><select name="status" value={draft.status} onChange={event=>change('status',event.target.value)}><option value="">All case statuses</option><option value="open">Open</option><option value="closed">Closed</option></select></Field>
    <button type="submit" disabled={loading}>Apply report filters</button>
   </form>
  </section>
  {loading?<p role="status">Opening reports…</p>:view&&<>
   <p>{view.cohortCount} permitted matters in this cohort · As of {view.today} · {view.timezone}</p>
   <p>Dates use firm-local matter opening / lead receipt. Unattributed leads remain in conversion totals. Case status applies to matters.</p>
   <div className="grid">{view.dashboards.map(item=><section className="panel" key={item.id} aria-labelledby={`report-${item.id}-heading`}>
    <h2 id={`report-${item.id}-heading`}>{item.title}</h2>
    <button type="button" className={`record${selected===item.id?' current':''}`} aria-pressed={selected===item.id} aria-label={`Show ${item.title}`} onClick={()=>setSelected(item.id)}><strong>{item.count} records</strong>{item.total!==undefined&&<span>{reportTotal(item)}</span>}<span>Show {item.title}</span></button>
    <div className="actions"><button type="button" className="quiet" onClick={()=>run(()=>exportReport(item,filters),`${item.title} exported`)}>Export {item.title}</button></div>
   </section>)}</div>
   {dashboard&&<ReportTable dashboard={dashboard} owners={view.options.owners} practices={view.options.practices} openMatter={id=>{choose(id);navigate();}}/>}
  </>}
 </>;
}
