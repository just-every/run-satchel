import {Field,Form,type Row,type Run,api} from './common';
const split=(value:unknown)=>String(value??'').split(';').map(v=>v.trim()).filter(Boolean);
export function ContactProfile({contact,revision,run,saved}:{contact?:Row;revision:number;run:Run;saved:(id:string)=>void}){
 return <Form label={contact?'Save contact profile':'Create contact'} submit={d=>run(async()=>{const c=await api('/contacts',{...d,id:contact?.id,revision,aliases:split(d.aliases),formerNames:split(d.formerNames),emails:split(d.emails),phones:split(d.phones),addresses:split(d.addresses)});saved(c.id);},'Contact profile saved')}>
  <Field name="kind" label="Contact kind"><select name="kind" defaultValue={contact?.kind??''} required><option value="">Choose kind</option><option value="unclassified" disabled>Unclassified source contact</option><option value="person">Person</option><option value="organization">Organization</option></select></Field>
  <Field name="name" label="Contact name" value={contact?.name}/>
  {([['aliases','Aliases'],['formerNames','Former names'],['emails','Email addresses'],['phones','Phone numbers'],['addresses','Postal addresses']] as const).map(([name,label])=><Field key={name} name={name} label={label+' (separate with ;)'} required={false} value={contact?.[name]?.join('; ')}/>) }
 </Form>;
}
