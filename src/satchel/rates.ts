// TIME-003: fee-agreement rate rules, matter budgets and once-per-level alerts.
// Rules and budgets are append-only versions; an entry stores the price resolved
// when it was recorded, so later rate changes never reprice work or issued bills.
import {atomic,audit,date,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';

export type Pricing={rules:Data[];firmRateCents:number;firmIncrement:number;firmKey:string};
export type Work={matterId:string;client:string;date:string;timekeeper:string;task:string|null;minutes:number;billable:boolean;rateCents?:number};
export type Price={rateCents:number;billedMinutes:number;incrementMinutes:number;discountBps:number;amountCents:number;billable:boolean;rateSource:'entry'|'rule'|'firm-default';ruleId:string|null};

export async function loadPricing(db:D1Database):Promise<Pricing> {
 const [rules,firm]=await Promise.all([rows(db,'SELECT * FROM s_rate_rules ORDER BY effective_from,created_at,id'),stmt(db,'SELECT default_rate_cents,billing_increment_minutes FROM s_firm WHERE id=1').first<Data>()]);
 const firmRateCents=(firm?.default_rate_cents as number)??0,firmIncrement=(firm?.billing_increment_minutes as number)??1;
 return {rules,firmRateCents,firmIncrement,firmKey:`${firmRateCents}:${firmIncrement}`};
}
// Rules are append-only, so their count is the agreement revision a price was resolved at.
export function pricingGuard(db:D1Database,p:Pricing) {
 return guard(db,"(SELECT COUNT(*) FROM s_rate_rules)=? AND COALESCE((SELECT default_rate_cents||':'||billing_increment_minutes FROM s_firm WHERE id=1),'0:1')=?",p.rules.length,p.firmKey);
}
// Billed minutes round worked minutes up to the increment; the charge is billed minutes
// × hourly USD cents / 60, less the discount in basis points, half-up to whole cents.
export function charge(billedMinutes:number,rateCents:number,discountBps:number) {
 return Number((BigInt(billedMinutes)*BigInt(rateCents)*BigInt(10000-discountBps)+300000n)/600000n);
}
const scopeRank:Record<string,number>={matter:3,client:2,firm:1};
// Precedence: a matter agreement beats the client's, which beats the firm's; within one,
// a rule naming the timekeeper beats one that does not, then one naming the UTBMS task,
// then the latest effective date on or before the work date. No rule: firm defaults.
export function price(p:Pricing,w:Work):Price {
 if(w.rateCents!==undefined)return {rateCents:w.rateCents,billedMinutes:w.minutes,incrementMinutes:1,discountBps:0,amountCents:charge(w.minutes,w.rateCents,0),billable:w.billable,rateSource:'entry',ruleId:null};
 const rank=(r:Data)=>[scopeRank[r.scope],r.timekeeper_email?1:0,r.utbms_task?1:0];
 const better=(a:Data,b:Data)=>{const x=rank(a),y=rank(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return a.effective_from>b.effective_from;};
 let rule:Data|null=null;
 for(const r of p.rules){
  const scoped=r.scope==='firm'||(r.scope==='client'&&r.scope_key===w.client)||(r.scope==='matter'&&r.scope_key===w.matterId);
  if(scoped&&(!r.timekeeper_email||r.timekeeper_email===w.timekeeper)&&(!r.utbms_task||r.utbms_task===w.task)&&r.effective_from<=w.date&&(!rule||better(r,rule)))rule=r;
 }
 const rateCents=rule?rule.rate_cents:p.firmRateCents,incrementMinutes=rule?rule.increment_minutes:p.firmIncrement,discountBps=rule?rule.discount_bps:0;
 const billedMinutes=Math.ceil(w.minutes/incrementMinutes)*incrementMinutes;
 return {rateCents,billedMinutes,incrementMinutes,discountBps,amountCents:charge(billedMinutes,rateCents,discountBps),billable:w.billable&&(!rule||rule.billable===1),rateSource:rule?'rule':'firm-default',ruleId:rule?.id??null};
}

// Each level alerts once per budget version, in the same transaction as the recording
// that crossed it: threshold when used × 100 ≥ budget × alert percent; exceeded when
// used > budget. Used is every billable entry's recorded USD cents (time and costs).
export function budgetAlerts(db:D1Database,matterId:string,entryId:string|null,at:string) {
 return stmt(db,`INSERT INTO s_budget_alerts(id,budget_id,matter_id,level,used_cents,budget_cents,entry_id,at)
  SELECT lower(hex(randomblob(16))),b.id,b.matter_id,lv.level,u.used,b.cents,?,? FROM (SELECT * FROM s_matter_budgets WHERE matter_id=? ORDER BY version DESC LIMIT 1) b
  JOIN (SELECT 'threshold' level UNION ALL SELECT 'exceeded') lv JOIN (SELECT COALESCE(SUM(amount_cents),0) used FROM s_entries WHERE matter_id=? AND billable=1) u
  WHERE ((lv.level='threshold' AND u.used*100>=b.cents*b.alert_percent) OR (lv.level='exceeded' AND u.used>b.cents))
  AND NOT EXISTS(SELECT 1 FROM s_budget_alerts a WHERE a.budget_id=b.id AND a.level=lv.level)`,entryId,at,matterId,matterId);
}

const ruleJson=(r:Data)=>({id:r.id,scope:r.scope,client:r.scope==='client'?r.scope_key:null,matterId:r.scope==='matter'?r.scope_key:null,timekeeperEmail:r.timekeeper_email,utbmsTask:r.utbms_task,effectiveFrom:r.effective_from,rateCents:r.rate_cents,incrementMinutes:r.increment_minutes,discountBps:r.discount_bps,billable:r.billable===1,note:r.note,createdBy:r.created_by,createdAt:r.created_at});

export async function matterRates(db:D1Database,actor:Actor,matterId:string) {
 const m=await matter(db,actor,matterId),p=await loadPricing(db);
 const [budgets,alerts,used]=await Promise.all([
  rows(db,'SELECT * FROM s_matter_budgets WHERE matter_id=? ORDER BY version DESC',matterId),
  rows(db,'SELECT * FROM s_budget_alerts WHERE matter_id=? ORDER BY at,level',matterId),
  stmt(db,'SELECT COALESCE(SUM(amount_cents),0) used FROM s_entries WHERE matter_id=? AND billable=1',matterId).first<Data>(),
 ]);
 const usedCents=used!.used as number,current=budgets[0];
 return {firmDefault:{rateCents:p.firmRateCents,incrementMinutes:p.firmIncrement},client:m.client,
  rules:p.rules.filter(r=>r.scope==='firm'||(r.scope==='client'&&r.scope_key===m.client)||(r.scope==='matter'&&r.scope_key===matterId)).map(ruleJson),
  budget:current?{id:current.id,version:current.version,cents:current.cents,alertPercent:current.alert_percent,note:current.note,usedCents,remainingCents:current.cents-usedCents,setBy:current.created_by,setAt:current.created_at}:null,
  usedCents,budgetHistory:budgets.map(b=>({version:b.version,cents:b.cents,alertPercent:b.alert_percent,note:b.note,setBy:b.created_by,setAt:b.created_at})),
  alerts:alerts.map(a=>({id:a.id,budgetId:a.budget_id,level:a.level,usedCents:a.used_cents,budgetCents:a.budget_cents,entryId:a.entry_id,at:a.at}))};
}

// Until FIRM-002 adds billing staff, the principal sets firm and client agreements;
// the principal or a lawyer who sees the matter sets its own rates and budget.
export async function addRateRule(db:D1Database,actor:Actor,matterId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer');const m=await matter(db,actor,matterId);
 insist(['firm','client','matter'].includes(body.scope),'Choose a firm, client or matter agreement');
 if(body.scope!=='matter')need(actor,'owner');
 const timekeeper=body.timekeeperEmail?text(body.timekeeperEmail,'Timekeeper email',320).toLowerCase():null;
 if(timekeeper)insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? UNION SELECT 1 FROM oa_operators WHERE lower(email)=? AND role='owner'",timekeeper,timekeeper).first(),'Choose a timekeeper on the firm team');
 const task=body.utbmsTask?text(body.utbmsTask,'UTBMS task code',8).toUpperCase():null;
 if(task)insist(/^[A-Z]\d{3}$/.test(task),'UTBMS task code must look like L110');
 insist(typeof body.billable==='boolean','Say whether matching work is billable');
 const ruleId=id(),scopeKey=body.scope==='firm'?'firm':body.scope==='client'?m.client:matterId;
 const values=[ruleId,body.scope,scopeKey,timekeeper,task,date(body.effectiveFrom),integer(body.rateCents,'Hourly rate in USD cents',0,100000000),integer(body.incrementMinutes,'Billing increment (minutes)',1,60),integer(body.discountBps??0,'Discount in basis points',0,10000),body.billable?1:0,text(body.note,'Agreement reference',500),actor.email,now()];
 await atomic(db,actor,[accessGuard(db,actor,matterId),
  stmt(db,'INSERT INTO s_rate_rules(id,scope,scope_key,timekeeper_email,utbms_task,effective_from,rate_cents,increment_minutes,discount_bps,billable,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',...values),
  audit(db,actor,'rate.rule_added',ruleId,JSON.stringify({scope:body.scope,matterId,effectiveFrom:values[5],rateCents:values[6]}),{matterId})]);
 return matterRates(db,actor,matterId);
}

export async function setBudget(db:D1Database,actor:Actor,matterId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer');await matter(db,actor,matterId);
 const cents=integer(body.cents,'Budget in USD cents',1,1000000000000),percent=integer(body.alertPercent,'Alert percent',1,100),note=text(body.note,'Budget note',500);
 const budgetId=id(),at=now();
 await atomic(db,actor,[accessGuard(db,actor,matterId),
  stmt(db,'INSERT INTO s_matter_budgets(id,matter_id,version,cents,alert_percent,note,created_by,created_at) SELECT ?,?,COALESCE(MAX(version),0)+1,?,?,?,?,? FROM s_matter_budgets WHERE matter_id=?',budgetId,matterId,cents,percent,note,actor.email,at,matterId),
  budgetAlerts(db,matterId,null,at),audit(db,actor,'budget.set',budgetId,JSON.stringify({matterId,cents,alertPercent:percent}),{matterId})]);
 return matterRates(db,actor,matterId);
}
