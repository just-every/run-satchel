import {api,Field,Form,type Row,type Run} from './common';

export function ContactConflictClassifications({contact,revision,run}:{contact:Row;revision:number;run:Run}){
 return <section aria-label="Contact conflict classifications">
  <h4>Conflict classifications</h4>
  {!contact.classifications?.length&&<p>No contact conflict classifications recorded.</p>}
  {contact.classifications?.map((record:Row,index:number)=><article className="record" key={index}>
   <strong>{record.classification==='prospective_client'?'Prospective client':record.classification==='staff_relationship'?'Staff relationship':record.classification}</strong>
   <p>{record.note}</p>
   <small>Recorded by {record.actor} · <time dateTime={record.at}>{record.at}</time></small>
  </article>)}
  <Form key={contact.id+':'+revision} label="Record conflict classification" submit={data=>run(()=>api('/contacts/'+contact.id+'/conflict-classification',{revision,classification:data.classification,note:data.note}),'Contact conflict classification recorded')}>
   <Field label="Contact conflict classification" name="classification"><select name="classification" aria-label="Contact conflict classification" defaultValue="" required><option value="">Choose a classification</option><option value="prospective_client">Prospective client</option><option value="staff_relationship">Staff relationship</option></select></Field>
   <Field label="Conflict classification note" name="note"><textarea name="note" aria-label="Conflict classification note" required rows={3}/></Field>
  </Form>
 </section>;
}
