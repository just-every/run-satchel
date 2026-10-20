// TIME-007: append-only client billing guidelines (the matter's recorded client name,
// exact match, as TIME-003) and the per-line checks that code an insurer bill.
import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {xmlProfile} from './ledes-xml-profile';
import {classifications,codeFormat,codeProblems,ledesSettings,type Coding} from './utbms-codes';

const guidelineJson=(g:Data)=>({id:g.id,client:g.client,version:g.version,clientLedesId:g.client_ledes_id,lawFirmId:g.law_firm_id,requireTask:g.require_task===1,requireActivity:g.require_activity===1,requireExpense:g.require_expense===1,narrativeMin:g.narrative_min,bannedPhrases:JSON.parse(g.banned_phrases),maxRates:JSON.parse(g.max_rates),incrementMinutes:g.increment_minutes,note:g.note,createdBy:g.created_by,createdAt:g.created_at,xmlProfile:g.xml_profile?JSON.parse(g.xml_profile):null});
export type Guideline=ReturnType<typeof guidelineJson>;

export async function currentGuideline(db:D1Database,client:string):Promise<Guideline|null> {
 const g=await stmt(db,'SELECT * FROM s_ledes_guidelines WHERE client=? ORDER BY version DESC LIMIT 1',client).first<Data>();
 return g?guidelineJson(g):null;
}

export async function matterLedes(db:D1Database,actor:Actor,matterId:string) {
 const m=await matter(db,actor,matterId),history=await rows(db,'SELECT * FROM s_ledes_guidelines WHERE client=? ORDER BY version DESC',m.client);
 const visible=(row:Data)=>{const g=guidelineJson(row);if(g.xmlProfile){const {clientMatterIds,...profile}=g.xmlProfile;g.xmlProfile={...profile,clientMatterId:clientMatterIds?.[matterId]??''};}return g;};
 return {client:m.client,guideline:history[0]?visible(history[0]):null,history:history.map(visible),...await ledesSettings(db)};
}

const ledesField=(value:unknown,label:string,max:number)=>{const v=text(value,label,max);insist(!/[|]|\[\]/.test(v),`${label} cannot contain | or []`);return v;};
const flag=(v:unknown,label:string)=>{insist(typeof v==='boolean',`Say whether the guideline ${label}`);return v?1:0;};

// Until FIRM-002 adds billing staff, the principal records each client's guideline version.
export async function saveGuideline(db:D1Database,actor:Actor,matterId:string,body:Data) {
 human(actor);need(actor,'owner');const m=await matter(db,actor,matterId);
 insist(Array.isArray(body.bannedPhrases)&&body.bannedPhrases.length<=50,'List at most 50 banned narrative phrases');
 const banned=[...new Set(body.bannedPhrases.map((p:unknown)=>text(p,'Banned phrase',100).toLowerCase()))];
 insist(body.maxRates&&typeof body.maxRates==='object'&&!Array.isArray(body.maxRates),'Give maximum hourly rates by LEDES classification');
 const maxRates:Record<string,number>={};
 for(const [k,v] of Object.entries(body.maxRates)){insist(classifications.includes(k),`Choose a LEDES classification (${classifications.join(', ')})`);maxRates[k]=integer(v,`Maximum ${k} hourly rate in USD cents`,0,100000000);}
 const last=await stmt(db,'SELECT COALESCE(MAX(version),0) v FROM s_ledes_guidelines WHERE client=?',m.client).first<Data>(),version=(last!.v as number)+1,guidelineId=id();
 const profile=xmlProfile(body.xmlProfile);
 const previous=await currentGuideline(db,m.client);
 const xml=profile?{...profile,clientMatterIds:{...previous?.xmlProfile?.clientMatterIds,[matterId]:profile.clientMatterId}}:null;
 if(xml)delete (xml as Data).clientMatterId;
 const values=[guidelineId,m.client,version,ledesField(body.clientLedesId,'LEDES client ID',20),ledesField(body.lawFirmId,'LEDES law firm ID',20),flag(body.requireTask,'requires task codes'),flag(body.requireActivity,'requires activity codes'),flag(body.requireExpense,'requires expense codes'),integer(body.narrativeMin,'Minimum narrative length',0,500),JSON.stringify(banned),JSON.stringify(maxRates),integer(body.incrementMinutes,'Required billing increment in minutes (0 for none)',0,60),text(body.note,'Guideline source note',500),actor.email,now(),xml?JSON.stringify(xml):null];
 await atomic(db,actor,[stmt(db,'INSERT INTO s_ledes_guidelines(id,client,version,client_ledes_id,law_firm_id,require_task,require_activity,require_expense,narrative_min,banned_phrases,max_rates,increment_minutes,note,created_by,created_at,xml_profile) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',...values),
  audit(db,actor,'ledes.guideline.saved',guidelineId,JSON.stringify({client:m.client,version}),{matterId})]);
 return matterLedes(db,actor,matterId);
}

