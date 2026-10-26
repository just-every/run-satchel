import {ProductionReleases} from './production-releases';
import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
import {renderProductionPages} from './production-rendering';

// Reuse the existing document panels and labeled controls.
export function DocumentProductions({matterId,actor,documents,run,tick}:{matterId:string;actor:Row;documents:Row[];run:Run;tick:number}){
 const [packets,setPackets]=useState<Row[]>([]),allowed=['owner','lawyer'].includes(actor.role);
 useEffect(()=>{setPackets([]);},[matterId,allowed]);
 useEffect(()=>{if(!allowed)return;let active=true;api('/matters/'+matterId+'/productions').then(result=>{if(active)setPackets(result);}).catch(error=>{if(active)void run(async()=>{throw error;});});return()=>{active=false;};},[matterId,tick,allowed]);
 if(!allowed)return null;
 const available=documents.filter(d=>!d.erasedAt);
 return <section className="panel" aria-label="Evidence productions"><h2>Evidence productions</h2>
  <p>Prepare PDF originals with Bates numbers, privilege labels and whole-page redactions. Selected pages are replaced with black pages; retained pages in a selectively redacted PDF are rendered to sanitized images. Originals remain separate.</p>
  <details><summary>Production limits and release policy</summary><p>Maximum 20 sources, 500 produced pages and 1 MiB per packet. Other formats can be withheld. The principal authorizes each release to one authenticated recipient with an expiry. An unopened release can be recalled; an opened packet remains disclosed in the audit.</p></details>
  <Form label="Prepare production" submit={data=>run(async()=>{
   const items=available.filter(d=>data[d.id+'.disposition']!=='exclude').map(d=>({
    documentId:d.id,revision:d.revision,version:d.currentVersion,
    withheld:data[d.id+'.disposition']==='withhold',privilege:String(data[d.id+'.privilege']||'None'),
    redactedPages:String(data[d.id+'.pages']||'').trim()?String(data[d.id+'.pages']).split(',').map(value=>Number(value.trim())):[],
    reason:data[d.id+'.reason']
   }));
   for(const item of items)if(!item.withheld&&item.redactedPages.length){const source=available.find(d=>d.id===item.documentId)!;Object.assign(item,{renderedPages:await renderProductionPages(source,item.redactedPages)});}
   await api('/matters/'+matterId+'/productions',{items,recipientName:data.recipientName,recipientEmail:data.recipientEmail,batesPrefix:data.batesPrefix,batesStart:Number(data.batesStart)});
  },'Production prepared for counsel review')}>
   <Field label="Intended recipient name" name="recipientName"/><Field label="Intended recipient email" name="recipientEmail" type="email"/>
   <Field label="Bates prefix" name="batesPrefix" value="PROD-"/><Field label="First Bates number" name="batesStart" type="number" value={1}/>
   {available.map(d=><details key={d.id}><summary>{d.title} · version {d.currentVersion}</summary>
    <Field label={'Production choice for '+d.title} name={d.id+'.disposition'}><select aria-label={'Production choice for '+d.title} name={d.id+'.disposition'} defaultValue="exclude"><option value="exclude">Do not select</option><option value="produce">Produce PDF</option><option value="withhold">Withhold entire original</option></select></Field>
    <Field label={'Privilege label for '+d.title} name={d.id+'.privilege'} value="None"/>
    <Field label={'Whole pages to redact in '+d.title+' (comma separated)'} name={d.id+'.pages'} required={false}/>
    <Field label={'Withholding or redaction reason for '+d.title} name={d.id+'.reason'} required={false}/>
   </details>)}
  </Form>
  <button className="quiet" onClick={()=>run(async()=>{setPackets(await api('/matters/'+matterId+'/productions'));},'Production status refreshed')}>Refresh production status</button>
  {packets.map(p=><article className="record" key={p.id}><h3>Production for {p.snapshot?.recipient.name??'Erased source'}</h3>
   <p>{p.status} · {p.size} bytes</p><p className="document-hash">Packet SHA-256 {p.sha256}</p>
   {p.snapshot&&<><p>Intended recipient: {p.snapshot.recipient.email}</p><p>{p.snapshot.scope}</p>
    <details><summary>Manifest and privilege log</summary>{p.snapshot.items.map((item:Row)=><div key={item.documentId}><strong>{item.title} · source version {item.version}</strong><p>{item.withheld?'Withheld':item.firstBates+' through '+item.lastBates} · Privilege: {item.privilege}</p>{item.redactedPages.length>0&&<p>Whole pages redacted: {item.redactedPages.join(', ')}</p>}{item.reason&&<p>Reason: {item.reason}</p>}{item.holds?.map((hold:Row)=><p key={hold.id}>Legal hold: {hold.reason}</p>)}<p className="document-hash">Source SHA-256 {item.sourceSha256}</p>{item.producedSha256&&<p className="document-hash">Produced SHA-256 {item.producedSha256}</p>}</div>)}</details>
   </>}
   {['draft','approved'].includes(p.status)&&<a href={'/api/satchel/productions/'+p.id+'/preview'}>Download review packet</a>}
   {p.status==='draft'&&<Form label="Approve exact production" submit={data=>run(()=>api('/productions/'+p.id+'/approve',{sha256:p.sha256,reviewNote:data.reviewNote}),'Exact production approved for internal export')}><Field label="Counsel review note" name="reviewNote"/></Form>}
   {p.status==='approved'&&<p><a href={'/api/satchel/productions/'+p.id+'/file'}>Export approved production</a></p>}
   {p.exported_at&&<p>First internal export: {p.exported_at}.</p>}
   {p.snapshot&&<ProductionReleases packet={p} actor={actor} run={run}/>}
   {['draft','approved'].includes(p.status)&&!p.exported_at&&<Form label="Recall unexported production" submit={data=>run(()=>api('/productions/'+p.id+'/recall',{reason:data.reason}),'Unexported production recalled')}><Field label="Recall reason" name="reason"/></Form>}
  </article>)}
 </section>;
}
