import {useEffect,useRef,useState} from 'react';
import {LeadPractice} from './lead-practice';
import {api,Field,Form,type Row,type Run} from './common';

type Question={key:string;label:string;type:'text'|'select'|'date'|'yesno';required:boolean;options?:string[];when?:{key:string;equals:string}};
type Draft={id?:string;revision?:string;version?:number;title:string;practice:string;practiceCode?:string|null;firmName:string;logoDataUrl:string;assignedEmail:string;consentText:string;questions:Question[];published:boolean};
const consent='I consent to this firm receiving and reviewing this inquiry. This does not authorize automated contact.';
const blank=(state:Row):Draft=>({title:'',practice:'',practiceCode:null,firmName:state.firm?.name??'',logoDataUrl:'',assignedEmail:state.actor.email??'',consentText:consent,questions:[],published:false});
const newQuestion=():Question=>({key:'q_'+crypto.randomUUID().replaceAll('-',''),label:'',type:'text',required:false});

function QuestionEditor({question,index,earlier,change,remove}:{question:Question;index:number;earlier:Question[];change:(q:Question)=>void;remove:()=>void}){
 const sources=earlier.filter(q=>q.type==='select'||q.type==='yesno'),source=sources.find(q=>q.key===question.when?.key);
 const values=source?.type==='yesno'?['yes','no']:source?.options??[];
 return <fieldset className="review"><legend>Question {index+1}</legend>

  <Field label="Question label" name={'question-label-'+index}><input required maxLength={300} value={question.label} onChange={e=>change({...question,label:e.target.value})}/></Field>
  <Field label="Answer type" name={'question-type-'+index}><select value={question.type} onChange={e=>{const type=e.target.value as Question['type'];const {options:_,...rest}=question;change({...rest,type,...(type==='select'?{options:question.options??[]}: {})});}}><option value="text">Text</option><option value="select">Select</option><option value="date">Date</option><option value="yesno">Yes / no</option></select></Field>
  <label><input type="checkbox" checked={question.required} onChange={e=>change({...question,required:e.target.checked})}/> Required answer</label>
  {question.type==='select'&&<Field label="Options (one per line)" name={'question-options-'+index}><textarea required value={(question.options??[]).join('\n')} onChange={e=>change({...question,options:e.target.value.split('\n')})}/></Field>}
  <Field label="Show this question" name={'question-condition-'+index}><select value={question.when?.key??''} onChange={e=>{const {when:_,...rest}=question;change(e.target.value?{...rest,when:{key:e.target.value,equals:''}}:rest);}}><option value="">Always</option>{sources.map((q,i)=><option key={i} value={q.key}>{q.label||q.key||`Question ${earlier.indexOf(q)+1}`}</option>)}{question.when&&!source&&<option value={question.when.key}>Unavailable: {question.when.key}</option>}</select></Field>
  {question.when&&<Field label="When the answer equals" name={'question-value-'+index}><select required value={question.when.equals} onChange={e=>change({...question,when:{key:question.when!.key,equals:e.target.value}})}><option value="">Choose an exact answer</option>{values.map((v,i)=><option key={i} value={v}>{v}</option>)}{question.when.equals&&!values.includes(question.when.equals)&&<option value={question.when.equals}>Unavailable: {question.when.equals}</option>}</select></Field>}
  <button type="button" className="quiet" onClick={remove}>Remove question {index+1}</button>
 </fieldset>;
}