// Units are billed hours in ten-thousandths (half-up); the adjustment carries discount and
// rounding so LINE_ITEM_TOTAL = units × unit cost (half-up to cents) + adjustment exactly.
export function unitsOf(billedMinutes:number){return Math.floor((billedMinutes*10000*2+60)/120);}
export function baseCents(units4:number,unitCostCents:number){return Number((BigInt(units4)*BigInt(unitCostCents)*2n+10000n)/20000n);}
const dollars=(c:number)=>`$${(c/100).toFixed(2)}`;

// Codes one bill line under the guideline. Returns the LEDES line and every reason it fails.
export async function codeLine(db:D1Database,g:Guideline,e:Data,override:Data|undefined,lineNumber:number,amountCents:number,description:string) {
 const pick=(kind:string,key:string,current:string|null)=>override&&override[key]!==undefined?codeFormat(kind,override[key]):current;
 const fee=e.kind==='time'||e.kind==='fee',coding:Coding={task:fee?pick('task','utbmsTask',e.utbms_task??null):null,activity:fee?pick('activity','utbmsActivity',e.utbms_activity??null):null,expense:fee?null:pick('expense','utbmsExpense',e.utbms_expense??null)};
 const problems=await codeProblems(db,coding);
 if(fee&&g.requireTask&&!coding.task)problems.push(`UTBMS task code is required by the ${g.client} guideline`);
 if(fee&&g.requireActivity&&!coding.activity)problems.push(`UTBMS activity code is required by the ${g.client} guideline`);
 if(!fee&&g.requireExpense&&!coding.expense)problems.push(`UTBMS expense code is required by the ${g.client} guideline`);
 if(/[|]|\[\]/.test(description))problems.push('narrative cannot contain | or []');
 if(description.length<g.narrativeMin)problems.push(`narrative is shorter than the guideline's ${g.narrativeMin} characters`);
 for(const phrase of g.bannedPhrases)if(description.toLowerCase().includes(phrase))problems.push(`narrative uses "${phrase}", which the guideline does not accept`);
 let line:Data={lineNumber,sourceId:e.id,type:fee?'F':'E',date:e.date,description,task:coding.task,activity:coding.activity,expense:coding.expense,timekeeperId:null,timekeeperName:null,classification:null,units4:10000,unitCostCents:amountCents,adjustmentCents:0,totalCents:amountCents};
 if(fee){
  const tk=await stmt(db,'SELECT * FROM s_ledes_timekeepers WHERE email=?',e.created_by).first<Data>();
  if(!tk)problems.push(`timekeeper ${e.created_by} has no LEDES timekeeper ID`);
  const billed=e.billed_minutes??e.minutes,max=tk?g.maxRates[tk.classification]:undefined;
  if(e.kind!=='fee'&&max!==undefined&&e.rate_cents>max)problems.push(`rate ${dollars(e.rate_cents)}/h exceeds the guideline's ${dollars(max)}/h for ${tk!.classification}`);
  if(e.kind!=='fee'&&g.incrementMinutes>0&&billed%g.incrementMinutes!==0)problems.push(`${billed} billed minutes is not a multiple of the guideline's ${g.incrementMinutes}-minute increment`);
  const units4=e.kind==='fee'?10000:unitsOf(billed),unitCost=e.kind==='fee'?amountCents:e.rate_cents;
  line={...line,timekeeperId:tk?.timekeeper_id??null,timekeeperName:tk?.name??null,classification:tk?.classification??null,units4,unitCostCents:unitCost,nonhourly:e.kind==='fee',adjustmentCents:amountCents-baseCents(units4,unitCost)};
 }
 return {line,problems:problems.map(p=>`Line ${lineNumber} (${description.slice(0,40)}): ${p}`)};
}
