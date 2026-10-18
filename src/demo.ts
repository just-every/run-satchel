import type { Bindings } from './auth.server'
import { digest, stmt } from './satchel/model'
import { contacts, firm, matters, practiceAreas, team } from './demo/records'

/** Only called by Base's demo runtime, after its real owner has been claimed. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
 const db = env.DB
 const at = (days: number) => new Date(now.getTime() + days * 86400000).toISOString()
 const day = (days: number) => at(days).slice(0, 10)
 const insert = (table: string, values: Record<string, unknown>) => {
  const keys = Object.keys(values)
  return table === 's_matters'
   ? stmt(db, `INSERT INTO ${table} (${keys.join(',')}) SELECT ${keys.map(() => '?').join(',')} WHERE NOT EXISTS(SELECT 1 FROM s_matters WHERE id=?)`, ...Object.values(values), values.id)
   : stmt(db, `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) ON CONFLICT DO NOTHING`, ...Object.values(values))
 }
 await db.batch([
  stmt(db, `UPDATE oa_operators SET display_name=? WHERE email=? AND role='owner'`, 'Julia Bennett', ownerEmail),
  stmt(db, `INSERT INTO oa_first_run(singleton,completed_by,completed_at) SELECT 1,id,? FROM oa_operators WHERE email=? ON CONFLICT DO NOTHING`, now.getTime(), ownerEmail),
  insert('s_firm', {id:1, ...firm, currency:'USD', source:'principal', revision:'demo-1', updated_by:ownerEmail, updated_at:now.toISOString()}),
  insert('s_offices', {id:'demo-office', position:0, name:'Main office', phone:firm.phone, line1:firm.line1, line2:firm.line2, city:firm.city, state:firm.state, zip:firm.zip, timezone:firm.timezone}),
  ...practiceAreas.map((p, position) => insert('s_practice_areas', {...p, position})),
  ...team.map(m => insert('s_members', {...m, active:1})),
  ...contacts.map(c => insert('s_parties', {...c, source:'native', revision:'demo-1'})),
 ])
 // Keep the recorded conflict search and its parties in the same transaction;
 // the native freshness trigger also applies to these sample matters.
 for (const [index, m] of matters.entries()) {
  const id = `demo-${m.id}`, opened = at(-28 + index * 3)
  await db.batch([
   insert('s_conflicts', {id:id+'-conflict',client:m.client,adverse:m.adverse,queries:JSON.stringify([m.client,m.adverse]),matches:'[]',party_revision:0,actor:ownerEmail,at:opened}),
   stmt(db, `UPDATE s_conflicts SET party_revision=(SELECT party_revision FROM s_meta WHERE id=1) WHERE id=? AND NOT EXISTS(SELECT 1 FROM s_matters WHERE id=?)`,id+'-conflict',id),
   insert('s_matters', {id,title:m.title,client:m.client,adverse:m.adverse,conflict_id:id+'-conflict',review_note:'Firm records and known aliases reviewed; principal recorded clearance before engagement.',opened_by:ownerEmail,opened_at:opened}),
   insert('s_matter_access', {matter_id:id,email:ownerEmail}),
   insert('s_matter_access', {matter_id:id,email:team[index%2].email}),
   ...[m.client,m.adverse].flatMap((name,i) => [
    insert('s_parties',{id:`${id}-party-${i}`,name,aliases:'',email:'',source:'native',revision:'demo-1'}),
    insert('s_matter_parties',{matter_id:id,party_id:`${id}-party-${i}`,relation:i?'adverse':'client'}),
   ]),
   insert('s_audit',{id:id+'-opened',actor:ownerEmail,action:'matter.opened',object_id:id,detail:'Conflict search reviewed; engagement accepted.',at:opened}),
  ])
  const entries = [
   {kind:'time',description:m.work,minutes:90,rate_cents:30000,amount_cents:45000},
   {kind:'time',description:'Client conference and next-step advice',minutes:30,rate_cents:30000,amount_cents:15000},
   {kind:'time',description:'Review correspondence and update matter chronology',minutes:45,rate_cents:25000,amount_cents:18750},
   {kind:'disbursement',description:'Registry search and certified copy',minutes:null,rate_cents:null,amount_cents:4200},
  ].map((e,i) => ({...e,id:`${id}-entry-${i}`,matter_id:id,revision:'demo-1',date:day(-7+i),currency:'USD',created_by:ownerEmail,created_at:at(-7+i)}))
  await db.batch(entries.map(e => insert('s_entries',e)))
  // One authentic, immutable bill package; the other two entries remain unbilled.
  const lines = entries.slice(0,2).map(e=>({sourceId:e.id,sourceRevision:e.revision,kind:e.kind,date:e.date,description:e.description,minutes:e.minutes,rateCents:e.rate_cents,amountCents:e.amount_cents,rounding:'nearest cent, half up'}))
  const snapshot = {title:'Professional services — '+m.client,date:day(-2),currency:'USD',matterId:id,matterTitle:m.title,client:m.client,lines,totalCents:60000}
  const status = ['draft','approved','exported'][index%3]
  const artifact = status==='draft' ? null : [
   ['Satchel bill',id+'-bill',snapshot.title,snapshot.date,'USD'],
   ['Matter',id,m.title,'Client',m.client],
   ['kind','source id','date','description','minutes','rate USD cents/hour','amount USD cents'],
   ...lines.map(l=>[l.kind,l.sourceId,l.date,l.description,l.minutes,l.rateCents,l.amountCents]),
   ['TOTAL','','','','','',60000],['Approved by',ownerEmail,at(-1),'Work and client instructions reviewed.'],
  ].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n'
  await db.batch([
   insert('s_bills',{id:id+'-bill',matter_id:id,revision:'demo-1',status,snapshot:JSON.stringify(snapshot),artifact,artifact_digest:artifact?await digest(artifact):null,approved_by:artifact?ownerEmail:null,approved_at:artifact?at(-1):null,review_note:artifact?'Work and client instructions reviewed.':null,exported_at:status==='exported'?at(-1):null,created_by:ownerEmail,created_at:at(-2)}),
   ...entries.slice(0,2).map(e=>insert('s_billing_sources',{entry_id:e.id,bill_id:id+'-bill',source_revision:e.revision})),
  ])
  for (const [n,title] of ['Engagement and scope','Matter conference notes'].entries()) {
   const docId = `${id}-doc-${n}`, content = `${title}\n${m.title}\nClient: ${m.client}\n\n${n ? m.work+'.\nNext step: '+m.deadline+'.\nTarget review: '+day(m.days)+'.\n'+m.source+'.' : 'Engagement accepted after conflict review. Scope: advice, document review and negotiation. Billing: USD; trust funds and accounting remain external.'}\n`, bytes = new TextEncoder().encode(content)
   await db.batch([
    insert('s_documents',{id:docId,matter_id:id,title,visibility:n?'private':'matter',created_by:ownerEmail,created_at:opened,current_version:1,revision:'demo-1',updated_by:ownerEmail,updated_channel:'person',updated_at:opened}),
    insert('s_document_versions',{document_id:docId,version:1,name:title.replaceAll(' ','-')+'.txt',mime:'text/plain',declared_mime:'text/plain',size:bytes.length,sha256:await digest(bytes),content_base64:btoa(String.fromCharCode(...bytes)),created_by:ownerEmail,created_channel:'person',created_at:opened}),
   ])
  }
  for (const [n,status] of ['confirmed','proposed','done'].entries()) {
   const deadlineId = `${id}-deadline-${n}`, title = [m.deadline,'Client progress conference','Confirm engagement instructions'][n]
   await db.batch([
    insert('s_deadlines',{id:deadlineId,matter_id:id,title,date:day(n===2?-10:m.days+n*3),timezone:'America/New_York',source:m.source,document_id:id+'-doc-0',document_version:1,status,revision:'demo-1',proposed_by:ownerEmail,proposed_channel:'person',proposed_at:at(-12),confirmed_by:status==='proposed'?null:ownerEmail,confirmed_at:status==='proposed'?null:at(-11),completed_by:status==='done'?ownerEmail:null,completed_at:status==='done'?at(-10):null,completion_evidence:status==='done'?'Client instructions confirmed and retained in matter notes.':null}),
    insert('s_deadline_events',{id:deadlineId+'-proposed',deadline_id:deadlineId,action:'propose',actor:ownerEmail,channel:'person',at:at(-12),detail:JSON.stringify({source:m.source})}),
    ...(status==='proposed'?[]:[insert('s_deadline_events',{id:deadlineId+'-confirmed',deadline_id:deadlineId,action:'confirm',actor:ownerEmail,channel:'person',at:at(-11),detail:JSON.stringify({note:'Date and source independently reviewed.'})})]),
    ...(status==='done'?[insert('s_deadline_events',{id:deadlineId+'-done',deadline_id:deadlineId,action:'complete',actor:ownerEmail,channel:'person',at:at(-10),detail:JSON.stringify({evidence:'Client instructions confirmed.'})})]:[]),
   ])
  }
  if (index<3) await insert('s_proposals',{id:id+'-preparation',kind:'deadline',payload:JSON.stringify({matterId:id,title:'Review next-step advice with client',date:day(m.days+1),timezone:'America/New_York',source:'Matter conference notes; awaiting principal review.'}),for_email:ownerEmail,agent_label:'Practice assistant',status:'pending',created_at:at(-1)}).run()
 }
}
