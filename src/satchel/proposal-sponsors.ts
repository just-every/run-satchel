import {stmt} from './model.ts'

/** Called only by explicit native owner restore/invitation/member actions. The
 * historical proposal row stays unchanged. Existing destination links never
 * move when an address is changed or reused. No account is created here. */
export function restoredProposalSponsorLinks(db:D1Database,email?:string,invited=false){
 return stmt(db,`INSERT OR IGNORE INTO s_proposal_sponsor_links(proposal_id,operator_id)
 SELECT p.id,o.id FROM s_proposals p JOIN oa_operators o ON o.email=p.for_email
 WHERE p.sponsor_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM oa_operators original WHERE original.id=p.sponsor_id)
 AND o.status IN (${invited?"'active','invited'":"'active'"})${email?' AND o.email=?':''}`, ...email?[email]:[])
}
