import assert from 'node:assert/strict';
import {open} from './harness.mjs';

export const updateTick='2026-11-01T12:00:00.000Z';
export const updateWording='Your trial date changed from January 10 to February 12, 2027. Please provide your current contact details.';
export async function updateFixture(h){
 const m=await open(h,'Harper trial update','Harper Update Client','Harper Update Adverse'),base='/matters/'+m.id;
 for(const [email,role] of [['client@example.test','client'],['other-client@example.test','client'],['lawyer@example.test','lawyer'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:role==='client'?'Casey Client':role,role},h.owner);await h.json('/team/invite',{email},h.owner);}
 const client=await h.login('client@example.test'),other=await h.login('other-client@example.test'),lawyer=await h.login('lawyer@example.test'),assistant=await h.login('assistant@example.test');
 for(const email of ['lawyer@example.test','assistant@example.test'])await h.json(base+'/access',{email},h.owner);
 for(const email of ['client@example.test','other-client@example.test'])await h.json(base+'/portal',{email,reason:'Reviewed native portal recipient'},h.owner);
 let graph=await h.json('/contacts',undefined,h.owner);const contact=graph.contacts.find(c=>c.name===m.client);
 await h.json('/contacts',{id:contact.id,revision:graph.revision,kind:'person',name:contact.name,emails:['client@example.test']},h.owner);
 const consent=async decision=>{const g=await h.json('/contacts',undefined,h.owner);return h.json('/contacts/'+contact.id+'/consent',{revision:g.revision,channel:'email',decision,evidenceDate:'2026-10-20',source:'Reviewed instructions from the client'},h.owner);};
 await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
 await h.json(base+'/stage-profile',{revision:null,lawyerEmail:'owner@example.test'},h.owner);
 const task=await h.json(base+'/tasks',{title:'Confirm contact details',ownerEmail:'owner@example.test'},h.owner);
 await h.json(base+'/client-shares',{kind:'task',recordId:task.id,instructions:'Provide current contact details'},h.owner);
 const upload=(name,content,extra={})=>h.json(base+'/documents',{name,mime:'text/plain',visibility:'matter',contentBase64:Buffer.from(content).toString('base64'),...extra},h.owner);
 let order=await upload('Trial-order.txt','Court order paragraph 7: trial on January 10, 2027.');
 const propose=(date,source,version)=>h.json(base+'/deadlines',{title:'Trial',kind:'hearing',date,timezone:'America/New_York',source,documentId:order.id,version},h.owner);
 const old=await propose('2027-01-10','Original order paragraph 7',1);await h.json('/deadlines/'+old.id+'/confirm',{revision:old.revision,note:'Counsel checked the original trial order'},h.owner);
 order=await upload('Revised-trial-order.txt','Revised order paragraph 7: trial on February 12, 2027. Counsel-private strategy remains separate.',{documentId:order.id,revision:order.revision});
 const current=await propose('2027-02-12','Revised order paragraph 7',2);await h.json('/deadlines/'+current.id+'/confirm',{revision:current.revision,note:'Counsel adopted the revised trial date'},h.owner);
 const state=()=>h.json(base+'/matter-updates',undefined,h.owner),draft=(await state()).updates.find(u=>u.deadline_id===current.id);
 assert.ok(draft,'Confirming the revised order atomically creates a draft update');
 return {m,base,order,old,current,draft,client,other,lawyer,assistant,consent,state,upload};
}
export function updateEdit(u,extra={}){return {revision:u.revision,title:'Reviewed trial update',body:updateWording,recipients:['client@example.test'],promises:[{text:'Deliver the revised hearing preparation checklist by Friday',responsibleEmail:'owner@example.test'}],responsibleEmail:'owner@example.test',dueAt:'2026-10-01T12:00:00.000Z',maxContacts:7,...extra};}
// A newly confirmed hearing order yields a draft; counsel approves it as an exact scheduled packet without promises.
export async function approvedUpdate(h,base,title,{actor=h.owner,...extra}={}){
 const doc=await h.json(base+'/documents',{name:title+'.txt',mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('Court order paragraph 4: preparation hearing on April 2, 2027.').toString('base64')},h.owner);
 const d=await h.json(base+'/deadlines',{title,kind:'hearing',date:'2027-04-02',timezone:'America/New_York',source:title+' paragraph 4',documentId:doc.id,version:1},h.owner);
 await h.json('/deadlines/'+d.id+'/confirm',{revision:d.revision,note:'Counsel checked the original order'},h.owner);
 const u=(await h.json(base+'/matter-updates',undefined,h.owner)).updates.find(u=>u.deadline_id===d.id),saved=await h.json('/matter-updates/'+u.id+'/edit',updateEdit(u,{title,promises:[],...extra}),actor);
 await h.json('/matter-updates/'+u.id+'/approve',{revision:saved.revision,confirmed:true,reviewNote:'Counsel approves this exact scheduled update'},actor);return {u,doc};
}
export async function reviewedUpdate(h,f,extra={}){
 await f.consent('allowed');const saved=await h.json('/matter-updates/'+f.draft.id+'/edit',updateEdit(f.draft,extra),h.owner);
 await h.json('/matter-updates/'+saved.id+'/approve',{revision:saved.revision,confirmed:true,reviewNote:'Responsible counsel reviewed wording, recipients, promises and the exact schedule'},h.owner);
 return (await f.state()).updates.find(u=>u.id===saved.id);
}
