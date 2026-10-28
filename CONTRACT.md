# Satchel target product contract

Target edition: 17 October 2026. Satchel is the US small-firm practice management system a Clio Manage, MyCase, Smokeball or PracticePanther buyer can switch to, with Filevine’s matter-work depth and source-grounded assistance beyond today’s Eve workflows. It runs intake and conflicts, engagements, matters, documents and email, court deadlines, client communication, time capture, billing, built-in trust accounting, legal payments and collections.

## Product target

| | |
| --- | --- |
| Category | Legal practice management software |
| Incumbents a buyer switches from | Clio, MyCase (8am), Smokeball, PracticePanther; Filevine and Eve |
| Up-and-comers it must also beat | Filevine, Eve |
| First buyer | The principal or administrator of a 1–10 lawyer US firm, with lawyers, assistants, billing staff and an outside accountant; USD fees, US banks, US court practice and US client communication norms |

The primary journey: qualify a prospect, clear conflicts, engage the client, work the matter with source-linked evidence and deadlines, bill exact work, collect and reconcile operating and trust money, then close with retained history.


## How to read this contract

- This follows the RER contract standard.
- Core, Agent surface and Later are reported separately.
- Done means every acceptance point has recorded proof.
- Field proof is kept in its register.
- ACCEPTANCE.md and the homepage claims document are generated from this file.

## Shared duties (Base)

| Base duty | Duty | Delta clauses | Base journey |
| --- | --- | --- | --- |
| BASE-ACCESS-001 | Sign-in | none | not run |
| BASE-ACCESS-002 | Sessions | FIRM-002 | not run |
| BASE-ACCESS-003 | Public endpoints | none | not run |
| BASE-ACCESS-004 | Server-side authorisation | none | not run |
| BASE-INPUT-001 | Validation | none | not run |
| BASE-INPUT-002 | HTML | none | not run |
| BASE-INPUT-003 | Uploads | none | not run |
| BASE-SECRET-001 | No leakage | FIRM-004 | not run |
| BASE-SECRET-002 | Startup | none | not run |
| BASE-DATA-001 | Export and import | FIRM-001, FIRM-003, FIRM-005, FIRM-006, FIRM-007, BASE-001, INTAKE-001, INTAKE-005, MATTER-007, DOC-002, DOC-006, CLIENT-008, TIME-004, TIME-005, TIME-006, BILL-004, BILL-005, BILL-012, BILL-017, BILL-015, BILL-016, TRUST-004, TRUST-008, CONNECT-003, MOVE-003, MOVE-005, MOVE-006, MOVE-008, AGENT-007 | not run |
| BASE-DATA-002 | Retention | none | not run |
| BASE-DATA-003 | Erasure | none | not run |
| BASE-DATA-004 | Outbound flows | FIRM-004, CONNECT-001 | not run |
| BASE-DATA-005 | Independence | none | not run |
| BASE-PUBLIC-001 | Privacy | none | not run |
| BASE-PUBLIC-002 | Origins | none | not run |
| BASE-PUBLIC-003 | Accessibility | none | not run |
| BASE-OPS-001 | Health | none | not run |
| BASE-OPS-002 | Migrations | none | not run |
| BASE-OPS-003 | Idempotency | CONNECT-001 | not run |
| BASE-OPS-004 | Failure is visible | none | not run |
| BASE-OPS-005 | Audit | none | not run |
| BASE-ROLE-001 | Roles through every door | SAT-009, OSS-001, FIRM-002, FIRM-003, FIRM-005, FIRM-006, FIRM-008, BASE-001, INTAKE-001, INTAKE-004, INTAKE-005, INTAKE-010, INTAKE-007, INTAKE-008, INTAKE-009, MATTER-001, MATTER-002, MATTER-003, MATTER-006, MATTER-007, MATTER-009, DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-008, DOC-009, DOC-010, DOC-011, DOC-012, DOC-014, CAL-001, CAL-008, CLIENT-001, CLIENT-005, CLIENT-006, CLIENT-007, CLIENT-008, CLIENT-009, CLIENT-010, TIME-002, TIME-004, TIME-005, TIME-006, TIME-008, BILL-011, BILL-012, BILL-017, BILL-016, TRUST-004, TRUST-008, TRUST-009, TRUST-010, CONNECT-001, CONNECT-002, CONNECT-003, REPORT-001, REPORT-003, MOBILE-001, MOBILE-002, MOVE-006, MOVE-008, AGENT-002, AGENT-004, AGENT-007, AGENT-009, AGENT-010 | not run |
| BASE-AUDIT-001 | Searchable, durable audit | FIRM-002, FIRM-003, FIRM-005, FIRM-008, INTAKE-005, INTAKE-010, DOC-014, CAL-008, CLIENT-010, TIME-003, TIME-005, BILL-001, TRUST-008, CONNECT-003, REPORT-001 | not run |
| BASE-BACKUP-001 | Independent backup, restore and rollback | none | not run |
| BASE-DATA-006 | Erasure respects retention and legal hold | FIRM-006, BASE-001, INTAKE-001, INTAKE-005, INTAKE-010, INTAKE-006, INTAKE-007, MATTER-007, DOC-002, DOC-003, DOC-006, DOC-014, TIME-003, TIME-005, TIME-006, TRUST-004, TRUST-008, TRUST-010, AGENT-010 | not run |
| BASE-SIGNIN-001 | Standards-based SSO and lifecycle | FIRM-004 | not run |
| BASE-SIGNIN-002 | Native multi-factor authentication | FIRM-004 | not run |
| BASE-INSTALL-001 | Free self-host and removal | OSS-001 | not run |
| BASE-MAIL-001 | Truthful mail outcomes | OSS-001, INTAKE-001, INTAKE-002, INTAKE-004, INTAKE-007, INTAKE-009, MATTER-003, MATTER-005, MATTER-009, DOC-003, DOC-008, DOC-009, CAL-006, CAL-007, CAL-011, CLIENT-002, CLIENT-006, CLIENT-008, CLIENT-010, TIME-002, TIME-003, TIME-006, TIME-007, TIME-009, BILL-002, BILL-007, BILL-012, BILL-016, TRUST-002, TRUST-005, TRUST-006, TRUST-007, TRUST-008, TRUST-009, REPORT-003, MOVE-002, MOVE-003, MOVE-004, MOVE-008, AGENT-006, AGENT-007 | not run |
| BASE-ACCESSIBILITY-001 | One accessibility bar | MOBILE-001 | not run |
| BASE-DOCS-001 | On-site docs from one contract | none | not run |
| BASE-AGENT-001 | One MCP door per seed | none | not run |
| BASE-AGENT-002 | The seed's jobs are tools, through the UI's own actions | AGENT-001, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, AGENT-009, AGENT-010, SURFACE-001 | not run |
| BASE-AGENT-003 | Records are resources | SURFACE-004 | not run |
| BASE-AGENT-004 | Business identity and short-lived, audience-bound tokens | none | not run |
| BASE-AGENT-005 | An agent acts as a person in a role, never more | SAT-009, CONNECT-001, AGENT-010 | not run |
| BASE-AGENT-006 | Every action declares its risk class | SURFACE-001, SURFACE-002, SURFACE-003 | not run |
| BASE-AGENT-007 | The company's policy decides, at one chokepoint | SAT-009, AGENT-001, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, AGENT-009, AGENT-010, SURFACE-005 | not run |
| BASE-AGENT-008 | Truthful attribution | SAT-009 | not run |
| BASE-AGENT-009 | Every agent action is audited with its class and decision | none | not run |
| BASE-AGENT-010 | Agents can follow changes | SURFACE-004 | not run |
| BASE-AGENT-011 | Limits are policy, and Pause stops everything | none | not run |
| BASE-AGENT-012 | Writes are idempotent and conflict-safe | CONNECT-001 | not run |
| BASE-AGENT-013 | Manifest, docs and the conformance journey | SURFACE-001, SURFACE-004, SURFACE-005 | not run |

## Published clauses

- `SAT-006`: *Tier:* Core
- `SAT-009`: *Tier:* Core · *Cites:* BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008, BASE-ROLE-001
- `OSS-001`: *Tier:* Core · *Cites:* BASE-INSTALL-001, BASE-ROLE-001, BASE-MAIL-001

### Published foundations

#### SAT-006 — Correct by reviewed additions

**Requirement.** A correction is a separately reviewed delta referencing the original bill and source amounts. The original exported artifact, review identity and history remain intact. A delta adjusts an amount without releasing entries; when the entries themselves are wrong (matter, rate, narrative or template), BILL-016 voids the invoice and rebills them.

**Acceptance.**
1. Create and approve a courtesy reduction through the billing API; export its negative delta and download the original again with identical bytes.

#### SAT-009 — Prepare and decide matter proposals

**Requirement.** Matter, bill and deadline proposals retain their own conflict, bill and source-review prerequisites. Internal preparation carries standard; decisions binding legal or financial work carry commitment or money under the company’s policy.

**Acceptance.**
1. Under the held company policy, use an agent credential to prepare each proposal, refuse the agent impersonating a person’s approval and repeated human decisions, inspect the person’s decision record, then revoke the credential and refuse access.

#### OSS-001 — Free and open source, MIT licensed

**Requirement.** Satchel’s source is publicly available under the MIT license, with no Satchel license fee, subscription, paywall, seat charge or matter limit.  Payment, e-signature and accounting providers, including LawPay, Stripe, DocuSign, Inkwell, QuickBooks Online and Xero, bill the firm directly under their own terms, as do hosting, mail, SMS, court-rule and filing providers; “100% free” describes Satchel software, not those provider services.

**Acceptance.**
1. Read `LICENSE` and the homepage, /run, README and owner guides and verify they agree on MIT, free Satchel software, self-hosting and direct provider billing.
2. Follow the published run command on a fresh installation and complete the native matter/time/bill workflow without any Satchel payment, plan or license prompt.
3. Before connecting a provider inspect its terms and direct firm-billing disclosure and prove Satchel adds no software or provider-resale charge.

## Target clauses

### Firm authority and records

#### FIRM-001 — Set up an empty US firm

*Tier:* Core · *Cites:* BASE-DATA-001

**Requirement.** A fresh installation starts with the buyer’s firm, offices, US contact details, practice areas, IANA timezone, USD billing defaults and fiscal settings entered by the principal or imported with provenance: imported from a Satchel firm-settings JSON file (the one **Download firm settings** produces), recorded with its file name and SHA-256; a full firm archive restore also carries the settings and their provenance. Importing firm settings from Clio, MyCase and other products belongs to MOVE-002 to MOVE-007. Production never starts with demo clients.

**Acceptance.**
1. Start a fresh installation, finish setup, inspect empty matters and enter firm settings; download them and import the file into a fresh installation, where the source shows its file name and SHA-256; restore a full firm archive and find the same settings and provenance.

#### FIRM-002 — Separate finance and legal rights

*Tier:* Core · *From:* FIRM-002, SAT-001, SAT-003 · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-ACCESS-002

**Requirement.** Principal manages membership and policies; lawyers clear conflicts, confirm legal deadlines and approve legal work; assistants manage assigned work without legal approval; billing staff draft and deliver approved bills; trust officers authorize transfers; accountants reconcile with read-only matter context; clients see explicit portal grants.  Billing staff draft bills and, once a lawyer or the principal has approved one, issue and export it; they cannot approve, reach trust records, conflicts, membership or matter access. Accountants read their assigned matters, billing and every trust record and reconcile (import a statement period, record bank clearance, match checks) but cannot authorize, sign or reopen a period or change anything else. A client reaches no staff door: only the principal shares one matter at a time with an active client member, with a recorded reason and an audit entry, and the client then sees that matter’s number, title and status; a walled matter is never shown and withdrawing the share closes the view. Agent keys and integrations need a principal, lawyer, assistant or trust-officer sponsor, so a member whose role changes to billing, accountant or client loses any earlier key at once. FIRM-008’s custom roles narrow these roles and never widen them; CLIENT-001 to CLIENT-009 own portal identities, content and messaging beyond this view and inherit the share and withdrawal rules. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#firm-002). The principal saves and invites lawyers and assistants, deactivates membership and controls matter grants. The principal grants or removes access to individual matters. Other staff see only assigned matters; the principal can see all. Finance and ethical-wall extensions in FIRM-002 and FIRM-003 add narrower authority within their own scope. Its grant door refuses staff excluded by an INTAKE-005 engagement restriction, naming it .

**Acceptance.**
1. Create each role and use direct APIs for legal approval, invoice delivery, trust transfer, reconciliation and access changes; deny every capability outside that role.
2. Also: as billing staff draft and issue an approved bill but fail to approve it; as an accountant reconcile and fail to authorize, sign or change a matter; as a client see only a shared matter, with every staff door refused.
3. Through Team and the JSON API invite an assistant, grant one matter, read it, then revoke membership; direct private reads and writes fail immediately.
4. As an unassigned assistant request a matter and its billing, files and deadlines directly, receive refusal, then grant and remove access and repeat.

#### FIRM-003 — Enforce ethical walls

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001

**Requirement.** Restricted matters support explicit ethical walls, excluding ordinary administrators and search, exports, notifications, connected repositories and agent context. A designated custodian records exceptional access with reason and an audit entry. Inherit REPORT-001’s exclusion of a principal outside the wall from every report row, count, drill, option and CSV. The principal establishes a wall with an active lawyer or principal custodian and explicit members; subsequent membership changes belong only to the custodian. Exceptional access requires the custodian’s recorded reason, expires within 60 minutes, can be revoked and widens no agent or integration grant. Membership changes revoke outstanding exceptional grants. Current matter doors, search, reports, notifications and exports intersect wall access; an indivisible firm archive, import original or account aggregate is refused unless every included wall permits the reader. DOC-010, DOC-011 and DOC-014 inherit the same boundary before connected repositories or desktop caches ship.  The principal establishes a wall naming an active lawyer or principal custodian, who is always a wall member; for a wall INTAKE-010 creates at opening, the default custodian is the lawyer who records the restriction. After creation only the current custodian changes membership, hands custodianship to another active lawyer or principal inside the wall, or dissolves the wall, each with a recorded reason; nobody outside the wall, the principal and administrators included, adds themselves, changes members or custodian, approves access or dissolves it. With no active custodian the wall stays in force, reads "custodian unassigned", allows no exceptional access, and an active lawyer or principal inside the wall may take custodianship with a recorded reason. Exceptional access is requested with a reason by one active person in a native session from the person’s own signed-in session. Only the current custodian approves or refuses it, with a decision note. It lasts at most 60 minutes from approval and never renews: a further need is a new request. It is revoked early by the custodian or by any membership or custodian change. It opens the walled matter's current doors for that person only. It never confers membership or custodian authority, does not widen their agent or integration grants, and never counts toward the every-wall permission for whole-firm archives, import originals or account aggregates. Request, decision, expiry, revocation and the recipient's walled reads under a grant are FIRM-005 audit actions readable inside the wall; the recipient sees their own request, decision and expiry. INTAKE-010's walled routing and the walls its restrictions create are proved under INTAKE-010.

**Acceptance.**
1. Wall off an adverse matter, search and export as a principal outside the wall, then approve a documented emergency access and inspect its trace.
2. Also (ct 22 Oct 2026): as the principal outside the wall, be refused adding yourself, changing members, re-designating the custodian, dissolving the wall and approving your own request; as an agent key or integration, be refused widening its own scope by requesting or using that person’s exceptional grant.
3. As the custodian, approve the principal's request, see it refused after 60 minutes, approve another and see it revoked by a membership change and again by handing custodianship to an inside lawyer.
4. Under an active grant, be refused a whole-firm archive.
5. Deactivate the custodian and see "custodian unassigned" with no grant possible until an inside lawyer takes custodianship.

#### FIRM-004 — Secure sessions and connected secrets

*Tier:* Core · *Cites:* BASE-SIGNIN-001, BASE-SIGNIN-002, BASE-SECRET-001, BASE-DATA-004 · *Register:* R-5

**Requirement.** Firm authentication and connector authorization protect matter data and local credentials. Revocation stops newly authorized work and exposes in-flight uncertainty. Diagnostics retain the seed-specific authorization and token state. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#firm-004).

**Acceptance.**
1. Sign in with MFA, revoke a device and a Microsoft connector while work is queued, then attempt reads and inspect logs and an export.

#### FIRM-005 — Export a complete action audit

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001

**Requirement.** Authorized custodians filter and export an append-only history of actor, role, matter, source, revision, human decision, automation policy and provider outcome. Audit access respects walls; corrections add records rather than rewriting prior actions. The principal is the current native custodian. Every capability and provider that exists today records this evidence; FIRM-002, FIRM-003, FIRM-004, FIRM-008, BILL-005/006/007, BOOKS-001/002, CONNECT-003 and AGENT-010 inherit the obligation before their new roles, walls, providers, policies or doors ship, as does each future clause adding a capability or record kind. Legacy rows retain every original field unchanged; unavailable role, channel, source and revision fields remain null and are labeled “legacy, not recorded”, never inferred from present membership. Audit date filters include whole UTC calendar days, ordered by action timestamp and ID. Export streams a frozen append-only snapshot with its record count; its own export-request action is recorded after that snapshot. Archive restore retains all imported rows unchanged and appends a new custody action naming the exact supplied archive hash.

**Acceptance.**
1. Open the audit, filter a matter and date range, export a transfer and approval trail, and verify an unauthorized reader cannot inspect it.

#### FIRM-006 — Apply retention and legal holds

*Tier:* Core · *From:* FIRM-006, SAT-012 · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-DATA-006

**Requirement.** Counsel (the principal or a lawyer on the matter) places and releases legal holds and sets matter and document retention schedules; holds block scheduled disposal and ordinary erasure. Until FIRM-002 and FIRM-008 define a custodian role, expiration asks the principal, who approves disposal. Approved disposal removes originals and every derivative, and its journal counts each kind removed: today Satchel keeps no previews, OCR text, search vectors or connector caches, so the journal records zero of each; when DOC-002 (previews), DOC-003 (OCR and search index) and DOC-010 (connector caches) add derivatives, disposal must remove them and the journal must count them. DOC-002’s separate annotations and retained conflict originals are also removed and counted individually. DOC-012 chronology snapshots and reviews and DOC-013 production packets and manifests are removed when any source is disposed, and the journal counts affected chronologies and productions. Before a lead-retention door ships, FIRM-006 must also apply its holds, disposal, original and derivative removal and restore-fence obligations to INTAKE-001 inquiry records and R2 originals. A disposed document keeps only a tombstone (name, erasure time and journal) in its matter’s document list: no download returns any version, and no document search, saved view search or duplicate check finds it. INTAKE-005 waivers and restriction records are retained conflict originals. A principal confirms a document name and reason to erase every version’s bytes while preserving metadata, hashes and the erasure journal. Supplying the later journal fences older archives; copies already downloaded or delivered remain outside local erasure.

**Acceptance.**
1. As a lawyer on the matter place a hold, request erasure and receive a refusal; release it, let the schedule expire and approve disposal as the principal (a lawyer or assistant cannot approve it); prove all downloads and searches stop and the disposal journal counts every derivative kind removed (zero previews, OCR text, search vectors and connector caches today).
2. Erase through the document API, refuse assistant erasure, confirm all version downloads fail and reject a pre-erasure backup when accompanied by the later journal.

#### FIRM-007 — Operate and recover the owned system

*Tier:* Core · *Cites:* BASE-DATA-001

**Requirement.** The principal owns deployment and provider accounts, sees storage/connector costs and health diagnostics that name each connector’s authorization and token expiry, last successful sync, queued and failed jobs, scheduled-job lag, storage use against quota, last verified backup and restore test, bank-feed staleness and unreconciled trust periods, each with its next action. The principal exports full archives with large attachments and reconciled trust history. Restore validates counts and hashes, keeps secrets local and leaves external sending and charging paused until reauthorized.

**Acceptance.**
1. Restore a populated target firm into a new installation, reconcile attachment hashes and trust totals, expire a connector token and stop the bank feed and see each named in diagnostics with its next action, and prove no imported job sends or charges.
2. On a fresh computer run `npx -y @runeditrun/rer dev just-every/run-satchel`, reach the local installation, then follow the owner deployment guide to run it in the firm’s own server/Cloudflare account without a Satchel subscription.

#### FIRM-008 — Define custom roles and rate visibility

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Beyond FIRM-002’s built-in roles, the principal defines custom roles with per-area permissions: billing rates (none, own, all), operating and trust bank accounts (none, balances only, full transactions), reports (none, own matters, firm-wide), contacts, documents, billing and settings.  Legal approval and trust authorization stay tied to FIRM-002’s lawyer and trust-officer authority, and a custom role cannot confer them. Apply those report scopes to every REPORT-001 row, count, drill and CSV. **Exact semantics.** A custom role is a named ceiling the principal places on one active member who is not a client or the principal, beside their built-in role: it lowers what that role could reach and never raises it, so legal approval, conflict clearance, trust authorization, matter grants and ethical walls stay exactly as FIRM-002 and FIRM-003 define them, and a role that names trust authorization or legal approval is refused. Rates: none, own (entries, drafts and bill lines the member recorded, plus agreements naming no timekeeper) or all; every other timekeeper’s rate, amount and discount, and every frozen CSV, LEDES or XML text, is withheld and marked, never shown as zero, while bill totals remain, and exports that carry rates need all. Bank: none, balances (account and subsidiary-ledger balances only) or full; a bill row shows no trust custody without full. Reports: none, own (matters whose responsible attorney is the member and leads assigned to them, applied before every row, count, drill, option and CSV) or firm-wide, always inside current grants and walls. Contacts, documents, billing and settings: none, read (reads only) or write (the built-in role decides). Every server door of a session, an agent key and its proposals, and an integration key is assigned to its areas in one map the principal can read, and a door missing from it is refused to a narrowed member.  FIRM-004, DOC-010, DOC-011, DOC-014, REPORT-002, REPORT-003, BOOKS-001, BOOKS-002, BILL-005 to BILL-016 and every new door inherit the map: each must be given an area at its door.

**Acceptance.**
1. Create a role with own-rate visibility and no trust bank access and assign it to an assistant; request another timekeeper’s rate through the timesheet, draft invoice, report and export routes and the IOLTA register directly and receive refusal or redaction; widen the role, repeat, and inspect the audit of both changes; refuse a custom role that grants trust authorization.

#### BASE-001 — Preserve Base guarantees through replacements

*Tier:* Core · *From:* BASE-001, SAT-011 · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-DATA-006

**Requirement.** Satchel retains native Base identity, imports, portability and erasure guarantees. Its custom archive/erase doors replace generic product export/erasure for matter records, including originals, review history, import journals and erasure fences; this replacement must grow with every new product record. Product records, review history and import provenance round-trip; identity, sessions, local configuration and agent keys remain excluded.

**Acceptance.**
1. Through native sign-in and Satchel backup, restore and erasure routes round-trip every native record, omit local authority and refuse stale erased content.
2. Export through Team & safety, refuse corrupt and nonempty restore, restore into an empty installation, export again and compare all native rows and original bill bytes.

### Intake and engagement

#### INTAKE-001 — Publish conditional intake forms

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-DATA-006, BASE-MAIL-001

**Requirement.** Staff publish branded accessible forms with conditional questions, consent, secure attachments, spam controls and practice-specific fields. Every submission becomes a permissioned lead with source and receipt; sensitive replies never appear in public URLs or notification subjects. The principal and lawyers publish immutable numbered form versions with the firm name, optional PNG/JPEG logo, practice label, plain-text review consent and typed text, choice, date or yes/no questions. A conditional question depends on one earlier choice or yes/no answer; the server refuses hidden answers and validates required visible answers. Publication names an active principal, lawyer or assistant as the lead assignee. A submission requires explicit consent for receipt and review of that inquiry only: it never matches a contact identity, changes channel consent or authorizes sending. The public page uses strict-origin referrers and exact-origin submissions; a random, hashed 20-minute token binds the published revision, a honeypot and at most ten accepted submissions per form/network/UTC hour limit spam. Only an hourly HMAC network digest is retained, for at most two hours; scheduled cleanup removes expired security data. One accepted submission atomically records one native lead, source form/version, immutable answers and consent evidence, original-file references and an opaque receipt; replay returns the same receipt, never a second lead. The receipt is displayed after POST, with no anonymous read-back page, email or notification. At most three PDF, PNG or JPEG originals of up to 10 MiB each (10,485,760 bytes) are stored in R2 after byte-signature/type checks; they are labeled not malware-scanned, never rendered inline, and authenticated attachment downloads verify their hashes. Each private read and download applies INTAKE-002 visibility to both the original lead and every survivor after a merge; merging never grants the survivor assignee access to an invisible source original. R2 originals and immutable provenance round-trip in streamed native archives; credentials, spent tokens, network digests and temporary upload reservations do not. Interrupted upload reservations expire after twenty minutes for cleanup; current uploads ask an archive request to wait rather than exporting incomplete originals. INTAKE-007 inherits complete inquiry provenance and the prohibition on sensitive URL/notification-subject content; DOC-001 carries larger/resumable uploads and quarantine, while FIRM-006 must add lead-original retention, holds, disposal and restore fencing before its lead-retention door ships.

**Acceptance.**
1. Submit a family-law inquiry with a conditional answer and attachment from a phone; inspect the private lead, receipt and consent history.

#### INTAKE-002 — Manage a lead pipeline

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Staff qualify, assign and move leads through editable stages, keep referral source, consultation outcome and next action, detect duplicates and report stalled or lost leads with reasons. Staff record a lead with the prospect’s name, optional email and phone, inquiry summary and referral source; the referral source and creator are fixed provenance. Until INTAKE-001 forms ship, staff record leads by hand; each INTAKE-001 submission must become one of these leads at its door. The principal and lawyers see and maintain every lead and configure the ordered pipeline stages; an assistant sees and works only leads assigned to them, records new leads assigned to themselves and cannot reassign or merge; trust officers see no leads. Assignees are active lawyers, assistants or the principal. A lead is qualified (pending, qualified or not qualified), moved between stages, and keeps a consultation outcome and a next action with an optional date. Each change is checked against the lead’s revision and appended to its immutable history. A possible duplicate is another open lead with the same email (case-insensitive), the same phone digits (at least seven) or the same name (ignoring case and spacing). Counsel merges a duplicate into a surviving lead: the survivor keeps its own fields, and the duplicate stays as a merged record with its source, referral, creator and history, shown as the survivor’s provenance. Losing a lead requires a reason. Converting links a matter opened through the conflict-reviewed door that the person can see, one lead per matter; INTAKE-007 adds full carry-over and MATTER-004’s opening trigger applies to that matter. Each person’s due queue lists their own open leads whose next-action date is on or before the firm-local today, flagged overdue when it is earlier. An open lead is stalled when its next action is overdue or when its last activity was 14 or more firm-local calendar days ago (inclusive). A missing next-action date alone is not stalled. Lead names and details never appear in notification subjects; INTAKE-001, INTAKE-007 and every future lead notification door inherit this rule at its door. The conversion report excludes merged duplicates and counts leads, open, converted and lost leads by referral source and by stage, with conversion shown as converted ÷ leads in whole percent, rounded half-up. It lists stalled leads with their reasons and lost leads with their recorded reasons, and each person’s report covers only the leads they can see.

**Acceptance.**
1. Assign two prospects, merge a duplicate with preserved provenance, miss a follow-up and inspect the owner’s due queue and conversion report.

#### INTAKE-003 — Book consultations

*Tier:* Core

**Requirement.** Prospects book approved availability with timezone conversion, buffers, fees if required, reminders and reschedule/cancel links; consultation records and intake answers reach the responsible lawyer without duplicate calendar bookings.

**Acceptance.**
1. Book the last available slot, race a second booking, reschedule across timezones and verify one appointment and the linked intake record.

#### INTAKE-004 — Maintain a legal contact graph

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001

**Requirement.** People and organizations have aliases, former names, related entities, addresses, communication consent and matter roles such as client, adverse party, insurer, witness, expert and counsel. Deduplication preserves relationships and conflict history. The principal or a lawyer maintains the graph; assistants and trust officers read only contacts attached to permitted matters, with only permitted matter-role links. Firm contact access does not grant matter detail. Stable source party IDs and import provenance remain separate from the surviving contact ID. A person explicitly classifies both contacts, chooses a same-kind survivor and records a reason; a recorded exact preview binds that person, role and graph revision and applies once. Every physical source ID, profile, alias, former name, address, related-entity link, matter role and recorded conflict snapshot remains intact; a losing ID resolves to its survivor, without rewriting historical matter or financial text. Consent evidence is append-only per source identity and channel (email, phone, SMS and post), unknown by default. The latest recorded decision for each identity controls, in durable recording order; the entered evidence date is an attestation, not a scheduled change. Any denied identity makes the merged channel denied; otherwise all identities must allow or it stays unknown. A merge grants no messaging or sync authority: INTAKE-008, INTAKE-009, CLIENT-005 and CLIENT-006 must enforce their own current authority at its door their new doors.

**Acceptance.**
1. Import two aliases of an insurer, relate it to two matters, merge the duplicate and search every relationship without losing source identities.

#### INTAKE-005 — Review conflicts across the whole firm

*Tier:* Core · *From:* INTAKE-005, SAT-002 · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-006

