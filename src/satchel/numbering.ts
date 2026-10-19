import { atomic,audit,human,id,insist,integer,need,stmt,text,type Actor,type Data } from './model';
export async function numberSettings(db:D1Database){
 const s=await stmt(db,'SELECT * FROM s_number_settings WHERE id=1').first<Data>();
 return {pattern:s!.pattern,start:s!.start,padding:s!.padding,perClient:!!s!.per_client,revision:s!.revision};
}
export async function saveNumberSettings(db:D1Database,actor:Actor,body:Data){
 human(actor);need(actor,'owner');
 const pattern=text(body.pattern,'Matter number pattern',120),tokens:string[]=Array.from(pattern.match(/\{[^}]+\}/g)??[]);
 insist(tokens.includes('{sequence}')&&tokens.filter(t=>t==='{sequence}').length===1,'Include {sequence} exactly once');
 insist(tokens.every(t=>['{sequence}','{year}','{client}','{practice}'].includes(t))&&!/[{}]/.test(pattern.replace(/\{(sequence|year|client|practice)\}/g,'')),'Use {sequence}, {year}, {client} and {practice} tokens');
 insist(/^[A-Za-z0-9{} _./-]+$/.test(pattern),'Use letters, digits, spaces and separators - _ . /');
 insist(typeof body.perClient==='boolean','Choose firm-wide or per-client numbering');
 insist(!body.perClient||tokens.includes('{client}'),'Per-client sequences require {client} in the pattern');
 const start=integer(body.start,'Starting number',1,999999999),padding=integer(body.padding,'Sequence padding',1,12),guard=id();
 await atomic(db,actor,[stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_number_settings WHERE id=1 AND revision=?) THEN 1 ELSE 0 END)',guard,text(body.revision,'Settings revision',100)),stmt(db,'UPDATE s_number_settings SET pattern=?,start=?,padding=?,per_client=?,revision=? WHERE id=1',pattern,start,padding,body.perClient?1:0,id()),stmt(db,'DELETE FROM s_number_sequences'),stmt(db,'DELETE FROM s_guard WHERE id=?',guard),audit(db,actor,'matter.number_pattern','firm',JSON.stringify({pattern,start,padding,perClient:body.perClient}))]);
 return numberSettings(db);
}
export async function matterIdentity(db:D1Database,body:Data,client:string,imported=false){
 const settings=await numberSettings(db),clientKey=client.trim().toLowerCase();
 const clientNumber=body.clientNumber?text(body.clientNumber,'Client number',40):null;
 insist(clientNumber===null||/^[A-Za-z0-9_-]+$/.test(clientNumber),'Client number uses letters, digits, - or _');
 const old=await stmt(db,'SELECT number FROM s_number_clients WHERE client_key=?',clientKey).first<Data>();
 insist(!old||!clientNumber||old.number===clientNumber,'This client already has a different number',409);
 const practice=body.practiceCode?text(body.practiceCode,'Practice area code',6).toUpperCase():'';
 insist(imported||!settings.pattern.includes('{practice}')||practice,'Choose a practice area for this number pattern');
 if(practice)insist(await stmt(db,'SELECT 1 FROM s_practice_areas WHERE code=?',practice).first(),'Choose a configured practice area');
 return {clientKey,clientNumber,practice,settingsRevision:settings.revision};
}
