import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
export const representativeAddress=name=>[name,'example.test'].join(String.fromCharCode(64));
export async function representativeFixture(h,m,{represented,recipient,successor}){
 const state=()=>h.json('/contacts',undefined,h.owner),base='/matters/'+m.id;
 const save=async(name,email)=>h.json('/contacts',{revision:(await state()).revision,kind:'person',name,emails:[email]},h.owner);
 const contact=await save('Representative principal '+m.id,represented);
 await h.json('/contacts/'+contact.id+'/matter-role',{revision:(await state()).revision,matterId:m.id,role:'client'},h.owner);
 const record=async(email,previousId=null,cookie=h.owner,expected=200)=>h.json('/contacts/'+contact.id+'/representative',{revision:(await state()).revision,matterId:m.id,previousId,representedEmail:represented,recipient:email,authorityEvidence:'synthetic-satchel-1: practitioner inspected the signed matter-specific instructions',verificationEvidence:'synthetic-satchel-2: practitioner confirmed the exact recipient by an independent callback',withdrawn:false},cookie,expected);
 const review=(id,cookie=h.owner,expected=200)=>h.json('/contacts/'+contact.id+'/representative-review',{evidenceId:id,confirmed:true,reason:'Principal inspected the exact authority and recipient evidence'},cookie,expected);
 const grant=(email,evidenceId,expected=200)=>h.json(base+'/portal',{email,kind:'delegate',delegateOf:represented,reason:'Fresh exact representative grant',...(evidenceId?{representativeEvidenceId:evidenceId}:{})},h.owner,expected);
 return {base,contact,state,save,record,review,grant,represented,recipient,successor};
}
export async function representativePortalFlow(){
 const h=await harness();try{
 for(const [email,role] of [[representativeAddress('client'),'client'],[representativeAddress('deleg'),'client'],[representativeAddress('stranger'),'client'],[representativeAddress('legacy'),'client'],[representativeAddress('lawyer'),'lawyer'],[representativeAddress('assistant'),'assistant']]){await h.json('/team',{email,name:'Representative journey member',role},h.owner);await h.json('/team/invite',{email},h.owner);}
 const m=await open(h,'Representative replacement review','Representative Client','Representative Adverse'),base='/matters/'+m.id;
 const represented=representativeAddress('client'),recipient=representativeAddress('deleg'),successor=representativeAddress('stranger'),f=await representativeFixture(h,m,{represented,recipient,successor});
 const old=await h.login(recipient),next=await h.login(successor),lawyer=await h.login(representativeAddress('lawyer')),assistant=await h.login(representativeAddress('assistant'));
 await h.json(base+'/access',{email:representativeAddress('lawyer')},h.owner);
 await h.json(base+'/portal',{email:represented,reason:'Original represented client grant'},h.owner);
 // A delegate may already hold access before any representative evidence is recorded.
 const legacyEmail=representativeAddress('legacy'),legacy=await h.login(legacyEmail);
 const legacyGrant=(await f.grant(legacyEmail)).grants.find(g=>g.email===legacyEmail&&!g.revokedAt);
 const other=await open(h,'Separate representative matter','Separate Client','Separate Adverse'),otherBase='/matters/'+other.id;
 await h.json(otherBase+'/portal',{email:represented,reason:'Independent client grant'},h.owner);
 await h.json(otherBase+'/portal',{email:legacyEmail,kind:'delegate',delegateOf:represented,reason:'Independent delegate grant'},h.owner);
 const original='synthetic-satchel-3: retained original bytes',doc=await h.json(base+'/documents',{name:'Representative instructions.txt',mime:'text/plain',visibility:'matter',contentBase64:Buffer.from(original).toString('base64')},h.owner);
 await h.json(base+'/client-shares',{kind:'document',recordId:doc.id,instructions:'Review the retained original'},h.owner);
 const task=await h.json(base+'/tasks',{title:'Return signed instructions',dueDate:'2026-11-12',owner:representativeAddress('owner')},h.owner);
 await h.json(base+'/client-shares',{kind:'task',recordId:task.id,instructions:'Return the signed instructions'},h.owner);
 const items=(await h.json('/portal/matters/'+m.id+'/shares',undefined,legacy)).items,documentShare=items.find(i=>i.kind==='document'),taskShare=items.find(i=>i.kind==='task');
 const file='/api/satchel/portal/shares/'+documentShare.id+'/file';
 const beforeReplacement=await h.request(file,undefined,legacy);assert.equal(beforeReplacement.status,200);assert.equal(await beforeReplacement.text(),original);
 const e1=await f.record(recipient,null,lawyer);await f.review(e1.id,lawyer,403);
 await h.json('/contacts/'+f.contact.id+'/representative',{revision:(await f.state()).revision,matterId:m.id},assistant,403);
 await f.grant(recipient,e1.id,409);await f.review(e1.id);
 assert.equal((await h.request(file,undefined,legacy)).status,404,'Recording and approving a successor closes a pre-existing delegate document URL');
 const replaced=(await h.json(base+'/portal',undefined,h.owner)).grants.find(g=>g.id===legacyGrant.id);
 assert.ok(replaced.revokedAt,'The former delegate grant is retained as revoked history');assert.equal(replaced.revokedBy,representativeAddress('lawyer'));
 assert.deepEqual((await h.json('/portal',undefined,legacy)).grants.map(g=>g.matterId),[other.id],'Replacement leaves the delegate grant on another matter active');
 await f.grant(legacyEmail,e1.id,409);await f.grant(recipient,e1.id);
 assert.equal(await(await h.request(file,undefined,old)).text(),original);
 await h.json('/portal/shares/'+taskShare.id+'/acknowledge',{note:'Reviewed with the client'},old);
 const request=(await h.json(base+'/requests',{title:'Evidence of authority',instructions:'Send the signed instructions',criteria:'Complete and signed',clientVisible:true},h.owner)).requests[0];
 assert.equal((await h.json('/portal/matters/'+m.id+'/requests',undefined,old)).requests[0].id,request.id);
 await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);const settings=(await h.json('/followups/settings',undefined,h.owner)).settings.find(x=>x.kind==='engagement_chase');await h.json('/followups/settings',{...settings,enabled:true,steps:[{afterMinutes:15}],quietStart:'00:00',quietEnd:'01:00',timezone:'UTC',maxContacts:3},h.owner);await h.json('/portal/requests/'+request.id+'/reminder-consent',{consent:true},old);await h.json('/requests/'+request.id+'/reminders',{email:recipient,approved:true},h.owner);
 const before=h.mails.length;
 await h.json('/contacts/'+f.contact.id+'/consent',{revision:(await f.state()).revision,channel:'sms',decision:'denied',evidenceDate:'2026-11-01',source:'Client withdrew SMS consent; no SMS is sent'},h.owner);
 assert.equal((await h.json('/contacts/'+f.contact.id,undefined,h.owner)).effectiveConsent.sms,'denied');assert.equal(h.mails.length,before);
 const e2=await f.record(successor,e1.id);await f.record(successor,e1.id,h.owner,409);const runAt=new Date(Date.now()+86400000);runAt.setUTCHours(12,0,0,0);await h.restart();await h.scheduled(runAt.getTime());assert.equal(h.mails.length,before,'Replacement stops queued request reminders');const stopped=(await h.json(base+'/requests',undefined,h.owner)).requests.find(q=>q.id===request.id).reminders.sequences;assert.equal(stopped[0].status,'stopped');
 assert.equal((await h.request(file,undefined,old)).status,404);await h.json('/portal/shares/'+taskShare.id+'/complete',{},old,404);await h.json('/portal/requests/'+request.id+'/notes',{body:'Old representative must be refused'},old,404);
 await h.json('/portal/matters/'+m.id+'/requests',undefined,next,404);await f.review(e1.id,h.owner,409);await f.grant(successor,e1.id,409);await f.grant(successor,e2.id,409);
 await f.review(e2.id);await h.json('/portal/matters/'+m.id+'/shares',undefined,next,404);await f.grant(successor,e2.id);
 assert.equal(await(await h.request(file,undefined,next)).text(),original);await h.json('/portal/shares/'+taskShare.id+'/complete',{},next);await h.json('/portal/requests/'+request.id+'/notes',{body:'Fresh successor confirms the request'},next);
 const history=await h.json('/contacts/'+f.contact.id+'/representatives',undefined,h.owner);assert.deepEqual(history.evidence.map(r=>r.id),[e1.id,e2.id]);assert.equal(history.evidence[0].current,0);assert.equal(history.evidence[1].reviews.length,1);
 const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),restored=await harness();
 try{await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);await restored.json('/team/invite',{email:successor},restored.owner);const restoredNext=await restored.login(successor);assert.equal((await restored.request(file,undefined,restoredNext)).status,404);const retained=await restored.json('/contacts/'+f.contact.id+'/representatives',undefined,restored.owner);assert.equal(retained.evidence.length,2);assert.ok(retained.evidence.every(r=>r.reviews.every(v=>v.local===0)));await restored.json(base+'/portal',{email:successor,kind:'delegate',delegateOf:represented,representativeEvidenceId:e2.id,reason:'Cannot inherit archive authority'},restored.owner,409);assert.equal(await(await restored.request('/api/satchel/documents/'+doc.id+'/file',undefined,restored.owner)).text(),original);}finally{await restored.close();}
 const principalGrant=(await h.json(base+'/portal',undefined,h.owner)).grants.find(g=>g.email===represented&&!g.revokedAt);await h.json('/portal-grants/'+principalGrant.id+'/revoke',{reason:'Original represented client grant withdrawn'},h.owner);await h.json(base+'/portal',{email:represented,reason:'Fresh represented client grant'},h.owner);assert.equal((await h.request(file,undefined,next)).status,404,'Replacing the original client grant cannot revive its delegate grant');await f.grant(successor,e2.id);assert.equal((await h.request(file,undefined,next)).status,200);
 // Losing and surviving identities retain evidence but cannot inherit its reviewed authority.
 const duplicate=await f.save('Representative principal duplicate',representativeAddress('second')),merge=await h.json('/contacts/merge-preview',{survivorId:f.contact.id,duplicateId:duplicate.id,reason:'Practitioner confirms duplicate identity'},h.owner);await h.json('/contacts/merge',{previewId:merge.id},h.owner);
 assert.equal((await h.request(file,undefined,next)).status,404);await f.review(e2.id,h.owner,409);await f.grant(successor,e2.id,409);
 assert.equal(await(await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,h.owner)).text(),original);
 const shares=await h.json(base+'/client-shares',undefined,h.owner);assert.ok(shares.shares.find(s=>s.id===taskShare.id).acks.some(a=>a.kind==='completed'&&a.by===successor));
 }finally{await h.close();}
}