**Requirement.** Conflict review searches former and prospective clients, related entities, aliases, staff relationships and closed matters; it records possible matches, counsel’s disposition, waivers and engagement restrictions without exposing walled detail to unauthorized people. Search evidence records the number of canonical contacts actually scanned and all physical source identities, including merged identities. An explicit client role on a permitted open matter is labeled current client; on a permitted closed matter it is labeled former client, with the year of that matter’s current closure event in the firm IANA timezone (UTC before setup). These are recorded matter associations, not a determination that professional duties ended. The search retains those counts, timezone and associations at review time; reopening does not rewrite them, and later reads reapply current matter grants. Earlier search counts remain unrecorded, never inferred.  Only the principal and lawyers (INTAKE-005, FIRM-002) search, dispose, record waivers and set engagement restrictions; assistants, trust officers and portal users cannot use those native legal-role actions. Agent legal decisions carry commitment under the company’s policy and the sponsor’s legal role. Besides current and former clients, matches are labelled *prospective client* for a contact on a lead (INTAKE-002) or consultation (INTAKE-003) not converted, with its stage and firm-local year; *related entity* through INTAKE-004 links; and *staff relationship* for a relationship the principal or a lawyer recorded between a staff member and a contact (kind, dates, source), shown to the principal and lawyers only. Labels are recorded associations, never determinations. A match whose matter role the searcher cannot read under current grants or private-record rules is a *restricted match*: the searcher sees the matched contact and alias as INTAKE-004 allows and, in place of every hidden matter, role, title and count, one route per custodian ("Restricted match: routed to <custodian>"). Until FIRM-003 ships the custodian is the principal, the current native custodian (FIRM-005, FIRM-006). The custodian records a disposition from a closed set (no conflict; waivable, waiver recorded; proceed with engagement restrictions; decline) bound to that review's revision; the searcher sees only the outcome, custodian, time and any restriction text the custodian writes for disclosure. Opening is refused until every route has a current custodian disposition, no route says decline, every waivable match has a waiver and counsel's overall disposition is recorded; any party change makes all of them stale (INTAKE-005). A waiver records the waiving contacts (each holding a client role on the affected matter), date, scope text and the match it answers, with a file or a written confirmation, labelled "practitioner-recorded, not signed through Satchel" until INTAKE-006 supplies signatures; a restricted match's waiver is recorded and read only by its custodian. Engagement restrictions attach to the new matter at opening: disclosed condition text on the matter header for everyone with access, and excluded non-principal staff whom FIRM-002's grant door refuses, naming the restriction; removing one needs the principal or a lawyer on the matter with a reason. Every route, disposition, waiver and restriction is a FIRM-005 audit action, travels in archives, and is retained, held and disposed with FIRM-006's retained conflict originals. Retained restriction payload disposal uses FIRM-006: the principal types the search reference and records a reason, every affected source and opened matter has an expired schedule and no hold, and saved counsel notes, condition text, acknowledgment text and their audit payload copies are replaced by a disposal marker. Stable ids, decisions, attribution, times and original audit digests remain. Existing staff exclusions and walls stay enforced; a disposed review cannot clear an engagement or accept a new disposition. New searches are required. Search, routing and disposition are evidence for counsel, never legal clearance; applying the conflict rules is the firm's. A principal or lawyer searches firm parties, adverse parties and aliases, reviews recorded matches and writes a conclusion before opening a matter. Any party insert, update or delete invalidates the search; linking already-known, unchanged parties to a new matter does not. Each conflict search clears one opening only, so two separately reviewed openings that involve only existing, unchanged parties may both succeed concurrently. Search is evidence for counsel, never a guarantee of legal clearance.

**Acceptance.**
1. Search a former client’s alias and a prospective adverse affiliate, route a restricted match to its custodian and require recorded counsel disposition before engagement.
2. Search across all firm contacts, imported aliases and open and closed matters, inspect the searched-contact count and a former-client match showing its matter’s closed year, and record the partner’s clearance; no contact may be silently skipped, and a restricted match reveals only its custodian route.
3. Run a conflict search, change a party record, attempt opening against the stale search and receive refusal; repeat with fresh review and explicit confirmation to open.
4. Open two separately reviewed matters involving only existing, unchanged parties concurrently and both succeed; reusing either search is refused.

#### INTAKE-010 — Route walled conflict matches to wall custodians

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006

**Requirement.** a match on a walled matter is a restricted match for everyone outside that wall, the principal and administrators included, and routes to the custodian FIRM-003 designates for that wall: a principal or lawyer inside it (default: the lawyer who created it), never a person outside it. Only that custodian disposes of the walled match, records and reads its waiver and writes its disclosed restriction text. A principal outside the wall sees only the route, outcome, custodian and time; cannot dispose, override, re-designate the custodian or add themselves to the wall; and reaches walled detail only through FIRM-003's recorded exceptional access. A contact whose only matter roles are walled shows outside the wall only as the route; its other roles show normally. With no active custodian inside the wall the route reads "custodian unassigned: ask the wall's counsel" and opening is refused. An engagement restriction that excludes the principal or requires a screen creates a FIRM-003 wall at opening naming the excluded people. Walled conflict evidence (routes, dispositions, waivers, restriction detail) stays out of search, exports, notifications, connected repositories, agent context, reports and FIRM-005 audit reads for everyone outside the wall.

**Acceptance.**
1. Wall off an adverse matter with a lawyer custodian inside and the principal outside.
2. As the principal, search the adverse party's alias and see only the route; be refused opening, disposing, re-designating the custodian and adding yourself.
3. As the custodian, dispose with a waiver, then open.
4. As the principal, check search, export, notifications, agent context, reports and the audit for walled detail and find none; approve an exceptional access under FIRM-003 and inspect its trace.

#### INTAKE-006 — Execute engagement agreements

*Tier:* Core · *Cites:* BASE-DATA-006

**Requirement.** Counsel selects a versioned fee agreement, reviews client and payer details, requests electronic signatures through DocuSign or Inkwell, tracks signer identity, decline/expiry and completion, and files the signed document and certificate with the matter. enforce INTAKE-005 and INTAKE-010’s current counsel and custodian dispositions, waivers and enforced engagement-restriction gates. signed waivers may come through its signature flow; practitioner-recorded INTAKE-005 waivers keep their label.

**Acceptance.**
1. Send an hourly engagement to two signers, receive a signed webhook twice and inspect one completed agreement and certificate; a declined agreement cannot open an engaged matter.
2. Inspect the approved hourly rates in the exact signed engagement, verify that one of two signatures leaves it pending and that two of two completes it with both signer identities.

#### INTAKE-007 — Convert a lead without losing history

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-006, BASE-MAIL-001

**Requirement.** An authorized lawyer converts a cleared, accepted engagement into a matter, carrying parties, signed terms, files, consultation notes, assigned staff and approved retainer request; idempotent conversion never opens a second matter. INTAKE-007 carries INTAKE-001’s exact form versions, answers, receipt and review consent, and R2 originals under the original and surviving lead access checks. enforce INTAKE-005 and INTAKE-010’s current counsel and custodian dispositions, waivers and enforced engagement-restriction gates.

**Acceptance.**
1. Convert a signed lead twice through intake and inspect one matter with complete linked history and an uncharged retainer request.
2. INTAKE-007 inherits INTAKE-002’s lead visibility, counsel merge, firm-local stalled-lead rules and the prohibition on lead names/details in notification subjects before shipping.

#### INTAKE-008 — Follow up prospects under consent

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Owners configure consultation reminders, unanswered-inquiry follow-ups and engagement chases by channel, quiet hours and contact limits. A reply, opt-out, conflict stop or decline halts the sequence and assigns the next human action. Before this capability ships, enforce its own recorded sending or sync authority and INTAKE-004’s merged-identity consent obligations; a contact merge supplies neither authority nor consent. RL-103 applies only published staff-started consented sequences, rechecks exact-lead sending authority and shared contact limits, and stops every active sequence on reply, conflict, decline, conversion or withdrawal.

**Acceptance.**
1. Schedule a consented lead sequence, receive a reply after its first reminder, restart the worker and verify later sends stop and responsibility remains visible.

#### INTAKE-009 — Synchronize Google and Microsoft 365 contacts

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001

**Requirement.** Each staff member may connect Google Contacts or Microsoft 365/Outlook contacts for two-way sync of the INTAKE-004 contacts they choose by matter role, tag or practice group, with stable remote IDs, mapping of names, organizations, emails, phones and addresses, loop prevention and a visible conflict queue. Walled, restricted and prospective-client contacts never leave Satchel unless firm policy allows; a remote edit is a proposed change, a remote delete never deletes a Satchel contact or its conflict history, and disconnecting stops sync with visible state. Before this capability ships, enforce its own recorded sending or sync authority and INTAKE-004’s merged-identity consent obligations; a contact merge supplies neither authority nor consent.

**Acceptance.**
1. Connect one staff member’s Google contacts and another’s Microsoft 365 contacts, sync a client group both ways, edit one phone number in each system concurrently and resolve the conflict in the queue; delete a synced contact remotely and confirm the Satchel contact and its conflict history remain; confirm a walled matter’s adverse party never syncs; replay sync without duplicates, then disconnect and see the stopped state.

### Matter operations

#### MATTER-001 — Model practice-specific matters

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Each practice area has editable matter types, custom typed fields, case numbers, courts, opponents, insurance limits, fee arrangements and required records. Changes are versioned and validated without rewriting historic closed matters. The principal defines each matter type for one configured practice area, acting for the firm administrator until FIRM-008 custom roles exist; every save writes an immutable numbered version. Standard fields are case number, court, insurance limit (exact USD cents from at most two decimals, never rounded) and fee arrangement (hourly, flat fee, contingency, hybrid or pro bono, with optional terms); opponents are the matter’s conflict-reviewed adverse parties (INTAKE-005). A type marks which standard fields are required and adds typed custom fields (text, number, YYYY-MM-DD date, USD money, choice, yes/no) and required record types. The principal or a lawyer who sees the matter records values; assistants read only. Values are validated against the type version the matter adopted: a new version reaches an open matter only when counsel explicitly adopts it and every required and typed value passes, and a closed matter (MATTER-007) keeps its recorded version and values and cannot adopt another until reopened. A required record is on file when an available current original of exactly that document type is visible to the viewer, otherwise missing; it does not block saving. The matter docket shows court, case number, opponents and each visible deadline with its date, IANA timezone, status (proposed dates labeled unconfirmed), citation and exact source-document version. The Clio matters import records a case_number column with its source provenance. MOVE-002 imports, MATTER-004 workflows, DOC-006 templates and MATTER-009 search inherit the typed fields and the adopted-version rule at their doors.

**Acceptance.**
1. Create litigation and estate templates, require different fields, import a case number and reject an invalid typed value.
2. Set a litigation matter’s court and case number, open its docket and a confirmed deadline’s scheduling-order paragraph, and verify the displayed court, date, timezone and exact source-version citation agree.

#### MATTER-002 — Track stages and milestones

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Lists and kanban boards filter matters by lawyer, practice, stage, risk and next milestone. Stage transitions enforce required evidence and show blocked or overdue work without concealing exceptions. The principal and lawyers configure named stages with required document types and update the responsible lawyer, risk (low, medium, high or urgent), next milestone and optional date on matters they may see; assistants read only. The responsible lawyer must be active and already see the matter; assignment grants no access. Both list and kanban use the same permissioned filters: lawyer, practice and stage match exactly, risk matches its label, and next milestone matches text without case. A stage transition requires a reason, the current stage-configuration and matter-profile revisions, and explicitly selected current, retained originals matching every required type exactly; their versions and SHA-256 digests are retained in the activity record. Missing or changed evidence refuses the move and records the blocker. Open, blocked and overdue work remains visible and is never completed or rescheduled by a stage move; a date is overdue strictly before today in the firm timezone (UTC before firm setup). Stage configuration changes affect future decisions; previous decisions retain their exact requirements and evidence. MATTER-004 inherits these stage checks before workflow transitions ship. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#matter-002).

**Acceptance.**
1. Move a matter to demand-ready with a missing medical bill, see the blocker, attach the bill and complete the transition with an activity record.

#### MATTER-003 — Assign dependent work

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001

**Requirement.** Tasks have owners, due dates, priorities, subtasks, dependencies, recurring schedules and completion evidence. Reassignment, absence coverage and bulk updates preserve history and do not silently change confirmed legal dates. The principal, lawyers and assistants who see the matter add and change tasks; an owner must be active staff who already sees the matter, and assignment grants no access. A task either has its own due date or is tied to a legal deadline and always shows that deadline’s date; tasks never change a deadline. Open prerequisites and open subtasks block completion, which requires written evidence and is final. A recurring task (daily, weekly or monthly, a monthly date clamped to the month’s last day) creates its next occurrence, with the same owner, when it is completed. A task whose owner is absent (CAL-008) on its due date, or today when later, shows that absence and any coverage until it is reassigned. Reassignment and bulk changes of owner, priority or due-date shift append per-task history with a reason; a bulk date shift skips tasks tied to a legal date and lists them. Notifications are in-app only: a new owner is told of an assignment, and when a prerequisite is completed each dependent task’s owner is told whether it is ready or what still blocks it; email and push notices belong to CAL-011 and MOBILE-002, which inherit these events at their doors, as do MATTER-004 (workflow-generated tasks), MATTER-006 (handoffs) and MATTER-007 (closure checks).

**Acceptance.**
1. Assign dependent discovery tasks, reassign an absent assistant, complete a prerequisite and inspect remaining blockers and notifications.

#### MATTER-004 — Run editable matter workflows

*Tier:* Core

**Requirement.** A versioned practice workflow inherits MATTER-002’s current stage-evidence checks before approved transitions ship and generates tasks, events, document requests and draft documents from intake or approved stage transitions. The firm previews changes, chooses which open matters receive them and can stop a run without deleting completed work. each generated workflow run participates in MATTER-007’s live closure checks; reopening resumes a run only on its explicit counsel approval. Workflows are firm templates with immutable numbered versions of 1–50 keyed steps: a task (with priority); an appointment at a 24-hour start time and duration in the firm timezone, inviting nobody; a document request, which Satchel records and never sends; or a draft document, matter-visible plain text with the client, matter title and matter number merged. Each step is dated a whole number of days after the firm-local date it is generated. The principal or a lawyer creates and versions templates; every staff member can read them. A run starts when counsel (the principal or a lawyer who sees the matter) previews a version on the matter and approves selected steps. Triggers only propose a run for counsel’s review: a matter opened natively after its conflict review (the end of intake; imported matters propose nothing) or a MATTER-002 stage transition that has already passed its evidence checks. Workflows never move a stage themselves. Each approved step generates its record exactly once per run, so repeated approvals, restarts and rollouts create nothing twice. Stopping a run deletes and cancels nothing; restarting generates only approved steps not yet generated. A new version changes no run or generated record. The rollout preview lists the open matters the person sees whose live run uses an older version, with the steps (by key) the new version adds; only the matters counsel chooses move to it and generate those steps. Proposed and active runs and open document requests are MATTER-007 closure checks, and a closed matter generates nothing. On reopening, a live run resumes only when counsel selects it; every other live run is stopped with the reason ‘Not resumed on reopening’ and keeps what it generated. INTAKE-002’s lead conversion inherits the opening trigger, and every later step kind or trigger inherits once-only generation and these closure and reopening checks at its door.

**Acceptance.**
1. Preview a litigation workflow on an existing matter, approve selected steps, restart and verify each step is created once; edit the template without changing completed history.

#### MATTER-005 — Keep a complete matter timeline

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Matter notes, calls, email, documents, tasks, deadlines, client commitments, bills and payments appear in a filterable chronology with source links and scoped mentions. Private notes remain excluded from client views and unauthorized search.

**Acceptance.**
1. Add a private strategy note and shared progress note, file an email and inspect lawyer and client timelines for the correct entries.

#### MATTER-006 — Manage staff capacity and handoff

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Supervisors see assigned workload, due work, absence coverage and unowned matters; a handoff transfers selected responsibilities with acknowledgment while preserving original timekeeper attribution and access policy. Until FIRM-002 and FIRM-008 define a supervisor role, the principal is the supervisor. The workload view lists each active staff member’s open tasks and deadline ownerships, the overdue ones and those due soon (overdue or due within 14 days of today in the firm’s timezone, inclusive), current and future absences with coverage (CAL-008) and handoffs awaiting acknowledgment; it also lists imminent work with no active owner and unowned matters (open work but no active person owning any of it). A handoff moves the selected person’s open task and deadline ownerships on chosen matters to a receiver who must already see every chosen matter; it grants no access, records per-item history, notifies the receiver in-app and stays awaiting acknowledgment until the receiver acknowledges it once. Time entries, completed tasks and their attribution never change. FIRM-002 and FIRM-008 (supervisor roles), MATTER-004 and MATTER-007 inherit these workload and handoff obligations at their doors.

**Acceptance.**
1. Hand off an absent lawyer’s active matters, acknowledge the assignment and confirm every imminent task has an owner with no change to historic time entries.

#### MATTER-007 — Close and reopen matters deliberately

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-DATA-006

**Requirement.** Closure checks unfinished deadlines, client promises, final bills, trust balances and original-file return; counsel resolves or explicitly carries exceptions. Reopening records its reason and restores only approved workflows and access. The principal or a lawyer who sees the matter prepares an attributed exact closure preview. Every open task, proposed or confirmed legal date, unacknowledged handoff, unbilled billable entry (nonbillable time, billable=0 under TIME-001, is recorded but never billed and is not checked), draft bill, unpaid or credited invoice branch, nonzero trust ledger and pending trust action is checked; balances use exact USD cents. Counsel also reviews a manual client-promise inventory, with retained source evidence for fulfilled promises, and records whether originals were returned (with retained confirmation), are not held, or remain outstanding. Every unresolved item needs its own carry reason, or must be resolved before a fresh preview. Changed work, finance, source originals or access invalidate the preview, and it applies only for its preparing person and once. Closure is a recorded disposition, not a write ban: no task, reminder, appointment or handoff is canceled, no access is revoked, and all carried ownership and due obligations continue. Reopening requires a reason and explicit selections of retained tasks, deadlines, appointments, reminders and existing access; empty selections are allowed, no jobs start and no grants change implicitly. Full immutable close/reopen history and exact source snapshots survive archive restore; reads reapply current private-source visibility. A reviewer without access to every source sees one opaque restricted-review blocker, with no source title, count or detail, and cannot close the matter (403); authorized counsel must review it. MATTER-004 workflow runs and document requests are checked live and each live run needs an explicit reopening decision; AGENT-007 and CLIENT-008 inherit live promise closure checks and explicit reopening decisions before their capabilities ship. REPORT-001 adds a required explicit legal outcome on closure, recorded only by the principal or responsible lawyer and retained across reopening. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#matter-007).

**Acceptance.**
1. Attempt closure with a trust balance and open court task, resolve or authorize exceptions, close and reopen while retaining the entire history.

#### MATTER-008 — Number matters by firm scheme

*Tier:* Core

**Requirement.** The principal configures the firm’s matter-number pattern from a starting number, padding, year, client number, practice-area code and separators, with optional per-client sequences. Each new matter receives the next unique number atomically, even when two open at once: two separately reviewed openings that involve only existing, unchanged parties both succeed concurrently, while any party insert, update or delete invalidates an older conflict review (INTAKE-005); a pattern change applies only to later matters, and imported matters keep their source numbers (MOVE-002) without colliding with new ones. Matter numbers appear on invoices, documents, calendar entries and search. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#matter-008).

**Acceptance.**
1. Configure a year, client number and four-digit sequence pattern starting at 1050, open two separately reviewed matters with only existing, unchanged parties concurrently and receive consecutive distinct numbers, then change a party and see an older review refused; import a Clio matter numbered 2019-0042 and confirm the next new matter does not collide; change the pattern and verify existing numbers are unchanged on the matter, its invoice and its documents.

#### MATTER-009 — Search the whole firm from one box

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001

**Requirement.** One search box finds matters by name, matter number or case number, contacts and aliases, notes, tasks, events, documents, email, invoices and payments the person may see, grouped by type with keyboard navigation and a phone layout. Results apply matter access, custom roles and ethical walls before any title, count or snippet is returned and link to the record; DOC-003 supplies document and email full text.

**Acceptance.**
1. Search a client surname and find its matter, contact, note, task and invoice in grouped results; search a matter number and a case number; run the same queries as a walled-out principal and an unassigned assistant and receive no walled or unassigned record, title, count or snippet.

### Documents and evidence

#### DOC-001 — Store real working files

*Tier:* Core · *From:* DOC-001, SAT-007 · *Cites:* BASE-ROLE-001

**Requirement.** Upload resumable large PDFs, DOCX, images, audio/video and bulk folders with per-file limits shown before transfer, quotas, malware quarantine and hash-verified originals. A 500 MiB scanned record and a multi-gigabyte matter set are ordinary supported work, not export-only attachments. Matter documents retain original bytes, hashes, version metadata and creator history. Matter visibility follows access; private visibility is uploader/principal only. Downloads validate integrity and use safe attachment headers. DOC-001 governs the working-file size target. INTAKE-001’s R2 inquiry originals inherit DOC-001’s future resumable-upload and quarantine obligations before those doors ship.

**Acceptance.**
1. Upload a 500 MiB record, interrupt and resume, then bulk-upload a matter folder; download matching hashes and refuse access during quarantine.
2. Upload private and matter-visible originals, refuse the assistant private download, append a version and retrieve both originals through authenticated file routes.

#### DOC-002 — Preview and compare versions

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-DATA-006

**Requirement.** Staff preview PDFs, images and office documents, annotate separately from originals and compare versions with author/time provenance. Concurrent saves create explicit conflicts; source citations continue to identify the reviewed version. DOC-005 and DOC-014 inherit these version, conflict and citation obligations before adding their save doors.

**Acceptance.**
1. Open a PDF preview, annotate it, save conflicting Word edits and compare versions while downloading the unchanged original.
2. Annotations are separate, version-bound page/section notes with author/time provenance; saving a note changes no original, current version or source citation.
3. Appending an original requires its base document revision.
4. A stale or racing save retains its exact attempted original as an explicit conflict beside the current version; an authorized resolution appends it as a new version (or identifies the already-retained identical version), retaining prior versions and citations.
5. Office content previews identify their limitations and do not claim original layout, drawings, macro execution or recalculated formulas.
6. Preview rendering remains in browser memory.
7. Separate annotations and retained conflict originals follow the document’s access, archive, hold, erasure and restore-fence obligations, with each removed kind counted at disposal.

#### DOC-003 — Search OCR and full text

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-006, BASE-MAIL-001

**Requirement.** OCR scanned records and index permitted document text, metadata and email with matter/date/type filters, exact page snippets and index freshness. Search applies matter walls before snippets and includes deletion of all derivatives on disposal.

**Acceptance.**
1. Find a phrase only present in a scanned page, open its citation, revoke access and confirm snippets and cached results disappear.

#### DOC-004 — Organize and act on document sets

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Folders, tags, document types, saved views, bulk filing and duplicate detection support everyday matter navigation. Bulk operations preview their destinations and permissions and retain original identity and version history. Saved filters belong to the person within the matter, grant no sharing access and recheck current document access on every use. Metadata filing uses the existing uploader-or-principal edit authority and never changes readers. Folder, facet, saved-view and duplicate counts are computed only from accessible originals; duplicates are SHA-256 matches across retained versions of distinct documents, each original retained separately. Applying a recorded preview requires the same person and role, current matter/document access and unchanged document revisions; a preview applies once.

**Acceptance.**
1. File a mixed production into two matter folders, catch a duplicate and bulk-retag it without exposing private files or replacing originals.
2. Open the matter document folders and compare each displayed file count with its accessible contents before and after filing; private files contribute neither a name nor a count for an unauthorized reader.

#### DOC-005 — Work in Microsoft Word

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Open matter DOCX files in Word through Microsoft 365, preserve tracked changes, comments and original versions, and save a new version back to the correct matter with conflict detection and access revocation.

**Acceptance.**
1. Open a matter brief in Word, edit tracked changes, save back, race another save and inspect a visible conflict and both retained versions.

#### DOC-006 — Assemble legal documents and forms

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-006

**Requirement.** Versioned Word/PDF templates merge typed matter fields, conditional clauses and repeating parties from approved questionnaires. Staff preview unresolved fields, maintain court-form versions and approve the generated DOCX/PDF before sending. Staff maintain immutable numbered templates with jurisdiction and court-form version labels, typed questionnaire fields (text, number, date, exact USD money, choice and yes/no), ordered paragraphs, answer-conditioned paragraphs and repeating matter parties. Merge fields use the matter’s adopted MATTER-001 version and canonical values, never the newest unadopted type; money renders in dollars with two decimals. Every saved questionnaire revision freezes its template version, answers, matter fields and party list and shows missing required or referenced values. Counsel approval covers that exact questionnaire and the generated DOCX/PDF whose hashes match the staff review downloads; incomplete, stale or unapproved final delivery is refused. Changed answers create a new comparable revision without rewriting earlier approvals or files. Approved files enter DOC-001 originals and inherit FIRM-006 retention/holds/erasure and BASE-001 archive recovery. Downloads are files for staff delivery, never a claim that Satchel sent them; CLIENT-006 and DOC-007 inherit exact-version approval before any sending or signing door ships. Jurisdiction and court-form version labels are firm-maintained, never a claim of court certification.

**Acceptance.**
1. Assemble a two-party engagement and a jurisdiction form, change one questionnaire answer, compare revisions and refuse delivery with an unresolved required field.

#### DOC-007 — Sign and file matter documents

*Tier:* Core

**Requirement.** DocuSign and Inkwell connectors request ordered or parallel signatures on an approved exact version, remind permitted recipients and retain signed bytes, certificate, provider ID and failure/decline history. Revoking a request never overwrites a signed original.

**Acceptance.**
1. Send a settlement release, decline then resend a revised version, complete it and replay the callback; inspect one signed version per completed request.

#### DOC-008 — File Outlook email and attachments

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001

**Requirement.** Microsoft 365/Outlook users file individual messages or approved threads and attachments to matters, retain sender/recipient headers and original .eml, associate sent replies and prevent duplicate filing across staff. Filing never grants a new matter reader. Approved matter-filing rules automatically capture matching incoming and sent messages; unmatched mail waits for staff assignment.

**Acceptance.**
1. File an Outlook thread with an attachment, reply from Outlook, replay sync and inspect one linked message per provider ID with correct matter permissions.
2. Approve an Outlook matter-filing rule, receive a matching email and attachment without manually filing them, and see them arrive in the correct matter once; an unmatched message waits for assignment, and replies composed in Outlook retain the same thread and source identities.

#### DOC-009 — File Gmail email and attachments

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001

**Requirement.** Google Workspace/Gmail users select matter labels or messages for filing, preserve original headers, threads and attachments, associate outbound replies and handle deleted or revoked mail access without losing filed evidence. Approved label-to-matter rules automatically capture matching mail and attachments while Gmail remains the composing and reply interface.

**Acceptance.**
1. File a labeled Gmail conversation, add a reply, disconnect its grant and verify retained originals and a visible stopped-sync state.
2. Enable a consented Gmail label-to-matter rule, receive a matching email and attachment without manually filing them, and inspect one automatic filing; compose and send the reply in Gmail and find it on the same matter thread without duplicate originals.

#### DOC-010 — Connect SharePoint OneDrive and Drive

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Microsoft SharePoint/OneDrive and Google Drive connectors map selected folders and file versions to matters, track remote IDs and permission drift and offer controlled copy or linked-file custody. A revoked remote link is reported, never presented as a retained original.

**Acceptance.**
1. Map folders from each service, update and revoke a remote file, and inspect the new version, failed access and explicit copy-versus-link custody.

#### DOC-011 — Connect Box and Dropbox

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Firms map existing Box and Dropbox folders to matters with least-privilege grants, version references, sync diagnostics and permission reconciliation; neither service becomes an alternative firm access boundary.

**Acceptance.**
1. Connect each provider, map one restricted folder, change remote permissions and confirm unauthorized clients and staff cannot acquire its contents.

#### DOC-012 — Build medical and bill chronologies

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Authorized teams organize received medical records and bills by provider, date, treatment, charge and source page, identify gaps and duplicates, and reconcile totals without silently deciding causation or altering source evidence. Health-data access, agreements and processor configuration are explicit setup work.

**Acceptance.**
1. Import a treatment packet and overlapping bill, review the source-linked chronology and discrepancy totals, and prevent publication before counsel approves it.

#### DOC-013 — Prepare controlled evidence productions

*Tier:* Core

**Requirement.** Counsel selects matter documents, privilege labels, redactions and Bates numbering; productions retain a manifest, privilege log, recipient and delivery proof while preserving unredacted originals and permitting recall of still-unopened shares.

**Acceptance.**
1. Prepare a redacted production, review its privilege log, deliver to approved opposing counsel and inspect exact delivered bytes and the original retained separately.

#### DOC-014 — Open matter folders on the desktop

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006

**Requirement.** Staff install Satchel’s desktop drive for macOS and Windows, which shows only the matters they may access as folders in Finder or File Explorer, streams files on demand with optional per-matter offline pinning and opens them in any desktop application. Saving a file back records a new DOC-001 version with the saver’s identity and conflict detection, a file added to a matter folder is filed to that matter, and nothing is overwritten or deleted outside the matter’s retention and hold rules (FIRM-006). Ethical walls (FIRM-003), access removal and member deactivation take effect at the next sync and remove cached copies from the device; every open, save and offline pin is audited under FIRM-005.

**Acceptance.**
1. On macOS and on Windows open an assigned matter folder in Finder and in File Explorer, edit a PDF in a desktop application and see a new retained version; race a web upload of the same file and inspect a visible conflict with both versions kept; drop a new file into the folder and find it filed to the matter; confirm a walled matter never appears; remove the user’s matter access and deactivate them and verify the folder and cached files disappear at the next sync and the audit shows each action.

### Calendar and legal delivery

#### CAL-001 — Schedule matter appointments

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Matter calendars support appointments, recurring events, attendees, locations/video links, timezones, shared availability and cancellation history alongside distinct legal deadlines. Moving an appointment never moves an unrelated court deadline. Appointments are booked by the principal, lawyers and assistants who can see the matter. Attendees are active staff who can already see the matter; an invitation grants no access. A series repeats daily or weekly, every 1–12 days or weeks, for 2–104 occurrences at the same local wall-clock time in its IANA timezone, so its UTC instant shifts across daylight saving; a series with any occurrence at a local time that does not exist is refused, and an ambiguous local time uses the earlier instant. Canceling or moving one occurrence appends a reasoned, attributed change and never deletes the occurrence; a canceled occurrence stays canceled. The firm view lists the appointments and deadlines of every matter the viewer may see whose local dates fall in an inclusive range of at most 400 days, each read in its own timezone. Shared availability is free/busy: active staff see a colleague’s busy start and end times, with title and matter only for matters the viewer may see. CAL-002 and CAL-003 (calendar sync), CAL-011 (appointment reminders) and MOBILE-001/MOBILE-002 inherit these appointment, attendee and availability rules at their doors.

