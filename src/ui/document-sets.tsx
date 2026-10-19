import {useEffect,useState,type ReactNode} from 'react';
import {api,Empty,Field,Form,type Row,type Run} from './common';
type Props={matterId:string;actor:Row;documents:Row[];run:Run;tick:number;children:(visible:Row[],selected:string[],toggle:(id:string)=>void)=>ReactNode};
export function DocumentSets({matterId,actor,documents,run,tick,children}:Props){
 const [state,setState]=useState<Row>(),[filter,setFilter]=useState<Row>({}),[selected,setSelected]=useState<string[]>([]),[preview,setPreview]=useState<Row>();
 const base='/matters/'+matterId+'/document-sets';
 useEffect(()=>{setFilter({});setSelected([]);setPreview(undefined);setState(undefined);},[matterId]);
 useEffect(()=>{let active=true;api(base).then(s=>{if(active)setState(s);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[matterId,tick]);
 useEffect(()=>{setSelected(ids=>ids.filter(id=>documents.some(d=>d.id===id&&!d.erasedAt)));},[documents]);
 const change=(key:string,value:any)=>setFilter(f=>({...f,[key]:value}));
 const visible=documents.filter(d=>(filter.folderId===undefined||d.folderId===filter.folderId)&&(!filter.tag||d.tags.includes(filter.tag))&&(!filter.documentType||d.documentType===filter.documentType)&&(!filter.query||!d.erasedAt&&`${d.title} ${d.documentType} ${d.tags.join(' ')}`.toLowerCase().includes(filter.query.toLowerCase()))&&(!filter.duplicatesOnly||d.duplicates.length));
 const toggle=(id:string)=>{setPreview(undefined);setSelected(ids=>ids.includes(id)?ids.filter(v=>v!==id):[...ids,id]);};
 const editable=visible.filter(d=>!d.erasedAt&&(actor.role==='owner'||d.createdBy===actor.email));
 return <>
  <section className="panel"><h2>Document folders & views</h2>
   {!state?<p>Opening document folders…</p>:<>
    <label>Document folder<select aria-label="Document folder" value={filter.folderId===undefined?'all':filter.folderId??'unfiled'} onChange={e=>change('folderId',e.target.value==='all'?undefined:e.target.value==='unfiled'?null:e.target.value)}><option value="all">All documents ({state.total})</option><option value="unfiled">Unfiled ({state.unfiledCount})</option>{state.folders.map((f:Row)=><option key={f.id} value={f.id}>{f.name} ({f.count})</option>)}</select></label>
    <label>Find documents<input value={filter.query??''} onChange={e=>change('query',e.target.value)}/></label>
    <label>Filter by tag<select value={filter.tag??''} onChange={e=>change('tag',e.target.value)}><option value="">All tags</option>{state.tags.map((t:Row)=><option key={t.name} value={t.name}>{t.name} ({t.count})</option>)}</select></label>
    <label>Filter by document type<select value={filter.documentType??''} onChange={e=>change('documentType',e.target.value)}><option value="">All types</option>{state.documentTypes.map((t:Row)=><option key={t.name} value={t.name}>{t.name} ({t.count})</option>)}</select></label>
    <label><input type="checkbox" checked={Boolean(filter.duplicatesOnly)} onChange={e=>change('duplicatesOnly',e.target.checked)}/>Show hash duplicates only</label>
    <p role="status">{visible.length} accessible {visible.length===1?'document':'documents'} in this view</p>
    <Form label="Create folder" submit={d=>run(async()=>{await api(base+'/folder',{name:d.name});},'Folder created')}><Field label="Folder name" name="name"/></Form>
    <Form label="Save current view" submit={d=>run(async()=>{await api(base+'/view',{name:d.name,filters:filter});},'Document view saved')}><Field label="View name" name="name"/></Form>
    {state.views.map((v:Row)=><button className="quiet" key={v.id} onClick={()=>setFilter(v.filters)}>{v.name} ({v.count})</button>)}
   </>}
  </section>
  {children(visible,selected,toggle)}
  <section className="panel"><h2>Bulk filing</h2><p>{selected.length} selected. Filing preserves originals, versions and readers.</p>
   <button className="quiet" onClick={()=>{setPreview(undefined);setSelected(editable.map(d=>d.id));}}>Select editable documents in this view</button>{selected.length>0&&<button className="quiet" onClick={()=>{setSelected([]);setPreview(undefined);}}>Clear selection</button>}
   <Form label="Preview filing" submit={d=>run(async()=>{
    const body:Row={documents:selected.map(id=>({id,revision:documents.find(v=>v.id===id)?.revision}))};
    if(d.folderId)body.folderId=d.folderId==='unfiled'?null:d.folderId;
    if(d.changeTags)body.tags=String(d.tags??'').split(',').map(t=>t.trim()).filter(Boolean);
    if(d.changeType)body.documentType=String(d.documentType??'').trim();
    setPreview(await api(base+'/preview',body));
   },'Filing preview ready')}>
    <Field label="Destination folder" name="folderId"><select name="folderId"><option value="">Keep each current folder</option><option value="unfiled">Unfiled</option>{state?.folders.map((f:Row)=><option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
    <label><input type="checkbox" name="changeTags"/>Replace tags on selected documents</label><Field label="Tags, separated by commas" name="tags" required={false}/>
    <label><input type="checkbox" name="changeType"/>Set document type on selected documents</label><Field label="Document type" name="documentType" required={false}/>
   </Form>
  </section>
  {preview&&<section className="panel"><h2>Review exact filing</h2><p>Review these destinations and existing permissions before applying.</p>{preview.items.map((d:Row)=><article className="record" key={d.id}><strong>{d.title}</strong><p>{d.before.folderName} → {d.after.folderName}</p><p>Tags: {d.before.tags.join(', ')||'None'} → {d.after.tags.join(', ')||'None'}</p><p>Type: {d.before.documentType||'None'} → {d.after.documentType||'None'}</p><p>{d.permissions} · Version {d.currentVersion} retained</p></article>)}<button onClick={()=>run(async()=>{await api(base+'/apply',{previewId:preview.id});setPreview(undefined);setSelected([]);},'Documents filed; originals and readers retained')}>Apply reviewed filing</button><button className="quiet" onClick={()=>setPreview(undefined)}>Discard preview</button></section>}
  {state&&documents.length===0&&<Empty>Upload originals to begin filing this matter.</Empty>}
 </>;
}
