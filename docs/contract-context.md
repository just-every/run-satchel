# Satchel scope and migration context

## Whole job and authority

Satchel owns the legal practice loop from prospective client through closed matter and reconciled money. Trust accounting is built in: client subsidiary ledgers, bank registers and three-way reconciliation are core product obligations, not a link to an external spreadsheet. Banks and contracted processors hold and move actual money. Counsel retains conflict clearance, legal judgments, deadline confirmation and external filing authority. Agents prepare and act only under explicit delegated nonlegal authority; people retain legal and financial approvals.

The published foundation had no root CONTRACT.md or named clause IDs. SAT-001 through SAT-013 give stable names to its existing ACCEPTANCE.md promises, preserving the behavior. Their 1 MiB implementation limit and old exclusions of delivered invoices, trust accounting and provider calls describe the prior release, not target boundaries. New target clauses supersede those scope exclusions while preserving original-byte integrity, review history and authority checks. USD cents remain exact; foreign-currency invoices require explicit agreements and separate currency ledgers.

Neighboring products remain separate. [Chest](https://github.com/just-every/run-chest) owns general-purpose file collaboration; Satchel owns matter evidence and connects repositories. [Inkwell](https://github.com/just-every/run-inkwell) supplies signatures, alongside DocuSign; Satchel owns engagement and matter workflow. [Pantry](https://github.com/just-every/run-pantry) is a general accounting product; Satchel owns legal billing and IOLTA subsidiary accounting and connects QuickBooks Online/Xero. General CRM, enterprise e-discovery and unrestricted legal research databases remain separate products; matter intake, scoped research integration and evidence production remain Satchel obligations.

All clauses inherit server-side authorization, matter confidentiality, stable source identities, append-only posted financial records, reviewed exact revisions, durable job state and explicit uncertain outcomes. Native Base session/import/portability guarantees continue through BASE-001. A fresh production installation contains no sample clients. Examples in acceptance journeys are test inputs, never seeded production records. Paid/network services may use official sandboxes at the edge; application workflows must use real application handlers.

## Approved scope coverage

| Approved input | Named clauses |
| --- | --- |
| Legal practice management; Clio Manage replacement spanning intake to collection | INTAKE-001–010, MATTER-001–009, DOC-001–014, CAL-001–011, CLIENT-001–009, TIME-001–008, BILL-001–016, TRUST-001–010 |
| IOLTA and three-way reconciliation; delivered invoices, LawPay/Stripe, plans and collections | TRUST-001–010, BILL-002, BILL-005–016 |
| Large files, OCR/search, assembly, signatures, Microsoft 365/Gmail/file filing | DOC-001–014, INTAKE-006 |
| Two-way Google/Outlook calendars, CalendarRules/LawToolBox and reminders | CAL-001–008, CAL-011 |
| Intake forms, secure portal, requests and texting | INTAKE-001–010, CLIENT-001–009 |
| Automatic time capture, flat/contingency and LEDES/UTBMS | TIME-001–008, BILL-001 |
| QuickBooks Online operating sync and full Clio migration | BOOKS-001, MOVE-001–002, MOVE-008 |
| Every named incumbent and up-and-comer move-in | MOVE-002–007 |
| Inventory integrations and follow-up behavior | INTAKE-009, DOC-005–011, CAL-002–010, CLIENT-003, CLIENT-005–008, BILL-005–009, BOOKS-001–002, CONNECT-001–003, MATTER-004 |
| Matter agent completes evidence, authorized chases, cited drafts, deadlines and cash milestones | AGENT-001–010 |
| Reporting, role rights, mobile and preservation of Base guarantees | FIRM-001–008, BASE-001, MATTER-008–009, REPORT-001–003, MOBILE-001–002, SAT-001–013 |

## Migration format references

These official source documents inform adapter inputs; they are not evidence that Satchel already implements them. Target move-in covers the full practice through native exports, authorized APIs or vendor-assisted extraction, with missing data made explicit and resolved before cutover. A balance-only export never proves historic trust reconciliation.

- [Clio migration formats](https://help.clio.com/hc/en-us/articles/10263045235867-Migrating-Data-From-Your-Current-Software-C-F) and [calendar exports](https://help.clio.com/hc/en-150/articles/9289958655515-Import-Filter-and-Export-Calendars).
- [MyCase full backup and separate documents](https://supportcenter.mycase.com/en/articles/9370346-how-do-i-get-my-data-out-of-mycase).
- [Smokeball ZIP/CSV export](https://support.smokeball.com/hc/en-us/articles/38032621456279-Exporting-Data-from-Smokeball-Using-the-Data-Import-Export-Tool) and [file backup boundaries](https://support.smokeball.com/hc/en-us/articles/5855417161751-Access-Smokeball-Settings).
- [PracticePanther contacts](https://support.practicepanther.com/en/articles/479930-exporting-contacts), [matters](https://support.practicepanther.com/en/articles/480001-exporting-your-matters) and [time exports](https://support.practicepanther.com/en/articles/479866-how-do-i-export-my-time-entries).
- [Filevine export options](https://support.filevine.com/hc/en-us/articles/46857222439323-Data-Export-Options), [DataBridge](https://support.filevine.com/hc/en-us/articles/41499337170587-DataBridge) and [document ZIPs](https://support.filevine.com/hc/en-us/articles/4404167318029-Doc-Zipping).
- [Eve Word/citation exports](https://www.eve.legal/tort-report/october-2025-updates) and [demand packages](https://www.eve.legal/use-cases/demand-letters). No public bulk structured Eve schema is assumed; vendor-approved retrieval is MOVE-007 work.
