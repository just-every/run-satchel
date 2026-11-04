import {sendInquiry,inquiry,pdf} from './intake-fixture.mjs';

export async function recoveryOriginals(h,owner,large){
 const form=await h.json('/intake/forms',{title:'Recovery inquiry',practice:'General',firmName:'Recovery firm',assignedEmail:owner,consentText:'Review this inquiry without automated contact.',published:true,questions:[]},h.owner);
 const originals=[],files=[];
 for(let index=0;index<(large?3:1);index++){
  const original=pdf(large?8*1024*1024:32768);original.name=`Recovery-original-${index+1}.pdf`;original.bytes[original.bytes.length-1]=48+index;
  const token=await h.json('/intake/public/'+form.id);
  await sendInquiry(h,form,{...inquiry(token),name:`Recovery inquiry ${index+1}`,answers:{}},[original]);
  const lead=(await h.json('/leads',undefined,h.owner)).leads.find(l=>l.name===`Recovery inquiry ${index+1}`);
  files.push((await h.json('/leads/'+lead.id+'/intake',undefined,h.owner)).submissions[0].files[0]);originals.push(original);
 }
 return {originals,files};
}
