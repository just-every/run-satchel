import type { FormEvent, ReactNode } from 'react';
export type Row=Record<string,any>;
export async function api(path:string,body?:any) { const response=await fetch('/api/satchel'+path,{credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}); const result:any=await response.json();if(!response.ok) throw new Error(result.error??'The request could not be completed');return result; }
// A figure a custom role withholds arrives as null and is said so, never shown as $0.00.
export const dollars=(cents:number|null)=>cents===null?'Withheld by your role':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export const today=()=>new Date().toISOString().slice(0,10);
export function Form({children,submit,label='Save',danger=false}:{children:ReactNode;submit:(data:Row)=>Promise<void>;label?:string;danger?:boolean}) { return <form onSubmit={async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;await submit(Object.fromEntries(new FormData(form)));}}>{children}<button type="submit" className={danger?'danger':undefined}>{label}</button></form>; }
export function Field({label,name,type='text',required=true,value,children}:{label:string;name:string;type?:string;required?:boolean;value?:string|number;children?:ReactNode}) {return <label>{label}{children??<input name={name} type={type} required={required} defaultValue={value} step={type==='number'?'1':undefined}/>}</label>;}
export function Empty({children}:{children:ReactNode}) {return <div className="empty"><svg viewBox="0 0 32 40" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 2h13l7 8v28H6Z M19 2v9h7 M11 19h10 M11 25h10"/></svg><p>{children}</p></div>;}
export type Run=(job:()=>Promise<any>,message?:string)=>Promise<void>;
