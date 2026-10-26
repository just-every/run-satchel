import {Fault,type Actor} from './model';
// FIRM-002: billing staff, accountants and clients are denied every server door that is not listed
// for them here, before any handler runs. Principal, lawyer, assistant and trust-officer authority
// stays in each handler's own role check; this table only fences the roles that have no legacy door.
type Door=[method:'GET'|'POST',path:RegExp];
const part='[^/]+';
const door=(method:'GET'|'POST',path:string):Door=>[method,new RegExp('^'+path.replace(/:id/g,part).replace(/:rest/g,'.*')+'$')];
const shared=[door('GET','/search'),door('GET','/me'),door('GET','/state'),door('GET','/firm'),door('GET','/notifications'),door('POST','/notifications/:id/read'),door('GET','/matters/:id'),door('GET','/matters/:id/billing')];
const billing=[door('GET','/matters/:id/fee-plans'),door('GET','/matters/:id/ledes'),door('GET','/prebill-runs'),door('GET','/prebill-runs/:id'),door('POST','/prebill-runs'),door('GET','/matters/:id/invoice-template'),door('GET','/bills/:id/trust-options'),door('POST','/trust/transfers'),door('GET','/invoice-templates'),door('POST','/invoice-templates'),door('POST','/invoice-templates/:id/retire'),door('GET','/invoice-template-defaults'),door('POST','/invoice-template-defaults'),door('POST','/matters/:id/invoice-template'),door('GET','/matters/:id/invoice-deliveries'),door('POST','/bills/:id/deliveries'),door('GET','/invoice-deliveries/:id/pdf'),door('POST','/invoice-deliveries/:id/authorize'),door('POST','/invoice-notification-attempts/:id/send'),door('GET','/portal/matters/:id/payer-statements'),door('POST','/matters/:id/payer-statements'),door('GET','/payer-statements/:id/pdf'),door('GET','/portal/invoices/:id/payment'),...shared,door('POST','/matters/:id/bills'),door('GET','/bills/:id/export'),door('GET','/bills/:id/invoice.pdf'),door('GET','/bills/:id/ledes'),door('GET','/bills/:id/ledes-xml'),door('POST','/invoices/issue'),door('GET','/invoice-numbering')];
const accountant=[...shared,door('GET','/trust'),door('GET','/trust/:rest'),door('POST','/trust/periods'),door('POST','/trust/entries/:id/clear'),door('POST','/trust/checks/:id/match')];
const client=[door('GET','/invoice-deliveries/:id/pdf'),door('GET','/portal/matters/:id/payer-statements'),door('GET','/payer-statements/:id/pdf'),door('GET','/portal/invoices/:id/payment'),door('POST','/portal/invoices/:id/checkout'),door('GET','/report-summaries'),door('POST','/portal/requests/:id/reminder-consent'),door('GET','/me'),door('GET','/portal'),door('GET','/portal/matters/:id/timeline'),door('GET','/portal/matters/:id/shares'),door('POST','/portal/shares/:id/acknowledge'),door('POST','/portal/shares/:id/complete'),door('GET','/portal/shares/:id/file'),door('GET','/portal/matters/:id/invoices'),door('GET','/portal/invoices/:id/pdf'),door('GET','/portal/matters/:id/threads'),door('POST','/portal/threads/:id/open'),door('POST','/portal/threads/:id/messages'),door('GET','/portal/attachments/:id'),door('GET','/portal/matters/:id/requests'),door('POST','/portal/requests/:id/uploads'),door('POST','/portal/requests/:id/notes')];
export const roleDoors:Partial<Record<Actor['role'],Door[]>>={billing,accountant,client};
export const agentRoles:Actor['role'][]=['owner','lawyer','assistant','trust_officer'];
export function localPath(path:string){return path.replace(/^\/api\/satchel/,'')||'/';}
export function gateRole(actor:Actor,method:string,path:string){
 const doors=roleDoors[actor.role];if(!doors)return;
 const m=method==='HEAD'?'GET':method,p=localPath(path);
 if(!doors.some(([dm,re])=>dm===m&&re.test(p)))throw new Fault('Your role cannot perform this action',403);
}
// Agent keys and integrations belong to sponsors with a legacy working role; finance and client roles hold none.
export function agentSponsor(role:Actor['role']){if(!agentRoles.includes(role))throw new Fault('Agent and integration credentials need a principal, lawyer, assistant or trust-officer sponsor',403);}
