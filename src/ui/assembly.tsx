import {useEffect,useState} from 'react';
import {api,Empty,Field,Form,type Row,type Run} from './common';

type Question={key:string;label:string;type:string;required:boolean;options?:string[]};
type Paragraph={text:string;when?:{key:string;equals:string|number|boolean};repeat?:'parties'};
type Definition={jurisdiction:string;formVersion:string;questions:Question[];paragraphs:Paragraph[]};
type Template={id:string;name:string;version:number;versions:{version:number;definition:Definition}[]};
type Revision={id:string;number:number;templateId:string;templateVersion:number;answers:Row;paragraphs:string[];unresolved:string[];sha256:string;approved:{by:string;at:string;docxId:string;pdfId:string}|null};
type Assembled={id:string;title:string;revisions:Revision[]};
const questionTypes=[['text','Text'],['number','Number'],['date','Date'],['money','Money (USD)'],['choice','Choice'],['yesno','Yes / no']];
const matterFields=[['matter.title','Matter title'],['matter.number','Matter number'],['matter.client','Client'],['matter.caseNumber','Case number'],['matter.court','Court'],['matter.feeArrangement','Fee arrangement'],['matter.feeTerms','Fee terms'],['matter.insuranceLimit','Insurance limit (USD)']];
const newest=(assembly?:Assembled)=>assembly?.revisions.reduce<Revision|undefined>((latest,r)=>!latest||r.number>latest.number?r:latest,undefined);
const answerDraft=(definition:Definition|undefined,answers:Row)=>Object.fromEntries(Object.entries(answers).map(([key,value])=>[key,definition?.questions.find(q=>q.key===key)?.type==='money'?(Number(value)/100).toFixed(2):value]));
const unresolvedLabel=(field:string,definition?:Definition)=>field==='parties'?'Matter parties':field.startsWith('answer.')?definition?.questions.find(q=>q.key===field.slice(7))?.label??field.slice(7):matterFields.find(([key])=>key===field)?.[1]??(field.startsWith('custom.')?'Custom matter field: '+field.slice(7):field);

