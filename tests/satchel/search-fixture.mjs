import {open} from './harness.mjs';
export async function searchFixture(h){
 const m=await open(h,'Barton lease review','Barton Workshop LLC','Riverbend Holdings LLC'),base='/matters/'+m.id;
 await h.json(base+'/fields',{revision:null,caseNumber:'CASE-2026-BARTON-42'},h.owner);
 const contacts=await h.json('/contacts',undefined,h.owner),client=contacts.contacts.find(c=>c.name===m.client);
 await h.json('/contacts',{id:client.id,revision:contacts.revision,name:client.name,kind:'organization',aliases:['Old workshop alias'],formerNames:['Barton Makers'],emails:[],phones:[],addresses:[]},h.owner);
 const doc=await h.json(base+'/documents',{name:'Lease original.txt',mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('Original evidence, not an OCR search fixture').toString('base64')},h.owner);
 const notes=await h.json('/documents/'+doc.id+'/annotations',{version:1,page:1,note:'Barton notice period requires counsel review'},h.owner);
 const task=await h.json(base+'/tasks',{title:'Review the notice period'},h.owner);
 const event=await h.json(base+'/appointments',{title:'Consult with counsel',date:'2026-11-10',time:'10:00',timezone:'America/New_York',durationMinutes:30,attendees:[]},h.owner);
 const email=await h.json(base+'/documents',{name:'Client instructions.eml',mime:'message/rfc822',visibility:'matter',contentBase64:Buffer.from('From: client@example.test\r\nSubject: Instructions\r\n\r\nRetain the source.').toString('base64')},h.owner);
 const entry=await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'Review original instructions',minutes:60,rateCents:25000},h.owner);
 const bill=await h.json(base+'/bills',{title:'Lease advice prebill',date:'2026-10-01',entryIds:[entry.id]},h.owner);
 return {m,doc,note:notes.annotations[0],task,event,email,bill,client};
}
