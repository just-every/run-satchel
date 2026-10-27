import assert from 'node:assert/strict';
import {open} from './harness.mjs';

export async function principalTrustChanges(h,read,publish,{officerOnly=false}={}){
 const set=async(role,active=true)=>h.json('/team',{email:'owner@example.test',name:'Principal',role,active},h.owner);
 await set('lawyer');
 assert.deepEqual(await read(),[],'A principal without trust-record authority cannot sustain publication');
 await publish(403);
 await set('trust_officer',false);
 assert.deepEqual(await read(),[],'An inactive designation cannot sustain publication');
 await publish(403);
 await set('accountant');
 if(officerOnly){assert.deepEqual(await read(),[],'Replenishment requires the principal to remain a designated officer');await publish(403);}
 else assert.equal((await read()).length,1,'A current principal accountant retains statement-record authority');
 await set('trust_officer');
 assert.equal((await read()).length,1,'Restoring the original capabilities permits the still-current grant');
}

export async function nativePrincipalChanges(h,read,publish){
 const email='successor@example.test';
 let response=await h.request('/auth/invite',{email,displayName:'Successor principal',role:'owner'},h.owner);
 assert.equal(response.status,202,await response.text());
 const successor=await h.login(email);
 const operators=await(await h.request('/auth/operators',undefined,successor)).json(),original=operators.find(o=>o.email==='owner@example.test');
 response=await h.request('/auth/operator/status',{operatorId:original.id,status:'inactive'},successor);
 assert.equal(response.status,200,await response.text());
 assert.deepEqual(await read(),[],'Inactive native authorizer cannot sustain publication');
 await publish(401);
 response=await h.request('/auth/operator/status',{operatorId:original.id,status:'active'},successor);
 assert.equal(response.status,200,await response.text());
 h.owner=await h.login('owner@example.test');
 assert.equal((await read()).length,1);
 response=await h.request('/auth/operator/role',{operatorId:original.id,role:'member'},successor);
 assert.equal(response.status,200,await response.text());
 assert.deepEqual(await read(),[],'Removing native principal authority ends publication');
 h.owner=await h.login('owner@example.test');await publish(403);
 response=await h.request('/auth/operator/role',{operatorId:original.id,role:'owner'},successor);
 assert.equal(response.status,200,await response.text());
 h.owner=await h.login('owner@example.test');
 assert.equal((await read()).length,1);
}

export async function assertTrustAudit(h,action,id,revision,expected,context){
 const result=await h.json('/audit?action='+action,undefined,h.owner),row=result.records.find(r=>r.objectId===id);
 assert.ok(row,'The exact financial publication has retained audit evidence');
 assert.deepEqual(row.actor,{id:context.actorId,email:'owner@example.test',role:'owner',channel:'person'});
 assert.ok(Number.isFinite(Date.parse(row.at)));
 assert.equal(row.matterId,context.matterId);assert.equal(row.revision,revision);
 assert.equal(row.evidence.context.designatedFirmRole,'trust_officer');
 for(const [key,value] of Object.entries(expected))assert.deepEqual(row.evidence.record[key],value,'Audit snapshot '+key);
 return row;
}

export async function accountAccessChanges(h,f,read,publish){
 const email='custodian@example.test';
 await h.json('/team',{email,name:'Account source custodian',role:'lawyer'},h.owner);
 await h.json('/team/invite',{email},h.owner);const custodian=await h.login(email);
 const unrelated=await open(h,'Separate bank client','Maple client','Separate adverse'),account=await h.json('/trust/accounts',{name:'Separate trust bank',kind:'trust',bankReference:'synthetic-satchel-2'},h.owner);
 await h.json('/trust/ledgers',{accountId:account.id,matterId:unrelated.id},h.owner);await h.json('/matters/'+unrelated.id+'/access',{email},h.owner);
 const unrelatedWall=await h.json('/matters/'+unrelated.id+'/wall',{custodianEmail:email,members:[],reason:'An unrelated account has its own screen',revision:null},h.owner);
 assert.equal((await read()).length,1,'A screen in a different bank account does not revoke this account’s release');
 await h.json('/ethical-walls/'+unrelatedWall.id+'/dissolve',{reason:'Separate account reviewed',revision:unrelatedWall.revision},custodian);
 await h.json('/matters/'+f.other.id+'/access',{email},h.owner);
 const wall=await h.json('/matters/'+f.other.id+'/wall',{custodianEmail:email,members:[],reason:'Screen another subsidiary in this bank account',revision:null},h.owner);
 assert.equal((await h.json('/matters/'+f.m.id,undefined,h.owner)).matter.id,f.m.id,'The released matter itself remains accessible');
 assert.deepEqual(await read(),[],'Loss of another subsidiary also removes full-account publication authority');
 await publish(403);
 await h.json('/ethical-walls/'+wall.id+'/dissolve',{reason:'Separate review completed',revision:wall.revision},custodian);
 assert.equal((await read()).length,1);
}
