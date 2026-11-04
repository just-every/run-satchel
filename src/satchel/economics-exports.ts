import {atomic,audit,digest,id,insist,matter,now,rows,stmt,type Actor,type Data} from './model';
import {economicsPrincipal} from './staff-costs';
import {economicsArtifact,economicsFile} from './economics';
import {accessGuard,guard} from './trust-guards';
import {matterScope} from './matter-scope';

const permitted=`NOT EXISTS(SELECT 1 FROM json_each(x.matter_ids) covered WHERE NOT ${matterScope('covered.value')})`;
export async function retainedEconomics(db:D1Database,actor:Actor){
 economicsPrincipal(actor);
 return {exports:await rows(db,`SELECT x.id,x.artifact_sha256,x.generated_by,x.generated_at,x.filters FROM s_economics_exports x WHERE x.artifact IS NOT NULL AND ${permitted} ORDER BY x.generated_at DESC,x.id`,actor.role,actor.email)};
}
export async function generateEconomics(db:D1Database,actor:Actor,b:Data){
 economicsPrincipal(actor);insist(b.confirmed===true,'Explicitly request this confidential internal report');
 const {report,manifest,artifact,artifactSha256}=await economicsArtifact(db,actor,b.filters??{}),exportId=id(),matterIds=report.matters.map(m=>m.matterId),costIds=[...new Set(report.matters.flatMap(m=>m.source.costBasis.map((c:Data)=>c.approvalId).filter(Boolean)))].sort();
 await atomic(db,actor,[...matterIds.map(m=>accessGuard(db,actor,m)),guard(db,'NOT EXISTS(SELECT 1 FROM s_staff_cost_disposals WHERE revision_id IN(SELECT value FROM json_each(?)))',JSON.stringify(costIds)),stmt(db,'INSERT INTO s_economics_exports VALUES(?,?,?,?,?,?,?,?)',exportId,artifact,artifactSha256,JSON.stringify(matterIds),JSON.stringify(costIds),actor.email,report.asOf,JSON.stringify(report.filters)),audit(db,actor,'report.economics_generated',exportId,JSON.stringify({artifactSha256,payloadSha256:manifest.payloadSha256,matterIds,generatedAt:report.asOf,marking:manifest.marking,delivery:'Retained for a separate authenticated download; no access authority is retained'}))]);
 return {id:exportId,artifactSha256,generatedAt:report.asOf,downloadPath:'/api/satchel/reports/economics/exports/'+exportId+'/file'};
}
export async function downloadEconomics(db:D1Database,actor:Actor,exportId:string){
 economicsPrincipal(actor);
 const record=await stmt(db,'SELECT * FROM s_economics_exports WHERE id=? AND artifact IS NOT NULL',exportId).first<Data>();insist(record,'Retained report not found',404);
 const matterIds=JSON.parse(record.matter_ids) as string[];
 for(const matterId of matterIds)await matter(db,actor,matterId);
 insist(await digest(record.artifact)===record.artifact_sha256,'Retained report failed its integrity check',503);
 await atomic(db,actor,[...matterIds.map(m=>accessGuard(db,actor,m)),guard(db,'EXISTS(SELECT 1 FROM s_economics_exports WHERE id=? AND artifact IS NOT NULL AND artifact_sha256=?)',exportId,record.artifact_sha256),audit(db,actor,'report.economics_downloaded',exportId,JSON.stringify({artifactSha256:record.artifact_sha256,matterIds,generatedAt:record.generated_at,requestedAt:now(),delivery:'Explicit authenticated download response; receipt by the reader is not asserted'}))]);
 return economicsFile(record.artifact,record.artifact_sha256);
}
