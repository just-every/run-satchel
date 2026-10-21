import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
import {DocumentPreview} from './document-preview';
export function DocumentReview({document,version,run,tick}:{document:Row;version:number;run:Run;tick:number}){
 const [review,setReview]=useState<Row>({annotations:[],conflicts:[]}),[selected,setSelected]=useState('');
 useEffect(()=>{let active=true;api('/documents/'+document.id+'/review').then(v=>{if(active)setReview(v);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[document.id,tick]);
 const conflict=review.conflicts.find((c:Row)=>c.id===selected),base='/documents/'+document.id;
 return <section aria-label="Version review"><h4>Separate annotations · version {version}</h4>
  {review.annotations.filter((a:Row)=>a.version===version).map((a:Row)=><p key={a.id}>Page / section {a.page}: {a.note}<br/><small>{a.created_by} · {a.created_at}</small></p>)}
  <Form label="Save separate annotation" submit={v=>run(async()=>{await api(base+'/annotations',{version,page:Number(v.page),note:v.note});},'Annotation saved separately; original unchanged')}><Field label="Page or section" name="page" type="number" value={1}/><Field label="Annotation" name="note"><textarea name="note" required maxLength={4000}/></Field></Form>
  {review.conflicts.length>0&&<><h4>Retained save conflicts</h4><p>A conflicting save keeps its exact attempted original separately. Compare it before appending; reviewed source citations keep their original version.</p>
   <label>Conflict copy<select aria-label="Conflict copy" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a retained copy</option>{review.conflicts.map((c:Row)=><option key={c.id} value={c.id}>{c.name} · {c.created_by} · {c.created_at}{c.resolved_at?' · resolved':''}</option>)}</select></label>
   {conflict&&<><p>{conflict.resolved_at?'Resolved as version '+conflict.resolved_version:'Unresolved conflict'} · Base revision {conflict.base_revision}</p>
    <div className="document-comparison"><DocumentPreview documentId={document.id} version={document.versions.find((v:Row)=>v.version===document.currentVersion)}/><DocumentPreview documentId={document.id} version={{version:'conflict',name:conflict.name,mime:conflict.mime,declaredMime:conflict.declared_mime,size:conflict.size,sha256:conflict.sha256,createdBy:conflict.created_by,createdAt:conflict.created_at}} sourceUrl={'/api/satchel'+base+'/conflicts/'+conflict.id+'/file'}/></div>
    {!conflict.resolved_at&&<button type="button" onClick={()=>void run(async()=>{await api(base+'/conflicts/'+conflict.id+'/resolve',{revision:document.revision});},'Conflict resolved; original versions retained')}>Append retained conflict as a new version</button>}</>}
  </>}
 </section>;
}
