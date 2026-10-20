import type {ChangeEvent} from 'react';
import {Field,type Row} from './common';

export function LeadPractice({areas,code,onChange}:{areas:Row[];code?:string|null;onChange?:(code:string)=>void}){
 const selection=onChange?{value:code??'',onChange:(e:ChangeEvent<HTMLSelectElement>)=>onChange(e.target.value)}:{defaultValue:code??''};
 return <Field label="Practice area" name="practiceCode" required={false}><select name="practiceCode" aria-label="Practice area" {...selection}>
  <option value="">No practice</option>{areas.map(p=><option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
  {code&&!areas.some(p=>p.code===code)&&<option value={code}>Unavailable: {code}</option>}
 </select></Field>;
}
