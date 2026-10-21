import {wallAllows} from './matter-scope';
import {insist,stmt,type Actor} from './model';
// Whole-file originals and firm-wide administrative operations cannot be
// projected safely: every wall must permit their current human reader.
export const allWallsAllow=(emailSql:string,channelSql="'person'")=>`NOT EXISTS(SELECT 1 FROM s_ethical_walls bulk_wall WHERE NOT ${wallAllows('bulk_wall.matter_id',emailSql,channelSql)})`;
export async function requireWholeFirmWallAccess(db:D1Database,actor:Actor){
 insist(await stmt(db,`SELECT 1 FROM (SELECT ? email) bulk_reader WHERE ${allWallsAllow('bulk_reader.email',actor.channel==='agent'?"'agent'":"'person'")}`,actor.email).first(),'This firm-wide operation requires access to every ethical wall',403);
}