function QuestionEditor({question,index,change,remove}:{question:Question;index:number;change:(q:Question)=>void;remove:()=>void}){
 return <fieldset className="record"><legend>Question {index+1}</legend>
  <label>Question wording<input required value={question.label} onChange={e=>change({...question,label:e.target.value})}/></label>
  <div className="inline"><label>Answer reference<input required maxLength={40} pattern="[a-z][a-z0-9_]*" title="Start with a lowercase letter; use lowercase letters, numbers and underscores." value={question.key} onChange={e=>change({...question,key:e.target.value})}/></label>
   <label>Answer type<select value={question.type} onChange={e=>{const {options:_,...q}=question;change({...q,type:e.target.value,...(e.target.value==='choice'?{options:[]}: {})});}}>{questionTypes.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label></div>
  <label className="check"><input type="checkbox" checked={question.required} onChange={e=>change({...question,required:e.target.checked})}/>Required before approval</label>
  {question.type==='choice'&&<label>Choices, one per line<textarea required rows={3} value={(question.options??[]).join('\n')} onChange={e=>change({...question,options:e.target.value.split('\n')})}/></label>}
  <button type="button" className="quiet" onClick={remove}>Remove question {index+1}</button>
 </fieldset>;
}

function ParagraphEditor({paragraph,index,questions,change,remove}:{paragraph:Paragraph;index:number;questions:Question[];change:(p:Paragraph)=>void;remove:()=>void}){
 const [custom,setCustom]=useState('');
 const condition=questions.find(q=>q.key===paragraph.when?.key);
 const insert=(field:string)=>{if(field)change({...paragraph,text:paragraph.text+'{{'+field+'}}'});};
 return <fieldset className="record"><legend>Paragraph {index+1}</legend>
  <label>Paragraph text<textarea required rows={4} value={paragraph.text} onChange={e=>change({...paragraph,text:e.target.value})}/></label>
  <label>Insert a detail<select value="" onChange={e=>insert(e.target.value)}><option value="">Choose a detail to add to the paragraph</option>
   <optgroup label="Matter details">{matterFields.map(([key,label])=><option value={key} key={key}>{label}</option>)}</optgroup>
   {questions.length>0&&<optgroup label="Questionnaire answers">{questions.filter(q=>q.key).map((q,i)=><option value={'answer.'+q.key} key={i}>{q.label||q.key}</option>)}</optgroup>}
   {paragraph.repeat&&<optgroup label="Current party"><option value="party.name">Party name</option><option value="party.relation">Party relationship</option></optgroup>}
  </select></label>
  <details><summary>Insert a custom matter field</summary><label>Custom field reference<input value={custom} onChange={e=>setCustom(e.target.value)}/></label><button type="button" className="quiet" disabled={!custom.trim()} onClick={()=>insert('custom.'+custom.trim())}>Insert custom field</button></details>
  <label className="check"><input type="checkbox" checked={paragraph.repeat==='parties'} onChange={e=>{const {repeat:_,...p}=paragraph;change(e.target.checked?{...p,repeat:'parties'}:p);}}/>Repeat this paragraph for each party</label>
  <label>Include this paragraph<select value={paragraph.when?.key??''} onChange={e=>{const {when:_,...p}=paragraph;const question=questions.find(q=>q.key===e.target.value);change(e.target.value?{...p,when:{key:e.target.value,equals:question?.type==='yesno'?true:''}}:p);}}><option value="">Always</option>{questions.filter(q=>q.key).map((q,i)=><option value={q.key} key={i}>When {q.label||q.key} matches</option>)}</select></label>
  {paragraph.when&&<label>Include when the answer is{condition?.type==='yesno'?<select value={String(paragraph.when.equals)} onChange={e=>change({...paragraph,when:{key:paragraph.when!.key,equals:e.target.value==='true'}})}><option value="true">Yes</option><option value="false">No</option></select>:condition?.type==='choice'?<select required value={String(paragraph.when.equals)} onChange={e=>change({...paragraph,when:{key:paragraph.when!.key,equals:e.target.value}})}><option value="">Choose an answer</option>{condition.options?.map((o,i)=><option key={i} value={o}>{o}</option>)}</select>:<input required value={String(paragraph.when.equals)} onChange={e=>change({...paragraph,when:{key:paragraph.when!.key,equals:e.target.value}})}/>}</label>}
  <button type="button" className="quiet" onClick={remove}>Remove paragraph {index+1}</button>
 </fieldset>;
}

function TemplateEditor({template,run,saved}:{template?:Template;run:Run;saved:(template:Template)=>void}){
 const definition=template?.versions.find(v=>v.version===template.version)?.definition;
 const [questions,setQuestions]=useState<Question[]>(definition?.questions??[]);
 const [paragraphs,setParagraphs]=useState<Paragraph[]>(()=>definition?.paragraphs.map(p=>p.when&&definition?.questions.find(q=>q.key===p.when!.key)?.type==='money'?{...p,when:{...p.when,equals:(Number(p.when.equals)/100).toFixed(2)}}:p)??[{text:''}]);
 return <Form label={template?'Save new template version':'Create template'} submit={data=>run(async()=>{
  const cleaned=questions.map(q=>({...q,key:q.key.trim(),label:q.label.trim(),...(q.type==='choice'?{options:q.options?.map(o=>o.trim()).filter(Boolean)}:{})}));
  if(new Set(cleaned.map(q=>q.key)).size!==cleaned.length)throw new Error('Give every question a different answer reference.');
  if(!paragraphs.length)throw new Error('Add at least one document paragraph.');
  const missing=paragraphs.find(p=>p.when&&!cleaned.some(q=>q.key===p.when!.key));
  if(missing)throw new Error('A paragraph refers to a question that was removed. Choose its inclusion rule again.');
  saved(await api('/assembly/templates',{...(template?{id:template.id,expectedVersion:template.version}:{}),name:data.name,definition:{jurisdiction:data.jurisdiction,formVersion:data.formVersion,questions:cleaned,paragraphs}}));
 },template?'New template version saved; existing documents keep their recorded versions':'Document template created')}>
  {template&&<p>Editing version {template.version}. Saving creates a new version.</p>}
  <Field label="Template name" name="name" value={template?.name}/>
  <div className="inline"><Field label="Jurisdiction" name="jurisdiction" value={definition?.jurisdiction}/><Field label="Court form version" name="formVersion" value={definition?.formVersion}/></div>
  <h3>Questionnaire</h3><p>Add the questions staff must answer before a lawyer reviews the document.</p>
  {questions.map((question,index)=><QuestionEditor key={index} question={question} index={index} change={q=>setQuestions(previous=>previous.map((item,i)=>i===index?q:item))} remove={()=>setQuestions(previous=>previous.filter((_,i)=>i!==index))}/>)}
  <button type="button" className="quiet" onClick={()=>setQuestions(previous=>[...previous,{key:'',label:'',type:'text',required:false}])}>Add question</button>
  <h3>Document paragraphs</h3><p>Write the document in order. Insert matter details or answers where they belong.</p>
  {paragraphs.map((paragraph,index)=><ParagraphEditor key={index} paragraph={paragraph} index={index} questions={questions} change={p=>setParagraphs(previous=>previous.map((item,i)=>i===index?p:item))} remove={()=>setParagraphs(previous=>previous.filter((_,i)=>i!==index))}/>)}
  <button type="button" className="quiet" onClick={()=>setParagraphs(previous=>[...previous,{text:''}])}>Add paragraph</button>
 </Form>;
}

function AnswerField({question,value,change}:{question:Question;value:unknown;change:(value:string|boolean)=>void}){
 const label=question.label+(question.type==='money'?' (USD)':'')+(question.required?' (required)':'');
 const text=value===undefined||value===null?'':String(value);
 if(question.type==='choice'||question.type==='yesno')return <label>{label}<select value={text} onChange={e=>change(question.type==='yesno'&&e.target.value!==''?e.target.value==='true':e.target.value)}><option value="">Not answered</option>{question.type==='yesno'?<><option value="true">Yes</option><option value="false">No</option></>:question.options?.map(o=><option value={o} key={o}>{o}</option>)}</select></label>;
 return <label>{label}<input type={question.type==='date'?'date':['number','money'].includes(question.type)?'number':'text'} min={question.type==='money'?'0':undefined} step={question.type==='money'?'0.01':question.type==='number'?'any':undefined} value={text} onChange={e=>change(e.target.value)}/></label>;
}

function RevisionText({revision,label}:{revision:Revision;label:string}){
 return <article aria-label={label}><h3>{label}</h3><p>Revision {revision.number} · template version {revision.templateVersion}</p>{revision.paragraphs.length?revision.paragraphs.map((p,i)=><p key={i} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{p}</p>):<p>No paragraphs rendered.</p>}</article>;
}

function RevisionReview({assembly,actor,run,templates}:{assembly:Assembled;actor:Row;run:Run;templates:Template[]}){
 const latest=newest(assembly)!;
 const [reviewId,setReviewId]=useState(latest.id),[compareId,setCompareId]=useState('');
 const revision=assembly.revisions.find(r=>r.id===reviewId)??latest;
 const comparison=assembly.revisions.find(r=>r.id===compareId&&r.number<revision.number);
 const template=templates.find(t=>t.id===revision.templateId);
 const definition=template?.versions.find(v=>v.version===revision.templateVersion)?.definition;
 return <article className="record"><h3>{assembly.title}</h3>
  <div className="inline"><label>Revision to review<select value={revision.id} onChange={e=>setReviewId(e.target.value)}>{assembly.revisions.map(r=><option value={r.id} key={r.id}>Revision {r.number}{r.approved?' · approved':' · awaiting review'}</option>)}</select></label>
   <label>Compare with revision<select value={comparison?.id??''} onChange={e=>setCompareId(e.target.value)}><option value="">No comparison</option>{assembly.revisions.filter(r=>r.number<revision.number).map(r=><option value={r.id} key={r.id}>Revision {r.number}</option>)}</select></label></div>
  <p>{template?.name} · template version {revision.templateVersion}{definition?.jurisdiction?' · '+definition.jurisdiction:''}{definition?.formVersion?' · court form '+definition.formVersion:''}</p>
  <details><summary>Saved questionnaire answers</summary>{Object.keys(revision.answers).length?<dl>{Object.entries(revision.answers).map(([key,value])=><div key={key}><dt>{definition?.questions.find(q=>q.key===key)?.label??key}</dt><dd>{typeof value==='boolean'?(value?'Yes':'No'):definition?.questions.find(q=>q.key===key)?.type==='money'?'USD '+(Number(value)/100).toFixed(2):String(value)}</dd></div>)}</dl>:<p>No answers recorded.</p>}</details>
  {revision.unresolved.length>0?<div className="error" role="alert"><strong>Resolve before approval</strong><ul>{revision.unresolved.map((field,i)=><li key={i}>{unresolvedLabel(field,definition)}</li>)}</ul><p>Update the questionnaire or matter details, then save a new revision.</p></div>:<p className="notice">All required details are resolved. Review the complete document before approval.</p>}
  {comparison?<div className="grid" aria-label="Revision comparison"><RevisionText revision={comparison} label="Earlier document"/><RevisionText revision={revision} label="Document under review"/></div>:<RevisionText revision={revision} label="Document preview"/>}
  <p>{revision.approved?'Review the files retained for this approved revision.':'Review these draft files before approval. They are for staff review and have not been sent.'}</p><div className="actions"><a href={'/api/satchel/assembly/revisions/'+revision.id+'/preview?format=docx'}>Review DOCX</a><a href={'/api/satchel/assembly/revisions/'+revision.id+'/preview?format=pdf'}>Review PDF</a></div>
  {revision.approved?<><p className="notice">Approved by {revision.approved.by} · {revision.approved.at.slice(0,10)}</p><div className="actions"><a href={'/api/satchel/assembly/revisions/'+revision.id+'/file?format=docx'}>Download approved DOCX</a><a href={'/api/satchel/assembly/revisions/'+revision.id+'/file?format=pdf'}>Download approved PDF</a></div></>:revision.id!==latest.id?<p>A newer revision exists. Select the latest revision to approve the document.</p>:['owner','lawyer'].includes(actor.role)?<><p>Approval covers this saved questionnaire and document revision.</p><button disabled={revision.unresolved.length>0} onClick={()=>run(()=>api('/assembly/revisions/'+revision.id+'/approve',{sha256:revision.sha256}),'Document revision approved; DOCX and PDF are ready')}>Approve document revision</button></>:<p>A lawyer or the principal must approve this revision before files can be downloaded.</p>}
 </article>;
}

export function Assembly({matterId,actor,run,tick}:{matterId:string;actor:Row;run:Run;tick:number}){
 const [templates,setTemplates]=useState<Template[]>([]),[assemblies,setAssemblies]=useState<Assembled[]>([]);
 const [loaded,setLoaded]=useState(''),[loadError,setLoadError]=useState(''),[reload,setReload]=useState(0);
 const [assemblyId,setAssemblyId]=useState(''),[templateId,setTemplateId]=useState(''),[version,setVersion]=useState(0),[answers,setAnswers]=useState<Row>({}),[editTemplate,setEditTemplate]=useState(''),[expectedRevision,setExpectedRevision]=useState(0);
 useEffect(()=>{setAssemblyId('');setTemplateId('');setVersion(0);setAnswers({});setExpectedRevision(0);setLoaded('');setLoadError('');},[matterId]);
 useEffect(()=>{let active=true;if(matterId)Promise.all([api('/assembly/templates'),api('/matters/'+matterId+'/assembly')]).then(([t,a])=>{if(active){setTemplates(t.templates);setAssemblies(a.assemblies);setLoaded(matterId+':'+tick);setLoadError('');}}).catch(e=>{if(active)setLoadError(e.message);});return()=>{active=false;};},[matterId,tick,reload]);
 if(!matterId)return null;
 const ready=loaded===matterId+':'+tick;
 const selected=assemblies.find(a=>a.id===assemblyId),latest=newest(selected);
 const template=templates.find(t=>t.id===templateId),definition=template?.versions.find(v=>v.version===version)?.definition;
 const selectTemplate=(id:string)=>{const t=templates.find(item=>item.id===id);setTemplateId(id);setVersion(t?.version??0);setAnswers({});};
 const chooseAssembly=(id:string)=>{setAssemblyId(id);const revision=newest(assemblies.find(a=>a.id===id));if(revision){setTemplateId(revision.templateId);setVersion(revision.templateVersion);setExpectedRevision(revision.number);setAnswers(answerDraft(templates.find(t=>t.id===revision.templateId)?.versions.find(v=>v.version===revision.templateVersion)?.definition,revision.answers));}else{setTemplateId('');setVersion(0);setAnswers({});setExpectedRevision(0);}};
 return <section className="panel" aria-label="Document assembly"><h2>Assemble a document</h2><p>Choose a versioned template, answer its questions and save a preview for lawyer review.</p>
  {loadError&&<p className="error" role="alert">{loadError}</p>}
  {loadError?<button className="quiet" onClick={()=>setReload(n=>n+1)}>Reload document assembly</button>:!ready&&<p role="status">Loading document assembly…</p>}
  <fieldset className="content" disabled={!ready} aria-busy={!ready}>
   <div className="grid"><div><h3>Questionnaire</h3>
    <label>Document to prepare<select value={assemblyId} onChange={e=>chooseAssembly(e.target.value)}><option value="">New document</option>{assemblies.map(a=><option value={a.id} key={a.id}>{a.title} · revision {newest(a)?.number}</option>)}</select></label>
    <label>Document template<select value={templateId} onChange={e=>selectTemplate(e.target.value)}><option value="">Choose a template</option>{templates.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
    {template&&<label>Template version<select value={version} onChange={e=>{setVersion(Number(e.target.value));setAnswers({});}}>{template.versions.map(v=><option value={v.version} key={v.version}>Version {v.version}{v.definition.formVersion?' · court form '+v.definition.formVersion:''}</option>)}</select></label>}
    {definition&&<><p>{definition.jurisdiction}{definition.formVersion?' · court form '+definition.formVersion:''}</p>{latest&&<p>Editing answers from revision {expectedRevision}. Saving creates a new revision for comparison.</p>}
     {latest&&latest.number!==expectedRevision&&<div className="notice"><p>A newer questionnaire has been saved. Reopen its answers before continuing.</p><button type="button" className="quiet" onClick={()=>chooseAssembly(assemblyId)}>Reload latest questionnaire</button></div>}
     <Form label={selected?'Save new document revision':'Save document preview'} submit={()=>run(async()=>{
      const values:Row={};for(const question of definition.questions){const value=answers[question.key];if(value!==undefined&&value!==null&&value!=='')values[question.key]=value;}
      const revision:Revision=await api('/matters/'+matterId+'/assembly',{templateId:template!.id,templateVersion:version,...(selected?{assemblyId:selected.id,expectedRevision}:{}),answers:values});
      const state:{assemblies:Assembled[]}=await api('/matters/'+matterId+'/assembly');
      const saved=state.assemblies.find(a=>a.revisions.some(r=>r.id===revision.id));
      if(!saved)throw new Error('The saved document could not be reopened. Reload document assembly before continuing.');
      setAssemblies(state.assemblies);setAssemblyId(saved.id);setExpectedRevision(revision.number);setAnswers(answerDraft(definition,revision.answers));
     },'Document preview saved; review required details and paragraphs below')}>
      {definition.questions.map(q=><AnswerField key={q.key} question={q} value={answers[q.key]} change={value=>setAnswers(previous=>({...previous,[q.key]:value}))}/>)}
      {!definition.questions.length&&<p>This template uses matter details and has no questionnaire questions.</p>}<small>Save a preview to see unresolved details. Complete every required detail before approval.</small>
     </Form></>}
    {!templates.length&&ready&&<Empty>No document templates yet.</Empty>}
   </div><div><details><summary>Manage document templates</summary><p>Each save creates a separate template version. Existing previews keep the version used to prepare them.</p><label>Template to edit<select value={editTemplate} onChange={e=>setEditTemplate(e.target.value)}><option value="">New template</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name} · version {t.version}</option>)}</select></label><TemplateEditor key={editTemplate+':'+(templates.find(t=>t.id===editTemplate)?.version??0)} template={templates.find(t=>t.id===editTemplate)} run={run} saved={t=>{setTemplates(previous=>[...previous.filter(item=>item.id!==t.id),t]);setEditTemplate(t.id);}}/></details></div></div>
   <h3>Saved documents</h3>{!assemblies.length&&ready&&<Empty>No assembled documents yet. Save a preview to begin review.</Empty>}{assemblies.map(a=><RevisionReview key={a.id+':'+a.revisions.map(r=>r.id+':'+Boolean(r.approved)).join(',')} assembly={a} templates={templates} actor={actor} run={run}/>)}
  </fieldset>
 </section>;
}