export async function representativeMailFlow(h,s){
 const recipient=representativeAddress('client'),represented=representativeAddress('second'),successor=representativeAddress('deleg');
 for(const email of [represented,successor]){await h.json('/team',{email,name:'Representative recipient',role:'client'},h.owner);await h.json('/team/invite',{email},h.owner);}
 const f=await representativeFixture(h,s.m,{represented,recipient,successor});
 await h.json(s.base+'/portal',{email:represented,reason:'Represented client original grant'},h.owner);
 const first=await f.record(recipient);await f.review(first.id);await f.grant(recipient,first.id);
 const letter={recipient,subject:'Exact representative letter',body:'synthetic-satchel-4: retain these exact delivered bytes',reviewNote:'Counsel authorizes this exact recipient and evidence revision'};
 const delivered=await h.json(s.base+'/correspondence',letter,s.lawyer);await h.json('/mail-attempts/'+delivered.attemptId+'/send',{},s.lawyer);
 const stale=await h.json(s.base+'/correspondence',letter,s.lawyer),queued=await s.schedule('appointment','2026-11-01T12:00:00.000Z');
 const count=h.mails.length,second=await f.record(successor,first.id);
 const contact=await f.save('Successor representative',successor);await s.consent(contact.id,'allowed');
 await h.json('/contacts/'+f.contact.id+'/consent',{revision:(await f.state()).revision,channel:'sms',decision:'denied',evidenceDate:'2026-11-01',source:'SMS withdrawal recorded without outbound contact'},h.owner);
 await h.restart();await h.scheduled('2026-11-01T12:01:00.000Z');await h.json('/mail-attempts/'+stale.attemptId+'/send',{},s.lawyer);
 assert.equal(h.mails.length,count,'Replacement stops scheduled work and stale reviewed mail without sending SMS');
 const jobs=await s.state();assert.equal(jobs.jobs.find(j=>j.id===queued.id).status,'stopped');
 await f.review(second.id);await f.grant(successor,second.id);
 const successorLetter={...letter,recipient:successor},fresh=await h.json(s.base+'/correspondence',successorLetter,s.lawyer);await h.json('/mail-attempts/'+fresh.attemptId+'/send',{},s.lawyer);
 assert.deepEqual(h.mails.at(-1).to,[successor]);assert.equal(h.mails.at(-1).text,letter.body);
 const history=(await h.json(s.base+'/correspondence',undefined,s.lawyer)).messages;
 assert.equal(history.find(m=>m.id===delivered.id).body,letter.body);assert.equal(history.find(m=>m.id===delivered.id).recipient,recipient);assert.equal(history.find(m=>m.id===delivered.id).attempts[0].status,'accepted');assert.equal(history.find(m=>m.id===stale.id).attempts[0].status,'failed');
 // A fresh grant for the same recipient never revives a queued preparation tied to the revoked grant.
 const staleSuccessor=await h.json(s.base+'/correspondence',successorLetter,s.lawyer),grant=(await h.json(s.base+'/portal',undefined,h.owner)).grants.find(g=>g.email===successor&&!g.revokedAt);
 await h.json('/portal-grants/'+grant.id+'/revoke',{reason:'Recipient access withdrawn'},h.owner);await f.grant(successor,second.id);
 await h.json('/mail-attempts/'+staleSuccessor.attemptId+'/send',{},s.lawyer,409);
 const after=h.mails.length;await h.restart();await h.scheduled('2026-11-01T12:02:00.000Z');assert.equal(h.mails.length,after);
}
