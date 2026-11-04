import {atomic,audit,human,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {requireWholeFirmWallAccess} from './wall-doors';
import {reviewOf} from './providers';
import type {Bindings} from '../auth.server';

export type RecoveryChannel='sending'|'charging';
async function latestImport(db:D1Database){
 if(!await stmt(db,"SELECT 1 FROM sqlite_master WHERE type='table' AND name='rer_portability_jobs'").first())return null;
 return stmt(db,"SELECT id FROM rer_portability_jobs WHERE kind='import' AND phase='complete' ORDER BY rowid DESC LIMIT 1").first<Data>();
}
export async function recoveryPaused(db:D1Database,channel:RecoveryChannel){
 if(await stmt(db,`SELECT 1 FROM s_recovery_state WHERE id=1 AND ${channel==='sending'?'sending_paused':'charging_paused'}=1 UNION ALL SELECT 1 FROM s_recovery_authority WHERE channel=? AND authorized_at IS NULL`,channel).first())return true;
 // Base commits its import receipt with the product rows. This also fences
 // compatible older archives that predate the normalized automation row.
 const imported=await latestImport(db);
 return !!imported&&!await stmt(db,'SELECT 1 FROM s_recovery_authority WHERE channel=? AND restore_id=? AND authorized_at IS NOT NULL',channel,imported.id).first();
}
export async function requireRecoveryAuthority(db:D1Database,channel:RecoveryChannel){
 insist(!await recoveryPaused(db,channel),'Restored '+channel+' is paused. The principal must authorize this installation in Recovery settings.',409);
}
export function restoreFences(db:D1Database,restoreId:string,at:string){
 return (['sending','charging'] as const).map(channel=>stmt(db,'INSERT INTO s_recovery_authority(channel,restore_id,restored_at) VALUES(?,?,?) ON CONFLICT(channel) DO UPDATE SET restore_id=excluded.restore_id,restored_at=excluded.restored_at,authorized_by=NULL,authorized_at=NULL,reason=NULL',channel,restoreId,at));
}
export async function authorizeRecovery(env:Bindings,actor:Actor,body:Data){
 human(actor);need(actor,'owner');await requireWholeFirmWallAccess(env.DB,actor);
 insist(body.channel==='sending'||body.channel==='charging','Choose sending or charging');
 const channel=body.channel as RecoveryChannel,restoreId=text(body.restoreId,'Restore receipt',100),reason=text(body.reason,'Authorization reason',2000);
 insist(body.confirmed===true,'Explicitly authorize the restored schedules for this installation');
 await recoveryState(env.DB);
 const fence=await stmt(env.DB,'SELECT * FROM s_recovery_authority WHERE channel=? AND restore_id=?',channel,restoreId).first<Data>();
 insist(fence&&!fence.authorized_at,'Review the current paused restore receipt',409);
 const review=await reviewOf(env.DB,channel==='sending'?'mail':'stripe');
 insist(review&&review.reviewedAt>fence.restored_at,'Review the provider terms again in this installation after restoring',409);
 if(channel==='sending')insist(env.MAIL_PROVIDER&&env.MAIL_FROM&&env.MAIL_API_KEY,'Configure this installation’s mail provider and sender first',409);
 else insist(await stmt(env.DB,"SELECT 1 FROM s_stripe_config WHERE approved_at>? AND kind='operating'",fence.restored_at).first(),'Approve a fresh operating processor arrangement after restoring. Each plan still requires current client consent.',409);
 const at=now();
 await atomic(env.DB,actor,[stmt(env.DB,`UPDATE s_recovery_state SET ${channel==='sending'?'sending_paused':'charging_paused'}=0 WHERE id=1`),stmt(env.DB,'UPDATE s_recovery_authority SET authorized_by=?,authorized_at=?,reason=? WHERE channel=? AND restore_id=? AND authorized_at IS NULL',actor.id,at,reason,channel,restoreId),audit(env.DB,actor,'firm.recovery_authorized',restoreId,JSON.stringify({channel,reason,providerReviewAt:review.reviewedAt}))]);
 return {channel,authorizedAt:at};
}
export async function recoveryState(db:D1Database){
 const state=await stmt(db,'SELECT * FROM s_recovery_state WHERE id=1').first<Data>(),imported=await latestImport(db);
 // A command-line import has the same atomic pause, but no HTTP restore receipt.
 // Its first principal observation establishes only a local authorization fence.
 for(const channel of ['sending','charging'] as const){
  const fence=await stmt(db,'SELECT restore_id,authorized_at FROM s_recovery_authority WHERE channel=?',channel).first<Data>();
  if(imported&&fence?.restore_id!==imported.id||state?.[channel+'_paused']&&(!fence||fence.authorized_at))await stmt(db,'INSERT INTO s_recovery_authority(channel,restore_id,restored_at) VALUES(?,?,?) ON CONFLICT(channel) DO UPDATE SET restore_id=excluded.restore_id,restored_at=excluded.restored_at,authorized_by=NULL,authorized_at=NULL,reason=NULL',channel,imported?.id??crypto.randomUUID(),now()).run();
 }
 return rows(db,'SELECT channel,restore_id,restored_at,authorized_at FROM s_recovery_authority ORDER BY channel');
}
