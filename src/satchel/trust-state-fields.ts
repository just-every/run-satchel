// Practitioner records for review, never answers filed or certified by Satchel.
export const californiaTrustFields=[
 ['reportingYear','Reporting year'],['licenseeName','Responsible licensee name'],['barNumber','California bar number'],
 ['heldClientFunds','Held client funds during the reporting year'],['selfAssessment','Annual self-assessment response'],
 ['complianceResponse','Practitioner-recorded annual compliance response'],['institutionName','Institution name'],
 ['institutionAddress','Institution address'],['routingNumber','Bank routing number'],['accountNumber','Trust account number'],
 ['accountType','IOLTA or non-IOLTA account type'],['accountJurisdiction','Account jurisdiction'],
 ['openedDate','Account opening date'],['closedDate','Account closing date or still open'],
] as const;
export const newYorkRecordCategories=[
 ['receipts_disbursements','Receipts and disbursements records'],['client_ledgers','Separate client ledgers'],
 ['retainer_agreements','Client retainer agreements'],['compensation_agreements','Compensation agreements'],
 ['client_statements','Client account statements'],['bills','Bills rendered to clients'],
 ['disbursement_records','Disbursement records'],['checkbooks','Checkbooks'],['check_stubs','Check stubs'],
 ['cancelled_checks','Cancelled checks'],['deposit_slips','Duplicate deposit slips'],['bank_statements','Bank statements'],
] as const;
