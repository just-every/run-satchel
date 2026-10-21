import {insist,stmt,type Data} from './model';
export async function routeAuthority(db:D1Database,routeId:string,partyRevision:number):Promise<Data>{
 if(routeId==='principal'){
  const principal=await stmt(db,"SELECT email FROM oa_operators WHERE role='owner' AND status='active' ORDER BY email LIMIT 1").first<Data>();
  return {id:routeId,custodian_email:principal?.email??null,revision:String(partyRevision),matter_id:null};
 }
 const wall=await stmt(db,`SELECT w.*,CASE WHEN EXISTS(SELECT 1 FROM s_wall_members wm WHERE wm.matter_id=w.matter_id AND wm.email=w.custodian_email) AND (EXISTS(SELECT 1 FROM oa_operators o WHERE o.email=w.custodian_email AND o.role='owner' AND o.status='active') OR EXISTS(SELECT 1 FROM s_members m WHERE m.email=w.custodian_email AND m.active=1 AND m.role='lawyer')) THEN w.custodian_email ELSE NULL END active_custodian FROM s_ethical_walls w WHERE w.id=?`,routeId).first<Data>();
 insist(wall,'Custodian route not found',404);return {...wall,custodian_email:wall.active_custodian};
}
