import {atomic,audit,human,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {requireWholeFirmWallAccess} from './wall-doors';
import {reviewOf} from './providers';
import type {Bindings} from '../auth.server';

export type RecoveryChannel='sending'|'charging';
export async function recoveryPaused(db:D1Database,channel:RecoveryChannel){
 return !!await stmt(db,'SELECT 1 FROM s_recovery_authority WHERE channel=? AND authorized_at IS NULL',channel).first();
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
 const fence=await stmt(env.DB,'SELECT * FROM s_recovery_authority WHERE channel=? AND restore_id=?',channel,restoreId).first<Data>();
 insist(fence&&!fence.authorized_at,'Review the current paused restore receipt',409);
 const review=await reviewOf(env.DB,channel==='sending'?'mail':'stripe');
 insist(review&&review.reviewedAt>fence.restored_at,'Review the provider terms again in this installation after restoring',409);
 if(channel==='sending')insist(env.MAIL_PROVIDER&&env.MAIL_FROM&&env.MAIL_API_KEY,'Configure this installation’s mail provider and sender first',409);
 else insist(await stmt(env.DB,"SELECT 1 FROM s_stripe_config WHERE approved_at>? AND kind='operating'",fence.restored_at).first(),'Approve a fresh operating processor arrangement after restoring. Each plan still requires current client consent.',409);
 const at=now();
 await atomic(env.DB,actor,[stmt(env.DB,'UPDATE s_recovery_authority SET authorized_by=?,authorized_at=?,reason=? WHERE channel=? AND restore_id=? AND authorized_at IS NULL',actor.id,at,reason,channel,restoreId),audit(env.DB,actor,'firm.recovery_authorized',restoreId,JSON.stringify({channel,reason,providerReviewAt:review.reviewedAt}))]);
 return {channel,authorizedAt:at};
}
export const recoveryState=(db:D1Database)=>rows(db,'SELECT channel,restore_id,restored_at,authorized_at FROM s_recovery_authority ORDER BY channel');
