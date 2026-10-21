// Wall membership intersects ordinary role/grant authority. Exceptional grants
// belong to the named person and never become delegated automation authority.
export function wallAllows(matterSql:string,emailSql:string,channelSql="'person'"){
 return `(NOT EXISTS(SELECT 1 FROM s_ethical_walls ew WHERE ew.matter_id=${matterSql}) OR EXISTS(SELECT 1 FROM s_wall_members wm WHERE wm.matter_id=${matterSql} AND wm.email=${emailSql}) OR (${channelSql}='person' AND EXISTS(SELECT 1 FROM s_wall_requests er WHERE er.matter_id=${matterSql} AND er.requester_email=${emailSql} AND er.status='approved' AND er.revoked_at IS NULL AND er.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))))`;
}
// Exactly two placeholders, in role/email order, as in the native grant queries.
export function matterScope(matterSql:string,channelSql="'person'"){
 return `EXISTS(SELECT 1 FROM (SELECT ? AS role,? AS email) reader WHERE (reader.role='owner' OR EXISTS(SELECT 1 FROM s_matter_access ga WHERE ga.matter_id=${matterSql} AND ga.email=reader.email) OR EXISTS(SELECT 1 FROM s_ethical_walls cw WHERE cw.matter_id=${matterSql} AND cw.custodian_email=reader.email) OR (${channelSql}='person' AND EXISTS(SELECT 1 FROM s_wall_requests ge WHERE ge.matter_id=${matterSql} AND ge.requester_email=reader.email AND ge.status='approved' AND ge.revoked_at IS NULL AND ge.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')))) AND NOT EXISTS(SELECT 1 FROM s_matter_exclusions ex WHERE ex.matter_id=${matterSql} AND ex.email=reader.email AND ex.released_at IS NULL) AND ${wallAllows(matterSql,'reader.email',channelSql)})`;
}