**Acceptance.**
1. Book a recurring conference across daylight saving, invite two staff, cancel one instance and compare matter and firm views.

#### CAL-002 — Synchronize Google Calendar both ways

*Tier:* Core

**Requirement.** Selected Google calendars exchange event creation, edits, cancellations, attendees and recurrence with stable IDs, loop prevention, conflict resolution and visible token/failure state; matter confidentiality controls event detail.

**Acceptance.**
1. Create an event in each system, edit concurrently, cancel a recurring instance and reconnect; inspect one consistent series with conflicts shown.

#### CAL-003 — Synchronize Outlook calendars both ways

*Tier:* Core

**Requirement.** Microsoft 365/Outlook calendars support the same two-way lifecycle, delegated calendars and attendee changes, with subscription renewal, missed-change recovery and explicit choice of which details leave the matter.

**Acceptance.**
1. Edit a delegated Outlook appointment while Satchel is disconnected, reconnect and reconcile its updated attendees and cancellation without duplicate invitations.

#### CAL-004 — Calculate LawToolBox deadlines

*Tier:* Core · *Register:* R-8

**Requirement.** Through a contracted LawToolBox integration, counsel chooses court, jurisdiction, trigger and service method, reviews computed dates and rule citations, and confirms publication to dependent tasks and calendars. Coverage and provider rule versions are visible.

**Acceptance.**
1. Use a covered court and service trigger in a provider sandbox, review holiday-adjusted dates, refuse an unsupported court and publish only after attorney confirmation.
2. Enter a replacement trial date once and inspect every LawToolBox-dependent deadline, its previous and proposed dates and rule/source references; after counsel confirms, each accepted deadline and connected calendar reflects that one trigger change.

#### CAL-005 — Calculate CalendarRules deadlines

*Tier:* Core · *Register:* R-8

**Requirement.** CalendarRules is a supported alternative rules connector with court coverage, trigger/service inputs, rule versions, calculation provenance and attorney confirmation. Switching providers compares proposed dates rather than silently replacing confirmed deadlines.

**Acceptance.**
1. Calculate one covered court schedule, compare it with an existing schedule and confirm differences before calendar changes; unsupported coverage leaves explicit manual review.
2. Repeat the single trial-date change through CalendarRules and compare every dependent deadline with the provider’s schedule; keep unsupported or uncertain dates visibly unresolved for counsel rather than omitting them.

#### CAL-006 — Propagate reviewed source changes

*Tier:* Core · *From:* CAL-006, SAT-008 · *Cites:* BASE-MAIL-001

**Requirement.** A changed court order, service date or rules version presents affected dates and dependent tasks with old/new source passages. Counsel accepts or rejects each legal change; approved calendars and assignees then reconcile and acknowledge it. A deadline has a date, IANA timezone, source citation and optional exact document version. A lawyer confirms and completes it with evidence. A changed source version supersedes earlier live deadlines and requires fresh review.

**Acceptance.**
1. Replace an order, inspect impacted deadlines, refuse automatic legal adoption, approve one change and verify all connected calendar copies and acknowledgment states.
2. Change a trial date once, list every affected deadline and task, and reconcile accepted replacements to Google and Outlook without retaining an active superseded date or duplicating an event; CLIENT-008 supplies the separately reviewed portal/email client notice.
3. Propose and confirm a cited deadline, append its source version, refuse completion of the superseded date, then confirm a replacement and record delivery evidence.

#### CAL-007 — Remind and escalate deadlines

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Rules define advance reminders, channels, quiet hours and escalation to a backup lawyer; acknowledgment differs from completion, and completion needs evidence of the underlying act. Missed or uncertain delivery stays visible until resolved. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#cal-007).

**Acceptance.**
1. Schedule a deadline reminder, fail one delivery, restart before escalation and complete the deadline with a filing receipt; only that receipt closes the obligation.
2. Set a seven-day reminder to the assigned lawyer, advance through its due instant and inspect the actual recipient, delivery result and one escalation after failed delivery; reassignment before sending must prevent delivery to the former owner.

#### CAL-008 — Show firm deadline coverage

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Lawyers see firm and matter agenda, upcoming limitation dates, conflicts, unconfirmed dates and absence coverage. Reports identify each source, owner, confirmation status and next action; an extracted date never appears as confirmed. Deadlines carry a kind (deadline, limitation, hearing or filing) and a responsible owner, set by the principal or a lawyer from active staff who already see the matter, with append-only owner history. The agenda lists, for the matters the viewer may see, every non-superseded deadline and every uncanceled CAL-001 appointment occurrence in an inclusive local-date range of at most 400 days; upcoming limitation dates are every proposed or confirmed limitation from the range start onward. A conflict is two appointment occurrences that overlap in time and share an organizer or attendee, reported only among items the viewer may see. The principal records anyone’s absence and staff record their own; all active staff see who is out, when, and who covers, while the reason is visible only to the principal and the absent person. The principal or the absent person assigns coverage to another active staff member; coverage grants no matter access. Next action follows this precedence: unconfirmed date, no owner, owner absent without coverage, coverer cannot see the matter, time conflict, then prepare and complete (or attend). A proposed date, including one an agent extracted and a person accepted as a proposal, always shows as unconfirmed until a lawyer confirms it. The CSV export carries date, time, timezone, kind, matter, title, source, owner, confirmation, coverage, conflicts and next action, and is recorded in the action audit. CAL-002/003 (synced calendars), CAL-004/005 (rule-computed dates), CAL-006 and MATTER-003/006 (tasks and handoffs) inherit these agenda, owner and coverage obligations at their doors.

**Acceptance.**
1. View overlapping hearings and an unconfirmed limitations date, assign coverage and export the agenda with source and confirmation columns.

#### CAL-009 — File and serve through InfoTrack

*Tier:* Core · *Register:* R-9

**Requirement.** An authorized lawyer approves exact filing documents, court, service recipients and fees; InfoTrack submits through covered networks and returns acceptance/rejection, stamped copies, service proof and costs to the matter. Submission alone is never filing completion.

**Acceptance.**
1. Approve a sandbox filing, receive rejection, correct and resubmit with a new revision, then reconcile stamped acceptance, service proof and expense without duplicate charges.
2. Submit a fourteen-exhibit filing and inspect each exhibit’s manifest entry and stamped acceptance; the matter’s filed-exhibit count reaches fourteen only after all fourteen are accepted, and a rejected exhibit remains open.

#### CAL-010 — Track court docket changes

*Tier:* Core

**Requirement.** Connect PACER through an authorized docket provider such as CourtListener RECAP where available and court/provider accounts for coverage, attach returned docket entries and orders, and propose related work with a lawyer reviewing legal effects and provider fees.

**Acceptance.**
1. Receive an amended order twice, inspect one docket entry and source artifact, and require counsel review before changing a legal deadline.

#### CAL-011 — Remind staff of appointments and tasks

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Each staff member receives in-app and email reminders, and push reminders under MOBILE-002, for their appointments and tasks at firm-default or per-item offsets, with snooze and dismiss. Reminders follow reassignment, cancellation and rescheduling, fire once across restarts and carry no confidential detail outside the authenticated app. A person who relies on Google or Outlook reminders for synced events can choose calendar-only reminders, so the same event never reminds twice.

**Acceptance.**
1. Create a task due tomorrow with a one-hour reminder and an appointment with a 15-minute reminder; reassign the task, reschedule the appointment and restart the worker; verify the new owner alone receives one task reminder, the appointment reminder fires once at the new time and the email carries only a link and a minimal subject; set calendar-only for a synced event and verify Satchel sends no reminder for it.

### Client communication

#### CLIENT-001 — Invite a secure client portal

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** A client or authorized co-client signs in to only expressly shared matters, with separate payer access and revocable delegates. Staff preview the client view; internal notes, other clients and privileged drafts never leak through search or notifications.

**Acceptance.**
1. Invite two co-clients and a payer, share one release, revoke a delegate and exercise direct portal file and message URLs for each identity.

#### CLIENT-002 — Retain secure two-way messages

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Portal conversations retain matter, participants, attachments, delivery/read states and staff assignments. Recipients receive minimal notifications and open confidential content inside the authenticated portal.

**Acceptance.**
1. Send a confidential attachment, receive a client reply, inspect the retained thread and unread queue and verify email notifications contain no confidential body.

#### CLIENT-003 — Chase document requests to receipt

*Tier:* Core

**Requirement.** Staff request specific records with instructions, owner, due date and acceptance criteria. Clients upload securely, staff accept or explain deficiencies, and authorized reminders continue only until accepted, stopped or escalated.

**Acceptance.**
1. Request two records, receive an incomplete upload, send a permitted clarification and close only the accepted item while the second remains due.

#### CLIENT-004 — Give clients tasks and events

*Tier:* Core

**Requirement.** The portal shows shared upcoming events, client tasks, due dates, completion instructions and acknowledgments; clients cannot mark a lawyer’s legal deadline complete or change confirmed court dates.

**Acceptance.**
1. Share a preparation task and hearing, complete the client task from a phone and refuse a client attempt to alter the hearing deadline.

#### CLIENT-005 — Text clients and leads with Twilio

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Two-way SMS/MMS through the firm’s registered Twilio number retains conversations on the correct lead/matter, consent, delivery/failure and opt-outs. A guided setup walks the principal through connecting or creating the Twilio account, buying or porting a number, US A2P 10DLC brand and campaign registration prefilled from firm settings, approval tracking and a test message; texting stays disabled with a visible reason until registration is approved. Quiet hours and recipient confirmation are part of setup; sensitive content uses portal links. Reviewed reminders can request an event confirmation reply such as C; matching replies record one acknowledgment on that event, never legal completion. Before this capability ships, enforce its own recorded sending or sync authority and INTAKE-004’s merged-identity consent obligations; a contact merge supplies neither authority nor consent.

**Acceptance.**
1. Complete the guided setup through sandbox registration states and see texting stay disabled while the campaign is pending; after approval text a consenting lead, file a reply, process STOP and verify pending reminders halt without exposing private message content.
2. Send a consented mediation reminder asking the client to reply C to confirm; receive C twice and inspect one event acknowledgment on the correct matter, without completing a legal deadline or sending a second confirmation.

#### CLIENT-006 — Deliver and reconcile email

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001 · *Register:* R-10

**Requirement.** Connected Microsoft/Gmail or the firm’s configured transactional mail provider sends reviewed client correspondence and invoice notifications, retains provider references and bounce/complaint states and avoids blindly resending an uncertain delivery. Before this capability ships, enforce its own recorded sending or sync authority and INTAKE-004’s merged-identity consent obligations; a contact merge supplies neither authority nor consent. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#client-006).

**Acceptance.**
1. Send a reviewed letter, simulate a bounce and lost acknowledgment at the provider edge, and inspect one attempt with a visible next human action.

#### CLIENT-007 — Keep call records and authorized recordings

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Staff log calls, participants, advice notes and follow-ups and link recordings/transcripts obtained through a consented phone provider. Recording permission and US state consent policy are checked before recording; staff approve transcript-derived work.

**Acceptance.**
1. Log a call and task, connect a consented recording and refuse capture without the required consent, then inspect permissioned transcript access.

#### CLIENT-008 — Send reviewed matter updates

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001

**Requirement.** Matter events produce draft client updates with source links and outstanding client actions. Counsel reviews wording, recipients and promises; approved scheduled updates track delivery and unresolved replies through completion. Its reviewed promises participate in MATTER-007’s live closure inventory, remaining unresolved until evidenced fulfillment or an individual counsel carry decision; reopening restores only explicitly approved workflows and existing access.

**Acceptance.**
1. Generate an update after an order, remove privileged strategy, approve its delivery and receive a reply that reopens the responsible person’s follow-up queue.
2. Move a confirmed trial date, review the old/new date and cited order in the draft update, then deliver the approved update to the authenticated portal and through CLIENT-006 email; verify both delivery states and that an unapproved change notifies nobody.

#### CLIENT-009 — Control sharing and communication preferences

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Record communication channels, language, accessibility needs, legal-representative authority and recipient verification; revoking consent or portal access stops new automated contact and invalidates outstanding links where possible while preserving historic delivered records.

**Acceptance.**
1. Change a client’s representative and SMS preference mid-sequence, then verify future recipients, link access and the retained old delivery history.

#### CLIENT-010 — Automated client reminders

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-MAIL-001 · *Register:* R-10

**Requirement.** Responsible counsel opts each matter into versioned invoice and appointment reminders. Exact approved templates, current recipient authority, affirmative consent across every merged identity, shared contact limits and durable outcomes govern each reminder. An uncertain attempt needs a new attributed decision before another attempt. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#client-010).

**Acceptance.**
1. Record per-matter opt-in by current responsible counsel and refuse it after that authority changes.
2. Approve an exact immutable template version once; each scheduled invoice and appointment reminder retains that version.
3. Restart scheduled work and inspect the shared recipient cap across reminder kinds and matters; an unknown acknowledgment causes no automatic resend.
4. Withdraw consent, portal authority or matter access before sending and inspect refusal; a merged identity without affirmative consent also prevents sending.
5. Inspect every send’s durable audit and template version, and the new attributed decision for another uncertain attempt.
6. Through populated reviewed-email screens at 1440 and 390, inspect retained template versions and outcomes with labelled controls and no overflow.

### Time and fee arrangements

#### TIME-001 — Run timers and timesheets

*Tier:* Core · *From:* TIME-001, SAT-004

**Requirement.** Timekeepers start, pause, resume and switch matter timers, enter work on weekly timesheets, distinguish billable/nonbillable activity and submit reviewed time without overlapping unnoticed timers. A timekeeper also reviews and posts a complete drafted day with editable durations and UTBMS codes; posting is idempotent and shows exact daily hours and USD totals. Every staff member keeps only their own timers and timesheet, on matters they see. Timers live on the server, so one started on a phone resumes on a desktop. A person has at most one running timer: starting or resuming another pauses the running one in the same step and says so, so timers never overlap unnoticed. Each closed timer interval (pause, stop or switch) drafts exactly one entry attributed to its timekeeper: elapsed time rounded up to a whole minute (at most 1,440, longer intervals labeled for review), dated by the interval start in the firm timezone (UTC before firm setup), at the rate TIME-003 resolves for its work date (the firm default rate and increment when no agreement rule matches). The weekly timesheet runs Monday to Sunday; timekeepers add drafts and edit duration (1–1,440 minutes), billability and UTBMS task (letter plus three digits, e.g. L110) and activity (A plus three digits) codes, checked for format only until TIME-007 supplies firm code sets, or reject a draft. Post day or Submit week turns each remaining draft into one immutable entry, refused while the timekeeper has a running timer; rejected drafts are excluded, posted drafts are final and a repeated post records nothing. Daily and weekly totals show exact hours and minutes of non-rejected drafts and billable USD at TIME-003’s price (billed minutes, rounded up to the agreed increment, × hourly cents / 60, less any agreed discount, half-up to whole cents). Nonbillable entries are recorded but refused on bills. TIME-002 suggestions, TIME-003 rate schedules and TIME-007 code sets inherit these drafts and the posting rule at their doors. Authorized staff record dated matter time in whole minutes and hourly USD cents, or disbursements in USD cents. Charges use exact integer arithmetic with declared half-up rounding to cents; invalid dates and unsafe amounts are refused.

**Acceptance.**
1. Start a timer on phone, resume on desktop, switch matters and submit the week; inspect one attributed entry per approved interval.
2. Review a day of draft entries, edit durations and UTBMS codes, then Post day; inspect one attributed posted entry per accepted draft and exact daily hours/USD totals, with rejected drafts excluded and a repeated post producing no duplicate work.
3. Record 90 minutes at $250 per hour and a $25 disbursement through Time & bills; inspect $400 in the prepared package and reject an invalid date.

#### TIME-002 — Capture email calendar and document activity

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001

**Requirement.** With explicit staff permission, Microsoft Word/Outlook and Google email/calendar/document activity becomes private time suggestions linked to matter sources. Staff review duration and billability, merge overlaps and exclude personal content before anything is billed.

**Acceptance.**
1. Work on an email, meeting and Word draft, review suggestions, discard personal activity and accept nonoverlapping time once despite repeated sync.
2. Inspect the draft day assembled from the email, calendar and document sources, open each source reference, edit an inaccurate suggestion and pass only the reviewed suggestions to TIME-001 day posting.

#### TIME-003 — Apply versioned rates and budgets

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-006, BASE-MAIL-001

**Requirement.** Fee agreements support attorney, matter, client, task and effective-date rates, rounding increments, discounts, nonbillable work and budgets with alerts. Old work retains its agreed rate; changing a rate never rewrites an issued bill. Agreement rules are append-only versions at firm, client (the matter’s recorded client name, exact match) or matter scope, optionally naming a timekeeper and a UTBMS task, each with an hourly USD-cents rate, a 1–60-minute rounding increment, a discount in basis points and a billable flag, effective from an inclusive date compared with the work date; a second rule with the same scope, timekeeper, task and date is refused. Precedence: a matter rule beats the client’s, which beats the firm’s; within one, a rule naming the timekeeper beats one that does not, then one naming the task, then the latest effective date on or before the work date; with no matching rule the FIRM-001 default rate and increment apply with no discount. Billed minutes are worked minutes rounded up to the increment; the charge is billed minutes × hourly cents × (10,000 − discount basis points) / 600,000, half-up to whole cents. A nonbillable rule makes matching work nonbillable (recorded, never billed). Timesheet drafts are priced from the agreement on their work date and posting freezes that price on the immutable entry, as does recording an entry without a rate; an explicit hourly rate on an entry or draft is recorded exactly as entered (TIME-001), with no increment or discount. Recorded entries keep their price when rules change, and issued bills keep their snapshot and exported bytes. Until FIRM-002 adds billing staff, the principal sets firm and client rules, and the principal or a lawyer who sees the matter sets matter rules and budgets. A matter budget is a versioned USD-cents amount with an alert percent; used is the recorded cents of every billable entry on the matter (time and disbursements). Each level alerts once per budget version, in the same step as the recording or budget change that crosses it: threshold when used × 100 ≥ budget × percent, exceeded when used > budget. Alerts are shown on the matter in Satchel and audited; no email is sent. TIME-002 suggestions, TIME-007 code sets and every later time-recording door or time import inherit this pricing and the budget check at their doors.

**Acceptance.**
1. Set a client override and future rate change, record work either side, cross the matter budget and inspect correct charges and the alert.

#### TIME-004 — Bill flat and recurring fees

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001

**Requirement.** Flat-fee milestones, recurring retainers, capped fees and blended arrangements record earned timing, included work and approved exceptions. Recurring schedules produce reviewable draft bills without silently recognizing unearned trust funds as revenue. The principal or a lawyer who sees the matter records immutable, explicitly reviewed fee terms: arrangement, USD cents, included work, permitted exceptions (or none), agreement reference, earning event and whether earned fees may be drawn from trust. Unknown earning or draw-down eligibility is refused with its reason. Flat, milestone and retainer arrangements create one nonhourly fee per due occurrence; once uses the reviewed start date, and monthly uses the first day of each calendar month from the reviewed start month through the inclusive final month. The first monthly date must be a month boundary. The scheduled Worker uses the firm IANA timezone and each plan reviewer's current authority and matter access, processing plans separately so a blocked plan cannot stop another plan on the same matter; counsel can also run the due schedule through a date. A unique plan/period identity survives restart and restore, including a voided occurrence, so replay never prepares another bill for it. Plans do not alter earlier drafts or invoices. Due processing only prepares drafts, earns zero, sends nothing and transfers nothing; failures remain visible with the missing guideline or other reason. Before approving a fee bill or its additive correction, counsel explicitly confirms the reviewed earning event and records source evidence; milestone earning also requires explicit completion, a future period cannot earn, and period-end earning is allowed only after the complete monthly period (or the once plan's end date) has passed in the firm timezone. Approval records the exact earned USD cents separately from trust custody. Prohibited draw-down is refused even for an earned bill; permitted draw-down still requires the existing same-matter, cleared-funds, officer and bank-result workflow, never inferred allocation or automatic movement. Capped and blended plans apply to selected recorded work within their inclusive date range, cannot overlap another capped/blended plan on the matter, and must be selected at preparation whenever selected time intersects that range. Caps cover time fees across all live drafts, approved invoices and additive corrections under that plan, with no monthly reset: chronological lines consume the remaining cap and can become zero; disbursements retain their exact amounts. Blended time uses worked whole minutes times the reviewed single hourly USD-cent rate divided by 60, rounded half-up to cents, independent of the original recorded hourly rate or increment. A permitted exception needs a separate counsel reference at preparation and uses the recorded entry amounts; no-exception plans refuse it. Positive corrections cannot exceed a reviewed cap or raise a flat, milestone, retainer or blended source above its originally reviewed line amount; a courtesy reduction can be restored only up to that amount. Source reservations and revision checks continue to prevent duplicate billing, and originals and terms remain immutable through corrections and archive recovery. Under a client LEDES guideline, nonhourly fees are F fee lines, one unit at the exact fee with the reviewed task/activity and timekeeper identity, never expenses or fabricated hours; all active-code, narrative and client guideline checks apply, XML 2.1.3 uses flat charge type F, and approval freezes both exports. TIME-005, TIME-008, BILL-001, BILL-004 and BILL-016 inherit these earning, cap, eligibility, source and nonhourly-code obligations before their new fee or bill doors ship.

**Acceptance.**
1. Create a monthly flat fee and a milestone fee, run the due schedule twice and inspect one draft per period with separate earned and trust balances.

#### TIME-005 — Manage contingency and settlements

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-006

**Requirement.** Record versioned contingency percentages, tiered outcomes, expenses, liens, medical providers and referral allocations. A settlement statement explains gross recovery, costs, fees and each disbursement; counsel and authorized finance staff approve before money movement. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#time-005).

**Acceptance.**
1. Prepare a settlement with a lien reduction and expense recovery, compare all allocations to gross funds and refuse disbursement until approvals and cleared funds exist.
2. Native human counsel reviews the exact versioned contingency agreement, selected outcome, percentage basis, earning condition and completed earning evidence.
3. Percentages use basis points and half-up USD-cent rounding.
4. Referral allocations divide the counsel fee and never add a separate client charge; the restricted statement retains original obligations, reductions, source evidence and an exact reconciliation to gross recovery.
5. Different counsel and designated trust-officer people approve each current exact statement. A recorded sole-practitioner separation waiver retains reason, scope, actor, effective version and time; one authorized person then records two distinct capacity approvals of the same revision.
6. A replacement statement needs fresh approvals; changed authority, officer designation, grants or ethical walls refuse execution.
7. Disbursement preparation and final approval bind the current statement and allocation, with cleared unreserved same-matter funds rechecked; readiness grants no spending authority, reservation, revenue, invoice or money movement.
8. Preserve the original settlement-to-disbursement journey, fractional-cent fee and referral rounding, earning and coding integration, attributable restricted audit, retention and erasure, archive history and restored-authority refusal, and populated and refused screens at 1440 and 390.

#### TIME-006 — Capture reimbursable expenses

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-DATA-006, BASE-MAIL-001

**Requirement.** Staff attach receipts and vendor/provider references, distinguish firm overhead, client disbursements and advanced costs, apply approved markup/tax treatment and reconcile a repeated filing-provider charge to one billable expense. Native detailed expenses record vendor, vendor reference, accounting code, overhead/client-disbursement/advanced-cost classification and an exact original receipt version. Overhead is nonbillable. The exact trimmed source-system/charge-reference pair identifies a reported charge across the firm: an unchanged replay returns its existing entry, changed details refuse, and concurrent submissions commit at most one entry. References are imported assertions, not provider verification; no markup is inferred. Existing document access and erasure rules apply to receipt links. Expense provenance is frozen into reviewed bill lines and CSV and survives restart and archive restore.

**Acceptance.**
1. Import an InfoTrack fee and upload its receipt, replay the charge and inspect one approved disbursement with its source and accounting mapping.

