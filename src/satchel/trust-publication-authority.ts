import {accountTrustScope} from './trust-reports';

// Publication remains dependent on the named human principal's current trust
// capability and access to the complete account, including other subsidiaries.
export function trustPublicationAuthority(accountSql:string,emailSql:string,officer=false){
 return `EXISTS(SELECT 1 FROM oa_operators publication_principal JOIN s_members publication_member ON publication_member.email=publication_principal.email
 WHERE publication_principal.email=${emailSql} AND publication_principal.role='owner' AND publication_principal.status='active'
 AND publication_member.active=1 AND publication_member.role IN(${officer?"'trust_officer'":"'trust_officer','accountant'"})
 AND ${accountTrustScope(accountSql,'publication_principal.role','publication_principal.email')})`;
}
