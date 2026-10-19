import {id,stmt,type Actor} from './model';
export function guard(db:D1Database,sql:string,...values:any[]){return stmt(db,`INSERT INTO s_guard(id,ok) SELECT ?,0 WHERE NOT COALESCE((${sql}),0)`,id(),...values);}
export function accessGuard(db:D1Database,actor:Actor,matterId:string){return guard(db,"EXISTS(SELECT 1 FROM s_matters WHERE id=? AND (?='owner' OR EXISTS(SELECT 1 FROM s_matter_access WHERE matter_id=? AND email=?)))",matterId,actor.role,matterId,actor.email);}
