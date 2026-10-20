export async function reportFoundation(h){
 const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};
 await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'},{code:'EST',name:'Estates'}]}},h.owner);
 for(const [email,role,name] of [['lawyer@example.test','lawyer','Jordan Lee'],['assistant@example.test','assistant','Case assistant']]){await h.json('/team',{email,name,role},h.owner);await h.json('/team/invite',{email},h.owner);}
 const lawyer=await h.login('lawyer@example.test'),assistant=await h.login('assistant@example.test');
 const make=async(title,client,practiceCode,grant=true)=>{const s=await h.json('/conflicts',{client,adverse:client+' adverse'},h.owner);const m=await h.json('/matters',{title,conflictId:s.id,reviewNote:'Reviewed firm conflict records',confirmed:true,practiceCode},h.owner);if(grant)await h.json('/matters/'+m.id+'/access',{email:'lawyer@example.test'},h.owner);const p=await h.json('/matters/'+m.id+'/stage',undefined,h.owner);await h.json('/matters/'+m.id+'/stage-profile',{revision:p.profile.revision,lawyerEmail:grant?'lawyer@example.test':'owner@example.test'},h.owner);return m;};
 const active=await make('Harper v. Reed','Harbor Mutual','LIT'),closed=await make('Reed settlement','Northfield Works','LIT'),estate=await make('Morgan estate','Morgan family','EST'),hidden=await make('Sealed regulatory matter','Restricted client','LIT',false);
 let stage=(await h.json('/stages',{name:'Discovery',requiredTypes:[]},h.owner)).stages[0];
 for(const m of [active,closed]){const p=await h.json('/matters/'+m.id+'/stage',undefined,h.owner);await h.json('/matters/'+m.id+'/stage-transition',{revision:p.profile.revision,stageId:stage.id,stageRevision:stage.revision,reason:'Discovery commenced after review',documents:[]},h.owner);}
 const preview=await h.json('/matters/'+closed.id+'/closure-preview',{clientPromisesReviewed:true,clientPromises:[],originalReturn:{status:'not_held',note:'No client originals held'}},h.owner);
 await h.json('/matters/'+closed.id+'/close',{previewId:preview.id,digest:preview.digest,revision:preview.revision,reason:'Close after settlement recorded',outcome:'settled',exceptions:preview.checks.map(c=>({key:c.key,reason:'Recorded continuing responsibility'}))},h.owner);
 stage=(await h.json('/stages',{id:stage.id,revision:stage.revision,name:'Discovery',requiredTypes:['Medical record']},h.owner)).stages[0];
 let privateDoc=await h.json('/matters/'+active.id+'/documents',{name:'Private medical evidence',mime:'text/plain',visibility:'private',contentBase64:Buffer.from('Private medical record original').toString('base64')},h.owner);
 const set=await h.json('/matters/'+active.id+'/document-sets/preview',{documents:[{id:privateDoc.id,revision:privateDoc.revision}],documentType:'Medical record'},h.owner);await h.json('/matters/'+active.id+'/document-sets/apply',{previewId:set.id},h.owner);
 const deadline=await h.json('/matters/'+active.id+'/deadlines',{title:'Discovery response due',date:'2000-01-03',timezone:'America/New_York',source:'Scheduling order paragraph 4'},h.owner);
 const privateDeadline=await h.json('/matters/'+active.id+'/deadlines',{title:'Private medical review deadline',date:'2000-01-02',timezone:'America/New_York',source:'Private order',documentId:privateDoc.id},h.owner);
 let publicDoc=await h.json('/matters/'+active.id+'/documents',{name:'Replaced scheduling order',mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('Original scheduling order').toString('base64')},h.owner);
 const superseded=await h.json('/matters/'+active.id+'/deadlines',{title:'Superseded discovery review',date:'2000-01-01',timezone:'America/New_York',source:'Replaced order paragraph 2',documentId:publicDoc.id},h.owner);
 await h.json('/matters/'+active.id+'/documents',{documentId:publicDoc.id,revision:publicDoc.revision,name:'Replacement scheduling order',mime:'text/plain',contentBase64:Buffer.from('Replacement scheduling order').toString('base64')},h.owner);
 const task=await h.json('/matters/'+active.id+'/tasks',{title:'Prepare discovery response',dueDate:'2000-01-02',ownerEmail:'lawyer@example.test'},h.owner);
 await h.json('/matters/'+hidden.id+'/tasks',{title:'Restricted enforcement response',dueDate:'2000-01-01',ownerEmail:'owner@example.test'},h.owner);
 const lead=await h.json('/leads',{name:'Ellis litigation inquiry',summary:'Contract dispute',referralSource:'Existing client',practiceCode:'LIT',assignedEmail:'lawyer@example.test'},h.owner);
 await h.json('/leads/'+lead.id,{revision:lead.revision,matterId:active.id},h.owner);
 const unknown=await h.json('/leads',{name:'Dana unclassified inquiry',summary:'Initial legal question',referralSource:'Website',assignedEmail:'lawyer@example.test'},h.owner);
 await h.json('/leads',{name:'Estate inquiry',summary:'Estate planning',referralSource:'Referral',practiceCode:'EST',assignedEmail:'lawyer@example.test'},h.owner);
 const secret=await h.json('/leads',{name:'Sealed regulator inquiry',summary:'Private context',referralSource:'Confidential',practiceCode:'LIT',assignedEmail:'lawyer@example.test'},h.owner);
 await h.json('/leads/'+secret.id,{revision:secret.revision,matterId:hidden.id},h.owner);
 return {lawyer,assistant,active,closed,estate,hidden,privateDoc,privateDeadline,deadline,superseded,task,unknown,stage};
}
export function csvRows(file){
 const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<file.length;i++){const c=file[i];if(c==='"'){if(quoted&&file[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if(c==='\n'&&!quoted){row.push(value.replace(/\r$/,''));rows.push(row);row=[];value='';}else value+=c;}
 if(value||row.length){row.push(value);rows.push(row);}const [keys,...data]=rows;return data.map(r=>Object.fromEntries(keys.map((k,i)=>[k,r[i]])));
}

// An archive input representing already-closed records with no recorded legal outcome.
export async function withoutRecordedOutcomes(archive){
 const records=archive.trim().split('\n').map(JSON.parse),manifest=records[0];
 manifest.tables.find(t=>t.name==='s_matter_outcomes').count=0;
 const {makePart}=await import('@runeditrun/rer/modules/portability');
 const {ArchiveVerifier,ContentVerifier}=await import('../../node_modules/@runeditrun/rer/modules/portability/format.mjs');
 const integrity=new ArchiveVerifier(manifest),content=new ContentVerifier(manifest),parts=[];
 for(const old of records.filter(r=>r.kind==='part')){const items=old.items.filter(i=>i.kind!=='row'||i.table!=='s_matter_outcomes'),part=await makePart(old.index,items);parts.push(part);integrity.add(part);for(const item of items)content.add(item);}
 return [manifest,...parts,{kind:'closing',partCount:parts.length,archiveHash:integrity.digest(),contentHash:content.digest()}].map(JSON.stringify).join('\n')+'\n';
}
