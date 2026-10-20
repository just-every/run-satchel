import {Empty} from './common';

export type ReportRow={
 id:string;matterId?:string;leadId?:string;matterNumber?:string;title:string;
 ownerEmail?:string;practiceCode?:string;value:number|null;status?:string;date?:string;detail?:string;
};
export type ReportDashboard={id:string;title:string;unit:string;rows:ReportRow[];count:number;total?:number};
export const reportNumber=(value:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
export const reportTotal=(dashboard:ReportDashboard)=>dashboard.total===undefined?'':dashboard.id==='conversion'?`${reportNumber(dashboard.total)} converted of ${dashboard.count} leads`:`Total: ${reportNumber(dashboard.total)} ${dashboard.unit}`;

export function ReportTable({dashboard,owners,practices,openMatter}:{
 dashboard:ReportDashboard;owners:{email:string;name:string}[];practices:{code:string;name:string}[];
 openMatter:(id:string)=>void;
}){
 return <section className="panel" aria-labelledby="report-detail-heading">
  <h2 id="report-detail-heading">{dashboard.title} details</h2>
  <p>{dashboard.count} records{dashboard.total!==undefined&&` · ${reportTotal(dashboard)}`}</p>
  {!dashboard.rows.length?<Empty>No matching report rows.</Empty>:<div className="table-scroll" tabIndex={0} role="region" aria-label={`${dashboard.title} report rows`}>
   <table><caption>{dashboard.title} · filtered source records</caption><thead><tr><th scope="col">Record</th><th scope="col">Owner</th><th scope="col">Practice</th><th scope="col">Status</th><th scope="col">Date</th><th scope="col">Detail</th><th scope="col">Value ({dashboard.unit})</th></tr></thead>
    <tbody>{dashboard.rows.map(row=><tr key={row.id}>
     <td><strong>{row.title}</strong>{row.matterId&&row.matterNumber?<div className="actions"><button type="button" className="quiet" onClick={()=>openMatter(row.matterId!)}>Open matter {row.matterNumber}</button></div>:row.leadId?<p><small>Lead {row.leadId}</small></p>:null}</td>
     <td>{row.ownerEmail?(owners.find(owner=>owner.email===row.ownerEmail)?.name??row.ownerEmail):'Unassigned'}</td>
     <td>{row.practiceCode?(practices.find(practice=>practice.code===row.practiceCode)?.name??row.practiceCode):'No practice'}</td>
     <td>{row.status??'—'}</td><td>{row.date??'—'}</td><td>{row.detail??'—'}</td><td>{row.value===null?'Not recorded':reportNumber(row.value)}</td>
    </tr>)}</tbody>
   </table>
  </div>}
 </section>;
}
