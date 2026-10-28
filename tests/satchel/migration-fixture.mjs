import {createHash} from 'node:crypto';
import {PDFDocument,StandardFonts} from 'pdf-lib';
export const csvRows=(headers,rows=[])=>[headers,...rows].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
export async function movePackage(email,trustAccountId,typeId){
 const pdf=await PDFDocument.create();pdf.addPage().drawText('Historic Clio invoice 2020-81. Total USD 120.00. Paid USD 20.00.',{font:await pdf.embedFont(StandardFonts.Helvetica),size:14});
 const file=(id,name,bytes)=>({id,name,contentBase64:Buffer.from(bytes).toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),modifiedAt:'2020-04-02T13:14:15.000Z'});
 const files=[file('pdf-1','Clio-2020-81.pdf',await pdf.save()),file('original-1','Client-one-statement.txt',Buffer.from('Statement: client one trust balance USD 1500.01, 2020-04-01.')),file('original-2','Client-two-statement.txt',Buffer.from('Statement: client two trust balance USD 3000.03, 2020-04-01.'))];
 const datasets={
  contacts:csvRows(['id','name','aliases'],[['client-1','Synthetic Satchel Workshop','Workshop former name'],['client-2','Synthetic Satchel Studio',''],['unused-1','Synthetic Satchel Unused','']]),
  matters:csvRows(['id','display_number','description','client_id','adverse_party','status','opened_at','closed_at','case_number','practice_code','fields'],[['matter-1','2020-C1','Source active advice','missing-client','Synthetic Satchel Landlord','open','2020-01-01T12:00:00.000Z','','CASE-42',typeId?'LIT':'',JSON.stringify({caseNumber:'CASE-42',court:'Source court',insuranceLimit:'1000000.01',feeArrangement:'hourly',feeTerms:'Source hourly engagement',...(typeId?{typeId,typeVersion:1,custom:{source_value:'250000.50'}}:{})})],['matter-2','2020-C2','Source active dispute','client-2','Synthetic Satchel Vendor','open','2020-02-02T12:00:00.000Z','','CASE-43','',''],['matter-3','2019-C3','Source closed estate','client-1','Synthetic Satchel Opponent','closed','2019-02-02T12:00:00.000Z','2020-03-03T12:00:00.000Z','CASE-44','','']]),
  relationships:csvRows(['id','matter_id','contact_id','relation'],[['relationship-1','matter-1','client-1','client']]),
  documents:csvRows(['id','matter_id','file_id','date','visibility'],[['document-1','matter-1','original-1','2020-04-01','matter'],['document-2','matter-2','original-2','2020-04-01','matter']]),
  notes:csvRows(['id','matter_id','title','body','occurred_at','visibility','staff_id'],[['note-1','matter-1','Source note','Exact historic note body','2020-03-01T12:00:00.000Z','team','staff-1']]),
  calls:csvRows(['id','matter_id','title','body','occurred_at','visibility'],[['call-1','matter-1','Source call','Exact historic call body','2020-03-02T12:00:00.000Z','team']]),
  emails:csvRows(['id','matter_id','title','body','occurred_at','visibility'],[['email-1','matter-1','Source email','Exact historic email body','2020-03-03T12:00:00.000Z','team']]),
  calendar:csvRows(['id','matter_id','title','date','time','timezone','duration_minutes'],[['event-1','matter-2','Historic meeting','2020-03-04','09:30','America/New_York',60]]),
  tasks:csvRows(['id','matter_id','title','due_date','status'],[['task-1','matter-2','Source review task','2020-04-05','open']]),
  time:csvRows(['id','matter_id','date','description','minutes','rate_cents','amount_cents','invoice_id','staff_id'],[['time-1','matter-1','2020-03-01','Billed source advice',60,10000,10000,'invoice-1','staff-1'],['time-2','matter-2','2020-03-02','Unbilled source advice',30,10000,5000,'','staff-1']]),
  expenses:csvRows(['id','matter_id','date','description','amount_cents','invoice_id'],[['expense-1','matter-1','2020-03-01','Source filing expense',2000,'invoice-1']]),
  invoices:csvRows(['id','matter_id','number','ordinal','date','total_cents','ar_cents','pdf_file_id'],[['invoice-1','matter-1','CLIO-2020-81',81,'2020-04-01',12000,10000,'pdf-1']]),
  trust:csvRows(['id','matter_id','client_id','balance_cents','statement_date','source_reference','document_id'],[['trust-1','matter-1','client-1',150001,'2020-04-01','Source statement page one','document-1'],['trust-2','matter-2','client-2',300003,'2020-04-01','Source statement page two','document-2']]),
  grow:csvRows(['id','name','summary','created_at','staff_id'],[['grow-1','Synthetic Satchel Prospect','Historic Grow intake lead','2020-03-05T12:00:00.000Z','staff-1']]),
 };
 return {schema:'satchel-clio-v1',account:'synthetic-satchel-1',phase:'snapshot',extractedAt:'2020-04-03T12:00:00.000Z',datasets,files,staff:{'staff-1':email},clientRepairs:{},trustAccountId,coverage:Object.fromEntries(Object.keys(datasets).map(k=>[k,'complete'])),counts:{contacts:3,matters:3,relationships:1,documents:2,notes:1,calls:1,emails:1,calendar:1,tasks:1,time:2,expenses:1,invoices:1,trust:2,grow:1},balances:{billedCents:12000,unbilledCents:5000,arCents:10000,trustCents:450004}};
}
export async function setupMove(h){
 const {actor}=await h.json('/state',undefined,h.owner);
 const account=await h.json('/trust/accounts',{name:'Synthetic Satchel migration trust',kind:'trust',bankReference:'Source bank ending 1234'},h.owner);
 const current=await h.json('/firm',undefined,h.owner),address={line1:'100 Example Street',city:'New York',state:'NY',zip:'10001'};
 const settings=current.settings??{name:'Synthetic Satchel Counsel',email:actor.email,phone:'2125550123',address,timezone:'America/New_York',billing:{defaultRateCents:10000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'2125550123',timezone:'America/New_York',address}],practiceAreas:[]};
 if(!settings.practiceAreas.some(a=>a.code==='LIT'))settings.practiceAreas.push({code:'LIT',name:'Litigation'});
 await h.json('/firm',{settings,revision:current.revision},h.owner);
 const types=await h.json('/matter-types',{name:'Migration source fields',practiceCode:'LIT',definition:{required:['caseNumber','court'],fields:[{key:'source_value',label:'Source value',type:'money',required:true}],records:[]}},h.owner);
 return movePackage(actor.email,account.id,types.types.find(t=>t.name==='Migration source fields').id);
}
export async function applyMove(h,p,job,options={}){
 let state=job;
 while(state.job.state==='applying'){
  const preview=await h.json('/migration/preview',{package:p},h.owner),pending=preview.rows[state.job.checkpoint];let review;
  if(pending?.kind==='matters'){
   const search=await h.json('/conflicts',{client:pending.client,adverse:pending.adverse},h.owner);
   review={conflictId:search.id,confirmed:true,reviewNote:'Principal reviewed source matter and every conflict match.'};
  }
  if(pending?.kind==='fees')review={confirmed:true,reviewNote:'Principal reviewed the exact source fee terms and native earning rules.'};
  if(pending?.kind==='trust')review={confirmed:true,reviewNote:'Designated trust officer reviewed the exact statement and client allocation.'};
  try{state=await h.json('/migration/resume',{id:state.job.id,review},h.owner);}catch(e){throw new Error('Applying '+pending?.kind+' '+pending?.sourceId+' at checkpoint '+state.job.checkpoint+': '+e.message,{cause:e});}
  if(options.stopAt&&state.job.checkpoint>=options.stopAt)break;
 }
 return state;
}
export const commitMove=async(h,p)=>{const preview=await h.json('/migration/preview',{package:p},h.owner);return h.json('/migration/commit',{package:p,fingerprint:preview.fingerprint},h.owner);};
