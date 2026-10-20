import {atomic,audit,id,insist,type Actor,type Data} from './model';
import {reportState} from './reports';
export async function exportReport(db:D1Database,actor:Actor,filters:Data){
 const report=await reportState(db,actor,filters),dashboard=report.dashboards.find(d=>d.id===filters.dashboard);
 insist(dashboard,'Choose a report dashboard');
 const view=filters.view??'all';insist(['all','overdue','converted'].includes(view),'Choose all, overdue or converted report rows');
 insist(view==='all'||(view==='overdue'&&['deadlines','workload'].includes(dashboard.id))||(view==='converted'&&dashboard.id==='conversion'),'This dashboard does not have that count');
 const selected=dashboard.rows.filter((r:Data)=>view==='all'||(view==='overdue'?r.overdue:r.status==='converted'));
 const cell=(value:unknown)=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const keys=['id','matterId','matterNumber','leadId','title','ownerEmail','practiceCode','status','date','detail','value','durationMs','overdue'];
 const csv=[keys,...selected.map((r:Data)=>keys.map(k=>r[k]??''))].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
 await atomic(db,actor,[audit(db,actor,'report.exported',id(),JSON.stringify({dashboard:dashboard!.id,filters:report.filters,asOf:report.asOf,rows:selected.length,view}))]);
 return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="satchel-${dashboard!.id}.csv"`,'cache-control':'private, no-store'}});
}