#### TIME-007 — Code LEDES and UTBMS work

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Firms configure UTBMS task/activity/expense codes and client guidelines; validate timekeeper IDs, narratives, rates and required fields; export LEDES 1998B and supported client-required LEDES XML with acceptance/rejection tracking. Until FIRM-002 adds billing staff, the principal configures the firm’s UTBMS code sets (task letter plus three digits, activity A plus three digits, expense E plus three digits; codes are retired, never deleted), each team member’s unique LEDES timekeeper ID and classification (PT, AS, OC, PL, LA or OT), and each client’s billing guideline. With no configured code of a kind, TIME-001’s format check is the whole rule; once a kind has codes, every entry, timesheet draft, bill coding and correction must use an active one. A guideline is an append-only version for the matter’s recorded client name (exact match, as TIME-003) naming the LEDES client ID and law-firm ID, whether task, activity and expense codes are required, a minimum narrative length, banned narrative phrases (case-insensitive), maximum hourly rates by classification and a required billing increment (0 for none); every fee line needs a timekeeper ID, and no LEDES field may contain | or []. A bill prepared for a client with a guideline is a LEDES bill: preparation checks every line against the current version and the firm code sets and refuses the whole bill naming each failing line and reason; codes may be chosen per line at preparation without changing the recorded entry. Before BILL-015 cutover, preparation reserves a unique invoice number (matter number, dash, the matter’s bill count including voided drafts; numbers are never reused) and approval freezes a LEDES 1998B file beside the reviewed CSV: YYYYMMDD dates, billing period from the earliest to the latest line date, units = billed hours to four decimals (half-up), unit cost = the hourly rate, and LINE_ITEM_ADJUSTMENT_AMOUNT carrying the agreed discount and rounding so the line total = units × unit cost (half-up to cents) + adjustment exactly; expenses are one unit at their amount. Downloading the frozen file marks the bill exported; bills for clients without a guideline stay plain reviewed bills. Counsel record the client’s e-billing outcome by importing its file (rows INVOICE_NUMBER|LINE_ITEM_NUMBER|STATUS|REASON, header optional, a blank line number meaning the whole invoice, a rejection needing its reason) only for that exported invoice; outcomes are append-only, labelled “imported from the e-billing file, not verified with the vendor” (Satchel never contacts the vendor), a re-imported file records nothing, and the invoice’s status follows its latest file (rejected if any row rejects). A rejected or wrong line is corrected through the existing reviewed correction branch: the correction may change the line’s codes, narrative or amount, is rechecked against the current guideline and code sets, and its LEDES file is a full replacement invoice numbered <original>-R<n> at every source’s current amount and coding, while Satchel’s ledger records only the additive delta, so no entry is charged twice and the original export is unchanged. BILL-001 batches, TIME-004/TIME-005 fee kinds, TIME-008 bulk entry and every later bill or time door inherit the code-set and guideline checks at their doors. The supported client-required XML profile is LEDES XML 2.1.3, validated in the public-door journeys against the unchanged [official LEDES Oversight Committee XSD](https://ledes.org/wp-content/uploads/2020/07/LEDES213xsd.zip) (`fixtures/ledes/Ledes213.xsd`; [format history](https://ledes.org/ledes-xml-ebilling-ver-2-1-format/)). The principal enables XML in an append-only guideline with explicit work country for invoice lines, firm vendor ID, the client-assigned firm vendor ID, client billing address/phone, firm billing-contact first/last name and email, and a client-assigned matter ID recorded separately for each matter; an expense-only invoice also names a configured billing timekeeper and its recorded hourly USD-cents rate for the required summary. Preparation checks the schema field lengths, XML characters, billed timekeeper names recorded as Last, First and IDs (at most 10 characters), and snapshots these details and the current US firm name/address/phone. Approval freezes a separate immutable XML artifact and digest; either download marks the bill exported and uses the same imported-outcome and reviewed-replacement flow. XML contains every fee and expense once, original line numbers as globally unique detail file-item numbers, USD, ISO dates, zero unrecorded tax and funds-applied amounts, exact matter/invoice totals, and the replacement reference in a standard extension. XML units are billed hours rounded half-up to two decimals as its XSD requires; base is the exact units × rate to four decimal dollar places, and a four-decimal signed line adjustment makes the exported line total equal the reviewed USD cents exactly (including discounts and rounding). XML does not claim vendor acceptance; settings changes and later replacements never rewrite either frozen export. Bills prepared without an XML profile retain their existing 1998B artifact; enabling the profile applies to future preparations and substantive reviewed corrections.

**Acceptance.**
1. Prepare a coded insurer bill, reject a missing activity code, export valid LEDES 1998B and XSD-valid XML 2.1.3 and import a rejection to correct via a reviewed revision without duplicate charges.

#### TIME-008 — Submit bulk work and allocate revenue

*Tier:* Core · *From:* TIME-008 · *Cites:* BASE-ROLE-001

**Requirement.** Authorized staff bulk-enter or import time and expenses with per-row validation, immutable source snapshots and attribution.

**Acceptance.**
1. Import a weekly timesheet with one invalid row, repair it, bill and partially collect, preserving original timekeeper records. TIME-009 governs resulting revenue allocation.
2. Bulk batches retain immutable originals, repaired inputs and normalized review snapshots.
3. The principal may attribute work to eligible staff; other native timekeepers import their own work.
4. Creator and original timekeeper remain separate, with current authority, original and current matter access, walls, pricing, codes, expense provenance and approved cost basis checked before atomic posting.

#### TIME-009 — Allocate collected revenue to attorneys

*Tier:* Core · *From:* TIME-008 · *Cites:* BASE-MAIL-001

**Requirement.** Firm-approved origination, responsible-attorney allocations and commissions use collected revenue with reversible source links, preserving original timekeeper attribution.

**Acceptance.**
1. Staff costs and compensation decisions remain principal-only.
2. Allocation rules are explicit append-only principal approvals of the exact supporting document version and digest, agreement citation, origination and responsible-attorney shares, and commission basis points.
3. Each allocation explicitly reviews an actual net operating collection and freezes its invoice components and rule version; receipt face value and unapplied credit are never substituted for invoice-applied cash.
4. A cleared bank application retains its explicitly reviewed earned-work and tax split; only its earned-work component is apportioned across pre-tax source lines. Unsplit collected cents are apportioned across net invoice lines and tax by largest remainder with source-identity tie order. Only the fee portion is shared; expenses and tax remain distinct. Attorney shares and the firm remainder conserve every fee cent, and commissions round half-up from each share. Prior returns are excluded from the approved original; subsequent linked releases and reversals subtract successive calculations on that same frozen basis exactly once. Invoice value, unpaid balances, pending payments, trust custody and write-offs confer no commission. A bank-cleared operating application is distinct from its preceding trust custody. Rule changes never rewrite original work, cost snapshots, bills or earlier allocations. These are internal calculations and authorize no payout.
5. Import a weekly timesheet with one invalid row, repair it, bill and partially collect; inspect attributed collections and commission calculations without changing original timekeeper records.

### Billing and collections

#### BILL-001 — Run prebill review and batch invoices

*Tier:* Core · *From:* BILL-001, SAT-005 · *Cites:* BASE-AUDIT-001

**Requirement.** Billing staff prepare prebills by matter, payer, period and arrangement; lawyers review narratives, exclusions and write-downs; batch issue uses exact approvals, unique invoice numbers assigned under BILL-015 and immutable PDF and line artifacts with an audit trail. Each PDF is rendered from the matter’s assigned BILL-013 template, and the issued invoice records that exact template revision, so later template edits never change it. During approval billing staff may request that available client trust pay the invoice through TRUST-004; the invoice issues showing the trust application once the trust officer approves it. After issue an invoice changes only by a SAT-006 correction or a BILL-016 void and rebill. A lawyer prepares a bill from unbilled matter entries, reviews the exact revision and exports its recorded CSV artifact. Source reservations prevent double billing; assistants cannot approve; an agent’s decision carries commitment under the company’s policy, and an exported artifact cannot be voided in place or overwritten: a later BILL-016 void is a separate append-only record beside it.

**Acceptance.**
1. Prepare three matters in one run, return one prebill, approve two and issue twice; inspect two issued invoices, each naming its template revision and a BILL-015 number, and unchanged source reservations.
2. Request trust application to one approved invoice and, after trust-officer approval, see it issue as paid from trust.
3. Reserve entries in a draft, refuse another bill using them, refuse premature export and assistant approval, approve as counsel and download the immutable CSV.

#### BILL-002 — Deliver invoices and payer statements

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Issue and deliver reviewed PDFs plus authenticated online payment links by portal/email with payer details, due dates, matter summaries and trust statements. Each PDF carries the firm’s logo, address and remittance details, the client and matter header, payment terms, a QR code and link to that invoice’s payment page and the trust balance as its BILL-013 template specifies. Track actual provider delivery/failure separately from export or queue success. Once an invoice is voided under BILL-016, its delivered payment link, portal page and QR code refuse payment and name the replacement invoice.

**Acceptance.**
1. Issue an invoice to a client and insurer, inspect delivered artifacts for logo, remittance block, terms and trust balance, scan the QR code to reach only that invoice’s payment page, inspect one bounced notification, then resend only with recorded authorization.

#### BILL-003 — Split payers and handle foreign invoices

*Tier:* Core

**Requirement.** Fee agreements allocate fixed or percentage responsibility across clients, insurers and third parties with separate privacy and payment status. USD is the US default; explicitly configured foreign-currency invoices preserve original currency, approved FX rate and USD accounting differences.

**Acceptance.**
1. Split a $1,000 bill between two payers, issue a foreign-currency bill under an approved agreement and reconcile payments without converting trust ledgers silently.

#### BILL-004 — Calculate US billing tax explicitly

*Tier:* Core · *Cites:* BASE-DATA-001

**Requirement.** The firm configures counsel/accountant-reviewed service and expense tax treatment by US jurisdiction, exemptions and rounding, optionally using Avalara for supported calculation. Tax lines preserve calculation inputs and provider result; unknown treatment blocks issuance for review. Native tax-reviewed additive corrections retain the original immutable reviewed rule, including exemptions, rates and per-line rounding. Each correction records the prior and corrected nonnegative source bases and their separately rounded tax; its signed tax delta is corrected tax minus prior tax, never a rounded percentage of the delta. A later rule cannot rewrite an earlier invoice or correction. Exact-revision calculation and counsel approval precede issue/export; original CSV/PDF bytes remain unchanged. A legacy correction without a reviewed original tax basis cannot invent one. Every draft approval, including an unconfigured legacy draft or an exemption, requires its exact-revision reviewed calculation. Trust requests require retained counsel-reviewed permitted tax draw-down and an explicit reference and nonnegative integer USD-cent allocations to earned base and tax; unknown or prohibited eligibility refuses. Each component is bounded separately after pending reservations, cleared payments and exact full reversals, while the total also respects cleared same-matter funds. Approval, bank submission and clearance recheck the retained eligibility and allocation; a pending legacy request cannot bypass them. Tax contributes to invoice due, never earned service revenue, and the existing officer, bank-evidence and reversal doors still apply. A client-reviewed immutable mapping must match the bill's recorded client and LEDES client ID and name the 1998B tax expense code, XML tax identity/type and review reference; missing, mismatched, invalid or retired mapping refuses approval. LEDES 1998B retains net source rows and appends mapped expense rows for nonzero per-source tax, with tax included in invoice totals. XML 2.1.3 uses standard fee/expense tax summaries and tax definitions, fractional rates, and a reviewed_tax extension carrying each exact source base and tax. Replacement LEDES exports contain the complete corrected invoice and the actual issued parent number; native CSV/PDF corrections retain only the signed additive difference. Original CSV/PDF/LEDES files and allocations survive restart and archive restore unchanged. No Avalara calculation or client/vendor verification is claimed. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#bill-004).

**Acceptance.**
1. Bill taxable and exempt lines to two US jurisdictions, inspect calculation provenance and refuse a bill with unreviewed treatment.

#### BILL-005 — Collect through 8am LawPay

*Tier:* Core · *Cites:* BASE-DATA-001 · *Register:* R-6

**Requirement.** Connect the firm’s contracted LawPay account for hosted card/eCheck payments, trust or operating destination, saved authorization, payment links, text-to-pay links sent through CLIENT-005 and QR payment links on invoices. Billing staff also take a card or eCheck payment a client authorizes by phone by keying it into LawPay’s hosted virtual-terminal fields inside Satchel, recording the client’s authorization and allocating it to the chosen invoice or trust request in the same step; card and account numbers never reach Satchel’s servers, logs or archives. Optional card surcharging applies only to operating payments by credit card, in US states the firm has enabled it for and within card-network caps, is disclosed before payment and is never added to debit cards or trust deposits. Show pending, cleared, failed and returned states; fees and chargebacks must not invade client trust principal.

**Acceptance.**
1. Pay a sandbox operating invoice and a trust request, duplicate webhooks and return an eCheck; inspect exactly-once allocation, separated fees and visible reversal.
2. Enable surcharging, pay an operating invoice by credit card from a text-to-pay link and see the disclosed surcharge as its own line; refuse a surcharge on a debit card and on a trust request, and pay a second invoice from its QR code.
3. As billing staff key a sandbox card read out by phone into the hosted fields against an operating invoice, record the authorization and see the invoice paid in one step; confirm no card number appears in Satchel requests, logs or archive, and refuse the same action to an assistant without billing rights.
4. As the client open an issued $3,250 invoice’s payment link and pay online by hosted card or bank/eCheck; inspect the invoice number, exact allocated amount and paid state only after the provider confirms payment, and prove a failed or uncertain attempt never marks it paid.

#### BILL-006 — Collect through Stripe legal configurations

*Tier:* Core · *Register:* R-7

**Requirement.** Stripe is an alternative for firm-approved operating payments and any explicitly supported trust configuration, using hosted tokenization and account verification. Trust collection cannot be enabled until the firm verifies a compliant bank/processor arrangement that protects client principal from fees and chargebacks.

**Acceptance.**
1. Collect a sandbox operating card/ACH payment and inspect reconciliation; attempt trust enablement without verified protection and refuse it, then test an approved trust arrangement.
2. As the client pay an issued invoice online from its invoice page using hosted card and, on another invoice, ACH; replay provider events and verify the exact invoice allocation and visible pending/paid/returned states without duplicate collection.

#### BILL-007 — Reconcile payments refunds and disputes

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Provider events reconcile invoices, receipts, settlement batches, processor fees, bank deposits, ACH returns, refunds and disputes with stable external IDs. Refunds and write-offs require finance approval and append-only corrections; unknown settlement never appears paid. RL-101 requires current finance authority and exact refund approval; uncertain results remain unresolved until authenticated reconciliation, and bank settlement requires matching completed payout and statement evidence.

**Acceptance.**
1. Lose a charge response, replay callbacks, settle a batch and approve a partial refund; reconcile invoice, processor, bank and ledger totals with no duplicate collection.

#### BILL-008 — Run consented payment plans

*Tier:* Core

**Requirement.** Authorized staff define installments, start date, balance allocation, payment method mandate and hardship changes. The scheduler charges only under current consent, prevents duplicate attempts and stops/escalates failed, disputed or revoked installments. A plan or saved-card autopay moved in from another system under MOVE-008 starts paused and charges nothing until the client re-authorizes it under LawPay or Stripe. RL-102 requires authorized finance setup and current client agreement and mandate for each schedule revision. Imported plans start paused; disputed, revoked, failed or uncertain collection stops for human resolution.

**Acceptance.**
1. Create a three-installment plan, process one, revoke consent before the next due date and restart; inspect one charge and a stopped plan with a human task.
2. Import a source plan and confirm it stays paused, charging nothing, until the client’s recorded re-authorization.

#### BILL-009 — Pursue collections until resolved

*Tier:* Core

**Requirement.** Aging queues, retainer replenishment and overdue invoices drive firm-approved reminder sequences with owner, next due date, attempt/reply states and contact limits. Disputes, promises to pay, hardship and representation changes route to people; confirmed payment, including an offline payment recorded through BILL-012 or a trust application approved through TRUST-004, stops future contact, a partial payment continues the sequence for the remainder only, and reversing that payment reopens the sequence. Voiding an invoice under BILL-016 ends its sequence, and its replacement invoice starts its own without repeating reminders already sent.

**Acceptance.**
1. Age an invoice, send an authorized reminder, record a dispute then clear it and pay; verify the sequence pauses on dispute and stops on reconciled payment.
2. Repeat with a recorded check, bounce it and verify the sequence resumes from its next due step without repeating sent reminders.
3. Apply trust that covers one invoice in full and another in part through TRUST-004; verify the first sequence stops and the second continues for the remaining amount only.
4. Void a reminded invoice under BILL-016 and verify its sequence stops and the rebilled invoice’s sequence starts at its first step.

#### BILL-010 — Show client ledgers and receivables

*Tier:* Core

**Requirement.** Client statements separate billed, unbilled, paid, credited, unapplied credit, disputed, trust-held, interest or late-fee and overdue amounts as of a selected date, with every balance drillable to source transactions, including offline payments, TRUST-004 trust applications shown beside their trust-ledger debits, their allocations and reversals. A BILL-016 voided invoice leaves aging and open balances and appears on the ledger beside its original issue with the void reason and its replacement invoice. Export aging by payer, matter and responsible lawyer.

**Acceptance.**
1. Open a statement spanning a credit, an unapplied overpayment, a reversed check, a partial trust application and its reversal, pending ACH and trust deposit; compare as-of totals and aging to original ledger entries, see each trust application once beside its trust-ledger debit, and export them.
2. Void one invoice and rebill it under BILL-016: aging drops the void, the ledger shows the void and its replacement once each and the as-of balance before the void is unchanged.

#### BILL-011 — Consolidate multi-matter billing

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** A payer receives a consolidated invoice or statement across selected matters while each line retains matter, fee agreement, responsible attorney and permissions. Invoice recipients and view events are recorded without exposing one represented party’s privileged work to another.

**Acceptance.**
1. Consolidate two matters for one client, keep a third excluded, inspect the PDF and portal view event and reconcile each matter allocation.

#### BILL-012 — Record offline payments against invoices

*Tier:* Core · *From:* BILL-012 · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001

**Requirement.** Billing staff record cash, check, wire or ACH received outside the processor with payer, method, check or wire reference, received and deposit dates and the operating deposit account, then allocate it across one or more of that payer’s unpaid invoices, oldest first or by explicit amounts. A short payment leaves the remainder due or, with finance approval, posts a reasoned write-off; an overpayment becomes unapplied client credit that staff later apply to another invoice or refund under BILL-007 approval. A bounced or stopped check is reversed by an append-only entry naming the original, which reopens each invoice, restores aging and resumes collection. Funds intended for trust are recorded through TRUST-002 and never applied to operating invoices directly. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#bill-012). Under RL-6, current native finance approval is the active principal’s exact-revision, exact-cent and reasoned decision; receipt recording does not confer approval authority.

**Acceptance.**
1. Record one check that pays two invoices in full and a third in part, post the remainder as a write-off with finance approval and refuse an assistant’s write-off; record a second check that overpays, leaving unapplied credit, and apply that credit to the next invoice; bounce the first check and reverse it.
2. After each step invoice status, aging, BILL-009 collection state, the BILL-010 client ledger and the BOOKS-001 QuickBooks Online sync reflect it exactly once, and replaying each request creates no second payment.
3. Approve a write-off only with current finance authority, binding the exact current invoice revision, positive integer USD cents and reason. Retain invoice identity, revision, amount, reason, approving person, approval time and linked append-only history.
4. Refuse unauthorized or stale approval and posting after authority, matter access or ethical-wall access changes; replay produces no second write-off and changed inputs require a fresh decision.
5. Inspect a write-off reducing collectible receivables with no payment, bank deposit or trust movement and unchanged original invoice artifacts and approvals.
6. Return the original check: reverse its payment allocations and preserve the independently approved write-off. Later receipts apply to the remaining collectible amount and keep excess as unapplied credit.

#### BILL-017 — Reverse approved invoice write-offs

*Tier:* Core · *From:* BILL-012 · *Cites:* BASE-ROLE-001, BASE-DATA-001

**Requirement.** An authorized exact-revision write-off reversal names the original, amount and reason, preserves both append-only records and restores the collectible balance once. It bypasses no payment-resolution, counsel-review or void prerequisite. RL-6 governs the separately approved reversal and preserves every original invoice-status, aging, collection, client-ledger and books obligation.

**Acceptance.**
1. Refuse unauthorized or stale reversal, approve the exact original write-off reversal with current finance authority and retain both records.
2. Restore the collectible balance once, without repeating sent reminders, and re-evaluate every BILL-016 prerequisite; refuse a void while an unreversed write-off remains.
3. Verify restart and archive recovery, invoice status, aging, collection, client ledger and once-only QuickBooks Online synchronization; exercise populated changed screens at 1440 and 390.

#### BILL-013 — Brand versioned invoice templates

*Tier:* Core

**Requirement.** The principal or billing staff maintain firm invoice templates using FIRM-001’s logo, address and remittance details: client and matter header, payment terms and due date, payment link and QR code, and per-template choices to show or hide time-entry detail, hours, rates, timekeepers, UTBMS codes, $0 no-charge lines and discounts, a summary or detailed layout, and how trust and prior balances appear. Templates are versioned; a firm default is overridden per client or matter, and the assignment is visible in prebill review. Every issued invoice keeps its exact template revision and rendered PDF bytes, so editing or retiring a template changes only later invoices.

**Acceptance.**
1. Upload a logo and remittance block, create a detailed template that shows no-charge lines and a summary template that hides hours and rates, and assign each to a different matter; issue both invoices and inspect the PDFs for logo, remittance block, header, terms, trust balance and the chosen detail.
2. Edit the detailed template and issue a new invoice; the earlier PDF downloads byte-identical and names the earlier revision.

#### BILL-014 — Charge interest and late fees by agreement

*Tier:* Core

**Requirement.** Firms configure per-client or per-matter payment profiles with terms, grace period, simple interest rate or flat late fee. Satchel refuses a charge the signed engagement terms do not authorize. Due charges are calculated in exact cents from the as-of unpaid balance and appear as draft lines for billing review before posting; they never accrue on trust balances, disputed amounts or installments current under a BILL-008 payment plan. Waivers carry a reason and finance approval.

**Acceptance.**
1. Set 30-day terms, a 10-day grace period and 1% monthly simple interest on one matter and none on another; age both invoices past grace, review and post interest on the first only; record a partial offline payment and inspect the next accrual on the reduced balance; mark the invoice disputed and see accrual stop; waive one charge with approval and refuse an assistant’s waiver.

#### BILL-015 — Number invoices by firm scheme

*Tier:* Core · *Cites:* BASE-DATA-001

**Requirement.** The principal configures the invoice-number pattern from a starting number, padding, prefix, year and separators. Each issued invoice receives the next unique number atomically, even within a concurrent batch; drafts and returned prebills consume no number, and an invoice voided under BILL-016 keeps its number, which is never reissued, while its rebill receives the next number. After a move, numbering continues from a firm-set next number above the last imported source invoice number, and imported invoices keep their source numbers (MOVE-002–007) without collision; a pattern change applies only to later invoices.

**Acceptance.**
1. Import Clio invoices through 2024-0187, set the next number to 2024-0188 and issue two invoices concurrently in one batch, receiving 2024-0188 and 2024-0189; return a prebill and confirm it consumed no number; refuse a next number that collides with an imported invoice; void 2024-0189 under BILL-016 and rebill its entries, receiving 2024-0190 while 2024-0189 stays on the voided invoice; change the prefix and verify issued PDFs, the BILL-010 ledger and QuickBooks Online sync keep their original numbers.
2. BILL-015 cutover is the principal’s first saved scheme.
3. Every pre-cutover number and approved/exported file stays byte-identical; a legacy draft with a reservation issues under that same number.
4. Later drafts have only their ID and a non-invoice label.
5. Number assignment, exact approved-revision and tax gates, PDF and LEDES rendering, permanent firm-wide registration and counter advance form one atomic issue operation; a failed batch consumes none, collisions are refused rather than skipped, and no gap-free claim is made.
6. Scheme versions apply only to later issues; year is from issue time in the firm IANA timezone and a counter reset requires an explicit noncolliding next number.
7. Corrections retain <original>-R<k> without advancing the counter.
8. Imports preserve source numbers and provenance with the next counter above every source ordinal; restore retains the register, counter and files. A legacy reserved draft approved after the first saved scheme keeps its reserved number and must pass atomic issue before export. A concurrent issue conflict commits no number; refreshing and replaying the exact approved issue request reconciles the durable result. Already frozen legacy artifacts remain byte-identical.

#### BILL-016 — Void issued invoices and rebill their entries

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001

**Requirement.** A lawyer, or billing staff with finance approval, voids an approved or issued invoice with a recorded reason; assistants cannot void; an agent’s void carries money and commitment under the company’s policy. Satchel refuses the void while the invoice carries an offline BILL-012 payment, a LawPay or Stripe BILL-005/BILL-006 payment or a TRUST-004 trust application, until each is reversed, refunded or moved to unapplied client credit by an append-only entry naming the original. The void is itself an append-only record: the original invoice, its BILL-013 template revision, line artifacts and PDF stay downloadable byte-identical beside a void notice in the invoice record and listings, its BILL-015 number is kept and never reissued, a voided invoice cannot be restored, and replaying the void request changes nothing. The void releases the invoice’s source reservations, so its time and expense entries return to unbilled; authorized staff then correct narrative, rate, UTBMS code or template assignment, or move an entry to another matter of the same client, with field-level edit history, and a moved entry takes the target matter’s access and ethical-wall rules. Each released entry is rebilled exactly once, on a new invoice with a new BILL-015 number and any BILL-013 template. Downstream, BILL-009 stops chasing the voided invoice; BILL-010 aging drops it while the client ledger shows the void beside the original; the invoice’s portal page, payment link, text-to-pay link and QR code refuse payment and name the replacement; BILL-014 interest stops accruing on it; BOOKS-001 voids the QuickBooks Online invoice exactly once; and REPORT-002 counts each entry’s billed value once, from the live invoice. SAT-006 correction deltas remain the way to adjust an amount without releasing entries. The current native edit door retains the source ID, creator, work date, worked duration and expense cost. A changed explicit hourly rate replaces the recorded price using worked minutes × hourly USD cents / 60, rounded half-up to cents, without a discount or agreement increment; an unchanged rate retains its recorded pricing. Narrative and UTBMS edits do not reprice. Moving preserves that recorded price and requires current access to both matters and their same recorded client value, as used by native client fee agreements. Each edit binds the reviewed entry revision and reason, records before/after values and actor, and refuses while the entry is reserved in another bill. Current entry-matter access controls its edit history; moving work grants no document or receipt access.

**Acceptance.**
1. Under the held company policy, issue and send a two-entry invoice; refuse a void by an assistant and by an agent key.
2. Record a partial check against it under BILL-012 and receive refusal of the void; reverse the payment to unapplied credit.
3. Void it as billing staff with finance approval and a reason: the original PDF downloads byte-identical, marked void in its record, with its number unchanged, and a repeated void request changes nothing.
4. Its payment link and portal pay button refuse payment and BILL-009 stops its sequence.
5. Move one entry to the client’s other matter and correct the other entry’s narrative, then read both entries’ edit history.
6. Rebill both matters: each entry appears on exactly one live invoice under a new BILL-015 number, a second rebill of either entry is refused, and the unapplied credit applies to one new invoice.
7. BILL-010 aging, the client ledger, REPORT-002 billed and realization totals and the BOOKS-001 QuickBooks Online sync show the void and the two new invoices once each, and replaying the void and the sync creates nothing new.

### Trust accounting

#### TRUST-001 — Keep built-in IOLTA client ledgers

*Tier:* Core

**Requirement.** Satchel itself maintains separate US IOLTA/trust bank registers, client/matter subsidiary ledgers and operating records in exact cents. Opening balances require dated source statements and approval; a shared bank balance never substitutes for each client’s owned funds. Native openings retain the exact document version and SHA-256 reviewed by the designated trust officer. Dates are inclusive YYYY-MM-DD calendar dates; future statement dates are refused against the current UTC date. Operating openings have no trust subsidiary; each trust opening belongs to one matter ledger. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#trust-001).

**Acceptance.**
1. Create an IOLTA account and two client ledgers, import reviewed opening balances and drill bank and client totals to their source records.

#### TRUST-002 — Record deposits and disbursements

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Record trust receipts, retainer deposits, checks, wires and authorized disbursements with payer/payee, matter, bank reference, deposit/cleared dates and supporting documents. Unidentified receipts remain suspense items rather than another client’s available money. A native posting records bank activity and never claims to send money. Dates are inclusive YYYY-MM-DD dates ordered received ≤ deposit/payment ≤ cleared; future UTC dates and new transaction posting dates before the bank register’s latest posting are refused. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#trust-002).

**Acceptance.**
1. Deposit funds for two clients, record a third unidentified receipt and disburse a cleared authorized amount; inspect separate balances and a suspense exception.

#### TRUST-003 — Prevent overdrafts and commingling

*Tier:* Core

**Requirement.** Trust availability is calculated per client/matter and cleared funds, with pending commitments included. Refuse negative balances, cross-client borrowing, fee deductions from principal and unsupported backdating; exceptions cannot be hidden by editing history. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#trust-003).

**Acceptance.**
1. Attempt a transfer exceeding one client’s cleared balance while the bank has sufficient aggregate cash; refuse it and retain the attempted-action history.

#### TRUST-004 — Authorize earned-fee trust transfers

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-DATA-006

**Requirement.** A designated trust officer approves a reviewed earned invoice and exact available client funds for trust-to-operating transfer. Dual authorization is configurable; bank or processor execution and actual cleared results reconcile before balances are final. Agents never authorize movement. Billing staff request the application during BILL-001 prebill or batch approval or against an already issued invoice by choosing the client’s trust ledger as that invoice’s payment source; the request reserves the funds under TRUST-003 until the officer approves or declines it. Each approved application posts paired, linked entries exactly once: a debit on the client’s matter trust ledger and trust bank register, and an operating payment allocated to the invoice. The invoice becomes paid when the application covers it; when cleared trust falls short, Satchel applies only the available amount, never overdraws the client ledger and leaves the remainder due in aging. The application stops or reduces BILL-009 collection, appears once on the BILL-010 client ledger beside its trust-ledger debit, in the client trust statement and in the TRUST-005 register, and syncs to BOOKS-001 as one operating payment, never as a second deposit or an untouched receivable. A mistaken application is reversed by an append-only entry naming the original, which reopens the invoice by the reversed amount and restores the client’s trust balance.

**Acceptance.**
1. Under the held company policy, trust-application approval carries money: issue a $1,000 and a $900 invoice to a client holding $1,500 in cleared trust; request trust application to the first during BILL-001 batch approval and to the second after issue, and refuse an assistant’s or agent’s approval.
2. The trust officer approves both, with a second approver while dual authorization is on; interrupt execution and reconcile its bank reference.
3. The first invoice is paid and the second shows $500 paid and $400 due in aging.
4. The trust ledger, trust bank register, client trust statement, BILL-010 ledger and TRUST-005 register each show each application once; BILL-009 stops the first invoice’s sequence and continues the second’s for $400; BOOKS-001 posts one QuickBooks Online operating payment per application, and replaying either approval creates nothing new.
5. Reverse the second application by an append-only entry: the invoice reopens to $900 due, the client’s trust balance returns to $500 and the reversal syncs once.
6. TIME-005 execution obligation: settlement disbursement preparation and final approval bind the exact current settlement revision, allocation, payee and amount to its required counsel and designated trust-officer approvals, including any valid recorded sole-practitioner setting.
7. Recheck current authority, ethical walls and cleared unreserved same-matter availability at execution.
8. A TIME-005 readiness result supplies no spending approval or reservation. Preserve the existing transfer, posting, uncertain-result and bank-reconciliation controls.

#### TRUST-005 — Reconcile all three trust views

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** For each statement period reconcile adjusted bank statement balance, trust bank register and sum of client subsidiary balances, showing outstanding checks/deposits and every difference. A trust officer signs and locks a dated reconciliation packet only when differences are resolved or explicitly recorded for correction. Amounts are exact integer USD cents. Statement import retains the uploaded bank original, version and hash with the officer-recorded closing balance; TRUST-007 adds bank-row parsing and feeds. The inclusive effective-date cutoff adds outstanding deposits and subtracts outstanding checks from the statement balance; the register includes suspense while the subsidiary sum excludes it. Each difference links to its entries and original sources. A signed packet freezes the report, client statements, source references, actor, time and SHA-256 digest. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#trust-005).

**Acceptance.**
1. Import a bank statement with an outstanding check and a misallocated receipt, inspect three-way differences, correct by journal and sign a balanced packet.
2. Run consecutive monthly periods and compare all three balances in integer cents.
3. Drill a $12.50 difference to its misallocated receipt and an outstanding check to its bank/register entries, resolve the discrepancy and verify all three adjusted totals agree to the cent before the balanced packet is signed.

#### TRUST-006 — Correct and lock trust history

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Posted trust entries are append-only; reversals name the original and reason, closed periods need authorized reopen, and each action retains person/time/source. Reconciliation reports and client trust statements reproduce any prior cutoff. Cutoffs include all entries effective on or before the selected calendar date. Current reports include later-recorded corrections, while each signed packet and its client statements retain their original frozen version and SHA-256 digest. An active documented reopen permits historical correcting entries within that period even after later postings; every other signed cutoff that would change must also be reopened. Historical debits and receipt reversals must preserve nonnegative cleared balances at every intervening effective/clearance date, so later deposits cannot finance an earlier payment. Journal reversals correct ledger records and never claim to move money; earned-fee applications retain TRUST-004’s bank-confirmed return process. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#trust-006).

**Acceptance.**
1. Reverse a misallocated deposit after month-end, require authorized reopen and compare the original signed packet with the corrected version and full trail.

#### TRUST-007 — Match banks and legal processor settlements

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Import OFX/QFX or bank CSV statements and connect authorized US bank feeds such as Plaid, matching LawPay/Stripe settlement references without duplicating receipts. Trust and operating feeds remain separate, with unresolved matches and stale-feed status visible.

**Acceptance.**
1. Import a statement twice, match a processor batch and one outstanding deposit, then disconnect the feed; verify one transaction per source and an unresolved stale-state banner.

#### TRUST-008 — Report trust and replenish retainers

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-006, BASE-MAIL-001

**Requirement.** Trust officers and authorized clients obtain client trust statements, balance alerts, reconciliation packets and state trust-record reports reviewed by the firm. California (Rule 1.15 monthly reconciliation of client ledgers, account journal and bank statements, and Client Trust Account Protection Program annual reporting fields) and New York (Rule 1.15(d) required bookkeeping records, retained seven years) ship first; other states’ fields are configured and reviewed by the firm. Low retainers generate approved replenishment requests; they never auto-withdraw funds without valid authorization. The recorded native release boundary remains an interim implementation; full authority scope is retained pending the unprovided ct ruling.

**Acceptance.**
1. Generate a monthly trust packet and client statement, produce the California monthly reconciliation and New York required-records report for the same period and trace each required field to source entries, cross a retainer threshold and inspect a delivered replenishment request without any unauthorized debit.
2. Only the active native principal, with existing trust-record authority and full account access, explicitly releases an exact current officer-signed ledger statement to one current client or co-client grant.
3. Payers and delegates receive no trust statements or replenishment requests.
4. The principal approves versioned retainer thresholds; a principal who is also a designated trust officer approves the exact current posted-balance alert before publishing a replenishment request to one current client or co-client grant.
5. Delivery means authenticated portal publication only, with an audited timestamp; it sends no email or SMS, initiates no provider call and never authorizes or posts a debit.
6. Reads recheck the original recipient grant, active principal authorizer and ethical walls; a fresh grant cannot revive old publication authority.
7. Statement release and request-delivery authority are excluded from archive restore, while signed records, policy versions and immutable audit evidence remain recoverable.
8. State-record downloads are incomplete review previews, not compliance certifications or annual filings. CLIENT-001 grant rules and existing trust-record authority continue to apply. This default changes no acceptance sentence and is not a DONE claim.

#### TRUST-009 — Produce checks and deposit records

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001

**Requirement.** Authorized staff prepare numbered trust/operating checks and deposit slips tied to approved ledger transactions, support void/reissue with reasons and bank matching, and prevent duplicate check numbers or printing from authorizing a payment. The principal with an active trust-officer designation records operating transactions; designated trust officers with current matter access prepare trust checks. Numbering accepts 1–12 positive decimal input digits and canonicalizes leading zeros and is unique per bank account forever, including voided checks. A printable check requires an approved, uncleared check disbursement. A void names a reason, exact check revision and supporting original and posts only after an officer reviews the exact reversal; pending/approved voids prevent clearance, and cleared checks require bank reversal rather than a void. A replacement requires a separately approved matching account, client ledger, payee and amount, with a new number linked to the approved void. Bank matching records the exact check number, amount, bank reference and source-backed cleared date without claiming a Satchel bank send. Deposit slips contain distinct approved uncleared receipts from one account, keep source references and say they are a record rather than bank confirmation; printing never posts or approves. Operating receipts and payments have no client subsidiary; cleared operating availability deducts pending operating payments and earned-fee reversals, and every posting preserves nonnegative historical balances.

**Acceptance.**
1. Prepare a reviewed disbursement check, void and reissue it, reconcile the bank debit and inspect both numbers and unchanged client ownership.

#### TRUST-010 — Transfer trust between one client’s matters

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-006

**Requirement.** A trust officer moves cleared funds between two matter ledgers of the same client, such as a closed matter’s remaining retainer to that client’s new matter, with a reason, the client’s written authorization attached and optional dual approval. Within one trust bank account the transfer posts one paired, append-only debit and credit, so the bank register is unchanged and TRUST-005 stays balanced; a move between two trust bank accounts also records and reconciles the bank movement. Transfers to another client, of uncleared funds or above the source matter’s available balance are refused under TRUST-003. Same client means the same canonical INTAKE-004 party related as client on both matters, including retained merged IDs; matching free-text client names never establishes identity. Each designated officer must currently see both matters. The request pins the written authorization’s retained matter-visible document version and hash, reason, exact cents, ledger pair and transfer date; a later document version does not rewrite that authority, while erasure or lost visibility refuses further work. Request keys replay exactly without another allocation. The firm’s one/two-distinct-officer approval policy is frozen on request; approvals must still be active before posting or bank submission. Within one account, final approval atomically posts opposite cleared subsidiary entries; bank-register rows exclude these allocations while both client statements and three-way totals retain them. Between accounts, approval only reserves: a person records submitted and then cleared or confirmed-not-executed bank outcomes, with exact debit/credit amounts, references, dates and originals for both accounts. Uncertain submission retains the reservation across restart; only cleared evidence posts the paired bank entries, once, and no Satchel bank send is claimed. Reversals require written authority and at least the original or current stronger approval threshold, name the original transfer and append its opposite pair; generic one-sided clearance/reversal refuses these entries. Available cleared funds include pending reservations from every disbursement, earned-fee application and matter-transfer door. Signed periods still require explicit reopening before a correction; their signed packets remain immutable.

**Acceptance.**
1. Close a matter holding $750 in trust, attach the client’s authorization and transfer $750 to the same client’s new matter; inspect paired matter-ledger entries, an unchanged bank register, both client trust statements and a balanced TRUST-005 view; refuse a transfer to another client’s matter and one exceeding cleared funds; replay the approval without a second transfer, then reverse it by an append-only entry naming the original.

### Accounting and integrations

#### BOOKS-001 — Synchronize QuickBooks Online operations

*Tier:* Core

**Requirement.** Map clients, matters/classes, operating invoices, payments (processor payments, offline BILL-012 payments and TRUST-004 trust applications, each as one operating payment with its invoice allocations), credits and credit applications, write-offs, reversals, expenses, fees and tax to QuickBooks Online with stable external IDs, direction/ownership settings and conflict queues. Trust liability summaries are explicitly mapped and never mistaken for operating revenue; a trust application never posts as a second deposit or leaves its receivable open. A BILL-016 void voids the matching QuickBooks Online invoice exactly once and each rebill syncs as a new invoice under its new number.

**Acceptance.**
1. Sync an operating invoice, partial payment, fee and credit twice, then a check applied across two invoices and its reversal, and a trust application to an invoice and its reversal; edit a conflicting QBO record and reconcile totals through a visible conflict queue with one QBO payment per Satchel payment or trust application and no duplicate deposit.
2. Void a synced invoice and rebill it, replay the sync and see one voided and one new QBO invoice.

#### BOOKS-002 — Synchronize Xero operations

*Tier:* Core

**Requirement.** Xero is a supported alternative for contacts, operating invoices, payments, credit notes, expenses and account mappings with idempotent references and reconciliation. A firm chooses one accounting source per entity; trust subsidiary ledgers remain in Satchel.

**Acceptance.**
1. Sync an invoice and refund, return a provider validation error, repair its account mapping and reconcile one correct record per transaction.

#### CONNECT-001 — Expose scoped APIs and webhooks

*Tier:* Core · *Cites:* BASE-AGENT-005, BASE-AGENT-012, BASE-DATA-004, BASE-OPS-003, BASE-ROLE-001

**Requirement.** Versioned integration reads and signed matter metadata events cover permitted matters, tasks, documents, deadlines and finance, with scoped grants and delivery journals. Integration preparation creates matter-bound bill and deadline proposals; SAT-009 owns new-matter preparation. Resolved-address and pinned-egress protection remains required for webhook destinations. Detailed rules are in [the capability reference](docs/contract-mechanisms.md#connect-001).

**Acceptance.**
1. Create a scoped integration, page permitted matters, receive a signed event twice and refuse access to another matter and an approval route.

#### CONNECT-002 — Connect Zapier and Clio APIs

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Zapier triggers/actions and an authorized Clio API connector route external intake and approved case updates through the same validation, conflict and permission doors. Connector status, duplicates, rate limits and revocation are visible without silently dropping work.

**Acceptance.**
1. Receive a Zapier lead and a Clio update twice, map them to one matter record, hit a provider rate limit and revoke the grant with queued work visible.

#### CONNECT-003 — Reconcile connector work durably

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-001

**Requirement.** Every connector exposes last successful sync, queued work, source IDs, attempts, replies, next action and completion evidence. Restart resumes durable state; uncertain non-idempotent sends wait for reconciliation or a human, and permission changes stop unauthorized queued actions. The current native scoped API/webhook connector keeps durable source event IDs and delivery attempts across worker restarts. Its journal shows queued work, source matter/record/event IDs, last receiver HTTP acceptance, principal-recorded confirmation, response status, attempts, completion evidence and each next action. A 3xx/4xx reply is a failed attempt; a 5xx reply, connection interruption or expired sending lease is uncertain and never retried automatically. The principal resolves the exact latest uncertain attempt using an external reference and receiver evidence: received closes it without another send, while not received permits a later attempt only under current access. This is human-recorded evidence, never independent provider verification or proof of downstream completion. Removing a matter from the integration’s existing allow-list immediately refuses its API reads and queued work; each claim checks the current integration generation. An already-sending request may have reached the receiver and remains visible for reconciliation. Reconciliation history and safe audit evidence restore without credentials or credential-bound queues. Every capability that exists today conforms; FIRM-004, INTAKE-006/009, DOC-005/007/008/009/010/011, CAL-002/003/004/005/009/010, CLIENT-005/006/007, TIME-002/006, BILL-005/006/007/008, TRUST-007, BOOKS-001/002, CONNECT-002, MOVE-008 and AGENT-002/003/004 and every future connector inherit these obligations at its door. CONNECT-001 remains partial for its separate Base resolved-address/pinned-egress gap.

**Acceptance.**
1. Interrupt a provider response and restart, reconcile by external reference, then revoke matter access and verify blocked queued work and no duplicate external effect.

### Reporting and daily access

#### REPORT-001 — Report case status and outcomes

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Dashboards filter active/closed matters, stage duration, outcomes, lead conversion, evidence gaps, deadlines and workload by practice, owner and date. Every count drills into permitted records and exports the same filtered data. The principal and lawyers use seven Reports dashboards and the same filtered source rows for counts, drill-downs and CSV. Current matter grants apply before every dataset (including converted leads), count, drill and export; an ungranted matter is the current exclusion acceptance case. FIRM-003 inherits exclusion of a principal outside an ethical wall, and FIRM-008 inherits finer report scopes, before those capabilities ship. Matter cohorts filter by exact practice, responsible stage-profile lawyer, open/closed status and inclusive opened calendar dates in the firm timezone (UTC before setup). Lead cohorts use assignee and inclusive received dates; merged duplicates are excluded, converted leads linked to inaccessible matters are excluded, and unclassified leads remain a distinct No practice bucket in conversion denominators even with a named practice filter. The case-status filter applies only to matters. Conversion is converted divided by all counted leads. Practice is an explicit configured code on native lead creation/update and the versioned intake form; submissions copy the saved code without inferring it from free text. Stage duration sums successful transition intervals while open, pauses at closure and resumes at reopening; days mean 86,400,000 elapsed milliseconds, displayed half-up to two decimals, with exact milliseconds in CSV. Unassigned or unrecorded stage history is labelled, never inferred from a profile edit. On closing, the principal or responsible lawyer must record won, settled, lost, dismissed, withdrawn, transactional complete, or other with details, atomically beside the immutable closure event; older closed matters show Outcome not recorded and nothing is inferred from a closure reason. Reopening retains the prior attributed outcome in history; open matters do not count as completed outcomes. Missing evidence counts only reader-visible retained current originals of each current stage-required type. Deadlines include proposed/confirmed dates and exclude superseded/completed dates; workload includes open tasks and those deadlines, with overdue strictly before the firm-local today. An open task linked to a superseded date remains work labelled for review, without treating that obsolete date as current overdue work. Exports reapply the same filters and current permissions, include exact source identifiers and add an audit action; export never widens access.

**Acceptance.**
1. Filter an attorney’s litigation cohort, trace an overdue count to its matters and export matching rows without a walled case appearing.

#### REPORT-002 — Report firm economics

*Tier:* Core

**Requirement.** Show utilization, realization, collection rate, effective rate, billed/unbilled work, WIP, aging and matter profitability with explicit formulas, approved staff cost rates and as-of dates. Distinguish pending payments, trust cash and earned revenue. A BILL-016 void and its rebill count each entry’s billed value once, from the live invoice, so billed totals and realization never double-count them.

**Acceptance.**
1. Follow one time entry through write-down, invoice, partial settlement and expense; reconcile each report to source transactions and export the formula basis.
2. Void that invoice and rebill the entry at a corrected rate; billed, realization and collection totals count the entry once at the corrected value.

#### REPORT-003 — Schedule actionable reports

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001

**Requirement.** Authorized principals save practice-specific reports and schedule permissioned email/portal summaries with sensitive data minimization, delivery status and a due owner action for exceptions. Saved reports preserve definitions and filters across export.

**Acceptance.**
1. Schedule a weekly overdue-work report, revoke a recipient and verify future delivery excludes them and failed delivery creates an actionable exception.

#### MOBILE-001 — Complete practice work on phones

*Tier:* Core · *From:* MOBILE-001, SAT-013 · *Cites:* BASE-ACCESSIBILITY-001, BASE-ROLE-001 · *Register:* R-1, R-2, R-3, R-4

**Requirement.** Responsive desktop and phone interfaces and supported iOS/Android apps cover matter lookup, documents, camera scans, time, calendar, messages and approvals with the same role controls, . The public site retains Run Satchel at /run and navigable Markdown guides at /docs. The installed root remains the Lobby; sign-in, setup and all workspace tabs retain the picked theme and available actions at desktop and phone widths.

**Acceptance.**
1. At 1440 and 390 pixels and on iOS/Android, find a real matter, scan a record, capture time, read a client reply and approve allowed work without clipping or lost state.
2. Navigate the built site’s run instructions and guides; at 1440 and 390 pixels complete sign-in, setup and each workspace tab with real matter records, checking actions and role restrictions.

#### MOBILE-002 — Protect offline work and push alerts

*Tier:* Core · *Cites:* BASE-ROLE-001

**Requirement.** Explicitly enabled encrypted device caches show freshness and restrict confidential previews; offline time/notes queue visibly and resolve conflicts on reconnect. Push alerts honor confidentiality and device revocation, which removes local authority and cached data when the device reconnects.

**Acceptance.**
1. Record time offline, change the matter on desktop, reconnect and resolve the conflict; revoke the phone and inspect cache and push access.

### Migration and cutover

#### MOVE-001 — Preview and reconcile a whole firm move

*Tier:* Core

**Requirement.** The principal previews source-specific packages with schema/version, mapping, record counts, files/hashes, relationships, rejections and coverage gaps before any write. Apply is resumable and idempotent; undo preserves records changed or used natively. Cutover requires signed reconciliation and a final delta.

**Acceptance.**
1. Preview a multi-matter export, repair an unmatched client and missing file, apply twice with interruption and undo safe rows; sign cutover only after source counts and balances reconcile.

#### MOVE-002 — Migrate Clio Manage and Grow completely

*Tier:* Core · *From:* MOVE-002, SAT-010 · *Cites:* BASE-MAIL-001

**Requirement.** Import Clio Manage/Grow contacts, matters, relationships, notes, time/expenses, tasks, email/call records, calendar CSV/ICS, invoices with their numbers and AR/trust balances using native CSV/API and separately exported or escrowed originals, including each historic bill’s original invoice PDF, attached to its matter and invoice record as evidence that staff can open and re-send to the client. Preserve source IDs, custom fields and staff mappings; retrieve missing history through authorized API/vendor-assisted extraction before cutover. The principal previews the documented Clio contacts CSV through Base import-kit, commits its exact fingerprint, resumes and inspects the provenance journal. Replay reuses the job; undo removes unchanged unused contacts and preserves native matter links. Full Clio migration is MOVE-002.

**Acceptance.**
1. Move two active and one closed Clio matters plus a Grow lead, compare files and dates, reconcile billed/unbilled and client trust totals, open a historic Clio invoice’s original PDF from its matter and re-send it through the portal with byte-identical content, and prove repeat import creates no duplicates.
2. Upload fixtures/clio-contacts.csv through Move in, prove preview writes nothing, refuse a changed fingerprint, apply and replay, open a linked matter and undo while preserving its contact.

#### MOVE-003 — Migrate 8am MyCase completely

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-MAIL-001

**Requirement.** Read MyCase Full Backup ZIP/CSV datasets for cases, contacts, tasks, calendars, time, fees, expenses, financial activity and portal/email/SMS history; match separately downloaded documents and invoice PDFs to their index. Include archived cases and use authorized supplemental extraction for omitted originals.

**Acceptance.**
1. Import a full backup plus binary archive, resolve document-index gaps and compare active/archived case counts, messages, invoice PDFs, AR and trust activity before cutover.

#### MOVE-004 — Migrate Smokeball completely

*Tier:* Core · *Cites:* BASE-MAIL-001

**Requirement.** Read Smokeball Data Import/Export ZIP/CSV for staff, contacts, matters, unbilled work, invoices, memos and tasks; obtain document/email files and remaining calendar/trust history through authorized vendor exports or assisted extraction. Map practice-specific fields and AutoTime-derived work without treating export omissions as completed migration.

**Acceptance.**
1. Import a matter with paid/unpaid invoices and unbilled work, link its separately supplied Word/email originals and calendar/trust package and reconcile source totals and unresolved gaps.

#### MOVE-005 — Migrate PracticePanther completely

*Tier:* Core · *Cites:* BASE-DATA-001

**Requirement.** Read PracticePanther Excel/XLSX or CSV exports for contacts/custom fields, matters, tasks, time, payments and messages; archive PDF reports as evidence and map document-store originals and additional financial/calendar exports. Guided vendor-assisted extraction closes missing entity coverage before switching off the source.

**Acceptance.**
1. Move a custom-field matter, recurring task, time and payment records from native spreadsheets, match documents and trust/AR reports and compare each source relationship and balance.

#### MOVE-006 — Migrate Filevine completely

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001

**Requirement.** Map Filevine projects, project types, custom sections/collections, contacts, roles, activity, calendar and finance from Data Connector report CSVs or authorized DataBridge/Snowflake extracts, plus separately downloaded Doc Zipping archives. Retain source metadata and identify uncovered fields; buyer-provided access or vendor-assisted extraction fills them.

**Acceptance.**
1. Import two project types and a document ZIP, preserve custom section repetitions and access mapping, and reconcile files, tasks, billing and source totals with no source credentials carried over.

#### MOVE-007 — Migrate Eve work and source references

*Tier:* Core

**Requirement.** Bring Eve Word exports with citations, medical overviews and PDF/separate-file demand packages into the correct matters, retaining source references and review state. Obtain available structured history through approved vendor export/API or assisted retrieval, alongside the underlying practice-system move; track unresolved evidence links before cutover.

**Acceptance.**
1. Import a cited Word overview and demand package, resolve their references to originals, map a vendor-approved structured package where supplied and flag every unavailable history item for retrieval and explicit resolution.

#### MOVE-008 — Prove finance and authority at cutover

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001

**Requirement.** For every source distinguish dated opening balances from full historical transactions, reconcile WIP, AR, credits and trust per client/matter/bank, and preserve supporting statements. Reauthorize mail, calendars, processors, accounting, portal users and signature providers; do not import passwords, payment tokens or live sends as authority. Because payment tokens never move, cutover runs a guided re-consent campaign: Satchel lists every client with an active source payment plan or saved-card autopay (including Clio Payments plans) with its next installment date, sends each an authorized re-authorization link under LawPay or Stripe through CLIENT-006 or CLIENT-005, keeps each imported BILL-008 plan paused with an owner task due before its next installment, and resumes the plan only on the client’s recorded consent.

**Acceptance.**
1. Shadow a billing/trust period against source reports, find a missing payment, repair it and approve cutover; restored queues remain paused and connector work needs new authorization.
2. Import two Clio Payments plans, send both re-authorization links, record one client’s consent and see that plan charge its next installment once; the other plan stays paused and its owner task becomes overdue before its installment date.
3. Introduce a $12.50 client trust mismatch and refuse cutover approval; show the exact source and destination ledger difference, repair it with provenance, and permit switching only when every client/matter/bank trust total agrees to the cent.

### Agent surface

**Specialist: legal-practice coordinator.** It moves the firm’s inquiries, evidence, deadlines, billed work and reconciled cash through their legal-practice workflows.

Inherits BASE-AGENT-001 to BASE-AGENT-013. The company’s policy decides every call.

**How Satchel computes each class.**

- **standard.** An internal reversible matter, task, document, time or proposal change carries its item count.

- **external.** Mail, texts, client publication, file exposure, calendar invitations and provider delivery carry recipients and counterparty: known from a firm contact or trusted provider, new otherwise, public for an open published form.

- **money.** Rates, fees, write-offs, refunds, payment plans, collections and trust movement carry exact amount, currency and counterparty.

- **commitment.** Conflict dispositions, signed terms, legal decisions, bill approval and counsel sign-offs carry the bound revision, value and counterparty.

- **accounts.** Creating a provider account or paid outside resource carries its provider.

- **gated.** A provider’s own consent, hosted payment entry, identity verification or acceptance in a person’s name carries provider and required step.

- **access.** Membership, matter shares, ethical-wall grants, portal access, devices and agent or integration grants carry affected people and whether authority widens or narrows.

- **security.** Authentication, connected credentials, protection settings and restore controls carry the affected setting.

- **destructive.** Erasing originals or irreversibly disposing records carries affected item count.

- **sensitive.** An authorized read or write touching health, identity, bank, card or payroll data adds record count and data kind from the selected fields and records.

- **live.** Changing an enabled schedule, connector or running automation carries the affected service.

| Tool | Does | Core clauses | Risk class | Today |

| --- | --- | --- | --- | --- |

| `satchel.sat.correct_by_reviewed_additions` | Correct by reviewed additions | SAT-006 | standard or money or sensitive | planned; native action only |

| `satchel.sat.prepare_and_decide_matter_proposals` | Prepare and decide matter proposals | SAT-009 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.firm.set_up_an_empty_us_firm` | Set up an empty US firm | FIRM-001 | standard or money or security or sensitive | planned; native action only |

| `satchel.firm.separate_finance_and_legal_rights` | Separate finance and legal rights | FIRM-002 | standard or external or money or commitment or access or sensitive | planned; native action only |

| `satchel.firm.enforce_ethical_walls` | Enforce ethical walls | FIRM-003 | standard or commitment or access or sensitive | planned; native action only |

| `satchel.firm.secure_sessions_and_connected_secrets` | Secure sessions and connected secrets | FIRM-004 | standard or security or sensitive or live or accounts or gated | planned; native action only |

| `satchel.firm.export_a_complete_action_audit` | Export a complete action audit | FIRM-005 | standard or external or money or access or security or sensitive | planned; native action only |

| `satchel.firm.apply_retention_and_legal_holds` | Apply retention and legal holds | FIRM-006 | standard or external or commitment or access or security or destructive or sensitive or live | planned; native action only |

| `satchel.firm.operate_and_recover_the_owned_system` | Operate and recover the owned system | FIRM-007 | standard or external or money or security or sensitive or live | planned; native action only |

| `satchel.firm.define_custom_roles_and_rate_visibility` | Define custom roles and rate visibility | FIRM-008 | standard or money or commitment or access or sensitive | planned; native action only |

| `satchel.base.preserve_base_guarantees_through_replacements` | Preserve Base guarantees through replacements | BASE-001 | standard or destructive or sensitive | planned; native action only |

| `satchel.intake.publish_conditional_intake_forms` | Publish conditional intake forms | INTAKE-001 | standard or external or commitment or access or security or destructive or live | planned; native action only |

| `satchel.intake.manage_a_lead_pipeline` | Manage a lead pipeline | INTAKE-002 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.intake.book_consultations` | Book consultations | INTAKE-003 | standard or money or commitment or live | planned; native action only |

| `satchel.intake.maintain_a_legal_contact_graph` | Maintain a legal contact graph | INTAKE-004 | standard or money or commitment or access or sensitive or live | planned; native action only |

| `satchel.intake.review_conflicts_across_the_whole_firm` | Review conflicts across the whole firm | INTAKE-005 | standard or money or commitment or access or destructive or sensitive or live | planned; native action only |

| `satchel.intake.route_walled_conflict_matches_to_wall_custodians` | Route walled conflict matches to wall custodians | INTAKE-010 | standard or commitment or access or destructive or sensitive | planned; native action only |

| `satchel.intake.execute_engagement_agreements` | Execute engagement agreements | INTAKE-006 | standard or money or commitment or destructive or sensitive | planned; native action only |

| `satchel.intake.convert_a_lead_without_losing_history` | Convert a lead without losing history | INTAKE-007 | standard or commitment or access or destructive or sensitive | planned; native action only |

| `satchel.intake.follow_up_prospects_under_consent` | Follow up prospects under consent | INTAKE-008 | standard or external or commitment | planned; native action only |

| `satchel.intake.synchronize_google_and_microsoft_365_contacts` | Synchronize Google and Microsoft 365 contacts | INTAKE-009 | standard or external or commitment or access or sensitive | planned; native action only |

| `satchel.matter.model_practice_specific_matters` | Model practice-specific matters | MATTER-001 | standard or money or commitment or access or sensitive | planned; native action only |

| `satchel.matter.track_stages_and_milestones` | Track stages and milestones | MATTER-002 | standard or commitment or access or sensitive or live | planned; native action only |

| `satchel.matter.assign_dependent_work` | Assign dependent work | MATTER-003 | standard or commitment or access or sensitive or live | planned; native action only |

| `satchel.matter.run_editable_matter_workflows` | Run editable matter workflows | MATTER-004 | standard or external or commitment or sensitive | planned; native action only |

| `satchel.matter.keep_a_complete_matter_timeline` | Keep a complete matter timeline | MATTER-005 | standard or money or sensitive | planned; native action only |

| `satchel.matter.manage_staff_capacity_and_handoff` | Manage staff capacity and handoff | MATTER-006 | standard or commitment or access or sensitive | planned; native action only |

| `satchel.matter.close_and_reopen_matters_deliberately` | Close and reopen matters deliberately | MATTER-007 | standard or money or commitment or access or security or destructive or sensitive | planned; native action only |

| `satchel.matter.number_matters_by_firm_scheme` | Number matters by firm scheme | MATTER-008 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.matter.search_the_whole_firm_from_one_box` | Search the whole firm from one box | MATTER-009 | standard or money or access or sensitive | planned; native action only |

| `satchel.doc.store_real_working_files` | Store real working files | DOC-001 | standard or access or sensitive | planned; native action only |

| `satchel.doc.preview_and_compare_versions` | Preview and compare versions | DOC-002 | standard or commitment | planned; native action only |

| `satchel.doc.search_ocr_and_full_text` | Search OCR and full text | DOC-003 | standard or access or destructive or sensitive | planned; native action only |

| `satchel.doc.organize_and_act_on_document_sets` | Organize and act on document sets | DOC-004 | standard or access or sensitive | planned; native action only |

| `satchel.doc.work_in_microsoft_word` | Work in Microsoft Word | DOC-005 | standard or commitment or access or sensitive | planned; native action only |

| `satchel.doc.assemble_legal_documents_and_forms` | Assemble legal documents and forms | DOC-006 | standard or external or commitment or destructive or sensitive | planned; native action only |

| `satchel.doc.sign_and_file_matter_documents` | Sign and file matter documents | DOC-007 | standard or external or commitment or sensitive or live | planned; native action only |

| `satchel.doc.file_outlook_email_and_attachments` | File Outlook email and attachments | DOC-008 | standard or external or commitment or access or sensitive | planned; native action only |

| `satchel.doc.file_gmail_email_and_attachments` | File Gmail email and attachments | DOC-009 | standard or commitment or access or sensitive | planned; native action only |

| `satchel.doc.connect_sharepoint_onedrive_and_drive` | Connect SharePoint OneDrive and Drive | DOC-010 | standard or external or sensitive or live | planned; native action only |

| `satchel.doc.connect_box_and_dropbox` | Connect Box and Dropbox | DOC-011 | standard or access or sensitive | planned; native action only |

| `satchel.doc.build_medical_and_bill_chronologies` | Build medical and bill chronologies | DOC-012 | standard or external or money or access or sensitive | planned; native action only |

| `satchel.doc.prepare_controlled_evidence_productions` | Prepare controlled evidence productions | DOC-013 | standard or external or sensitive | planned; native action only |

| `satchel.cal.schedule_matter_appointments` | Schedule matter appointments | CAL-001 | standard or external or access or sensitive or live | planned; native action only |

| `satchel.cal.synchronize_google_calendar_both_ways` | Synchronize Google Calendar both ways | CAL-002 | standard or commitment or sensitive | planned; native action only |

| `satchel.cal.synchronize_outlook_calendars_both_ways` | Synchronize Outlook calendars both ways | CAL-003 | standard or sensitive | planned; native action only |

| `satchel.cal.calculate_lawtoolbox_deadlines` | Calculate LawToolBox deadlines | CAL-004 | standard or external | planned; native action only |

| `satchel.cal.calculate_calendarrules_deadlines` | Calculate CalendarRules deadlines | CAL-005 | standard or external or live | planned; native action only |

| `satchel.cal.propagate_reviewed_source_changes` | Propagate reviewed source changes | CAL-006 | standard or commitment | planned; native action only |

| `satchel.cal.remind_and_escalate_deadlines` | Remind and escalate deadlines | CAL-007 | standard or external or security | planned; native action only |

| `satchel.cal.show_firm_deadline_coverage` | Show firm deadline coverage | CAL-008 | standard or external or commitment or access or sensitive | planned; native action only |

| `satchel.cal.file_and_serve_through_infotrack` | File and serve through InfoTrack | CAL-009 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.cal.track_court_docket_changes` | Track court docket changes | CAL-010 | standard or external or money | planned; native action only |

| `satchel.cal.remind_staff_of_appointments_and_tasks` | Remind staff of appointments and tasks | CAL-011 | standard or commitment | planned; native action only |

| `satchel.client.invite_a_secure_client_portal` | Invite a secure client portal | CLIENT-001 | standard or external or commitment or access or sensitive | planned; native action only |

| `satchel.client.retain_secure_two_way_messages` | Retain secure two-way messages | CLIENT-002 | standard or external or commitment or access or sensitive | planned; native action only |

| `satchel.client.chase_document_requests_to_receipt` | Chase document requests to receipt | CLIENT-003 | standard or sensitive | planned; native action only |

| `satchel.client.give_clients_tasks_and_events` | Give clients tasks and events | CLIENT-004 | standard or external or access or sensitive | planned; native action only |

| `satchel.client.text_clients_and_leads_with_twilio` | Text clients and leads with Twilio | CLIENT-005 | standard or external or commitment or access or sensitive | planned; native action only |

| `satchel.client.deliver_and_reconcile_email` | Deliver and reconcile email | CLIENT-006 | standard or external or money or sensitive | planned; native action only |

| `satchel.client.keep_call_records_and_authorized_recordings` | Keep call records and authorized recordings | CLIENT-007 | standard or external or commitment | planned; native action only |

| `satchel.client.send_reviewed_matter_updates` | Send reviewed matter updates | CLIENT-008 | standard or external or commitment or access or security or sensitive or live | planned; native action only |

| `satchel.client.control_sharing_and_communication_preferences` | Control sharing and communication preferences | CLIENT-009 | standard or external or access or live | planned; native action only |

| `satchel.client.automated_client_reminders` | Automated client reminders | CLIENT-010 | standard or external or money or commitment or sensitive or live | planned; native action only |

| `satchel.time.run_timers_and_timesheets` | Run timers and timesheets | TIME-001 | standard or money or sensitive or live | planned; native action only |

| `satchel.time.capture_email_calendar_and_document_activity` | Capture email calendar and document activity | TIME-002 | standard or money or sensitive | planned; native action only |

| `satchel.time.apply_versioned_rates_and_budgets` | Apply versioned rates and budgets | TIME-003 | standard or money or sensitive | planned; native action only |

| `satchel.time.bill_flat_and_recurring_fees` | Bill flat and recurring fees | TIME-004 | standard or external or money or commitment or access or security or sensitive or live | planned; native action only |

| `satchel.time.manage_contingency_and_settlements` | Manage contingency and settlements | TIME-005 | standard or external or money or commitment or sensitive | planned; native action only |

| `satchel.time.capture_reimbursable_expenses` | Capture reimbursable expenses | TIME-006 | standard or external or money or commitment or access or security or destructive or sensitive | planned; native action only |

| `satchel.time.code_ledes_and_utbms_work` | Code LEDES and UTBMS work | TIME-007 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.time.submit_bulk_work_and_allocate_revenue` | Submit bulk work and allocate revenue | TIME-008 | standard or money | planned; native action only |

| `satchel.time.allocate_collected_revenue_to_attorneys` | Allocate collected revenue to attorneys | TIME-009 | standard or money or commitment | planned; native action only |

| `satchel.bill.run_prebill_review_and_batch_invoices` | Run prebill review and batch invoices | BILL-001 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.bill.deliver_invoices_and_payer_statements` | Deliver invoices and payer statements | BILL-002 | standard or external or money or access or sensitive | planned; native action only |

| `satchel.bill.split_payers_and_handle_foreign_invoices` | Split payers and handle foreign invoices | BILL-003 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.bill.calculate_us_billing_tax_explicitly` | Calculate US billing tax explicitly | BILL-004 | standard or external or money or commitment or security or sensitive | planned; native action only |

| `satchel.bill.collect_through_8am_lawpay` | Collect through 8am LawPay | BILL-005 | standard or money or sensitive | planned; native action only |

| `satchel.bill.collect_through_stripe_legal_configurations` | Collect through Stripe legal configurations | BILL-006 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.bill.reconcile_payments_refunds_and_disputes` | Reconcile payments refunds and disputes | BILL-007 | standard or external or money or commitment or sensitive | planned; native action only |

| `satchel.bill.run_consented_payment_plans` | Run consented payment plans | BILL-008 | standard or money or sensitive or live | planned; native action only |

| `satchel.bill.pursue_collections_until_resolved` | Pursue collections until resolved | BILL-009 | standard or money or commitment | planned; native action only |

| `satchel.bill.show_client_ledgers_and_receivables` | Show client ledgers and receivables | BILL-010 | standard or money or sensitive | planned; native action only |

| `satchel.bill.consolidate_multi_matter_billing` | Consolidate multi-matter billing | BILL-011 | standard or money or sensitive | planned; native action only |

| `satchel.bill.record_offline_payments_against_invoices` | Record offline payments against invoices | BILL-012 | standard or money or commitment or security or sensitive | planned; native action only |

| `satchel.bill.reverse_approved_invoice_write_offs` | Reverse approved invoice write-offs | BILL-017 | standard or money or commitment or security | planned; native action only |

| `satchel.bill.brand_versioned_invoice_templates` | Brand versioned invoice templates | BILL-013 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.bill.charge_interest_and_late_fees_by_agreement` | Charge interest and late fees by agreement | BILL-014 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.bill.number_invoices_by_firm_scheme` | Number invoices by firm scheme | BILL-015 | standard or money | planned; native action only |

| `satchel.bill.void_issued_invoices_and_rebill_their_entries` | Void issued invoices and rebill their entries | BILL-016 | standard or money or commitment or access or security or sensitive | planned; native action only |

| `satchel.trust.keep_built_in_iolta_client_ledgers` | Keep built-in IOLTA client ledgers | TRUST-001 | standard or external or money or commitment or sensitive | planned; native action only |

| `satchel.trust.record_deposits_and_disbursements` | Record deposits and disbursements | TRUST-002 | standard or external or money or sensitive | planned; native action only |

| `satchel.trust.prevent_overdrafts_and_commingling` | Prevent overdrafts and commingling | TRUST-003 | standard or money or sensitive | planned; native action only |

| `satchel.trust.authorize_earned_fee_trust_transfers` | Authorize earned-fee trust transfers | TRUST-004 | standard or money or commitment or security or sensitive | planned; native action only |

| `satchel.trust.reconcile_all_three_trust_views` | Reconcile all three trust views | TRUST-005 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.trust.correct_and_lock_trust_history` | Correct and lock trust history | TRUST-006 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.trust.match_banks_and_legal_processor_settlements` | Match banks and legal processor settlements | TRUST-007 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.trust.report_trust_and_replenish_retainers` | Report trust and replenish retainers | TRUST-008 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.trust.produce_checks_and_deposit_records` | Produce checks and deposit records | TRUST-009 | standard or external or money or commitment or access or sensitive | planned; native action only |

| `satchel.trust.transfer_trust_between_one_client_s_matters` | Transfer trust between one client’s matters | TRUST-010 | standard or external or money or commitment or destructive or sensitive | planned; native action only |

| `satchel.books.synchronize_quickbooks_online_operations` | Synchronize QuickBooks Online operations | BOOKS-001 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.books.synchronize_xero_operations` | Synchronize Xero operations | BOOKS-002 | standard or money | planned; native action only |

| `satchel.connect.expose_scoped_apis_and_webhooks` | Expose scoped APIs and webhooks | CONNECT-001 | standard or external or money or commitment or access or sensitive | planned; native action only |

| `satchel.connect.connect_zapier_and_clio_apis` | Connect Zapier and Clio APIs | CONNECT-002 | standard or commitment or live | planned; native action only |

| `satchel.connect.reconcile_connector_work_durably` | Reconcile connector work durably | CONNECT-003 | standard or external or money or access or security or sensitive or live | planned; native action only |

| `satchel.report.report_case_status_and_outcomes` | Report case status and outcomes | REPORT-001 | standard or commitment or access or sensitive | planned; native action only |

| `satchel.report.report_firm_economics` | Report firm economics | REPORT-002 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.report.schedule_actionable_reports` | Schedule actionable reports | REPORT-003 | standard or external or access or live | planned; native action only |

| `satchel.move.preview_and_reconcile_a_whole_firm_move` | Preview and reconcile a whole firm move | MOVE-001 | standard or commitment | planned; native action only |

| `satchel.move.migrate_clio_manage_and_grow_completely` | Migrate Clio Manage and Grow completely | MOVE-002 | standard or external or money or sensitive | planned; native action only |

| `satchel.move.migrate_8am_mycase_completely` | Migrate 8am MyCase completely | MOVE-003 | standard or money or access or security | planned; native action only |

| `satchel.move.migrate_smokeball_completely` | Migrate Smokeball completely | MOVE-004 | standard or money or sensitive | planned; native action only |

| `satchel.move.migrate_practicepanther_completely` | Migrate PracticePanther completely | MOVE-005 | standard or money or sensitive | planned; native action only |

| `satchel.move.migrate_filevine_completely` | Migrate Filevine completely | MOVE-006 | standard or money or access or live | planned; native action only |

| `satchel.move.migrate_eve_work_and_source_references` | Migrate Eve work and source references | MOVE-007 | standard or commitment or sensitive | planned; native action only |

| `satchel.move.prove_finance_and_authority_at_cutover` | Prove finance and authority at cutover | MOVE-008 | standard or external or money or commitment or access or sensitive | planned; native action only |

| `satchel.agent.build_evidence_closed_matter_plans` | Build evidence-closed matter plans | AGENT-001 | standard or commitment or sensitive | planned; native action only |

| `satchel.agent.chase_authorized_evidence_to_acceptance` | Chase authorized evidence to acceptance | AGENT-002 | standard or external or sensitive | planned; native action only |

| `satchel.agent.explain_deadline_changes_before_propagation` | Explain deadline changes before propagation | AGENT-003 | standard or external | planned; native action only |

| `satchel.agent.draft_substantive_work_with_verified_sources` | Draft substantive work with verified sources | AGENT-004 | standard or commitment or access or sensitive | planned; native action only |

| `satchel.agent.review_active_matters_every_night` | Review active matters every night | AGENT-005 | standard or money or sensitive or live | planned; native action only |

| `satchel.agent.reconcile_matter_work_to_collected_cash` | Reconcile matter work to collected cash | AGENT-006 | standard or money or commitment or sensitive | planned; native action only |

| `satchel.agent.keep_client_promises_through_delivery` | Keep client promises through delivery | AGENT-007 | standard or external or commitment or access or security or sensitive | planned; native action only |

| `satchel.agent.coordinate_milestones_with_billing_and_collection` | Coordinate milestones with billing and collection | AGENT-008 | standard or external or money or commitment | planned; native action only |

| `satchel.agent.measure_recovered_work_and_agent_decisions` | Measure recovered work and agent decisions | AGENT-009 | standard or money or access or sensitive | planned; native action only |

| `satchel.agent.constrain_agent_data_and_execution` | Constrain agent data and execution | AGENT-010 | standard or commitment or sensitive | planned; native action only |

**Resources.** `satchel://matters/{id}`, `satchel://leads/{id}`, `satchel://contacts/{id}`, `satchel://documents/{id}/versions/{version}`, `satchel://deadlines/{id}`, `satchel://invoices/{id}`, `satchel://payments/{id}`, `satchel://trust-ledgers/{id}`, `satchel://proposals/{id}` and `satchel://reconciliations/{id}`.

**Events.** `matter.changed`, `evidence.received`, `deadline.changed`, `invoice.issued`, `payment.changed` and `trust.reconciled`.

**Prompts.** Intake to engagement (INTAKE-001–010); evidence to deadline (DOC-001–014, CAL-001–011); worked time to reconciled cash (TIME-001–009, BILL-001–017, TRUST-001–010).

**Not tools, and why.** OSS-001: an installation and software-licensing fact; MOBILE-001: interactive phone and native-app screens and camera hardware; MOBILE-002: device-local encrypted cache, offline queue and push delivery; DOC-014: desktop folder mounting and save behavior on the person’s device.

**Limits.** Upload, request and connector capacity follows the published capability reference; business limits and provider spend caps belong to the company’s policy.

**Handoffs.** Listen for repository evidence and signature completion; emit evidence received, changed deadlines, issued invoices, payment outcomes and reconciled trust records for the firm’s other specialists.

#### SURFACE-001 — Publish the legal-practice tool registry

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-013 · *Register:* R-11

**Requirement.** The legal-practice specialist exposes this seed-specific job on top of the cited Base agent duties, using the declared company policy.

**Acceptance.**
1. The registry covers every Core clause in the tool table and serves the four stated device or installation reasons for the remaining jobs.
2. Each named action reaches the corresponding matter, finance, intake, trust or communication workflow with the same resulting records as the native action.
3. The manifest, specialist prompts and on-site agent documentation agree with the tool, resource and event tables.

#### SURFACE-002 — Compute work and communication classes

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** The legal-practice specialist exposes this seed-specific job on top of the cited Base agent duties, using the declared company policy.

**Acceptance.**
1. An internal reversible change carries standard and its exact item count.
2. Outside communication or exposure adds external with recipient count and known, new or public counterparty; moving a file into externally visible matter content also counts.
3. A changed fee, tax, write-off, refund, collection or trust amount adds money with exact currency, amount and counterparty.
4. A conflict disposition, signed term, legal decision, bill approval or counsel sign-off adds commitment with its exact record revision, value and counterparty.
5. Selected health, identity, bank, card or payroll fields add sensitive with exact record count and data kind; ordinary matter text alone supplies no class claim.

#### SURFACE-003 — Compute authority and operation classes

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** The legal-practice specialist exposes this seed-specific job on top of the cited Base agent duties, using the declared company policy.

**Acceptance.**
1. A membership, wall, portal, device, matter or integration grant adds access with affected people and widening or narrowing direction.
2. Authentication, connected credentials or protective controls add security with the affected setting.
3. Irreversible original erasure or record disposal adds destructive with the exact item count.
4. An enabled schedule, connector or running automation change adds live with the affected service.
5. Creating an outside account or paid resource adds accounts with its provider.
6. An outside provider’s person-held consent, payment entry, identity verification or personal terms step adds gated with provider and step; a provider’s agent route retains the company policy for its classes.

#### SURFACE-004 — Link matter resources and specialist handoffs

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-003, BASE-AGENT-010, BASE-AGENT-013

**Requirement.** The legal-practice specialist exposes this seed-specific job on top of the cited Base agent duties, using the declared company policy.

**Acceptance.**
1. A matter, lead, contact, document version, deadline, invoice, payment, trust ledger, proposal and reconciliation each has the resource template declared below.
2. A matter change, evidence receipt, deadline change, invoice issue, payment result and trust reconciliation emit the declared typed handoff with the corresponding resource.
3. Specialist prompts cover intake-to-engagement, evidence-to-deadline and worked-time-to-reconciled-cash jobs with their Core clause links.

#### SURFACE-005 — Run a seeded practice week through MCP

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-007, BASE-AGENT-013

**Requirement.** The legal-practice specialist exposes this seed-specific job on top of the cited Base agent duties, using the declared company policy.

**Acceptance.**
1. A stranger agent given only the installation URL completes a seeded week: qualifies an inquiry, records a conflict disposition, prepares an engagement, opens its matter, gathers missing evidence, records a cited deadline and time, issues the reviewed bill and reconciles payment and trust evidence.
2. Under the all-autonomous company policy, every declared class runs without a policy refusal or person approval, preserving the legal and financial record prerequisites.
3. Under the held company policy, standard changes enter review and every other declared class waits for the policy’s named approver; the signed-in person takes those steps and the same week reconciles.
4. The week includes a new outside recipient, sensitive medical or bank record, fee change, exact legal decision, access change and a provider-held step, with the computed classes and facts shown in the result.
5. The resulting matters, original hashes, legal sources, bill totals, receivables, client ledger and trust reconciliation agree with their native workflow counterparts.

## Push further

### Push further

#### AGENT-001 — Build evidence-closed matter plans

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** The matter agent reads permitted engagement terms, orders, correspondence, records and workflow dependencies to maintain an editable obligations map with milestone, evidence needed, owner, next due action and completion criteria. Legal interpretations carry commitment under the company’s policy; no milestone closes because a job merely ran. Each embedded-agent call uses the tool classes and company policy declared in the Agent surface.

**Acceptance.**
1. Under the held company policy, give an active matter a missing witness statement, review the proposed plan, upload an unrelated file and keep the milestone open; accept the right evidence and inspect its source-linked completion.
2. Under the held company policy, give the agent an approved claim with required elements, inspect its file-to-claim evidence map and cited source pages, and identify the missing bank record explicitly; an unrelated upload cannot satisfy that claim element.

#### AGENT-002 — Chase authorized evidence to acceptance

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Within a delegated recipient/channel/time/contact budget, the agent requests missing client/provider records, handles replies and routine calls through contracted Twilio/voice services, files returned originals and records sufficiency decisions as commitment under the company’s policy. Expired authority and exceeded delegated limits stop the call; contact failures and legal uncertainty are disclosed to the company’s policy and responsible person. Each embedded-agent call uses the tool classes and company policy declared in the Agent surface.

**Acceptance.**
1. Under the held company policy, authorize one provider request and a bounded chase, return a partial record, reach the contact limit and inspect escalation; accept the final record and verify all future chases stop.
2. Under the held company policy, request a missing client bank statement through CLIENT-003 in the authenticated portal and an authorized bank/provider request within the delegation; track each recipient, reply, deficiency and accepted original separately and stop both chases once their evidence is accepted.

#### AGENT-003 — Explain deadline changes before propagation

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** The agent compares source passages in incoming orders and rule-provider changes, proposes dependent dates/tasks and staffing, and classifies each legal decision as commitment under the company’s policy before reconciling calendar delivery and acknowledgments. It exposes uncertainty and superseded sources. Each embedded-agent call uses the tool classes and company policy declared in the Agent surface.

**Acceptance.**
1. Under the held company policy, receive an amended order, inspect cited old/new passages, reject one inferred deadline, approve another and verify only the approved change reaches each calendar with acknowledgment status.

#### AGENT-004 — Draft substantive work with verified sources

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Using authorized matter evidence, approved templates and licensed research access such as Westlaw, LexisNexis or vLex, the agent drafts demands, complaints, discovery, deposition outlines and responses. Each factual/legal proposition links to source version/page or licensed authority; unsupported assertions remain flagged; external work carries external and, when binding, commitment under the company’s policy. Each embedded-agent call uses the tool classes and company policy declared in the Agent surface.

**Acceptance.**
1. Under the held company policy, draft a demand and discovery response from mixed records, open factual citations, flag an unsupported allegation and unavailable authority, revise with counsel and prove nothing sends or files before approval.

#### AGENT-005 — Review active matters every night

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** A scheduled agent checks permitted active matters for missing evidence, treatment/billing gaps, approaching limitations, stalled work and inconsistent facts, producing ranked next actions with exact sources and a responsible person. Counsel tunes practice-specific policy, suppresses false positives and chooses execution scope. Each embedded-agent call uses the tool classes and company policy declared in the Agent surface.

**Acceptance.**
1. Under the held company policy, run overnight on three matters including a treatment gap and completed request; inspect source-linked proposed actions, suppress one and verify the next run preserves the decision without duplicate tasks.

#### AGENT-006 — Reconcile matter work to collected cash

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** The agent joins permitted document/email activity, confirmed time, fee agreements, costs, bills, settlements and books to find unbilled work or payment mismatches. Billability and bill decisions carry commitment; transfers, refunds, write-offs and collection carry money or external under the company’s policy. Each embedded-agent call uses the tool classes and company policy declared in the Agent surface.

**Acceptance.**
1. Under the held company policy, detect worked-but-unbilled email and an unmatched settlement, review each recommendation and reconcile the final invoice/payment; refuse an agent attempt to approve or transfer trust funds.

#### AGENT-007 — Keep client promises through delivery

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** From approved updates the agent extracts a reviewed promise and date, tracks underlying tasks and evidence, prompts the owner before a miss and prepares the next source-cited update. Wording, privilege and recipient decisions carry commitment and external under the company’s policy; delivery and replies are reconciled before the promise closes. Its reviewed promises participate in MATTER-007’s live closure inventory, remaining unresolved until evidenced fulfillment or an individual counsel carry decision; reopening restores only explicitly approved workflows and existing access. Each embedded-agent call uses the tool classes and company policy declared in the Agent surface.

**Acceptance.**
1. Under the held company policy, approve a promise to deliver a draft Friday, delay its dependency, inspect an owner escalation and approve a revised update; verify receipt and retain the original promise history.

#### AGENT-008 — Coordinate milestones with billing and collection

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-007

**Requirement.** The agent coordinates editable practice workflows across accepted evidence, confirmed deadlines, reviewable deliverables, earned billing and authorized collection until each milestone’s legal and financial conditions are satisfied. It keeps separate owners and approvals, durable attempts and stop controls; a payment never substitutes for unfinished legal work. Each embedded-agent call uses the tool classes and company policy declared in the Agent surface.

**Acceptance.**
1. Under the held company policy, run a demand milestone from missing records through attorney-approved draft and earned invoice, return the payment and confirm the legal work stays complete while the collection obligation reopens.

#### AGENT-009 — Measure recovered work and agent decisions

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Principals inspect completed milestones, recovered billable work, time saved using a disclosed baseline, overdue reductions, source accuracy and human overrides. Every recommendation shows data used, policy/model revision and decision; metrics never reward false completion or expose walled matters. Each embedded-agent call uses the tool classes and company policy declared in the Agent surface.

**Acceptance.**
1. Under the held company policy, compare an agent-assisted cohort against the chosen baseline, drill a recovered-time metric to confirmed work and inspect rejected recommendations and excluded restricted matters.

#### AGENT-010 — Constrain agent data and execution

*Tier:* Core · *Cites:* BASE-AGENT-005, BASE-ROLE-001, BASE-DATA-006, BASE-AGENT-002, BASE-AGENT-007

**Requirement.** Agents use only authorized matter and licensed research context under firm-approved retention/training and health-data agreements;  Delegations specify permitted actions, recipients, spend, expiry and stop/escalation rules; revocation cancels queued authority while retaining outcome history. Each embedded-agent call uses the tool classes and company policy declared in the Agent surface.

**Acceptance.**
1. Under the held company policy, embed a send-and-transfer instruction in an uploaded record, revoke the delegation before scheduled work and inspect refusal, redacted context and preserved proposal history without an external effect.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Human screen-reader pass with VoiceOver, TalkBack and NVDA | MOBILE-001 | not run | | |
| R-2 | Published VPAT and independent accessibility review | MOBILE-001 | not run | | |
| R-3 | iOS application store approval | MOBILE-001 | not run | | |
| R-4 | Android application store approval | MOBILE-001 | not run | | |
| R-5 | Real Okta or Entra tenant conformance receipt | FIRM-004 | not run | | |
| R-6 | Real LawPay account and bank settlement receipt | BILL-005 | not run | | |
| R-7 | Real Stripe legal-configuration account and bank settlement receipt | BILL-006 | not run | | |
| R-8 | Real contracted LawToolBox and CalendarRules court coverage review | CAL-004, CAL-005 | not run | | |
| R-9 | InfoTrack production filing and court returned-stamp receipt | CAL-009 | not run | | |
| R-10 | Live mailbox and person-confirmed delivery receipt | CLIENT-006, CLIENT-010 | not run | | |
| R-11 | Claude, ChatGPT, Codex and Copilot client interoperability receipts | SURFACE-001 | not run | | |

## Boundaries

Satchel is US-first and uses USD by default. Licensed lawyers decide legal interpretation, conflicts, advice, filings and jurisdiction-specific professional duties. The software supports evidence, review and execution controls; it does not act as counsel or guarantee conflict clearance. Licensed Westlaw/LexisNexis/vLex access supplies external legal authority; restricted licensed content is not silently copied or redistributed.

A regulated US bank owns each IOLTA/operating account. LawPay or a firm-verified Stripe arrangement processes payments; provider onboarding, trust protections, ACH authorization and bank agreements are required engineering and setup, not excluded scope. Satchel still owns the complete legal ledger, approval workflow, three-way reconciliation and discrepancy resolution. It neither takes custody of client money nor claims that a payment request is settlement.

LawToolBox/CalendarRules provide contracted court-rule content; counsel confirms results and resolves uncovered courts through source-cited manual review. InfoTrack and authorized courts provide filing/service networks and stamped results. Satchel owns orchestration, returned evidence and follow-up; provider outages or rejected filings remain open work. Health records and agent processing require the firm’s applicable data/health agreements, subprocessors and access policy before processing; implementing those agreements is part of delivery.

Microsoft 365/Word and Google Workspace remain editing and mail platforms; Box/Dropbox remain repositories. Satchel supplies integrated matter filing, versions, search and permissions, rather than rebuilding desktop Word or a general enterprise e-discovery hosting network. Matter evidence productions and source-cited drafts stay in scope. US tax and trust treatment is configured and reviewed by the firm’s lawyer/accountant; Satchel records calculation provenance and does not guarantee professional compliance by installation alone.

## Homepage claims

| # | Claim | Clauses |
| --- | --- | --- |
| 1 | "runs your firm’s intake" | `INTAKE-001`, `INTAKE-002`, `INTAKE-005` |
| 2 | "matters" | `INTAKE-005`, `FIRM-002` |
| 3 | "deadlines" | `CAL-006` |
| 4 | "documents" | `DOC-001`, `DOC-001` |
| 5 | "tracks your time" | `TIME-001`, `TIME-001` |
| 6 | "keeps billing … in order" | `BILL-001`, `SAT-006`, `BILL-001` |
| 7 | "… and trust accounts in order" | `TRUST-001`, `TRUST-005` |
| 8 | "100% free, open source" | `OSS-001` |
| 9 | "alternative to Clio, MyCase and Smokeball" | `MOVE-002`, `MOVE-003`, `MOVE-004` |
| 10 | "Intake · Martinez v. Reed · conflict check clear ✓" | `INTAKE-005`, `INTAKE-001` |
| 11 | "Discovery due Nov 14" | `CAL-006` |
| 12 | "Court date moved → deadlines recalculated · client notified" | `CAL-006`, `CAL-004`, `CLIENT-008` |
| 13 | "Invoice #2041 · paid online $3,250" | `BILL-005`, `BILL-006` |
| 14 | "Intake form" (heading, paragraph and card) | `INTAKE-001` |
| 15 | "conflict check across every contact" (1,912 contacts searched, match, partner clears it) | `INTAKE-005`, `INTAKE-005` |
| 16 | "former client, closed 2023" on the match | `INTAKE-005`, `MATTER-007` |
| 17 | "engagement letter signed" (Signed 2 of 2, hourly rates) | `INTAKE-006`, `TIME-003` |
| 18 | "the retainer in trust" (Trust · IOLTA, retainer deposited) | `TRUST-002` |
| 19 | "Matter opened · Martinez v. Reed · 2026-0147" | `INTAKE-005`, `MATTER-008` |
| 20 | "Enter the new trial date once. Satchel recalculates every deadline" | `CAL-004`, `CAL-005`, `CAL-006` |
| 21 | "syncs every calendar" (Google Calendar, Outlook chips) | `CAL-002`, `CAL-003` |
| 22 | "tells the client" (Client notified in portal) | `CLIENT-008`, `CLIENT-001` |
| 23 | Docket card: court, deadlines with the scheduling-order paragraph they come from | `CAL-006`, `MATTER-001` |
| 24 | "reminder to Marcus Lee 7 days before" | `CAL-007`, `CAL-011` |
| 25 | "The matter agent checks the file against the claim" | `AGENT-001` |
| 26 | "asks the client for what is missing" (portal request, bank request) | `AGENT-002`, `CLIENT-003` |
| 27 | "drafts with every source cited" (demand draft with [1]–[3]) | `AGENT-004` |
| 28 | "Prepared by the matter agent" / "Approve and send" by a lawyer | `SAT-009`, `AGENT-010` |
| 29 | "5 of 5 deadlines met · 14 exhibits filed" | `CAL-006`, `CAL-009`, `DOC-013` |
| 30 | "Email files itself to the matter from Outlook or Gmail" | `DOC-008`, `DOC-009` |
| 31 | "Every scan is searchable" (search hit in the deposition transcript) | `DOC-003` |
| 32 | "templates fill from the matter" (notice of deposition) | `DOC-006` |
| 33 | "clients sign online" (bank records authorization) | `DOC-007` |
| 34 | Matter documents card: folders and counts | `DOC-001`, `DOC-004` |
| 35 | "Satchel drafts time entries from your email, calendar and documents" | `TIME-002` |
| 36 | "Review the day and post it" (UTBMS codes, Post day) | `TIME-001`, `TIME-007` |
| 37 | Day total "6.4 h · $1,920.00" in exact USD | `TIME-001` |
| 38 | "Hourly" | `TIME-001` |
| 39 | "flat fee or contingency" | `TIME-004`, `TIME-005` |
| 40 | "with LEDES for insurers" | `TIME-007` |
| 41 | "Clients pay by card or bank transfer from the invoice" (Paid online by card) | `BILL-005`, `BILL-006` |
| 42 | Invoice #2041 lines and total | `BILL-001`, `BILL-001` |
| 43 | Invoice #2033: overdue reminder and payment plan | `BILL-009`, `BILL-008` |
| 44 | "Trust that reconciles to the cent" (three-way reconciliation each month) | `TRUST-005` |
| 45 | "When they disagree, Satchel shows you why" (outstanding check) | `TRUST-005` |
| 46 | Martinez client trust ledger | `TRUST-001`, `TRUST-002` |
| 47 | "Operating books · QuickBooks Online · synced" | `BOOKS-001` |
| 48 | "A secure portal for documents and messages" | `CLIENT-001`, `CLIENT-002` |
| 49 | "plus text" (mediation reminder, Reply C to confirm) | `CLIENT-005` |
| 50 | "and email" ("Your trial date has moved") | `CLIENT-006`, `CLIENT-008` |
| 51 | "Bring every matter over from Clio" | `MOVE-002` |
| 52 | "Matters, contacts, documents, time and trust balances come across" (import counts) | `MOVE-002`, `MOVE-008` |
| 53 | "Trust must match to the cent before you switch" ($12.50 difference fixed) | `MOVE-001`, `MOVE-008` |
| 54 | Terminal: `npx -y @runeditrun/rer dev just-every/run-satchel`, "Run it on your own computer or server." | `BASE-001`, `FIRM-007` |
| 55 | "Court e-filing goes through InfoTrack" | `CAL-009` |
| 56 | "court-rule deadlines come from LawToolBox or CalendarRules" | `CAL-004`, `CAL-005` |
| 57 | "Word and Gmail stay your editors" | `DOC-005`, `DOC-009` |
| 58 | "lawyers make every legal call" | `INTAKE-005`, `BILL-001`, `CAL-006`, `SAT-009` |
| 59 | "Oct 15 · 6.4 h posted · 0 deadlines open tonight" | `TIME-001`, `CAL-006`, `TIME-001` |
| 60 | "Free and open source, MIT licensed." | `OSS-001` |
| 61 | Automated client reminders: per-matter opt-in by the responsible counsel, template approved once by counsel, scheduled invoice and appointment reminders under a rate cap, withdrawal of consent stops the next send, each send audited with the template version. | `CLIENT-010` |

## Retired clauses

| ID | Now | Reason |
| --- | --- | --- |
| SAT-001 | merged into FIRM-002 | Published release snapshot; its capability and acceptance are carried by FIRM-002. |
| SAT-002 | merged into INTAKE-005 | Published release snapshot; its capability and acceptance are carried by INTAKE-005. |
| SAT-003 | merged into FIRM-002 | Published release snapshot; its capability and acceptance are carried by FIRM-002. |
| SAT-004 | merged into TIME-001 | Published release snapshot; its capability and acceptance are carried by TIME-001. |
| SAT-005 | merged into BILL-001 | Published release snapshot; its capability and acceptance are carried by BILL-001. |
| SAT-007 | merged into DOC-001 | Published release snapshot; its capability and acceptance are carried by DOC-001. |
| SAT-008 | merged into CAL-006 | Published release snapshot; its capability and acceptance are carried by CAL-006. |
| SAT-010 | merged into MOVE-002 | Published release snapshot; its capability and acceptance are carried by MOVE-002. |
| SAT-011 | merged into BASE-001 | Published release snapshot; its capability and acceptance are carried by BASE-001. |
| SAT-012 | merged into FIRM-006 | Published release snapshot; its capability and acceptance are carried by FIRM-006. |
| SAT-013 | merged into MOBILE-001 | Published release snapshot; its capability and acceptance are carried by MOBILE-001. |

## Status

Judged from the code and tests at commit `05959af48f66c8f4e5b6a4815707e39336a9fe6f` (28 October 2026).

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 0 | 3 | 0 | 3 |
| Target and push further | 32 | 51 | 49 | 132 |
| All | 32 | 54 | 49 | 135 |

| Clause | Title | Kind | Status | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `SAT-006` | Correct by reviewed additions | published | partial | `src/satchel/billing-corrections.ts`; `src/satchel/billing.ts`; `tests/satchel/flows.test.mjs` | Proof gap: The exported correction CSV’s negative line amount is not read back; the snapshot amount and unchanged original are asserted. |
| `SAT-009` | Prepare and decide matter proposals | published | partial | `src/satchel/proposals.ts`; `src/satchel/team.ts`; `tests/satchel/flows.test.mjs` | Matter, bill and deadline preparations, native person decisions and credential revocation are asserted. Server-computed classes and company-policy decisions remain missing. Proof gap: The complete point’s outcomes are not traced to an assertion in its old cited Evidence set: Under the held company policy, use an agent credential to prepare each proposal, refuse the agent impersonating a person’s approval and repeated human decisions, inspect the person’s decision record, then revoke the credential and refuse access. |
| `OSS-001` | Free and open source, MIT licensed | published | partial | `LICENSE`; `README.md`; `docs/free-and-providers.md`; `src/satchel/providers.ts`; `src/ui/providers.tsx`; `tests/satchel/fresh-install.mjs`; `tests/satchel/providers.test.mjs`; `tests/satchel/providers-journey.test.mjs`; `tests/satchel/followups.test.mjs` | Proof gap: The complete point’s outcomes are not traced to an assertion in its old cited Evidence set: Read `LICENSE` and the homepage, /run, README and owner guides and verify they agree on MIT, free Satchel software, self-hosting and direct provider billing. The complete point’s outcomes are not traced to an assertion in its old cited Evidence set: Follow the published run command on a fresh installation and complete the native matter/time/bill workflow without any Satchel payment, plan or license prompt. The complete point’s outcomes are not traced to an assertion in its old cited Evidence set: Before connecting a provider inspect its terms and direct firm-billing disclosure and prove Satchel adds no software or provider-resale charge. The complete LICENSE/homepage/run/README/owner-guide agreement has no asserting test linked in the old Evidence set. |
| `FIRM-001` | Set up an empty US firm | target | done | `src/satchel/firm.ts`; `src/ui/firm.tsx`; `migrations/core/0025_firm.sql`; `tests/satchel/flows.test.mjs` |  |
| `FIRM-002` | Separate finance and legal rights | target | partial | `src/satchel/role-doors.ts`; `src/satchel/portal.ts`; `src/satchel/team.ts`; `migrations/core/0079_firm_roles.sql`; `tests/satchel/roles.test.mjs`; `tests/satchel/roles-journey.test.mjs`; `src/satchel/session.ts`; `tests/satchel/flows.test.mjs`; `src/satchel/model.ts`; `src/satchel/matters.ts` | Proof gap: Every role/action cross-product is not asserted in this row’s cited evidence; the named billing, accounting, trust and client cases are asserted. The complete Team UI invitation and post-revocation private read/write journey is not asserted by the API-only checks. The repeated grant/remove cycle across billing, file and deadline doors is not fully asserted by the cited matter-list checks. |
| `FIRM-003` | Enforce ethical walls | target | partial | `tests/satchel/flows.test.mjs`; `tests/satchel/wall-expiry.mjs`; `tests/satchel/contacts-journey.test.mjs`; `tests/satchel/trust.test.mjs`; `tests/satchel/reminders.test.mjs` | Proof gap: The expanded agent policy for access-class calls is not implemented; the existing native-session refusal remains asserted. Independent revocation by both a membership change and custodianship handoff is not read back as separate grant outcomes in the selected old evidence. The complete custodian-unassigned display and no-new-grant state is not asserted by the cited custodian identity assertion. |
| `FIRM-004` | Secure sessions and connected secrets | target | partial | `tests/satchel/flows.test.mjs`; `tests/satchel/security-flow.mjs`; `tests/satchel/microsoft-security-flow.mjs`; `tests/satchel/connector-journal-journey.test.mjs`; `tests/satchel/microsoft-live.mjs` | Native passphrase and authenticator MFA, device revocation and the Microsoft directory connector are proved by the focused public-door flows. Live least-privilege sandbox proof remains missing: the held shared application has broader directory grants, so a dedicated User.Read.All application is required. Resolved-address and pinned egress remain inherited from the CONNECT-001 Base egress door. Conservative principal-only directory consent and MFA enrollment semantics await ct approval; no interactive Microsoft SSO or licensed mailbox and site content is claimed. |
| `FIRM-005` | Export a complete action audit | target | done | `tests/satchel/audit.test.mjs`; `tests/satchel/audit-journey.test.mjs`; `tests/satchel/rates.test.mjs`; `tests/satchel/rates-journey.test.mjs`; `tests/satchel/invoice-numbering.test.mjs`; `tests/satchel/flows.test.mjs` |  |
| `FIRM-006` | Apply retention and legal holds | target | partial | `src/satchel/retention.ts`; `src/satchel/document-sets.ts`; `src/satchel/archive.ts`; `src/ui/retention.tsx`; `migrations/core/0026_retention.sql`; `tests/satchel/flows.test.mjs` | Proof gap: The complete point’s outcomes are not traced to an assertion in its old cited Evidence set: Erase through the document API, refuse assistant erasure, confirm all version downloads fail and reject a pre-erasure backup when accompanied by the later journal. |
| `FIRM-007` | Operate and recover the owned system | target | partial | `src/satchel/archive.ts`; `src/satchel/archive-policy.mjs`; `README.md` | Small-file archives and native trust applications/reversals restore; large attachments, paused provider jobs and the named health diagnostics remain missing. |
| `FIRM-008` | Define custom roles and rate visibility | target | partial | `src/satchel/custom-roles.ts`; `src/satchel/role-areas.ts`; `src/satchel/role-redaction.ts`; `src/satchel/team.ts`; `src/satchel/report-data.ts`; `migrations/core/0080_custom_roles.sql`; `tests/satchel/custom-roles.test.mjs`; `tests/satchel/roles-journey.test.mjs` | Proof gap: The direct IOLTA refusal and forbidden trust-authorizing custom role are not individually traced alongside rate, report and export checks. |
| `BASE-001` | Preserve Base guarantees through replacements | target | partial | `src/auth.server.ts`; `src/satchel/archive.ts`; `src/satchel/archive-policy.mjs`; `tests/satchel/flows.test.mjs` | Proof gap: The complete local-authority exclusion list is not asserted by the native-row equality; omitted archive tables need their own absence assertion. |
| `INTAKE-001` | Publish conditional intake forms | target | done | `src/satchel/intake-forms.ts`; `src/satchel/intake-submissions.ts`; `src/satchel/intake-files.ts`; `src/ui/intake-public.tsx`; `src/ui/intake-admin.tsx`; `migrations/core/0050_intake.sql`; `tests/satchel/intake.test.mjs`; `tests/satchel/intake-journey.test.mjs` |  |
| `INTAKE-002` | Manage a lead pipeline | target | done | `src/satchel/leads.ts`; `src/satchel/lead-report.ts`; `src/ui/leads.tsx`; `migrations/core/0049_leads.sql`; `tests/satchel/leads.test.mjs`; `tests/satchel/leads-journey.test.mjs` |  |
| `INTAKE-003` | Book consultations | target | done | `src/satchel/consult-slots.ts`; `src/satchel/consultations.ts`; `src/satchel/consult-public.ts`; `src/ui/consultations.tsx`; `src/ui/booking-public.tsx`; `migrations/core/0083_consultations.sql`; `tests/satchel/consultations.test.mjs`; `tests/satchel/consultations-journey.test.mjs` |  |
| `INTAKE-004` | Maintain a legal contact graph | target | done | `src/satchel/contacts.ts`; `src/satchel/contact-merge.ts`; `src/ui/contacts.tsx`; `tests/satchel/contacts.test.mjs`; `tests/satchel/contacts-journey.test.mjs` |  |
| `INTAKE-005` | Review conflicts across the whole firm | target | partial | `tests/satchel/contacts.test.mjs`; `tests/satchel/contacts-journey.test.mjs`; `src/satchel/matters.ts`; `tests/satchel/flows.test.mjs`; `tests/satchel/numbering.test.mjs` | Proof gap: The former-client and prospective-adverse-affiliate combination, every route disposition and engagement refusal are not jointly read back by the source-linked route assertion. The claim that no contact is silently skipped and that only route fields are returned lacks a complete field/count assertion at the cited line. |
| `INTAKE-010` | Route walled conflict matches to wall custodians | target | partial | `tests/satchel/contacts.test.mjs`; `tests/satchel/flows.test.mjs`; `tests/satchel/contacts-journey.test.mjs` | Proof gap: All six named absence doors (search, export, notifications, agent context, reports and audit) are not each asserted as a nonempty-fixture exclusion in the old cited evidence. |
| `INTAKE-006` | Execute engagement agreements | target | missing |  | Counsel selects a versioned fee agreement, reviews client and payer details, requests electronic signatures through DocuSign or Inkwell, tracks signer identity, decline/expiry and completion, and files the signed document and certificate with the matter. |
| `INTAKE-007` | Convert a lead without losing history | target | partial | `src/satchel/leads.ts`; `src/ui/leads.tsx`; `tests/satchel/leads.test.mjs`; `tests/satchel/leads-journey.test.mjs` | Linking an existing conflict-reviewed matter retains the lead and its history with one lead per matter. Counsel-only engagement conversion, automatic carry-over of parties, signed terms, inquiry originals, consultation notes, staff and retainer requests remain missing. |
| `INTAKE-008` | Follow up prospects under consent | target | partial | `src/satchel/followups.ts`; `src/satchel/followup-worker.ts`; `src/satchel/followup-links.ts`; `src/ui/followups.tsx`; `migrations/core/0082_followups.sql`; `tests/satchel/followups.test.mjs`; `tests/satchel/consultations-journey.test.mjs` | Gap: ct ASK pending. Default ADOPTED (conservative): email only, because it is the only channel with a recorded sending authority (the principal’s mail provider review); consent is recorded on the exact lead by staff or the booking form and is never inherited through a contact merge; a reply is recorded by staff (Satchel reads no inbound mail); the contact limit counts sends to one lead across all kinds in the trailing seven days; a reply, conflict stop (principal or lawyer), decline, conversion or opt-out stops every active sequence for the lead; no automatic start: staff start unanswered-inquiry and engagement sequences. SMS and inbound reply capture await a recorded SMS sending authority. |
| `INTAKE-009` | Synchronize Google and Microsoft 365 contacts | target | missing |  | Each staff member may connect Google Contacts or Microsoft 365/Outlook contacts for two-way sync of the INTAKE-004 contacts they choose by matter role, tag or practice group, with stable remote IDs, mapping of names, organizations, emails, phones and addresses, loop prevention and a visible conflict queue. Walled, restricted and prospective-client contacts never leave Satchel unless firm policy allows; a remote edit is a proposed change, a remote delete never deletes a Satchel contact or its conflict history, and disconnecting stops sync with visible state. |
| `MATTER-001` | Model practice-specific matters | target | partial | `src/satchel/matter-types.ts`; `src/satchel/matter-fields.ts`; `src/ui/matter-fields.tsx`; `migrations/core/0045_matter_types.sql`; `tests/satchel/matter-types.test.mjs`; `tests/satchel/matter-types-journey.test.mjs` | Proof gap: The docket and confirmed deadline’s exact scheduling-order paragraph, displayed date and timezone are not all asserted in the cited matter-profile assertion. |
| `MATTER-002` | Track stages and milestones | target | done | `src/satchel/matter-stages.ts`; `src/satchel/matter-stage-state.ts`; `src/ui/matter-stages.tsx`; `src/ui/matter-board.tsx`; `tests/satchel/stages.test.mjs`; `tests/satchel/stages-journey.test.mjs` |  |
| `MATTER-003` | Assign dependent work | target | done | `src/satchel/tasks.ts`; `src/ui/tasks.tsx`; `migrations/core/0041_tasks.sql`; `tests/satchel/tasks.test.mjs`; `tests/satchel/tasks-journey.test.mjs` |  |
| `MATTER-004` | Run editable matter workflows | target | done | `src/satchel/workflows.ts`; `src/satchel/workflow-runs.ts`; `src/ui/workflows.tsx`; `migrations/core/0048_workflows.sql`; `tests/satchel/workflows.test.mjs`; `tests/satchel/workflows-journey.test.mjs` |  |
| `MATTER-005` | Keep a complete matter timeline | target | partial | `src/satchel/matter-notes.ts`; `src/satchel/timeline.ts`; `src/ui/timeline.tsx`; `migrations/core/0084_matter_notes.sql`; `src/ui/client-portal.tsx`; `tests/satchel/timeline.test.mjs`; `tests/satchel/timeline-journey.test.mjs` | Proof gap: The lawyer chronology’s filed-email entry is not traced alongside the client absence assertions. |
| `MATTER-006` | Manage staff capacity and handoff | target | done | `src/satchel/workload.ts`; `src/ui/workload.tsx`; `migrations/core/0042_handoffs.sql`; `tests/satchel/workload.test.mjs`; `tests/satchel/workload-journey.test.mjs` |  |
| `MATTER-007` | Close and reopen matters deliberately | target | done | `src/satchel/matter-lifecycle.ts`; `src/satchel/matter-closure-checks.ts`; `src/ui/matter-lifecycle.tsx`; `tests/satchel/lifecycle.test.mjs`; `tests/satchel/lifecycle-journey.test.mjs` |  |
| `MATTER-008` | Number matters by firm scheme | target | partial | `tests/satchel/numbering.test.mjs`; `tests/satchel/matter-import.test.mjs`; `tests/satchel/numbering-journey.test.mjs` | Proof gap: The exact Clio 2019-0042 import and subsequent collision avoidance are not traced alongside concurrent and retained-number assertions. |
| `MATTER-009` | Search the whole firm from one box | target | partial | `src/satchel/search.ts`; `src/ui/search.tsx`; `tests/satchel/flows.test.mjs`; `tests/satchel/search-journey.test.mjs`; `tests/satchel/numbering-journey.test.mjs` | Proof gap: Both matter-number and case-number search results and every denied title/count/snippet are not all individually traced. |
| `DOC-001` | Store real working files | target | partial | `src/satchel/documents.ts`; `tests/satchel/flows.test.mjs` | Matter-document originals remain limited to 1 MiB; intake-only R2 originals now support 10 MiB each. Resumable matter-file storage and quarantine remain missing. Proof gap: Resumable 500 MiB and bulk-folder uploads with quarantine are not delivered in the old evidence. Both original versions’ returned bytes are not compared by the cited status-only authenticated-download check. |
| `DOC-002` | Preview and compare versions | target | partial | `src/satchel/documents.ts`; `src/satchel/document-review.ts`; `src/ui/document-preview.tsx`; `src/ui/office-preview.tsx`; `src/ui/document-review.tsx`; `migrations/core/0065_document_review.sql`; `tests/satchel/document-preview.test.mjs` | Proof gap: Preview rendering only in browser memory is not asserted by an inspection of stored state or network effects. The complete point’s outcomes are not traced to an assertion in its old cited Evidence set: Appending an original requires its base document revision. The complete point’s outcomes are not traced to an assertion in its old cited Evidence set: Office content previews identify their limitations and do not claim original layout, drawings, macro execution or recalculated formulas. |
| `DOC-003` | Search OCR and full text | target | missing |  | OCR scanned records and index permitted document text, metadata and email with matter/date/type filters, exact page snippets and index freshness. Search applies matter walls before snippets and includes deletion of all derivatives on disposal. |
| `DOC-004` | Organize and act on document sets | target | done | `src/satchel/document-sets.ts`; `src/ui/document-sets.tsx`; `tests/satchel/document-sets.test.mjs`; `tests/satchel/document-sets-journey.test.mjs` |  |
| `DOC-005` | Work in Microsoft Word | target | missing |  | Open matter DOCX files in Word through Microsoft 365, preserve tracked changes, comments and original versions, and save a new version back to the correct matter with conflict detection and access revocation. |
| `DOC-006` | Assemble legal documents and forms | target | done | `src/satchel/assembly.ts`; `src/satchel/assembly-template.ts`; `src/satchel/assembly-formats.ts`; `src/ui/assembly.tsx`; `tests/satchel/assembly.test.mjs`; `tests/satchel/assembly-journey.test.mjs` |  |
| `DOC-007` | Sign and file matter documents | target | missing |  | DocuSign and Inkwell connectors request ordered or parallel signatures on an approved exact version, remind permitted recipients and retain signed bytes, certificate, provider ID and failure/decline history. Revoking a request never overwrites a signed original. |
| `DOC-008` | File Outlook email and attachments | target | missing |  | Microsoft 365/Outlook users file individual messages or approved threads and attachments to matters, retain sender/recipient headers and original .eml, associate sent replies and prevent duplicate filing across staff. Filing never grants a new matter reader. |
| `DOC-009` | File Gmail email and attachments | target | missing |  | Google Workspace/Gmail users select matter labels or messages for filing, preserve original headers, threads and attachments, associate outbound replies and handle deleted or revoked mail access without losing filed evidence. |
| `DOC-010` | Connect SharePoint OneDrive and Drive | target | missing |  | Microsoft SharePoint/OneDrive and Google Drive connectors map selected folders and file versions to matters, track remote IDs and permission drift and offer controlled copy or linked-file custody. A revoked remote link is reported, never presented as a retained original. |
| `DOC-011` | Connect Box and Dropbox | target | missing |  | Firms map existing Box and Dropbox folders to matters with least-privilege grants, version references, sync diagnostics and permission reconciliation; neither service becomes an alternative firm access boundary. |
| `DOC-012` | Build medical and bill chronologies | target | done | `tests/satchel/document-sets.test.mjs`; `tests/satchel/document-sets-journey.test.mjs`; `src/satchel/document-chronologies.ts`; `src/satchel/chronology-pdf-text.ts`; `src/satchel/chronology-extraction.ts`; `src/ui/document-chronologies.tsx` |  |
| `DOC-013` | Prepare controlled evidence productions | target | partial | `tests/satchel/document-sets.test.mjs`; `tests/satchel/document-sets-journey.test.mjs`; `src/satchel/document-productions.ts`; `src/satchel/production-shares.ts`; `src/ui/document-productions.tsx`; `src/ui/production-releases.tsx`; `src/ui/production-recipient.tsx`; `src/ui/production-rendering.ts`; `migrations/core/0106_production_shares.sql` | Proof gap: The authenticated opposing-counsel delivery bytes are not traced by the staff reviewed-download assertion. |
| `DOC-014` | Open matter folders on the desktop | target | missing |  | Staff install Satchel’s desktop drive for macOS and Windows, which shows only the matters they may access as folders in Finder or File Explorer, streams files on demand with optional per-matter offline pinning and opens them in any desktop application. Saving a file back records a new DOC-001 version with the saver’s identity and conflict detection, a file added to a matter folder is filed to that matter, and nothing is overwritten or deleted outside the matter’s retention and hold rules (FIRM-006). Ethical walls (FIRM-003), access removal and member deactivation take effect at the next sync and remove cached copies from the device; every open, save and offline pin is audited under FIRM-005. |
| `CAL-001` | Schedule matter appointments | target | done | `src/satchel/appointments.ts`; `src/ui/calendar.tsx`; `migrations/core/0039_appointments.sql`; `tests/satchel/calendar.test.mjs`; `tests/satchel/calendar-journey.test.mjs` |  |
| `CAL-002` | Synchronize Google Calendar both ways | target | missing |  | Selected Google calendars exchange event creation, edits, cancellations, attendees and recurrence with stable IDs, loop prevention, conflict resolution and visible token/failure state; matter confidentiality controls event detail. |
| `CAL-003` | Synchronize Outlook calendars both ways | target | missing |  | Microsoft 365/Outlook calendars support the same two-way lifecycle, delegated calendars and attendee changes, with subscription renewal, missed-change recovery and explicit choice of which details leave the matter. |
| `CAL-004` | Calculate LawToolBox deadlines | target | missing |  | Through a contracted LawToolBox integration, counsel chooses court, jurisdiction, trigger and service method, reviews computed dates and rule citations, and confirms publication to dependent tasks and calendars. Coverage and provider rule versions are visible. |
| `CAL-005` | Calculate CalendarRules deadlines | target | missing |  | CalendarRules is a supported alternative rules connector with court coverage, trigger/service inputs, rule versions, calculation provenance and attorney confirmation. Switching providers compares proposed dates rather than silently replacing confirmed deadlines. |
| `CAL-006` | Propagate reviewed source changes | target | partial | `src/satchel/deadlines.ts`; `tests/satchel/flows.test.mjs` | Exact-version supersession exists; provider comparison, dependent work and calendar acknowledgment do not. Proof gap: All connected calendar copies and acknowledgment states remain unbuilt. Google and Outlook replacement reconciliation remains unbuilt. The submitted delivery-evidence text is not read back by the cited status-only completion assertion. |
| `CAL-007` | Remind and escalate deadlines | target | partial | `tests/satchel/reminders.test.mjs`; `tests/satchel/reminder-journey.test.mjs` | Proof gap: The absence of any non-receipt path closing the obligation is not traced by a final done-status assertion. |
| `CAL-008` | Show firm deadline coverage | target | done | `tests/satchel/agenda.test.mjs`; `tests/satchel/agenda-journey.test.mjs` |  |
| `CAL-009` | File and serve through InfoTrack | target | missing |  | An authorized lawyer approves exact filing documents, court, service recipients and fees; InfoTrack submits through covered networks and returns acceptance/rejection, stamped copies, service proof and costs to the matter. Submission alone is never filing completion. |
| `CAL-010` | Track court docket changes | target | missing |  | Connect PACER through an authorized docket provider such as CourtListener RECAP where available and court/provider accounts for coverage, attach returned docket entries and orders, and propose related work with a lawyer reviewing legal effects and provider fees. |
| `CAL-011` | Remind staff of appointments and tasks | target | missing |  | Each staff member receives in-app and email reminders, and push reminders under MOBILE-002, for their appointments and tasks at firm-default or per-item offsets, with snooze and dismiss. Reminders follow reassignment, cancellation and rescheduling, fire once across restarts and carry no confidential detail outside the authenticated app. A person who relies on Google or Outlook reminders for synced events can choose calendar-only reminders, so the same event never reminds twice. |
| `CLIENT-001` | Invite a secure client portal | target | partial | `src/satchel/portal.ts`; `src/satchel/client-shares.ts`; `src/satchel/portal-preview.ts`; `src/ui/client-portal.tsx`; `src/ui/client-shares.tsx`; `migrations/core/0086_portal_identities.sql`; `tests/satchel/portal-identities.test.mjs`; `tests/satchel/portal-threads.test.mjs`; `tests/satchel/portal-identities-journey.test.mjs` | Proof gap: Post-revocation delegate access to both direct file and message URLs is not individually traced by the permissioned initial download checks. |
| `CLIENT-002` | Retain secure two-way messages | target | done | `src/satchel/portal-threads.ts`; `src/ui/portal-threads.tsx`; `src/ui/client-portal.tsx`; `migrations/core/0087_portal_threads.sql`; `tests/satchel/portal-threads.test.mjs`; `tests/satchel/portal-threads-journey.test.mjs` |  |
| `CLIENT-003` | Chase document requests to receipt | target | done | `src/satchel/workflow-runs.ts`; `src/ui/workflows.tsx`; `tests/satchel/workflows.test.mjs`; `tests/satchel/workflows-journey.test.mjs`; `src/satchel/client-requests.ts`; `src/ui/client-requests.tsx`; `migrations/core/0088_client_requests.sql`; `tests/satchel/client-requests.test.mjs`; `tests/satchel/client-requests-journey.test.mjs`; `src/satchel/request-reminders.ts`; `migrations/core/0093_request_reminders.sql` |  |
| `CLIENT-004` | Give clients tasks and events | target | partial | `src/satchel/client-shares.ts`; `src/ui/client-shares.tsx`; `src/ui/client-portal.tsx`; `migrations/core/0085_client_shares.sql`; `tests/satchel/client-shares.test.mjs`; `tests/satchel/client-shares-journey.test.mjs` | Proof gap: The complete phone-screen task-completion proof is not traced by the API completion and protected-hearing assertions. |
| `CLIENT-005` | Text clients and leads with Twilio | target | missing |  | Two-way SMS/MMS through the firm’s registered Twilio number retains conversations on the correct lead/matter, consent, delivery/failure and opt-outs. A guided setup walks the principal through connecting or creating the Twilio account, buying or porting a number, US A2P 10DLC brand and campaign registration prefilled from firm settings, approval tracking and a test message; texting stays disabled with a visible reason until registration is approved. Quiet hours and recipient confirmation are part of setup; sensitive content uses portal links. |
| `CLIENT-006` | Deliver and reconcile email | target | done | `src/satchel/correspondence.ts`; `src/ui/correspondence.tsx`; `migrations/core/0094_correspondence.sql`; `tests/satchel/providers.test.mjs`; `tests/satchel/providers-journey.test.mjs` |  |
| `CLIENT-007` | Keep call records and authorized recordings | target | missing |  | Staff log calls, participants, advice notes and follow-ups and link recordings/transcripts obtained through a consented phone provider. Recording permission and US state consent policy are checked before recording; staff approve transcript-derived work. |
| `CLIENT-008` | Send reviewed matter updates | target | partial | `src/satchel/matter-updates.ts`; `src/ui/matter-updates.tsx`; `src/ui/portal-matter-updates.tsx`; `migrations/core/0107_matter_updates.sql`; `tests/satchel/providers.test.mjs`; `tests/satchel/providers-journey.test.mjs` | Proof gap: Matter update assertions reside in tests/satchel/matter-updates-flow.mjs, which the old Evidence cell does not cite. Old/new trial date, both delivery states and the no-notification-before-approval assertions reside in the uncited matter-updates-flow helper. |
| `CLIENT-009` | Control sharing and communication preferences | target | partial | `tests/satchel/contacts.test.mjs`; `tests/satchel/contacts-journey.test.mjs`; `tests/satchel/providers.test.mjs`; `migrations/core/0102_contact_preferences.sql`; `src/ui/contacts.tsx` | Verified legal-representative replacement and recipient verification across every communication door, and complete outstanding-link invalidation after consent or authority changes, remain unproved. The representative and SMS mid-sequence acceptance journey is not complete. Existing portal grants and scheduled email stops do not establish those wider obligations. |
| `CLIENT-010` | Automated client reminders | target | partial | `src/satchel/client-reminders.ts`; `src/satchel/correspondence.ts`; `src/satchel/api.ts`; `src/server.ts`; `migrations/core/0095_client_reminders.sql`; `API.md`; `tests/satchel/providers.test.mjs`; `tests/satchel/providers-journey.test.mjs` | Proof gap: The test title alone does not prove both widths’ retained version, outcome, labelled-control and overflow outcomes; the complete assertion set must be linked before done. |
| `TIME-001` | Run timers and timesheets | target | done | `src/satchel/timers.ts`; `src/satchel/timesheets.ts`; `src/ui/timesheet.tsx`; `migrations/core/0046_timesheets.sql`; `tests/satchel/timesheets.test.mjs`; `tests/satchel/timesheets-journey.test.mjs`; `src/satchel/billing.ts`; `tests/satchel/flows.test.mjs` |  |
| `TIME-002` | Capture email calendar and document activity | target | missing |  | With explicit staff permission, Microsoft Word/Outlook and Google email/calendar/document activity becomes private time suggestions linked to matter sources. Staff review duration and billability, merge overlaps and exclude personal content before anything is billed. |
| `TIME-003` | Apply versioned rates and budgets | target | done | `tests/satchel/rates.test.mjs`; `tests/satchel/rates-journey.test.mjs`; `tests/satchel/invoice-numbering.test.mjs` |  |
| `TIME-004` | Bill flat and recurring fees | target | done | `src/satchel/fee-plans.ts`; `src/satchel/fee-scheduler.ts`; `src/satchel/billing.ts`; `src/satchel/trust-transfers.ts`; `tests/satchel/fee-plans.test.mjs`; `tests/satchel/fee-plans-journey.test.mjs` |  |
| `TIME-005` | Manage contingency and settlements | target | partial | `tests/satchel/fee-plans.test.mjs`; `tests/satchel/settlement-execution-flow.mjs`; `tests/satchel/settlement-billing-flow.mjs`; `tests/satchel/settlement-retention-flow.mjs`; `tests/satchel/fee-plans-journey.test.mjs`; `tests/satchel/settlement-browser.mjs`; `docs/evidence/time005-assertions.md` | Native settlement preparation, exact approvals and scoped execution assertions exist. Complete settlement-to-disbursement, earning, coding, trust execution and recovery proof remains subject to fresh judgment; TRUST-004 carries execution integration. No completion is counted. |
| `TIME-006` | Capture reimbursable expenses | target | partial | `src/satchel/expenses.ts`; `src/satchel/billing.ts`; `src/ui/expenses.tsx`; `migrations/core/0067_expense_details.sql`; `tests/satchel/expenses.test.mjs`; `tests/satchel/expenses-journey.test.mjs` | Native detailed expense provenance, exact receipt links, nonbillable overhead, source-reference reconciliation and reviewed CSV are asserted. InfoTrack charge/receipt ingestion and provider reconciliation, approved markup and external accounting synchronization remain missing. |
| `TIME-007` | Code LEDES and UTBMS work | target | done | `src/satchel/utbms-codes.ts`; `src/satchel/ledes-guidelines.ts`; `src/satchel/ledes.ts`; `src/satchel/billing.ts`; `src/ui/ledes.tsx`; `migrations/core/0055_ledes.sql`; `tests/satchel/ledes.test.mjs`; `tests/satchel/ledes-journey.test.mjs`; `src/satchel/ledes-xml-profile.ts`; `src/satchel/ledes-xml.ts`; `src/ui/ledes-xml.tsx`; `migrations/core/0056_ledes_xml.sql`; `fixtures/ledes/Ledes213.xsd` |  |
| `TIME-008` | Submit bulk work and allocate revenue | target | partial | `tests/satchel/timesheets.test.mjs`; `tests/satchel/trust-transfer.test.mjs`; `tests/satchel/providers.test.mjs`; `tests/satchel/timesheets-journey.test.mjs`; `tests/satchel/bulk-revenue-journey.mjs` | Proof gap: Every posting refusal for original/current access, walls, pricing, codes, expense provenance and cost approval is not individually traced. |
| `TIME-009` | Allocate collected revenue to attorneys | target | partial | `tests/satchel/timesheets.test.mjs`; `tests/satchel/trust-transfer.test.mjs`; `tests/satchel/providers.test.mjs`; `tests/satchel/timesheets-journey.test.mjs`; `tests/satchel/bulk-revenue-journey.mjs` | Proof gap: The explicit absence of a payout and every listed non-commission state are not asserted by fee-allocation totals alone. |
| `BILL-001` | Run prebill review and batch invoices | target | partial | `tests/satchel/invoice-numbering.test.mjs`; `tests/satchel/invoice-numbering-journey.test.mjs`; `tests/satchel/prebill-journey.mjs`; `src/satchel/billing.ts`; `tests/satchel/flows.test.mjs` | Proof gap: The complete point’s outcomes are not traced to an assertion in its old cited Evidence set: Prepare three matters in one run, return one prebill, approve two and issue twice; inspect two issued invoices, each naming its template revision and a BILL-015 number, and unchanged source reservations. The complete point’s outcomes are not traced to an assertion in its old cited Evidence set: Request trust application to one approved invoice and, after trust-officer approval, see it issue as paid from trust. |
| `BILL-002` | Deliver invoices and payer statements | target | partial | `tests/satchel/providers.test.mjs`; `tests/satchel/providers-journey.test.mjs`; `tests/satchel/invoice-delivery-journey.mjs`; `tests/satchel/stripe-browser.mjs`; `tests/satchel/invoice-qr-scan.swift`; `tests/satchel/invoice-sendgrid-sandbox.mjs` | Proof gap: The exact QR destination, all artifact fields and authorized-resend outcomes are not all traced in this audit; bounced notification is asserted. |
| `BILL-003` | Split payers and handle foreign invoices | target | missing |  | Fee agreements allocate fixed or percentage responsibility across clients, insurers and third parties with separate privacy and payment status. USD is the US default; explicitly configured foreign-currency invoices preserve original currency, approved FX rate and USD accounting differences. |
| `BILL-004` | Calculate US billing tax explicitly | target | done | `src/satchel/tax-reviews.ts`; `src/satchel/trust-transfers.ts`; `src/satchel/ledes.ts`; `src/satchel/ledes-xml.ts`; `src/ui/tax-reviews.tsx`; `src/ui/trust-transfers.tsx`; `tests/satchel/tax-reviews.test.mjs` |  |
| `BILL-005` | Collect through 8am LawPay | target | missing |  | Connect the firm’s contracted LawPay account for hosted card/eCheck payments, trust or operating destination, saved authorization, payment links, text-to-pay links sent through CLIENT-005 and QR payment links on invoices. Billing staff also take a card or eCheck payment a client authorizes by phone by keying it into LawPay’s hosted virtual-terminal fields inside Satchel, recording the client’s authorization and allocating it to the chosen invoice or trust request in the same step; card and account numbers never reach Satchel’s servers, logs or archives. Optional card surcharging applies only to operating payments by credit card, in US states the firm has enabled it for and within card-network caps, is disclosed before payment and is never added to debit cards or trust deposits. Show pending, cleared, failed and returned states; fees and chargebacks must not invade client trust principal. |
| `BILL-006` | Collect through Stripe legal configurations | target | partial | `tests/satchel/stripe-sandbox.mjs`; `tests/satchel/providers.test.mjs`; `tests/satchel/providers-journey.test.mjs`; `tests/satchel/stripe-browser.mjs` | Proof gap: The authenticated sandbox reconciliation and denied unverified trust enablement are not individually traced alongside recorded trust collection. |
| `BILL-007` | Reconcile payments refunds and disputes | target | partial | `tests/satchel/providers.test.mjs`; `tests/satchel/stripe-reconciliation-flow.mjs`; `tests/satchel/providers-journey.test.mjs`; `tests/satchel/payment-money-browser.mjs` | Live Stripe operating sandbox proof is pending: the admitted credential shim reports that this run’s private secret file is unavailable. Automatic payout-event ingestion, separate receipt and bank-ledger posting, finance reversal of an incorrect bank match, and complete finance-approved write-off correction proof remain unproved. Default ADOPTED : only the active principal approves an exact invoice revision, positive USD-cent amount and reason for a refund; approval is append-only, an uncertain provider response is never retried automatically, and a later authenticated charge readback appends the correction. Bank settlement remains unconfirmed without an exact completed payout and principal-recorded statement match; later failed payout readback removes confirmed status. |
| `BILL-008` | Run consented payment plans | target | partial | `tests/satchel/providers.test.mjs`; `tests/satchel/providers-journey.test.mjs`; `tests/satchel/payment-money-browser.mjs` | Live Stripe operating sandbox proof is pending: the admitted credential shim reports that this run’s private secret file is unavailable. A full MOVE-008 source-export campaign and LawPay remain unproved; this native slice supports Stripe test mode only. Default ADOPTED : the active principal approves the exact operating-invoice schedule and hardship revision; the currently authorized client explicitly agrees in their own session and completes a new hosted Stripe mandate for that exact revision. Imported schedules contain no source credentials, start paused and create an owner task before their first installment. A changed schedule requires fresh client consent; failed, disputed, revoked or uncertain collections stop with a human task and never automatically retry. |
| `BILL-009` | Pursue collections until resolved | target | missing |  | Aging queues, retainer replenishment and overdue invoices drive firm-approved reminder sequences with owner, next due date, attempt/reply states and contact limits. Disputes, promises to pay, hardship and representation changes route to people; confirmed payment, including an offline payment recorded through BILL-012 or a trust application approved through TRUST-004, stops future contact, a partial payment continues the sequence for the remainder only, and reversing that payment reopens the sequence. Voiding an invoice under BILL-016 ends its sequence, and its replacement invoice starts its own without repeating reminders already sent. |
| `BILL-010` | Show client ledgers and receivables | target | partial | `src/satchel/billing.ts`; `src/satchel/trust-transfers.ts`; `src/ui/billing.tsx`; `src/ui/trust-transfers.tsx`; `tests/satchel/trust-transfer.test.mjs` | Native billing shows unbilled work and invoice trust-payment, remaining-due and credit amounts; applications, reversals and supported voids reconcile balances. Complete as-of client statements, offline/provider payments, unapplied credit, disputes, interest/late fees and payer/matter/lawyer aging exports remain missing. |
| `BILL-011` | Consolidate multi-matter billing | target | partial | `tests/satchel/providers.test.mjs`; `tests/satchel/providers-journey.test.mjs`; `tests/satchel/invoice-delivery-journey.mjs`; `src/satchel/payer-statements.ts`; `src/ui/invoice-delivery.tsx` | Proof gap: The portal view event and every matter allocation are not traced alongside the exact selected/excluded matter assertions. |
| `BILL-012` | Record offline payments against invoices | target | partial | `tests/satchel/trust-transfer.test.mjs`; `src/satchel/offline-payments.ts`; `src/satchel/offline-balances.ts`; `migrations/core/0103_offline_payments.sql`; `API.md` | Native operating receipt and credit commands exist; receipt-entry and credit-management screens, full aging and BILL-009 collection transitions, historical BILL-010 client statements and BOOKS-001 once-only QuickBooks Online synchronization remain unproved. Refunds require the unbuilt BILL-007 approval path and are refused here. Write-off reversal remains unimplemented; BILL-017 carries that part. |
| `BILL-017` | Reverse approved invoice write-offs | target | missing |  | The approved write-off reversal path, controls, financial reconciliation, recovery and screens are absent. |
| `BILL-013` | Brand versioned invoice templates | target | partial | `tests/satchel/providers-journey.test.mjs`; `tests/satchel/invoice-template-journey.mjs`; `tests/satchel/providers.test.mjs`; `API.md` | Proof gap: Every listed PDF field, logo and summary absence is not traced individually; selected detailed content, version and unchanged bytes are asserted. |
| `BILL-014` | Charge interest and late fees by agreement | target | missing |  | Firms configure per-client or per-matter payment profiles with terms, grace period, simple interest rate or flat late fee. Satchel refuses a charge the signed engagement terms do not authorize. Due charges are calculated in exact cents from the as-of unpaid balance and appear as draft lines for billing review before posting; they never accrue on trust balances, disputed amounts or installments current under a BILL-008 payment plan. Waivers carry a reason and finance approval. |
| `BILL-015` | Number invoices by firm scheme | target | partial | `src/satchel/invoice-schemes.ts`; `src/satchel/invoice-issue.ts`; `src/satchel/invoice-pdf.ts`; `src/ui/invoice-numbering.tsx`; `migrations/core/0064_invoice_numbers.sql`; `tests/satchel/invoice-numbering.test.mjs`; `tests/satchel/invoice-numbering-journey.test.mjs` | Versioned prospective schemes, permanent legacy/import register, exact-tax-reviewed PDF/LEDES/XML issue, all-or-none batches, collision refusal, independent concurrent issue reconciliation, unchanged replay, legacy reserved-draft issue, additive -R1/-R2 corrections without counter advance, issue-versus-discard exclusion and byte-identical restart/restore are asserted by BILL-015 public-door tests and 1440/390 journeys. Gap: BILL-016 issued void/rebill, actual Clio invoice ingestion (MOVE-002–007), BILL-010 ledger and BOOKS-001 QuickBooks number preservation remain unbuilt; imported-number registration is provenance only. |
| `BILL-016` | Void issued invoices and rebill their entries | target | partial | `src/satchel/invoice-void.ts`; `src/satchel/billing.ts`; `src/satchel/ledes.ts`; `src/ui/invoice-void.tsx`; `migrations/core/0069_invoice_voids.sql`; `tests/satchel/invoice-numbering.test.mjs`; `tests/satchel/invoice-numbering-journey.test.mjs`; `tests/satchel/trust-transfer.test.mjs`; `src/satchel/released-entries.ts`; `src/ui/released-entries.tsx`; `migrations/core/0070_entry_edits.sql`; `tests/satchel/fee-plans.test.mjs` | Native counsel voids original time/expense approved or issued invoices, including reviewed capped and blended work, through an append-only exact-revision journal; concurrent/repeated identical requests reconcile once, live payments and unresolved trust actions refuse, source reservations release; counsel edits narratives, explicit rates and UTBMS codes or moves work between accessible same-client matters with append-only field history; both matters rebill their stable source IDs once under a new number, and unchanged original CSV/PDF/LEDES/XML, number, approval and void evidence survive restart/restore. Capped/blended rebills reapply their reviewed terms, retain the cap consumed by other live bills, require fresh earning and tax reviews, and preserve original earning evidence; focused public-door tests and 1440/390 journeys assert the supported fee-source path. Offline payment refusal, explicit release to unapplied credit before counsel void, retained original CSV, bounce and credit replay are additionally proved by `tests/satchel/trust-transfer.test.mjs` — “Offline operating receipts allocate once, preserve credit, refuse unauthorized write-offs and release payments before an immutable void”. Gap: correction branches and scheduled nonhourly fee-source voids; billing/finance roles and agent void proposals; provider payment reversals and complete credit management; templates; collection/ledger/portal/payment-link/interest/report and QBO effects. |
| `TRUST-001` | Keep built-in IOLTA client ledgers | target | partial | `src/satchel/trust.ts`; `src/ui/trust.tsx`; `tests/satchel/trust.test.mjs`; `tests/satchel/trust-journey.test.mjs` | Proof gap: Drilling every displayed bank and client total to its source record is not traced by the current aggregate equality alone. |
| `TRUST-002` | Record deposits and disbursements | target | partial | `src/satchel/trust-transactions.ts`; `src/ui/trust-transactions.tsx`; `tests/satchel/trust.test.mjs`; `tests/satchel/trust-journey.test.mjs` | Proof gap: The authorized cleared-disbursement result and visible suspense exception are not each traced alongside the separate-balance assertions. |
| `TRUST-003` | Prevent overdrafts and commingling | target | done | `src/satchel/trust-guards.ts`; `src/satchel/trust-transactions.ts`; `tests/satchel/trust.test.mjs` |  |
| `TRUST-004` | Authorize earned-fee trust transfers | target | partial | `src/satchel/trust-transfers.ts`; `src/satchel/trust-reversals.ts`; `tests/satchel/trust-transfer.test.mjs`; `tests/satchel/trust-transfer-journey.test.mjs` | Native exact reviewed applications, dual officers, reservations, manual bank uncertainty and clearance, paired operating payments and reviewed append-only reversals exist. BILL-001 batch requests and trust-paid issue are now proved by the prebill invoice journey. BILL-009 collection, BILL-010 full client statements and BOOKS-001 accounting sync remain missing; each inherits once-only application and reversal obligations before shipping. |
| `TRUST-005` | Reconcile all three trust views | target | done | `src/satchel/trust-periods.ts`; `src/satchel/trust-reports.ts`; `tests/satchel/trust-period.test.mjs`; `tests/satchel/trust-period-journey.test.mjs`; `tests/satchel/trust-transfer.test.mjs` |  |
| `TRUST-006` | Correct and lock trust history | target | done | `src/satchel/trust-journal.ts`; `src/satchel/trust-periods.ts`; `src/satchel/trust-reports.ts`; `migrations/core/0035_trust_periods.sql`; `tests/satchel/trust-history.test.mjs`; `tests/satchel/trust-period-journey.test.mjs` |  |
| `TRUST-007` | Match banks and legal processor settlements | target | missing |  | Import OFX/QFX or bank CSV statements and connect authorized US bank feeds such as Plaid, matching LawPay/Stripe settlement references without duplicating receipts. Trust and operating feeds remain separate, with unresolved matches and stale-feed status visible. |
| `TRUST-008` | Report trust and replenish retainers | target | partial | `src/satchel/trust-periods.ts`; `src/satchel/trust-reports.ts`; `src/satchel/trust-statement-releases.ts`; `src/satchel/trust-retainers.ts`; `src/satchel/trust-state-records.ts`; `src/ui/trust-periods.tsx`; `tests/satchel/trust-period.test.mjs`; `tests/satchel/trust-history.test.mjs`; `tests/satchel/trust-period-journey.test.mjs` | Client workspace release, statement, balance-alert and replenishment controls with populated 1440 and 390 proof remain missing. Authorized-client balance-alert and state-report delivery, and reviewed field configuration for other states, remain missing. California previews still lack complete CTAPP annual account-registration fields and recorded firm review. New York previews still lack the complete required original-record set, firm review and seven-year preservation proof. Conservative release and replenishment authority, authenticated portal-only delivery, installation-local release authority and applicable retention and disposal semantics await ct approval; TRUST-008 remains partial. |
| `TRUST-009` | Produce checks and deposit records | target | partial | `src/satchel/trust-checks.ts`; `src/satchel/trust-check-operating.ts`; `src/satchel/trust-check-print.ts`; `src/ui/trust-checks.tsx`; `tests/satchel/trust-checks.test.mjs`; `tests/satchel/trust-checks-journey.test.mjs` | Proof gap: Unchanged client ownership and bank matching are not each traced alongside linked check identities and one ledger posting. |
| `TRUST-010` | Transfer trust between one client’s matters | target | partial | `src/satchel/trust-matter-transfers.ts`; `src/satchel/trust-matter-transfer-bank.ts`; `src/satchel/trust-matter-transfer-context.ts`; `src/ui/trust-matter-transfers.tsx`; `tests/satchel/trust-matter-transfer.test.mjs`; `tests/satchel/trust-matter-transfer-journey.test.mjs` | Proof gap: Cross-client and over-cleared-funds refusal outcomes are not individually traced alongside balanced paired entries and reversal. |
| `BOOKS-001` | Synchronize QuickBooks Online operations | target | missing |  | Map clients, matters/classes, operating invoices, payments (processor payments, offline BILL-012 payments and TRUST-004 trust applications, each as one operating payment with its invoice allocations), credits and credit applications, write-offs, reversals, expenses, fees and tax to QuickBooks Online with stable external IDs, direction/ownership settings and conflict queues. Trust liability summaries are explicitly mapped and never mistaken for operating revenue; a trust application never posts as a second deposit or leaves its receivable open. A BILL-016 void voids the matching QuickBooks Online invoice exactly once and each rebill syncs as a new invoice under its new number. |
| `BOOKS-002` | Synchronize Xero operations | target | missing |  | Xero is a supported alternative for contacts, operating invoices, payments, credit notes, expenses and account mappings with idempotent references and reconciliation. A firm chooses one accounting source per entity; trust subsidiary ledgers remain in Satchel. |
| `CONNECT-001` | Expose scoped APIs and webhooks | target | partial | `src/satchel/integrations.ts`; `src/satchel/webhooks.ts`; `docs/integrations.md`; `tests/satchel/integrations.test.mjs`; `tests/satchel/integrations-journey.test.mjs` | Scoped versioned matter/task/document/deadline/finance reads, atomic proposal idempotency, signing, durable delivery journal, rotation and failure pause exist. Resolved-address/pinned egress (Base egress door). Principal-entered destinations currently use the declared HTTPS literal/name public-host rule with Workers fetch and redirects refused; no DNS preflight or application address pin is claimed. |
| `CONNECT-002` | Connect Zapier and Clio APIs | target | missing |  | Zapier triggers/actions and an authorized Clio API connector route external intake and approved case updates through the same validation, conflict and permission doors. Connector status, duplicates, rate limits and revocation are visible without silently dropping work. |
| `CONNECT-003` | Reconcile connector work durably | target | done | `src/satchel/integration-journal.ts`; `src/satchel/webhooks.ts`; `src/ui/connector-journal.tsx`; `tests/satchel/connector-journal.test.mjs`; `tests/satchel/connector-journal-journey.test.mjs` |  |
| `REPORT-001` | Report case status and outcomes | target | done | `src/satchel/reports.ts`; `src/satchel/report-data.ts`; `src/satchel/report-stage-clock.ts`; `src/satchel/report-export.ts`; `src/satchel/matter-lifecycle.ts`; `src/satchel/leads.ts`; `src/satchel/intake-submissions.ts`; `src/ui/reports.tsx`; `migrations/core/0057_matter_outcomes.sql`; `migrations/core/0058_lead_practice.sql`; `tests/satchel/reports.test.mjs`; `tests/satchel/reports-journey.test.mjs`; `tests/satchel/lifecycle.test.mjs`; `tests/satchel/leads.test.mjs`; `tests/satchel/intake.test.mjs` |  |
| `REPORT-002` | Report firm economics | target | partial | `tests/satchel/reports.test.mjs`; `src/satchel/economics.ts`; `migrations/core/0101_economics_cost_rates.sql`; `tests/satchel/providers.test.mjs` | **Gap — complete economics and policy proof:** Workspace economics and cost-approval screens with populated 1440 and 390 evidence; populated aging bucket and processor-pending assertions; additive correction-branch reconciliation; complete historical as-of reconstruction; and public-door proof of the CT principal lifecycle, effective approved cost versions, unknown and aggregate coverage, export marking and custody, outbound exclusion, wall filtering, audit, restore, holds, disposal and erasure-fence riders remain unproved by this ruling. Retain the complete utilization, realization, collection rate, effective rate, billed and unbilled work, WIP, aging, profitability, formulas, approved costs, as-of dates and source-reconciled export target. Broader manager report grants remain under FIRM-008 within its existing non-elevating authority model; this ruling neither implements nor removes them. BILL-010 retains complete historical client statements. Existing evidence references remain claims at the pin, not fresh verification. |
| `REPORT-003` | Schedule actionable reports | target | done | `src/satchel/report-schedules.ts`; `src/ui/report-schedules.tsx`; `migrations/core/0089_report_schedules.sql`; `tests/satchel/report-schedules.test.mjs`; `tests/satchel/report-schedules-journey.test.mjs`; `tests/satchel/client-requests-journey.test.mjs` |  |
| `MOBILE-001` | Complete practice work on phones | target | partial | `src/ui/workspace.tsx`; `src/ui/documents.tsx`; `src/ui/billing.tsx`; `src/site/pages.tsx`; `src/site/docs/source.ts`; `tests/site/navigation.test.mjs`; `tests/satchel/journey.test.mjs` | Responsive web tabs exist; native apps, complete mobile practice flows and WCAG 2.2 AA keyboard, screen-reader and axe checks are absent. Proof gap: Supported iOS and Android native practice work and camera scans remain missing. The published-surface browser proof does not assert every installed tab and role restriction in this combined phone/native clause. |
| `MOBILE-002` | Protect offline work and push alerts | target | missing |  | Explicitly enabled encrypted device caches show freshness and restrict confidential previews; offline time/notes queue visibly and resolve conflicts on reconnect. Push alerts honor confidentiality and device revocation, which removes local authority and cached data when the device reconnects. |
| `MOVE-001` | Preview and reconcile a whole firm move | target | done | `tests/satchel/matter-import.test.mjs`; `tests/satchel/migration-flow.mjs`; `tests/satchel/numbering-journey.test.mjs`; `tests/satchel/migration-journey.mjs` |  |
| `MOVE-002` | Migrate Clio Manage and Grow completely | target | done | `tests/satchel/matter-import.test.mjs`; `tests/satchel/migration-flow.mjs`; `tests/satchel/numbering-journey.test.mjs`; `tests/satchel/migration-journey.mjs`; `tests/satchel/invoice-numbering.test.mjs`; `src/satchel/imports/clio.ts`; `src/satchel/imports.ts`; `tests/satchel/flows.test.mjs` |  |
| `MOVE-003` | Migrate 8am MyCase completely | target | missing |  | Read MyCase Full Backup ZIP/CSV datasets for cases, contacts, tasks, calendars, time, fees, expenses, financial activity and portal/email/SMS history; match separately downloaded documents and invoice PDFs to their index. Include archived cases and use authorized supplemental extraction for omitted originals. |
| `MOVE-004` | Migrate Smokeball completely | target | missing |  | Read Smokeball Data Import/Export ZIP/CSV for staff, contacts, matters, unbilled work, invoices, memos and tasks; obtain document/email files and remaining calendar/trust history through authorized vendor exports or assisted extraction. Map practice-specific fields and AutoTime-derived work without treating export omissions as completed migration. |
| `MOVE-005` | Migrate PracticePanther completely | target | missing |  | Read PracticePanther Excel/XLSX or CSV exports for contacts/custom fields, matters, tasks, time, payments and messages; archive PDF reports as evidence and map document-store originals and additional financial/calendar exports. Guided vendor-assisted extraction closes missing entity coverage before switching off the source. |
| `MOVE-006` | Migrate Filevine completely | target | missing |  | Map Filevine projects, project types, custom sections/collections, contacts, roles, activity, calendar and finance from Data Connector report CSVs or authorized DataBridge/Snowflake extracts, plus separately downloaded Doc Zipping archives. Retain source metadata and identify uncovered fields; buyer-provided access or vendor-assisted extraction fills them. |
| `MOVE-007` | Migrate Eve work and source references | target | missing |  | Bring Eve Word exports with citations, medical overviews and PDF/separate-file demand packages into the correct matters, retaining source references and review state. Obtain available structured history through approved vendor export/API or assisted retrieval, alongside the underlying practice-system move; track unresolved evidence links before cutover. |
| `MOVE-008` | Prove finance and authority at cutover | target | missing |  | For every source distinguish dated opening balances from full historical transactions, reconcile WIP, AR, credits and trust per client/matter/bank, and preserve supporting statements. Reauthorize mail, calendars, processors, accounting, portal users and signature providers; do not import passwords, payment tokens or live sends as authority. Because payment tokens never move, cutover runs a guided re-consent campaign: Satchel lists every client with an active source payment plan or saved-card autopay (including Clio Payments plans) with its next installment date, sends each an authorized re-authorization link under LawPay or Stripe through CLIENT-006 or CLIENT-005, keeps each imported BILL-008 plan paused with an owner task due before its next installment, and resumes the plan only on the client’s recorded consent. |
| `AGENT-001` | Build evidence-closed matter plans | push-further | missing |  | The matter agent reads permitted engagement terms, orders, correspondence, records and workflow dependencies to maintain an editable obligations map with milestone, evidence needed, owner, next due action and completion criteria. Legal interpretation carries commitment under the company’s policy; no milestone closes because a job merely ran. |
| `AGENT-002` | Chase authorized evidence to acceptance | push-further | missing |  | Within a delegated recipient/channel/time/contact budget, the agent requests missing client/provider records, handles replies and routine calls through contracted Twilio/voice services, files returned originals and records sufficiency decisions as commitment under the company’s policy. Expired authority, failed contact, legal uncertainty or a limit stops and escalates. |
| `AGENT-003` | Explain deadline changes before propagation | push-further | partial | `src/satchel/deadlines.ts`; `src/satchel/proposals.ts`; `tests/satchel/flows.test.mjs` | Source-linked proposals and supersession exist; extraction, provider comparison, dependent scheduling and acknowledgment are missing. |
| `AGENT-004` | Draft substantive work with verified sources | push-further | missing |  | Using authorized matter evidence, approved templates and licensed research access such as Westlaw, LexisNexis or vLex, the agent drafts demands, complaints, discovery, deposition outlines and responses. Each factual/legal proposition links to source version/page or licensed authority; unsupported assertions remain flagged and external work carries external and commitment under the company’s policy. |
| `AGENT-005` | Review active matters every night | push-further | missing |  | A scheduled agent checks permitted active matters for missing evidence, treatment/billing gaps, approaching limitations, stalled work and inconsistent facts, producing ranked next actions with exact sources and a responsible person. Counsel tunes practice-specific policy, suppresses false positives and chooses execution scope. |
| `AGENT-006` | Reconcile matter work to collected cash | push-further | missing |  | The agent joins permitted document/email activity, confirmed time, fee agreements, costs, bills, settlements and books to find unbilled work or payment mismatches. Timekeepers confirm billability, counsel reviews bills and finance decisions carry money under the company’s policy; the agent pursues only approved collection actions. |
| `AGENT-007` | Keep client promises through delivery | push-further | missing |  | From approved updates the agent extracts a reviewed promise and date, tracks underlying tasks and evidence, prompts the owner before a miss and prepares the next source-cited update. Wording, privilege and recipient decisions carry commitment and external under the company’s policy; delivery and replies are reconciled before the promise closes. |
| `AGENT-008` | Coordinate milestones with billing and collection | push-further | missing |  | The agent coordinates editable practice workflows across accepted evidence, confirmed deadlines, reviewable deliverables, earned billing and authorized collection until each milestone’s legal and financial conditions are satisfied. It keeps separate owners and approvals, durable attempts and stop controls; a payment never substitutes for unfinished legal work. |
| `AGENT-009` | Measure recovered work and agent decisions | push-further | missing |  | Principals inspect completed milestones, recovered billable work, time saved using a disclosed baseline, overdue reductions, source accuracy and human overrides. Every recommendation shows data used, policy/model revision and decision; metrics never reward false completion or expose walled matters. |
| `AGENT-010` | Constrain agent data and execution | push-further | partial | `tests/satchel/flows.test.mjs`; `tests/satchel/agent-execution-flow.mjs`; `tests/satchel/journey.test.mjs`; `tests/satchel/agent-execution-browser.mjs`; `tests/satchel/custom-roles.test.mjs` | Native agreement state, reviewed source entitlements, bounded zero-spend preparations, durable jobs, revocation, redacted context and retained history are proved. Recorded interim implementation: principal-approved native preparation, sponsor recipient, no training and no outbound execution. Full scoped delegation and provider boundaries await ct approval; server-computed classes and company-policy decisions remain missing. |
| `SURFACE-001` | Publish the legal-practice tool registry | target | missing |  | The MCP registry, server-computed classes, company-policy integration and conformance journey for these outcomes are absent. |
| `SURFACE-002` | Compute work and communication classes | target | missing |  | The MCP registry, server-computed classes, company-policy integration and conformance journey for these outcomes are absent. |
| `SURFACE-003` | Compute authority and operation classes | target | missing |  | The MCP registry, server-computed classes, company-policy integration and conformance journey for these outcomes are absent. |
| `SURFACE-004` | Link matter resources and specialist handoffs | target | missing |  | The MCP registry, server-computed classes, company-policy integration and conformance journey for these outcomes are absent. |
| `SURFACE-005` | Run a seeded practice week through MCP | target | missing |  | The MCP registry, server-computed classes, company-policy integration and conformance journey for these outcomes are absent. |
