export const invoiceLogo='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
export const invoiceTemplate=(previousId=null,extra={})=>({previousId,firmName:'Synthetic Satchel Counsel',address:'100 Example Street, New York NY 10001',logoBase64:invoiceLogo,logoMime:'image/png',remittance:'Remit to Synthetic Satchel Counsel, operating account ending 1234',terms:'Due within 30 days. Contact counsel with invoice questions.',dueDays:30,includeTrustBalance:true,reason:'Counsel reviewed exact branding, remittance and trust disclosure',confirmed:true,...extra});
export async function setupInvoicePayers(h,m){
 const base='/matters/'+m.id;
 const contact=async(name,email,kind,id)=>{const g=await h.json('/contacts',undefined,h.owner);return h.json('/contacts',{id,revision:g.revision,kind,name,emails:[email]},h.owner);};
 const graph=await h.json('/contacts',undefined,h.owner),client=await contact(m.client,'client@example.test','person',graph.contacts.find(c=>c.name===m.client).id),insurer=await contact('Synthetic Satchel Insurer','insurer@example.test','organization');
 let revision=(await h.json('/contacts',undefined,h.owner)).revision;await h.json('/contacts/'+insurer.id+'/matter-role',{revision,matterId:m.id,role:'insurer'},h.owner);
 for(const [email,name,kind] of [['client@example.test','Synthetic Satchel Client','client'],['insurer@example.test','Synthetic Satchel Insurer','payer']]){await h.json('/team',{email,name,role:'client'},h.owner);await h.json('/team/invite',{email},h.owner);await h.json(base+'/portal',{email,kind,reason:'Explicit invoice portal authority'},h.owner);}
 const consent=async(partyId,decision='allowed')=>{revision=(await h.json('/contacts',undefined,h.owner)).revision;await h.json('/contacts/'+partyId+'/consent',{revision,channel:'email',decision,evidenceDate:'2026-10-20',source:'Synthetic affirmative payer communication instructions'},h.owner);};
 await consent(client.id);await consent(insurer.id);return {client,insurer,consent};
}
