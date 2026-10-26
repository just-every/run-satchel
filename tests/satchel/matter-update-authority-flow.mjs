import assert from 'node:assert/strict';
import {approvedUpdate,updateTick} from './matter-update-fixture.mjs';

// Each case begins with an approved packet and changes a live sending boundary.
export async function proveUpdateAuthorityChanges(h,f){
 const profile=async email=>{const state=await h.json(f.base+'/stage',undefined,h.owner);await h.json(f.base+'/stage-profile',{revision:state.profile.revision,lawyerEmail:email},h.owner);};
 const prepare=(title,actor=h.owner)=>approvedUpdate(h,f.base,title,{actor});
 const stopped=async u=>{const before=h.mails.length;await h.scheduled(updateTick);assert.equal(h.mails.length,before,'Changed authority must stop both outbound paths');const job=(await f.state()).updates.find(x=>x.id===u.id).jobs[0];assert.equal(job.status,'stopped');assert.equal(job.portal_published_at,null);assert.ok(job.detail);};
 let packet=await prepare('Reassigned counsel');await profile('lawyer@example.test');await stopped(packet.u);await profile('owner@example.test');
 packet=await prepare('Superseded original');await f.upload('Replacement-order.txt','A replacement original awaiting a separate legal confirmation.',{documentId:packet.doc.id,revision:packet.doc.revision});await stopped(packet.u);
 packet=await prepare('Revoked portal authority');const grants=(await h.json(f.base+'/portal',undefined,h.owner)).grants;await h.json('/portal-grants/'+grants.find(g=>g.email==='client@example.test'&&!g.revokedAt).id+'/revoke',{reason:'Client portal authority withdrawn before scheduled contact'},h.owner);await stopped(packet.u);await h.json(f.base+'/portal',{email:'client@example.test',reason:'New explicit portal authority'},h.owner);
 await profile('lawyer@example.test');packet=await prepare('Reduced counsel permissions',f.lawyer);
 const role=await h.json('/roles',{name:'Update read access',permissions:{rates:'all',bank:'none',reports:'own',contacts:'read',documents:'read',billing:'read',settings:'none'},reason:'Counsel sending permission withdrawn before contact'},h.owner);
 await h.json('/team',{email:'lawyer@example.test',name:'Counsel',role:'lawyer',customRoleId:role.id},h.owner);await stopped(packet.u);
 await h.json('/team',{email:'lawyer@example.test',name:'Counsel',role:'lawyer',customRoleId:null},h.owner);
 packet=await prepare('Revoked native membership',f.lawyer);await h.json('/team',{email:'lawyer@example.test',name:'Counsel',role:'lawyer',active:false},h.owner);await stopped(packet.u);await h.json('/team',{email:'lawyer@example.test',name:'Counsel',role:'lawyer'},h.owner);
 packet=await prepare('Removed matter access',f.lawyer);await h.json(f.base+'/access',{email:'lawyer@example.test',remove:true},h.owner);await stopped(packet.u);await h.json(f.base+'/access',{email:'lawyer@example.test'},h.owner);await profile('owner@example.test');
}
