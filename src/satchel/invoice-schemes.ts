import {atomic,audit,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';

export async function invoiceCounter(db:D1Database){return stmt(db,'SELECT * FROM s_invoice_counter WHERE id=1').first<Data>();}
export function formatInvoice(terms:Data,ordinal:number,year:string){
 return [terms.prefix,terms.year?year:'',String(ordinal).padStart(terms.padding,'0')].filter(Boolean).join(terms.separator);
}
export async function invoiceSettings(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner','lawyer','billing');
 const counter=await invoiceCounter(db);
 return {counter,schemes:(await rows(db,'SELECT * FROM s_invoice_schemes ORDER BY version')).map(s=>({...s,terms:JSON.parse(s.terms)}))};
}
export async function saveInvoiceScheme(db:D1Database,actor:Actor,b:Data){
 human(actor);need(actor,'owner');
 const current=await invoiceCounter(db);
 insist((b.revision??null)===(current?.revision??null),'Invoice settings changed; refresh before saving',409);
 const terms={prefix:typeof b.prefix==='string'?b.prefix.trim():'',padding:integer(b.padding,'Number padding',1,12),year:b.year===true,separator:b.separator};
 insist(/^[A-Za-z0-9]{0,20}$/.test(terms.prefix),'Prefix uses up to 20 letters or digits');
 insist(['','-','/','.'].includes(terms.separator),'Choose a blank, dash, slash or dot separator');
 const next=integer(b.nextNumber,'Next invoice number',1,999999999999),floor=await stmt(db,"SELECT MAX(ordinal) n FROM s_invoice_numbers WHERE kind='imported'").first<Data>();
 insist(next>Number(floor?.n??0),'Next number must be above every imported source invoice ordinal',422);
 const zone=(await stmt(db,'SELECT timezone FROM s_firm WHERE id=1').first<Data>())?.timezone??'UTC';
 const year=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric'}).format(new Date());
 insist(!await stmt(db,'SELECT 1 FROM s_invoice_numbers WHERE number=?',formatInvoice(terms,next,year)).first(),'That invoice number is already registered; choose another next number',409);
 const version=Number((await stmt(db,'SELECT MAX(version) n FROM s_invoice_schemes').first<Data>())?.n??0)+1,schemeId=id(),at=now();
 await atomic(db,actor,[guard(db,current?'EXISTS(SELECT 1 FROM s_invoice_counter WHERE revision=?)':'NOT EXISTS(SELECT 1 FROM s_invoice_counter)',...(current?[current.revision]:[])),
  guard(db,"?>COALESCE((SELECT MAX(ordinal) FROM s_invoice_numbers WHERE kind='imported'),0)",next),
  stmt(db,'INSERT INTO s_invoice_schemes VALUES(?,?,?,?,?)',schemeId,version,JSON.stringify(terms),actor.email,at),
  stmt(db,'INSERT INTO s_invoice_counter VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET scheme_id=excluded.scheme_id,next_number=excluded.next_number,revision=excluded.revision',schemeId,next,id()),
  audit(db,actor,'invoice.scheme_saved',schemeId,JSON.stringify({version,terms,nextNumber:next,cutover:!current}))]);
 return invoiceSettings(db,actor);
}

// Imported numbers are registered before any future migration enables issuance.
// This records provenance only: it never invents an invoice or receivable.
export async function registerImportedNumbers(db:D1Database,actor:Actor,b:Data){
 human(actor);need(actor,'owner');const source=text(b.source,'Source export reference',1000);
 insist(Array.isArray(b.numbers)&&b.numbers.length>0&&b.numbers.length<=100,'Supply 1–100 imported invoice numbers');
 const entries=b.numbers.map((n:Data)=>({number:text(n.number,'Imported invoice number',100),ordinal:integer(n.ordinal,'Source numeric ordinal',1,999999999999)}));
 const current=await invoiceCounter(db),floor=Math.max(...entries.map((n:Data)=>n.ordinal));
 insist(!current||current.next_number>floor,'Set the next number above this import before registering its numbers',422);
 const writes=entries.map((n:Data)=>stmt(db,"INSERT INTO s_invoice_numbers VALUES(?,NULL,'imported',?,NULL,?,?)",n.number,n.ordinal,source,now()));
 await atomic(db,actor,[guard(db,current?'EXISTS(SELECT 1 FROM s_invoice_counter WHERE revision=? AND next_number>?)':'NOT EXISTS(SELECT 1 FROM s_invoice_counter)',...(current?[current.revision,floor]:[])),...writes,...(current?[stmt(db,'UPDATE s_invoice_counter SET revision=? WHERE id=1',id())]:[]),audit(db,actor,'invoice.import_numbers_registered',id(),JSON.stringify({source,numbers:entries}))]);
 return {registered:entries.length};
}
