import type { FormEvent, ReactNode } from 'react';
export type Row=Record<string,any>;
export async function api(path:string,body?:any) { const response=await fetch('/api/satchel'+path,{credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}); const result:any=await response.json();if(!response.ok) throw new Error(result.error??'The request could not be completed');return result; }
export const dollars=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export const today=()=>new Date().toISOString().slice(0,10);
export function Form({children,submit,label='Save'}:{children:ReactNode;submit:(data:Row)=>Promise<void>;label?:string}) { return <form onSubmit={async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;await submit(Object.fromEntries(new FormData(form)));}}>{children}<button type="submit">{label}</button></form>; }
export function Field({label,name,type='text',required=true,value,children}:{label:string;name:string;type?:string;required?:boolean;value?:string|number;children?:ReactNode}) {return <label>{label}{children??<input name={name} type={type} required={required} defaultValue={value} step={type==='number'?'1':undefined}/>}</label>;}
export function Empty({children}:{children:ReactNode}) {return <p className="empty">{children}</p>;}
export type Run=(job:()=>Promise<any>,message?:string)=>Promise<void>;
