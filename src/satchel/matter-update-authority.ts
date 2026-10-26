import {human,insist,matter,need,stmt,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {documentAccess,visibleDocument} from './documents';
import {parseGrants} from './custom-roles';
import {gateGrants} from './role-areas';

export async function responsibleUpdateCounsel(db:D1Database,actor:Actor,matterId:string){
 human(actor);need(actor,'owner','lawyer');await matter(db,actor,matterId);
 gateGrants(actor,'POST','/api/satchel/matters/'+matterId+'/matter-updates');
 insist(await stmt(db,'SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=? AND lawyer_email=?',matterId,actor.email).first(),'Only current responsible counsel may approve or schedule a matter update',403);
}
export async function currentUpdateCounsel(db:D1Database,u:Data):Promise<Actor>{
 const o=await stmt(db,'SELECT o.*,m.role member_role,m.active,r.permissions FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email LEFT JOIN s_custom_roles r ON r.id=m.custom_role_id WHERE o.id=?',u.approved_counsel_id).first<Data>();
 insist(o?.status==='active'&&(o.role==='owner'||o.active===1),'Approving counsel is no longer active',409);
 const actor:Actor={id:o.id,email:o.email,name:o.display_name,role:o.role==='owner'?'owner':o.member_role,channel:'person',...(o.role!=='owner'&&o.permissions?{grants:parseGrants(o.permissions)}:{})};
 insist(u.approved_by===actor.email,'The approving identity changed',409);await responsibleUpdateCounsel(db,actor,u.matter_id);return actor;
}
export async function visibleMatterUpdate(db:D1Database,actor:Actor,updateId:string){
 human(actor);need(actor,'owner','lawyer','assistant');
 const u=await stmt(db,'SELECT * FROM s_matter_updates WHERE id=?',updateId).first<Data>();insist(u,'Matter update not found',404);
 await matter(db,actor,u.matter_id);await visibleDocument(db,actor,u.source_document_id);
 if(u.previous_deadline_id){const previous=await stmt(db,'SELECT document_id FROM s_deadlines WHERE id=?',u.previous_deadline_id).first<Data>();if(previous?.document_id)await visibleDocument(db,actor,previous.document_id);}
 return u;
}
export function updateSourceGuards(db:D1Database,actor:Actor,u:Data){
 const access=documentAccess(actor),checks=[accessGuard(db,actor,u.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_matters WHERE id=? AND lifecycle_status='open')",u.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_deadlines WHERE id=? AND revision=? AND status='confirmed')",u.deadline_id,u.source_revision),guard(db,`EXISTS(SELECT 1 FROM s_documents d JOIN s_document_versions v ON v.document_id=d.id WHERE d.id=? AND d.current_version=? AND v.version=? AND v.sha256=? AND v.content_base64 IS NOT NULL AND d.erased_at IS NULL AND ${access.sql})`,u.source_document_id,u.source_version,u.source_version,u.source_digest,...access.params)];
 if(u.previous_deadline_id)checks.push(guard(db,`EXISTS(SELECT 1 FROM s_deadlines t LEFT JOIN s_documents d ON d.id=t.document_id WHERE t.id=? AND t.matter_id=? AND t.confirmed_at IS NOT NULL AND (t.document_id IS NULL OR (${access.sql})))`,u.previous_deadline_id,u.matter_id,...access.params));
 return checks;
}
export function updateAuthorityGuards(db:D1Database,actor:Actor,u:Data){return [...updateSourceGuards(db,actor,u),guard(db,"EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email LEFT JOIN s_custom_roles r ON r.id=m.custom_role_id WHERE o.id=? AND o.email=? AND o.status='active' AND (o.role='owner' OR (m.active=1 AND m.role='lawyer' AND (m.custom_role_id IS NULL OR (json_extract(r.permissions,'$.contacts')='write' AND json_extract(r.permissions,'$.documents')='write' AND json_extract(r.permissions,'$.billing')='write')))))",actor.id,actor.email),guard(db,'EXISTS(SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=? AND lawyer_email=?)',u.matter_id,actor.email),guard(db,"EXISTS(SELECT 1 FROM s_matter_updates WHERE id=? AND status='approved' AND approved_counsel_id=? AND revision=?)",u.id,actor.id,u.revision)];}