export function IntakeAdmin({state,run,tick}:{state:Row;run:Run;tick:number}){
 const allowed=['owner','lawyer'].includes(state.actor.role);
 const [forms,setForms]=useState<Draft[]>([]),[draft,setDraft]=useState<Draft>(()=>blank(state)),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[logoBusy,setLogoBusy]=useState(false);
 const generation=useRef(0),logoGeneration=useRef(0);
 useEffect(()=>{
  if(!allowed)return;
  let active=true;const request=++generation.current;setLoading(true);setError('');
  api('/intake/forms').then(result=>{if(active&&request===generation.current)setForms(result.forms);}).catch(e=>{if(active&&request===generation.current)setError(e.message);}).finally(()=>{if(active&&request===generation.current)setLoading(false);});
  return()=>{active=false;};
 },[tick,allowed]);
 if(!allowed)return null;
 const patch=(value:Partial<Draft>)=>setDraft(d=>({...d,...value}));
 const select=(form?:Draft)=>{logoGeneration.current++;setLogoBusy(false);setError('');setDraft(form?{...form,questions:form.questions.map(q=>({...q,...(q.options?{options:[...q.options]}:{}),...(q.when?{when:{...q.when}}:{})}))}:blank(state));};
 const save=async(published:boolean)=>{
  if(busy||logoBusy)return;
  setBusy(true);setError('');
  try{await run(async()=>{
   const saved:Draft=await api('/intake/forms',{...draft,published});
   // A list request begun before this save must never replace the saved revision.
   generation.current++;setLoading(false);setForms(current=>[saved,...current.filter(f=>f.id!==saved.id)]);setDraft(saved);
  },published?'Intake form published':draft.id?'Intake form version saved':'Intake draft created');}finally{setBusy(false);}
 };
 return <section className="panel"><h2>Intake forms</h2>
  {error&&<p role="alert" className="notice">{error}</p>}
  {loading&&<p aria-busy="true">Opening intake forms…</p>}
  <label>Saved form<select disabled={busy} value={draft.id??''} onChange={e=>select(forms.find(f=>f.id===e.target.value))}><option value="">New intake form</option>{forms.map(f=><option key={f.id} value={f.id}>{f.title} · version {f.version} · {f.published?'Published':'Draft'}</option>)}</select></label>
  {draft.id&&<p>Version {draft.version} · {draft.published?'Published':'Draft'}{draft.published&&<> · <a href={'/intake/'+encodeURIComponent(draft.id)} target="_blank" rel="noreferrer">{'/intake/'+draft.id}</a></>}</p>}
  <Form label={busy?'Saving…':draft.id?'Save new version':'Create draft'} submit={()=>save(draft.published)}>
   <fieldset disabled={busy}>
    <legend>{draft.id?'Edit intake form':'New intake form'}</legend>
    <Field label="Form title" name="title"><input required maxLength={160} value={draft.title} onChange={e=>patch({title:e.target.value})}/></Field>
    <Field label="Practice" name="practice"><input required maxLength={160} value={draft.practice} onChange={e=>patch({practice:e.target.value})}/></Field>
    <LeadPractice areas={state.firm?.practiceAreas??[]} code={draft.practiceCode} onChange={practiceCode=>patch({practiceCode})}/>
    <Field label="Firm name" name="firmName"><input required maxLength={160} value={draft.firmName} onChange={e=>patch({firmName:e.target.value})}/></Field>
    <Field label="Assigned email" name="assignedEmail"><input required type="email" value={draft.assignedEmail} onChange={e=>patch({assignedEmail:e.target.value})}/></Field>
    <Field label="Firm logo (optional PNG or JPEG)" name="logo" required={false}><input key={draft.id??'new'} type="file" accept="image/png,image/jpeg" onChange={e=>{
     const file=e.target.files?.[0],request=++logoGeneration.current;setError('');if(!file){setLogoBusy(false);return;}
     if(!['image/png','image/jpeg'].includes(file.type)||file.size>224997){setLogoBusy(false);setError('Choose a PNG or JPEG logo under 225 KB.');return;}
     setLogoBusy(true);const reader=new FileReader();reader.onload=()=>{if(request===logoGeneration.current){patch({logoDataUrl:String(reader.result)});setLogoBusy(false);}};reader.onerror=()=>{if(request===logoGeneration.current){setError('The logo could not be read.');setLogoBusy(false);}};reader.readAsDataURL(file);
    }}/></Field>
    {logoBusy&&<p aria-busy="true">Reading logo…</p>}
    {draft.logoDataUrl&&<><img src={draft.logoDataUrl} alt="Selected firm logo" width="96"/><button type="button" className="quiet" onClick={()=>{logoGeneration.current++;setLogoBusy(false);patch({logoDataUrl:''});}}>Remove logo</button></>}
    <Field label="Review consent" name="consentText"><textarea required maxLength={2000} value={draft.consentText} onChange={e=>patch({consentText:e.target.value})}/></Field>
    <h3>Questions</h3>
    {draft.questions.map((question,index)=><QuestionEditor key={index} question={question} index={index} earlier={draft.questions.slice(0,index)} change={q=>patch({questions:draft.questions.map((v,i)=>i===index?q:v)})} remove={()=>patch({questions:draft.questions.filter((_,i)=>i!==index)})}/>)}
    <button type="button" className="quiet" disabled={draft.questions.length>=30} onClick={()=>patch({questions:[...draft.questions,newQuestion()]})}>Add question</button>
    <p>Conditions can use an earlier select or yes / no answer. Changes to questions or options are validated when saved.</p>
   </fieldset>
  </Form>
  <button type="button" disabled={busy||logoBusy} onClick={()=>void save(!draft.published)}>{draft.published?'Unpublish form':'Publish form'}</button>
  {draft.id&&<button type="button" className="quiet" disabled={busy} onClick={()=>select()}>New intake form</button>}
 </section>;
}
