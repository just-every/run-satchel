import {stmt,type Actor} from './model';
export function stopContactEmail(db:D1Database,emails:string[],actor:Actor,at:string){
 const reason='Email consent withdrawn; fresh explicit review required';
 return emails.flatMap(email=>[
  stmt(db,'INSERT OR IGNORE INTO s_production_access_stops SELECT id,?,?,? FROM s_production_shares WHERE recipient_email=?',actor.email,at,reason,email),
  stmt(db,"UPDATE s_client_reminder_jobs SET status='stopped',detail=? WHERE recipient=? AND status IN('queued','prepared','paused')",reason,email),
  stmt(db,"UPDATE s_matter_update_jobs SET status='stopped',detail=? WHERE recipient=? AND status IN('queued','prepared','paused')",reason,email),
  stmt(db,"UPDATE s_request_reminder_sends SET status='cancelled',detail=? WHERE status='queued' AND reminder_id IN(SELECT id FROM s_request_reminders WHERE email=?)",reason,email),
  stmt(db,"UPDATE s_request_reminders SET status='stopped',reason=? WHERE email=? AND status='active'",reason,email),
  stmt(db,'INSERT OR IGNORE INTO s_collection_recipient_stops SELECT id,?,?,? FROM s_collection_sequences WHERE recipient=?',actor.email,at,reason,email)
 ]);
}
