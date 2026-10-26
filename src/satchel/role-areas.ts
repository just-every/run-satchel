import {Fault,type Actor} from './model';
import {areaLevels,type Area} from './custom-roles';
import {localPath} from './role-doors';
// FIRM-008: every server door is assigned to the permission areas it reads or changes. A member
// whose custom role sets a lower level is refused before the handler runs; a door that is not
// listed here is refused to such a member (fail closed), and GET /roles/doors shows the whole map.
const seg='[^/]+',any='.*';
const rule=(pattern:string,areas:string[]):[RegExp,string[]]=>[new RegExp('^'+pattern+'$'),areas];
const open:string[]=[];
export const areaRules:[RegExp,string[]][]=[
 rule('/bills/'+seg+'/trust-options',['billing','bank:balances']),
 rule('/(prebill-runs|prebill-runs/'+seg+'|bills/'+seg+'/review|matters/'+seg+'/invoice-template)',['billing']),
 rule('/(stripe/events|providers/sendgrid/events)',open),
 rule('/(invoice-templates|invoice-templates/'+seg+'/retire|invoice-template-defaults|invoice-notification-templates)',['billing','rates:all']),
 rule('/(matters/'+seg+'/invoice-deliveries|bills/'+seg+'/deliveries|invoice-deliveries/'+seg+'/authorize|invoice-notification-attempts/'+seg+'/send)',['billing','rates:all','contacts:read']),
 rule('/(invoice-deliveries/'+seg+'/pdf|portal/matters/'+seg+'/payer-statements|payer-statements/'+seg+'/pdf)',open),
 rule('/(matters/'+seg+'/payer-statements|invoices/'+seg+'/replacement)',['billing','rates:all']),
 rule('/stripe/settings',['settings']),
 rule('/portal/invoices/'+seg+'/(payment|checkout)',['billing']),
 rule('/(client-reminder-templates|matters/'+seg+'/client-reminders|matters/'+seg+'/client-reminders/schedule)',['contacts','documents','billing']),
 rule('/(matters/'+seg+'/correspondence|mail-attempts/'+seg+'/(send|resend-review|reconcile))',['contacts','documents','billing']),
 rule('/matters/'+seg+'/fields',['documents:read']),
 rule('/matters/'+seg+'/(lifecycle|closure-preview|close|reopen)',['documents:read','billing:read','rates:all','bank:full']),
 rule('/audit(/export)?',['settings:read','contacts:read','documents:read','billing:read','rates:all','bank:full']),
 rule('/(health|me|state|search|portal|notifications|calendar|availability|agenda|agenda/export|absences|handoffs|workload|matter-board|stages|workflows|ethical-walls|conflict-referrals|matter-types)',open),
 rule('/(notifications/'+seg+'/read|proposals/'+seg+'/decide|absences/'+seg+'/coverage|handoffs/'+seg+'/acknowledge|workflows/'+seg+'/(rollout|versions)|ethical-walls/'+seg+'/(dissolve|requests|take-custody)|wall-requests/'+seg+'/decide|wall-emergencies/'+seg+'/revoke|conflict-referrals/'+seg+'/decide|tasks/'+seg+'/(assign|complete)|deadlines/'+seg+'/(complete|confirm|owner|reminders)|reminders/'+seg+'/(acknowledge|resolve)|reminders/rules/'+seg+'/cancel|appointments/'+seg+'/occurrences/'+seg+'/'+seg+'|workflow-runs/'+seg+'/(stop|restart)|intake/public/'+seg+'|conflict-waivers/'+seg+'/dispose|agent/context|agent/'+seg+')',open),
 rule('/matters',open),rule('/matters/'+seg,open),
 rule('/matters/'+seg+'/(requests|threads|notes|timeline|client-shares|portal-preview|access|wall|restrictions/remove|stage|stage-profile|stage-transition|tasks|tasks/bulk|calendar|appointments|deadlines|workflows|workflow-preview|workflow-runs)',open),
 rule('/(saved-reports|saved-reports/'+seg+'/export|leads/report|reports|reports/export|report-schedules|report-schedules/'+seg+'/recipients/remove|report-exceptions/'+seg+'/resolve|report-summaries)',['reports']),
 rule('/(leads|leads/'+seg+'|leads/'+seg+'/(intake|merge)|lead-stages|contacts|contacts/'+seg+'|contacts/'+seg+'/'+seg+'|contacts/merge|contacts/merge-preview|conflicts|conflicts/'+seg+'/(review|disposition|referrals|dispose))',['contacts']),
 rule('/(matters/'+seg+'/(chronologies|chronologies/'+seg+'|productions|documents|document-sets|document-sets/'+seg+'|assembly)|chronologies/'+seg+'/publish|productions/'+seg+'/'+any+'|assembly/'+any+'|documents/'+seg+'/'+any+'|document-requests/'+seg+'/receive|retention|holds|holds/'+seg+'/release|intake/files/'+seg+'|conflict-waivers/'+seg+'/file|v1/documents/'+seg+'/file|v1/matters/'+seg+'/documents)',['documents']),
 rule('/(bills/'+seg+'/(export|invoice\\.pdf|ledes|ledes-xml))',['billing','rates:all']),
 rule('/(matters/'+seg+'/(billing|entries|bills|budget|fee-plans|fee-plans/run|tax-rules|ledes|ledes-guideline)|entries/'+seg+'/edit|bills/'+seg+'/(approve|correct|void|tax-reviews|ledes-outcomes)|invoice-numbering|invoice-numbering/import|invoices/issue|invoices/'+seg+'/void|time|time/drafts|time/drafts/'+seg+'|time/post|timers|timers/'+seg+'/'+seg+'|ledes|ledes/codes|ledes/timekeepers|v1/matters/'+seg+'/finance|v1/prepare/'+seg+')',['billing']),
 rule('/matters/'+seg+'/rates',['rates']),
 rule('/agent/matters/'+seg,['billing','documents']),
 rule('/trust',['bank:balances']),rule('/trust/'+any,['bank']),
 rule('/(firm|firm/export|firm/import|team|team/invite|keys|keys/'+seg+'/revoke|numbering|integrations|integrations/'+seg+'/(dispatch|journal|matter-access|reconcile|resume|revoke|rotate)|matter-import|matter-import/'+seg+'|import|import/'+seg+'|backup|restore|roles|roles/doors|matters/'+seg+'/portal|portal-grants/'+seg+'/revoke|intake/forms|v1/events)',['settings']),
 rule('/(requests/'+seg+'/(review|notes|reminders)|portal/matters/'+seg+'/requests|portal/requests/'+seg+'/(uploads|notes|reminder-consent)|threads/unread|threads/'+seg+'/(messages|assign|read)|attachments/'+seg+'|portal/matters/'+seg+'/(timeline|shares|invoices|threads)|portal/threads/'+seg+'/(open|messages)|portal/attachments/'+seg+'|portal/shares/'+seg+'/(acknowledge|complete|file)|portal/invoices/'+seg+'/pdf|client-shares/'+seg+'/revoke)',open),
 rule('/(providers|providers/'+seg+'/review|followups/settings)',['settings']),
 rule('/(leads/'+seg+'/(followups|consents|followup-events)|consult/offers|consultations|consultations/'+seg+'/cancel)',['contacts']),
 rule('/(consult/'+seg+'|consult/'+seg+'/book|consult/manage/'+seg+'|consult/manage/'+seg+'/(reschedule|cancel)|followups/'+seg+'/opt-out/'+seg+')',open),
 rule('/v1/matters',open),rule('/v1/matters/'+seg,open),rule('/v1/matters/'+seg+'/'+seg,open),
];
export function areasOf(path:string):string[]|null{
 const p=localPath(path).replace(/:[A-Za-z]+/g,'x');
 for(const [re,areas] of areaRules)if(re.test(p))return areas;
 return null;
}
function refuse():never{throw new Fault('Your custom role does not permit this action',403);}
function ranked(area:Area,value:string){return (areaLevels[area] as readonly string[]).indexOf(value);}
export function allows(actor:Actor,area:Area,needed:string){return !actor.grants||ranked(area,actor.grants[area])>=ranked(area,needed);}
export function requireArea(actor:Actor,area:Area,needed:string){if(!allows(actor,area,needed))refuse();}
export function gateGrants(actor:Actor,method:string,path:string){
 if(!actor.grants)return;
 const areas=actor.role==='billing'&&method==='POST'&&localPath(path)==='/trust/transfers'?['billing','bank:balances']:areasOf(path);
 if(!areas)refuse();
 const read=method==='GET'||method==='HEAD';
 for(const tag of areas){
  const [area,forced]=tag.split(':') as [Area,string|undefined];
  const g=actor.grants[area];
  if(forced){if(ranked(area,g)<ranked(area,forced))refuse();continue;}
  if(area==='bank'||area==='reports'){if(g==='none')refuse();if(area==='bank'&&g!=='full')refuse();continue;}
  if(area==='rates'){if(g==='none'||(!read&&g!=='all'))refuse();continue;}
  if(g==='none'||(!read&&g!=='write'))refuse();
 }
}
