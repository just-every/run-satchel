import {matterScope} from './matter-scope';
import type {Grants} from './custom-roles';
import {auditQuery,type AuditActor} from './audit-record';
export type Data = Record<string, any>;
export type Actor = { id: string; email: string; name: string; role: 'owner' | 'lawyer' | 'assistant' | 'trust_officer' | 'billing' | 'accountant' | 'client'; channel: 'person' | 'agent'; grants?: Grants; approval?: {id: string; resultId: string}; agentAttribution?:{agent:{id:string;name:string};for:{id:string;name:string};label:string};agentApprovers?:{id:string;name:string}[];doorAgentId?:string;agentKeyId?:string; agentExecution?:{delegation:Data;jobId?:string} };
export class Fault extends Error { constructor(message: string, public status = 400) { super(message); } }
export function insist(value: unknown, message: string, status = 400): asserts value { if (!value) throw new Fault(message, status); }
export function text(value: unknown, label: string, max = 1000) { insist(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `${label} is required (maximum ${max} characters)`); return value.trim(); }
export function integer(value: unknown, label: string, min = 0, max = 100000000) { insist(Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max, `${label} must be a whole number between ${min} and ${max}`); return Number(value); }
export function date(value: unknown) { const v = text(value, 'Date', 10); insist(/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(new Date(v).getTime()) && new Date(v).toISOString().slice(0,10) === v, 'Use a valid YYYY-MM-DD date'); return v; }
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function need(actor: Actor, ...roles: Actor['role'][]) { insist(roles.includes(actor.role), 'Your role cannot perform this action', 403); }
export function human(actor: Actor) { insist(actor.channel === 'person', 'A person must approve this action', 403); }
export const stmt = (db: D1Database, sql: string, ...values: any[]) => db.prepare(sql).bind(...values);
export async function rows(db: D1Database, sql: string, ...values: any[]) { return (await stmt(db, sql, ...values).all<Data>()).results; }
export async function matter(db: D1Database, actor: Actor, matterId: string) {
 const m = await stmt(db, `SELECT * FROM s_matters WHERE id=? AND ${matterScope('s_matters.id',actor.channel==="agent"?"'agent'":"'person'")}`, matterId, actor.role, actor.email).first<Data>();
 insist(m, 'Matter not found', 404); return m;
}
export function authority(actor: Actor) {
 return { sql: `EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=? AND o.status='active' AND (o.role='owner' OR EXISTS(SELECT 1 FROM s_members m WHERE m.email=o.email AND m.active=1 AND m.role=?)))`, params: [actor.id, actor.role] };
}
export function audit(db:D1Database,actor:AuditActor,action:string,objectId:string,detail='',evidence:Data={}){const q=auditQuery(actor,action,objectId,detail,evidence);return stmt(db,q.sql,...q.params);}
export async function atomic(db: D1Database, actor: Actor, statements: D1PreparedStatement[]) {
 const a = authority(actor), guard = id();
 const approval = actor.approval ? [stmt(db, `INSERT INTO s_guard(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_proposals WHERE id=? AND (sponsor_id=? OR EXISTS(SELECT 1 FROM s_proposal_sponsor_links ps WHERE ps.proposal_id=s_proposals.id AND ps.operator_id=?) OR (sponsor_id IS NULL AND for_email=?)) AND status='pending') THEN 1 ELSE 0 END)`, 'approval:'+guard, actor.approval.id, actor.id, actor.id, actor.email)] : [];
 const decision = actor.approval ? [stmt(db, "UPDATE s_proposals SET status='approved',result_id=?,decided_by=?,decided_at=? WHERE id=?",actor.approval.resultId,actor.email,now(),actor.approval.id),audit(db,actor,'proposal.approved',actor.approval.id,JSON.stringify({resultId:actor.approval.resultId})),stmt(db,'DELETE FROM s_guard WHERE id=?','approval:'+guard)] : [];
 try { await db.batch([...approval,stmt(db, `INSERT INTO s_guard(id,ok) VALUES(?,CASE WHEN (${a.sql}) THEN 1 ELSE 0 END)`, guard, ...a.params), ...statements, ...decision, stmt(db, 'DELETE FROM s_guard WHERE id=?', guard)]); }
 catch (error) { if (/constraint|s_guard|UNIQUE|stale conflict|closed trust period|trust statement periods cannot overlap|reopen the signed period first|only the current signed packet/i.test(String(error))) throw new Fault('The record changed or this action is no longer allowed. Refresh and try again.', 409); throw error; }
}
export async function digest(value: string | Uint8Array) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value as Uint8Array<ArrayBuffer>))].map(x=>x.toString(16).padStart(2,'0')).join(''); }
