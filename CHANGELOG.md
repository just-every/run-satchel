# Changelog

## Unreleased

- Pin RER 0.2.30: the hosted demo runs on the native Worker Loader host (each visitor gets an isolate with its own SQLite storage); vendored Base copies refreshed from `rer-v0.2.30`.
- Apply Satchel’s picked paper, cognac leather and brass style across the run site, sign-in, setup and workspace.
- Add a static run site with local run instructions and Markdown owner guides; keep the installed Lobby.
- Pin RER 0.2.20 and add a run-site workflow with deployment disabled until the release gate enables it.

## 28 October 2026 — Contract evidence provenance

These inherited descriptions record prior judgments. Current acceptance and status live only in CONTRACT.md.

SAT-001 evidence record: `src/satchel/team.ts`; `src/satchel/session.ts`; `tests/satchel/flows.test.mjs`

SAT-002 evidence record: `src/satchel/matters.ts`; `tests/satchel/flows.test.mjs`; `tests/satchel/numbering.test.mjs`

SAT-003 evidence record: `src/satchel/model.ts`; `src/satchel/matters.ts`; `tests/satchel/flows.test.mjs`

SAT-004 evidence record: `src/satchel/billing.ts`; `tests/satchel/flows.test.mjs`

SAT-005 evidence record: `src/satchel/billing.ts`; `tests/satchel/flows.test.mjs`

SAT-006 evidence record: `src/satchel/billing-corrections.ts`; `src/satchel/billing.ts`; `tests/satchel/flows.test.mjs`

SAT-007 evidence record: `src/satchel/documents.ts`; `tests/satchel/flows.test.mjs`

SAT-008 evidence record: `src/satchel/deadlines.ts`; `tests/satchel/flows.test.mjs`

SAT-009 evidence record: `src/satchel/proposals.ts`; `src/satchel/team.ts`; `tests/satchel/flows.test.mjs`

SAT-010 evidence record: `src/satchel/imports/clio.ts`; `src/satchel/imports.ts`; `tests/satchel/flows.test.mjs`

SAT-011 evidence record: `src/satchel/archive.ts`; `src/satchel/archive-policy.mjs`; `tests/satchel/flows.test.mjs`

SAT-012 evidence record: `src/satchel/archive.ts`; `tests/satchel/flows.test.mjs`

SAT-013 evidence record: `src/site/pages.tsx`; `src/site/docs/source.ts`; `src/ui/workspace.tsx`; `tests/site/navigation.test.mjs`; `tests/satchel/journey.test.mjs`

OSS-001 evidence record: `LICENSE`; `README.md`; `docs/free-and-providers.md`; `src/satchel/providers.ts`; `src/ui/providers.tsx`. `docs/free-and-providers.md` — “LICENSE, homepage, run page, README and owner guides agree: MIT, free Satchel software, self-hosting and direct provider billing” (the MIT LICENSE; the homepage’s free and open-source claims and own-computer-or-server run line; /run’s MIT license and run command; README and the owner guide: no license fee, subscription, paywall, seat charge or matter limit, and providers bill the firm directly, so “100% free” describes Satchel software only; no price, plan, trial or license-key text on the homepage or /run). `tests/satchel/fresh-install.mjs` is the fresh-installation journey run outside push Verify: the published rer dev start on a fresh clone, then firm settings, a conflict-reviewed matter, a time entry and a prepared bill in a browser with no payment, plan or license prompt and no external host contacted (receipt oss-001-fresh-install.txt, sx-satchel-c37). `tests/satchel/providers.test.mjs` — “Correspondence rechecks provider review, portal authority, counsel permission and matter access at send” (principal-only provider review, explicit confirmation, secure terms addresses, audit and archive retention). `tests/satchel/providers-journey.test.mjs` — “OSS-001 provider charges: disclosure, terms review and no payment prompt at 1440px / 390px” (every tab shows no payment, plan or license prompt and no icon-only control; the Provider charges panel lists each provider and records a review). `tests/satchel/followups.test.mjs` — “INTAKE-008 consented bounded follow-ups …” (mail sending is refused until the firm’s provider review is recorded). Satchel software is free; providers bill the firm directly under their own terms and Satchel adds no charge or markup to them.

FIRM-001 evidence record: `src/satchel/firm.ts`; `src/ui/firm.tsx`; `migrations/core/0025_firm.sql`; `tests/satchel/flows.test.mjs`

FIRM-002 evidence record: `src/satchel/role-doors.ts`; `src/satchel/portal.ts`; `src/satchel/team.ts`; `migrations/core/0079_firm_roles.sql`; `tests/satchel/roles.test.mjs` — “FIRM-002 each built-in role reaches only its own legal, billing, trust, reconciliation, access and portal doors” (principal, lawyer, assistant, trust officer, billing staff, accountant and client through direct APIs: legal approval, invoice issue/export, trust authorization and transfer, accountant reconciliation, membership/access changes, portal sharing and withdrawal, role-change agent-key refusal, audit roles); `tests/satchel/roles-journey.test.mjs` — “FIRM-002 the principal adds finance and client roles and shares one matter with a client” at 1440 and 390

FIRM-003 evidence record: `tests/satchel/flows.test.mjs` — “ethical walls exclude a principal from current doors and require expiring audited custodian access” (principal creation; principal self-add, member change, custodian change, dissolution and self-approval refused; valid agent/integration credentials refused requesting/using grants; active person grant opens the matter but never whole-firm archives; no renewal; membership and inside-lawyer handover revoke grants; inactive custodian closes existing grants and new requests; inside counsel takes custody; reasoned dissolution/re-establishment; request/decision/read/expiry/revocation audit; restart/archive recovery). `tests/satchel/wall-expiry.mjs` is the separate real sixty-minute public-door journey: minute 1–59 reads succeed, read after minute 60 is refused, recipient expiry stays fixed, and one expiry action is audited; run on the exact candidate outside push Verify. `tests/satchel/contacts-journey.test.mjs` — “ethical wall creation, opaque conflict route, custodian decision and revocation” at 1440/390 (creation, opaque principal route, decision/trace, temporary access/revocation, inside handover, unassigned recovery, reasoned dissolution). `tests/satchel/trust.test.mjs` — “TRUST-001 reviewed source openings maintain separate bank, client/matter and operating records in exact cents; archives preserve approvals” (excluded balances). `tests/satchel/reminders.test.mjs` — “CAL-007 reassignment, quiet hours, acknowledgment and access revocation fence future sends without hiding delivery history” (recipient/queued-send exclusion).

FIRM-004 evidence record: `tests/satchel/flows.test.mjs` — native authentication, MFA, device revocation, role denial, CSRF and matter membership; `tests/satchel/security-flow.mjs` — secureSessions; `tests/satchel/microsoft-security-flow.mjs` — proveMicrosoftSecurity; `tests/satchel/connector-journal-journey.test.mjs` — secureConnectionJourney at both widths; `tests/satchel/microsoft-live.mjs` — held-tenant token, directory read and revoked queue

FIRM-005 evidence record: `tests/satchel/audit.test.mjs` — “FIRM-005 filters and exports complete native transfer/approval snapshots, immutable roles and provider-policy outcomes; unauthorized readers are refused” proves filtering, transfer and approval snapshots, immutable roles, provider outcomes, reminder policy, complete streamed export and authorization; “FIRM-005 imported legacy audit keeps every original field byte-exact and labels unrecorded metadata without inventing roles” proves legacy preservation. `tests/satchel/audit-journey.test.mjs` — “FIRM-005 filter, inspect source/decision and download the transfer action audit at 1440px” and “at 390px” prove inspection and export. `tests/satchel/rates.test.mjs` and `tests/satchel/rates-journey.test.mjs` (TIME-003 tests named below) prove every emitted budget alert has an immutable exported actor, budget revision, source entry, policy and outcome, with wall fencing, restart, archive restore and 1440/390 inspection/download. `tests/satchel/invoice-numbering.test.mjs` proves concurrent released-entry edit and move crossings record once. `tests/satchel/flows.test.mjs` — “FIRM-001 and archive integrity: empty destination, later erasure journal, complete restoration with firm settings provenance” proves restored rows and appended custody evidence.

FIRM-006 evidence record: `src/satchel/retention.ts`; `src/satchel/document-sets.ts`; `src/satchel/archive.ts`; `src/ui/retention.tsx`; `migrations/core/0026_retention.sql`; `tests/satchel/flows.test.mjs`

FIRM-007 evidence record: `src/satchel/archive.ts`; `src/satchel/archive-policy.mjs`; `README.md`

FIRM-008 evidence record: `src/satchel/custom-roles.ts`; `src/satchel/role-areas.ts`; `src/satchel/role-redaction.ts`; `src/satchel/team.ts`; `src/satchel/report-data.ts`; `migrations/core/0080_custom_roles.sql`; `tests/satchel/custom-roles.test.mjs` — “FIRM-008 custom roles narrow rates, reports and exports on every door at the next request and are audited” (own-rate assistant across billing list, bill lines, rate agreements, timesheet, report, export and IOLTA register routes; refused trust-authorization and legal-approval roles; widening and removal at the next request; own-matter report scope across every row, count, option and CSV; audit of both role changes and the assignment) and “FIRM-008 custom roles gate bank, contacts, documents, settings, agent keys and every listed door without conferring authority” (balances-only and none bank, full-access role on a non-officer, read and none areas, agent-key ceiling, every listed door assigned to an area); `tests/satchel/roles-journey.test.mjs` — “FIRM-008 the principal defines, assigns and widens a custom role” at 1440 and 390

BASE-001 evidence record: `src/auth.server.ts`; `src/satchel/archive.ts`; `src/satchel/archive-policy.mjs`; `tests/satchel/flows.test.mjs`

INTAKE-001 evidence record: `src/satchel/intake-forms.ts`; `src/satchel/intake-submissions.ts`; `src/satchel/intake-files.ts`; `src/ui/intake-public.tsx`; `src/ui/intake-admin.tsx`; `migrations/core/0050_intake.sql`; `tests/satchel/intake.test.mjs`; `tests/satchel/intake-journey.test.mjs`

INTAKE-002 evidence record: `src/satchel/leads.ts`; `src/satchel/lead-report.ts`; `src/ui/leads.tsx`; `migrations/core/0049_leads.sql`; `tests/satchel/leads.test.mjs`; `tests/satchel/leads-journey.test.mjs`

INTAKE-003 evidence record: `src/satchel/consult-slots.ts`; `src/satchel/consultations.ts`; `src/satchel/consult-public.ts`; `src/ui/consultations.tsx`; `src/ui/booking-public.tsx`; `migrations/core/0083_consultations.sql`. `tests/satchel/consultations.test.mjs` — “INTAKE-003 prospects book approved availability across timezones: last slot, a race, reschedule, cancel, fee, reminders, one appointment and the linked intake record” (approved weekly windows in the offer timezone, shown in the prospect’s timezone; buffers; the last slot raced by two prospects gives one appointment and one refusal; reschedule from another timezone and prospect or lawyer cancellation keep one appointment with history; fee disclosed, acknowledged and recorded as due; one lead assigned to the responsible lawyer and one immutable intake record; consented reminders move with the booking). `tests/satchel/consultations-journey.test.mjs` — “INTAKE-003 / INTAKE-008 prospect books, moves and opts out; staff see the consultation, consent and stopped sequence at 1440px / 390px”. `tests/satchel/consultations.test.mjs` — “Consultations and matter appointments cannot win the same lawyer interval, including a calendar move racing reschedule” proves transactional calendar exclusion in both directions; “A signed consultation manage link expires at the appointment start and cannot read or cancel after expiry” proves real-time expiry at the public read, cancel and reschedule doors. The existing named booking test now asserts fee amount, acknowledgment wording, version and time, separate email consent wording, version and time, no consent for an unchecked booking, tampered-token refusal, one-booking scope and content minimization; the existing named browser journey asserts the unchecked separate reminder box and relationship disclaimer at both widths. Approved riders (ct, 23 October 2026, as supplied): fee line states amount and "due at the consultation, nothing is collected here" with acknowledgment recorded with wording version and time; reminder consent separate, unchecked, recorded with wording and time, email only; manage link unguessable, signed, expiring, scoped to that one intake, page and mail show no matter or privileged content; intake copy says submitting creates no attorney-client relationship (counsel's final wording). The principal or responsible lawyer approves the public offer and its review wording. The form separately discloses that submitting creates no attorney-client relationship. Fee acknowledgment and email-only reminder consent retain their exact wording, version and time. No payment is collected; BILL-001 inherits online fee collection. Manage authority is a keyed, unguessable token for one consultation and expires at its start or 91 days after booking, whichever is earlier; no inquiry answers, lead details or matter content appear on that page or in reminder mail. Booking and rescheduling validate the append-only calendar snapshot inside their own transaction; matter booking and occurrence moves also fence booked consultation intervals.

INTAKE-004 evidence record: `src/satchel/contacts.ts`; `src/satchel/contact-merge.ts`; `src/ui/contacts.tsx`; `tests/satchel/contacts.test.mjs`; `tests/satchel/contacts-journey.test.mjs`

INTAKE-005 evidence record: `tests/satchel/contacts.test.mjs` — “INTAKE-004 INTAKE-005 imported insurer aliases retain every source, relationship, matter role, consent and conflict snapshot through reviewed merge and restore” (counts, aliases, related entities, current/former roles, local closed year, review and recovery), and “whole-firm conflict labels, opaque principal and wall routes, closed dispositions, structured waivers and enforced exclusions survive recovery” (lead/staff labels, principal routes, all four dispositions, waiver parties/date/scope/match, exclusions, staleness, authority, archive, hold/disposal and restore fence); `tests/satchel/contacts-journey.test.mjs` — “INTAKE-004 INTAKE-005 maintain merged identities and review a former client conflict” and “whole-firm counsel review resumes after private custodian action and carries original waivers and engagement restrictions” at 1440/390 (public screens and native principal/custodian reviews); `tests/satchel/contacts.test.mjs` — “whole-firm conflict labels, opaque principal and wall routes, closed dispositions, structured waivers and enforced exclusions survive recovery” also proves expired-schedule/hold/principal/typed-confirmation restrictions on payload disposal, immutable attribution and original audit digests, retained staff exclusion, replay refusal and old-archive restore fence; the matching “whole-firm counsel review resumes after private custodian action and carries original waivers and engagement restrictions” journey proves held refusal and disposal at 1440/390

INTAKE-010 evidence record: `tests/satchel/contacts.test.mjs` — “whole-firm conflict labels, opaque principal and wall routes, closed dispositions, structured waivers and enforced exclusions survive recovery”; `tests/satchel/flows.test.mjs` — “ethical walls exclude a principal from current doors and require expiring audited custodian access”; `tests/satchel/contacts-journey.test.mjs` — “ethical wall creation, opaque conflict route, custodian decision and revocation” and “whole-firm counsel review resumes after private custodian action and carries original waivers and engagement restrictions” at 1440/390; `tests/satchel/contacts.test.mjs` — “whole-firm conflict labels, opaque principal and wall routes, closed dispositions, structured waivers and enforced exclusions survive recovery” additionally proves mixed visible/walled contact roles, one opaque route covering multiple same-custodian walls, every source in the private custodian review, secondary-wall staleness, inactive-custodian routing/opening refusal, custodian-recorded structured waiver then opening, explicit/default lawyer-custodian screen creation, and private notes/waivers absent from conflict reviews, referral lists, contacts, state, notifications, reports/CSV, audit/streamed export and agent context

INTAKE-007 evidence record: `src/satchel/leads.ts`; `src/ui/leads.tsx`; `tests/satchel/leads.test.mjs`; `tests/satchel/leads-journey.test.mjs`

INTAKE-008 evidence record: `src/satchel/followups.ts`; `src/satchel/followup-worker.ts`; `src/satchel/followup-links.ts`; `src/ui/followups.tsx`; `migrations/core/0082_followups.sql`. `tests/satchel/followups.test.mjs` — “INTAKE-008 consented bounded follow-ups: authority, consent, quiet hours, contact limit, reply/opt-out/conflict/decline stops, restart and merge never supply consent” (the principal alone enables a sequence, and only after the mail provider review; SMS refused; no consent, no sequence; a merge supplies no consent; quiet hours hold a message; the contact limit defers one; a reply after the first message stops later sends across a worker restart and leaves the next action and responsible person on the lead; opt-out link, conflict stop and decline each stop it). `tests/satchel/consultations-journey.test.mjs` at 1440px / 390px (consent and sequence on the lead, the stopping outcome and owner, the prospect’s opt-out page).

MATTER-001 evidence record: `src/satchel/matter-types.ts`; `src/satchel/matter-fields.ts`; `src/ui/matter-fields.tsx`; `migrations/core/0045_matter_types.sql`; `tests/satchel/matter-types.test.mjs`; `tests/satchel/matter-types-journey.test.mjs`

MATTER-002 evidence record: `src/satchel/matter-stages.ts`; `src/satchel/matter-stage-state.ts`; `src/ui/matter-stages.tsx`; `src/ui/matter-board.tsx`; `tests/satchel/stages.test.mjs`; `tests/satchel/stages-journey.test.mjs`

MATTER-003 evidence record: `src/satchel/tasks.ts`; `src/ui/tasks.tsx`; `migrations/core/0041_tasks.sql`; `tests/satchel/tasks.test.mjs`; `tests/satchel/tasks-journey.test.mjs`

MATTER-004 evidence record: `src/satchel/workflows.ts`; `src/satchel/workflow-runs.ts`; `src/ui/workflows.tsx`; `migrations/core/0048_workflows.sql`; `tests/satchel/workflows.test.mjs`; `tests/satchel/workflows-journey.test.mjs`

MATTER-005 evidence record: `src/satchel/matter-notes.ts`; `src/satchel/timeline.ts`; `src/ui/timeline.tsx`; `migrations/core/0084_matter_notes.sql`; `src/ui/client-portal.tsx`. `tests/satchel/timeline.test.mjs` — “MATTER-005 a matter timeline merges notes, calls, commitments, filed email, documents, tasks, deadlines, bills and payments; private notes reach only their author, clients see only what was shared” (a private strategy note and a shared progress note; a call mentioning the assistant; an internal commitment; a filed .eml, task, appointment, confirmed deadline, bill and operating payment, newest first with source links; the principal and assistant never receive the private note; filters by kind, text, dates and mentions of the reader; scoped mentions refused for people who cannot see the matter and for private notes; assistants cannot share with the client; the client timeline holds only entries a lawyer shared; private notes are neither a search result, count nor snippet for anyone else; a withdrawn grant, a wall and the firm archive). `tests/satchel/timeline-journey.test.mjs` — “MATTER-005 a lawyer records private and shared notes, files an email and reads the timeline; the client sees only the shared update at 1440px / 390px”. The same test also proves the filed email’s exact original is accessible through its source door, an ordinary document has its own source link and a scoped mention sends no notification. The same named timeline API test asserts that corrections preserve original text across restart, identify the original only to a reader allowed to see it, and reveal no private original identifier or title to the client or principal. The named timeline journey creates a correction through the existing entry form and shows its retained-original link in staff and client views at 1440 and 390. Approved defaults (ct, 23 October 2026): a private note is readable by its author alone, not even the principal (the principal-only firm archive still contains it); a team entry is readable by everyone who sees the matter; nothing reaches the client unless the principal or a lawyer marks that team entry client-visible when writing it; entries and corrections are append-only; a mention only names a person who can already see the matter and grants nothing; no notification is sent for a mention. Connected Outlook and Gmail email (DOC-008 and DOC-009) and client commitments with due dates (CLIENT-001) inherit this timeline and its private-note and client fences. Approved riders supplied 24 October 2026. The named timeline API assertion proves widening adds an audited entry and retains the private original, entry edits and deletion refused, and principal-only audited archive export retaining the private note after author departure under an active legal hold. Ct verdict of 24 October 2026 at 18:28 UTC: DONE justified; all existing timeline acceptance evidence retained.

MATTER-006 evidence record: `src/satchel/workload.ts`; `src/ui/workload.tsx`; `migrations/core/0042_handoffs.sql`; `tests/satchel/workload.test.mjs`; `tests/satchel/workload-journey.test.mjs`

MATTER-007 evidence record: `src/satchel/matter-lifecycle.ts`; `src/satchel/matter-closure-checks.ts`; `src/ui/matter-lifecycle.tsx`; `tests/satchel/lifecycle.test.mjs`; `tests/satchel/lifecycle-journey.test.mjs`

MATTER-008 evidence record: `tests/satchel/numbering.test.mjs`; `tests/satchel/matter-import.test.mjs`; `tests/satchel/numbering-journey.test.mjs`

MATTER-009 evidence record: `src/satchel/search.ts`; `src/ui/search.tsx`; `tests/satchel/flows.test.mjs` — “grouped firm search applies current record doors before results, counts and snippets” (client surname across grouped matters, contacts, source-linked annotation notes, tasks, events, document/email metadata, invoices and operating payments; matter/case numbers and retained contact aliases; assignment, custom-role and ethical-wall filtering before counts or snippets; private-original refusal; immediate erasure/access-loss effects; restart and native archive recovery). `tests/satchel/search-journey.test.mjs` — “MATTER-009 one search box: grouped keyboard results, matter and case numbers, unassigned and walled-out people see nothing at 1440px / 390px” (the workspace box, “/” to focus, grouped results for a client surname, arrow-key navigation with wrap, Enter opening the record’s screen with its matter, matter and case numbers, Escape; an unassigned assistant and a walled-out principal receive no group, count, title or snippet; the list stays inside the phone viewport; no icon-only control). `tests/satchel/numbering-journey.test.mjs` retains the existing matter-register UI proof. Inherited by future doors: MATTER-005 standalone notes and DOC-008/009 connected email inherit the same search fences when they ship; DOC-003 supplies document and email full text.

DOC-001 evidence record: `src/satchel/documents.ts`

DOC-002 evidence record: `src/satchel/documents.ts`; `src/satchel/document-review.ts`; `src/ui/document-preview.tsx`; `src/ui/office-preview.tsx`; `src/ui/document-review.tsx`; `migrations/core/0065_document_review.sql`; `tests/satchel/document-preview.test.mjs`

DOC-004 evidence record: `src/satchel/document-sets.ts`; `src/ui/document-sets.tsx`; `tests/satchel/document-sets.test.mjs`; `tests/satchel/document-sets-journey.test.mjs`

DOC-006 evidence record: `src/satchel/assembly.ts`; `src/satchel/assembly-template.ts`; `src/satchel/assembly-formats.ts`; `src/ui/assembly.tsx`; `tests/satchel/assembly.test.mjs`; `tests/satchel/assembly-journey.test.mjs`

DOC-012 evidence record: `tests/satchel/document-sets.test.mjs` — “native medical chronology requires health setup, pins source pages, reconciles overlapping bills only on counsel review, and erases its derivatives”: (1) explicit authorization and agreement setup, principal-only processing and private principal-uploaded original versions; (2) automatic extraction of provider, service date, treatment, integer-cent charges, source hash, version, page and reported totals from a real treatment PDF and overlapping bill; (3) record intervals, duplicate candidates, gross and discrepancy totals with no automatic exclusion; (4) exact-snapshot publication refusal until counsel resolves every candidate; (5) unreadable-page refusal without a partial save, separately preserved originals, restart, native archive recovery and derivative disposal. `tests/satchel/document-sets-journey.test.mjs` — “medical chronology setup, source-page review, duplicate decisions and counsel publication at 1440px” and the matching 390px journey prove setup, selection and native PDF extraction, source-page links, interval and discrepancy review, explicit duplicate decisions and published totals through built screens with labelled controls. Implementation: `src/satchel/document-chronologies.ts`; `src/satchel/chronology-pdf-text.ts`; `src/satchel/chronology-extraction.ts`; `src/ui/document-chronologies.tsx`.

DOC-013 evidence record: `tests/satchel/document-sets.test.mjs` — “controlled production pins originals, removes whole-page content, freezes exact Bates and privilege artifacts, and fences approval, export, recall and erasure”: (1) selected immutable versions, privilege labels, withholding, manifest, privilege log, Bates ranges and separately preserved originals; (2) exact-hash counsel approval and principal authorization of each exact packet release to one named native account; (3) authenticated byte-identical recipient download and durable hash, size and delivery receipt, with anonymous, other-recipient, wrong-hash, wrong-recipient and onward-action refusals; (4) actual expiry, unopened-only recall and retained opened disclosure audit; (5) travelling hold labels, refusal after new holds or loss of authorizer access, erasure, restart and archive recovery requiring fresh external authorization. `tests/satchel/document-sets-journey.test.mjs` — “controlled evidence production selective redaction, recipient delivery and recall at 1440px” and the matching 390px journey prove selective page rendering, removal of source text, metadata and attachments, manifest and privilege review, exact approval, explicit recipient invitation and release, authenticated matching ZIP bytes, recall and delivery receipts through built screens with labelled controls. Implementation: `src/satchel/document-productions.ts`; `src/satchel/production-shares.ts`; `src/ui/document-productions.tsx`; `src/ui/production-releases.tsx`; `src/ui/production-recipient.tsx`; `src/ui/production-rendering.ts`; `migrations/core/0106_production_shares.sql`.

CAL-001 evidence record: `src/satchel/appointments.ts`; `src/ui/calendar.tsx`; `migrations/core/0039_appointments.sql`; `tests/satchel/calendar.test.mjs`; `tests/satchel/calendar-journey.test.mjs`

CAL-006 evidence record: `src/satchel/deadlines.ts`; `tests/satchel/flows.test.mjs`

CAL-007 evidence record: `tests/satchel/reminders.test.mjs`; `tests/satchel/reminder-journey.test.mjs`

CAL-008 evidence record: `tests/satchel/agenda.test.mjs` — “CAL-008 firm agenda shows overlapping hearings, an unconfirmed limitation date, owners and absence coverage, and exports source and confirmation columns” proves conflicts, unconfirmed proposals, owners, absence privacy, coverage without access, next actions, matter scoping and audited CSV; private-source limitations within and beyond the agenda range appear only to their creator or principal. `tests/satchel/agenda-journey.test.mjs` — “CAL-008 view overlapping hearings and an unconfirmed limitation date, assign coverage and export the agenda at 1440px” and “at 390px” prove the Calendar flow and private-source exclusion for another matter reader.

CLIENT-001 evidence record: `src/satchel/portal.ts`; `src/satchel/client-shares.ts`; `src/satchel/portal-preview.ts`; `src/ui/client-portal.tsx`; `src/ui/client-shares.tsx`; `migrations/core/0086_portal_identities.sql`. `tests/satchel/portal-identities.test.mjs` — “CLIENT-001 two co-clients, a payer and a delegate each reach only their own portal doors, direct file URLs obey every identity, and staff preview what each sees” (principal-only grants of client, co-client, payer and delegate kinds with a delegate bound to a granted client; a matter-visible release shared by counsel, never a private document; direct file URLs return the exact original to both co-clients and a live delegate and are refused to the payer, a stranger, staff and the unauthenticated; the payer reads only issued invoices and their PDFs; co-clients share the client view, while delegates do not; staff preview each identity through that identity’s own doors, audited; revoking the delegate closes their URLs at once while the client keeps access; withdrawing the client closes the delegate while the co-client keeps theirs; archive). `tests/satchel/portal-threads.test.mjs` — direct message and attachment URLs for a client, co-client, live delegate, payer and stranger; `tests/satchel/portal-identities-journey.test.mjs` — “CLIENT-001 the principal invites co-clients, a payer and a delegate, shares a release and previews each identity; each portal shows only its own doors at 1440px / 390px”.  The identity test and journey invite two distinct co-clients. Preview includes the current timeline, shares, invoices, message threads and document requests through the identity’s own doors without changing unread state; deactivating the represented client closes the delegate and its preview. The same named identity API test asserts that a newly created ethical wall hides the matter from every portal identity, closes every existing portal collection door, shared-file URL and issued-invoice PDF URL, and returns no portal content in the custodian preview; a principal excluded by the wall cannot preview it. Grant, withdrawal and preview audit writes recheck matter authority in their transaction; a delegate grant also rechecks the represented active client. Direct message and attachment URLs for each identity are exercised in `tests/satchel/portal-threads.test.mjs` (CLIENT-002) beside the file URLs here. Approved defaults (ct, 23 October 2026): only the principal grants and withdraws portal access, one identity kind per person per matter; a co-client reads the same shared items as the client; a payer reads only the matter’s issued invoices and their PDFs; a delegate acts for one named client and has access only while that client’s grant and the delegate’s own are active, and cannot see invoices; clients, co-clients and payers see issued invoices; delegates do not; staff previews run the identity’s own doors and are audited; there is no portal search door and notifications expose no internal notes, other clients or privileged drafts; CLIENT-002 owns minimal message-waiting notifications after a recorded provider review. Approved riders supplied 24 October 2026. The named identity API assertion proves grant and revocation audit rows with actor and time, principal-visible staff preview audits, payer refusals including redacted matter metadata in the portal index, co-client parity including issued invoices and their PDFs, and delegate access ending with the client grant; the named identity journey proves the joint-access privilege warning on the grant screen at 1440 and 390. The same named identity API test excludes draft and approved but unissued invoices from the payer list and refuses their direct PDF URLs. It exercises the direct thread-open API for the client, both co-clients and a live delegate; refuses the payer, stranger, staff and unauthenticated caller; and refuses deactivated clients, withdrawn delegates, delegates whose represented client was withdrawn, and every portal identity behind an ethical wall.

CLIENT-002 evidence record: `src/satchel/portal-threads.ts`; `src/ui/portal-threads.tsx`; `src/ui/client-portal.tsx`; `migrations/core/0087_portal_threads.sql`. `tests/satchel/portal-threads.test.mjs` — “CLIENT-002 a confidential attachment, a client reply, the retained thread, read states, the unread queue and notifications that carry no content” (staff start a thread with a confidential attachment; the notification email to each reader names no subject, body or file and says it contains no message content, a missing mail review records not sent, the payer receives none; per-person read state and delivery and notification state; the exact attachment bytes only to readers and the assigned staff; the client’s reply with an attachment reaches the assigned staff’s unread queue and not an unassigned assistant’s; reassignment, retained append-only thread in the firm archive; a withdrawn grant or client closes the portal reader’s and delegate’s message and attachment URLs). `tests/satchel/portal-threads-journey.test.mjs` — “CLIENT-002 staff send a confidential attachment, the client reads and replies in the portal, and the emails carry no content at 1440px / 390px”. The same test also proves attachment limits, refusal to assign inaccessible staff, retained messages across restart and suppression of notifications when assigned staff lose matter access; reassignment restores visible unread ownership. CLIENT-006 retains the Gap for mail-provider delivery and bounce events. The same named thread API test asserts that uncertain notification outcomes preserve the confidential message and uncertainty across restart without an automatic resend, opening an already read message adds no duplicate read receipt, and a withdrawn reader cannot open or reply through the direct thread URL. Staff and portal read receipts recheck current access in the write transaction. Approved defaults (ct, 23 October 2026): only staff start a thread and a client replies; its participants are the matter’s portal readers (client, co-client, a live delegate, never a payer) and the thread’s assigned staff, and an assistant sees only threads assigned to or started by them; a notification email is sent only after the principal records the mail provider review, only says that a message is waiting, and records provider acceptance (not delivery); attachments are at most three per message and 1 MiB each, shown only inside the authenticated portal or staff workspace; messages are never edited or deleted. Provider delivery and bounce events await CLIENT-006. Approved riders supplied 24 October 2026. The named thread API assertion proves client-started threads refused, content-free mail subject and body with no matter name, the fourth attachment and 1 MiB plus one byte refused, disallowed types and unscanned or unparseable bytes refused on staff sends and client replies, and payer thread reads refused. Native attachments are restricted to UTF-8 plain-text .txt files, parsed and safety-screened by the server on writes and downloads; binary formats remain refused pending a trusted scanner and parser. Client-supplied scan claims grant no authority. This is a text safety screen, not an antivirus certification. The same named thread API test refuses PATCH, PUT, DELETE and direct edit and delete actions on message URLs for the principal, lawyer, assigned assistant, client, co-client and delegate, then compares both original message bodies and attachment references unchanged.

CLIENT-003 evidence record: `src/satchel/workflow-runs.ts`; `src/ui/workflows.tsx`; `tests/satchel/workflows.test.mjs`; `tests/satchel/workflows-journey.test.mjs`; `src/satchel/client-requests.ts`; `src/ui/client-requests.tsx`; `migrations/core/0088_client_requests.sql`. `tests/satchel/client-requests.test.mjs` — “CLIENT-003 two records are requested, an incomplete upload is explained, a corrected one is accepted and filed, and the second request stays due” (specific records with instructions, owner, due date and acceptance criteria; only staff ask; the portal readers see shared requests and the payer, a stranger and unshared requests are refused; an incomplete upload is marked deficient with a reason and a permitted clarification, the client’s question and corrected upload follow; only counsel accepts, filing exactly that upload as the matter’s retained original and closing only that request; an upload alone never closes one; the second request remains open and due; a received request takes no more uploads; archive). `tests/satchel/client-requests-journey.test.mjs` — “CLIENT-003 counsel requests two records, explains an incomplete upload and accepts the corrected one while the second stays due at 1440px / 390px”. `src/satchel/request-reminders.ts`; `migrations/core/0093_request_reminders.sql`. `tests/satchel/client-requests.test.mjs` — “Request reminders need exact reader opt-in and counsel approval, honor quiet hours, and stop on acceptance, withdrawal or counsel stop” proves request-specific consent wording and time, counsel approval, content-free email, quiet hours and every named stop through restart; “Request reminders escalate at the contact limit, revoked access and uncertain delivery without automatic resend” proves bounded sends and escalation without resends. The existing named two-record test now refuses unscanned binary, disguised executable text and invalid UTF-8 before storage. The named request journey records consent and counsel approval through the UI at both widths, retains its receipt assertions and audits icon-only controls. Approved riders (ct, 23 October 2026, as supplied): only counsel accepts; accepted upload closes only its request and keeps the original; uploads type-checked and refused when unscanned; reminders stay a named Gap, target opt-in and counsel-approved. Only staff request records and only counsel accepts an exact upload, retaining its original and closing only that request. Uploads use the same native UTF-8 plain-text .txt parser and safety screen as CLIENT-002; binary, unscanned and unparseable files are refused. This is not antivirus certification. An exact request and reader need recorded, initially unchecked email consent and explicit counsel approval. Native email chase steps, quiet hours and the shared seven-day contact limit come from INTAKE-008's settings. Current counsel authority, reader grants, consent and open request status are rechecked before every send. Acceptance through either existing receipt door, client withdrawal or counsel stop cancels remaining sends; limits, exhausted steps and failed or uncertain sends escalate to the request's human owner. Mail contains only a sign-in prompt and portal stop instructions; no request or matter content. CLIENT-006 owns provider delivery and bounce events, which are not prerequisites for this native stop semantic.

CLIENT-004 evidence record: `src/satchel/client-shares.ts`; `src/ui/client-shares.tsx`; `src/ui/client-portal.tsx`; `migrations/core/0085_client_shares.sql`. `tests/satchel/client-shares.test.mjs` — “CLIENT-004 a lawyer shares a preparation task, a hearing and a confirmed deadline; the client acknowledges and completes only the task and cannot alter any date” (only the principal or a lawyer shares; a task tied to a legal deadline and an unconfirmed deadline are refused; the portal returns exactly the shared task, hearing and deadline with due date, local time, location and instructions and none of the firm’s own records; acknowledgments and a client task completion are recorded once and shown to staff while the firm’s task stays open; marking an event or deadline done is refused and every move, cancel, confirm and complete door is refused to a client; another client, a withdrawn share and a withdrawn grant see nothing; archive). `tests/satchel/client-shares-journey.test.mjs` — “CLIENT-004 a lawyer shares a task, hearing and deadline; the client completes the task from a phone and has no way to change a date at 1440px / 390px”. The same test also proves co-client and delegate reads, payer refusal, per-person completion and immediate loss of delegate authority with the represented client. Acknowledgment and completion recheck current portal and share authority in the write transaction. The same named API test asserts that withdrawing and re-sharing an event creates a fresh acknowledgment history, retains both histories after restart, ignores attempted date and status changes in acknowledgment input, and sends no automatic notification for sharing, acknowledgment, completion or withdrawal. Approved defaults (ct, 23 October 2026): nothing reaches the client unless the principal or a lawyer shares that exact task, event or lawyer-confirmed deadline, with instructions, and it disappears the moment the share or the portal grant is withdrawn; a client acknowledgment or task completion is recorded and shown to staff but never completes the firm’s task or changes any date; a task tied to a legal deadline is never a client task; no email or text notification is sent (CLIENT-002 and CLIENT-006 own minimal notifications). CLIENT-001 co-client, payer and delegate identities carry the same per-share fences. Approved riders supplied 24 October 2026 and mapped to the named API assertion: client completion leaves the firm task open, legal dates unchanged and sends no notification. The same named client-shares API test compares the complete staff calendar and task records before and after client task completion, refused client mutations and acknowledgment input: every task due date, hearing occurrence, start and end instant, timezone and legal date remains unchanged.

CLIENT-006 evidence record: `src/satchel/correspondence.ts`; `src/ui/correspondence.tsx`; `migrations/core/0094_correspondence.sql`. Unknown acknowledgment, no automatic resend, and one send after a new audited decision: `tests/satchel/providers.test.mjs` — “Reviewed correspondence sends once, reconciles provider bounce and complaint, and retains uncertain delivery until a new human decision”. Every merged identity consented beside unknown and denied refusals: `tests/satchel/providers.test.mjs` — “Correspondence requires current affirmative consent on every merged identity before sending”. Current portal authority beside revocation, counsel permission and matter-wall refusals: `tests/satchel/providers.test.mjs` — “Correspondence rechecks provider review, portal authority, counsel permission and matter access at send”. Plain-text letter without attachments, minimal issued-invoice sign-in notice, and unissued refusal: `tests/satchel/providers.test.mjs` — “Correspondence sends plain text without attachments and issued invoice notices disclose only sign-in instructions”. Withdrawal blocks the next send beside consented sends and fresh review after renewal: `tests/satchel/providers.test.mjs` — “Correspondence requires current affirmative consent on every merged identity before sending”. `tests/satchel/providers-journey.test.mjs` — “Reviewed letter and invoice mail expose provider outcomes and a deliberate next human action at 1440px” prove review, sending, bounce, complaint, uncertain attempts and issued-invoice outcomes through the built screens, visible human decisions, no overflow and icon-only control audit. Fakes are confined to the provider network edge, as the acceptance permits. Ct approved this slice on 25 October 2026 at 10:10 UTC: counsel-reviewed plain-text mail to active, portal-authorized client contacts only with affirmative consent on every merged identity; minimal issued-invoice sign-in notifications contain no amounts, matter names or invoice contents; counsel explicitly reviews and sends, with current authority checked at send; no outbound attachments, which travel through the portal; an uncertain attempt is never resent automatically and another attempt needs a new audited decision. Counsel-only sending is the slice default. Provider acceptance never means mailbox delivery. CLIENT-008 and MOVE-008 inherit current authority and uncertain-attempt handling before shipping.

CLIENT-008 evidence record: `src/satchel/matter-updates.ts`; `src/ui/matter-updates.tsx`; `src/ui/portal-matter-updates.tsx`; `migrations/core/0107_matter_updates.sql`. `tests/satchel/providers.test.mjs` — “Reviewed matter updates preserve exact approval, scheduled delivery, responsible replies and live promises” proves (1) automatic source-cited drafts after confirmed orders, previous and new trial dates, outstanding client actions, and no unapproved portal or email disclosure; (2) counsel removal of privileged draft wording, exact saved revision, recipients, promises and scheduled approval, with stale and unauthorized refusal; (3) authenticated recipient-only portal publication and separate CLIENT-006 email outcomes, durable uncertain acknowledgment without automatic retry, an audited deliberate resend, the shared reminder contact cap, consent withdrawal, changed responsible counsel, native membership, custom permissions, matter access, portal authority and source supersession checked before contact; (4) a reply assigned to responsible staff, explicit completion evidence and a new reply reopening work; (5) live closure promises, individual carry decisions, source-backed fulfillment, stale-preview refusal, private-source opacity, only explicitly retained reopening schedules, and archive recovery without outbound action. `tests/satchel/providers-journey.test.mjs` — “Reviewed matter updates connect counsel approval, distinct delivery states and client follow-up at both viewport widths” proves saved-wording review, exact recipients and promises, cited order and old and new dates, scheduled portal and reconciled email states, authenticated client reply, counsel completion and retained promise evidence through built screens at 1440 and 390 pixels with labelled controls and no overflow. Responsible counsel approves each immutable packet; every actual contact rechecks current sending authority and the exact current source. Updates inherit CLIENT-006 and CLIENT-010 consent, current portal authority, plain-text mail without attachments, shared contact budget and uncertain-attempt handling.

CLIENT-009 evidence record: Language and accessibility instructions, separate merged identities, stale-write refusal, denied assistant edits, audit snapshots and archive recovery: `tests/satchel/contacts.test.mjs` — “INTAKE-004 INTAKE-005 imported insurer aliases retain every source, relationship, matter role, consent and conflict snapshot through reviewed merge and restore”. Editing instructions and inspecting retained history, no overflow and visibly labelled controls at 1440 and 390: `tests/satchel/contacts-journey.test.mjs` — “INTAKE-004 INTAKE-005 maintain merged identities and review a former client conflict at 1440px” and its 390px counterpart. Existing scheduled-contact stops after consent withdrawal, merged-consent changes, portal revocation, permission changes and walls: `tests/satchel/providers.test.mjs` — “Client reminder withdrawal and merged consent, portal revocation, permission and matter walls are rechecked before scheduled sends”. `migrations/core/0102_contact_preferences.sql`; `src/ui/contacts.tsx`. Preferences are recorded instructions, never recipient authority or automatic translation; each identity retains its own append-only history.  Issued-invoice link refusal after portal revocation beside byte-identical staff download and retained delivery history: `tests/satchel/providers.test.mjs` — “Reviewed invoice delivery retains branded payer artifacts, verifies provider outcomes and requires a new authorized attempt after failure”.

CLIENT-010 evidence record: `src/satchel/client-reminders.ts`; `src/satchel/correspondence.ts`; `src/satchel/api.ts`; `src/server.ts`; `migrations/core/0095_client_reminders.sql`; `API.md`. (1) Responsible-counsel per-matter opt-in: `tests/satchel/providers.test.mjs` — “Client reminders require per-matter opt-in from current responsible counsel and stop after authority changes”. (2) Once-approved exact immutable template version: `tests/satchel/providers.test.mjs` — “Every scheduled client reminder send retains its approved template version in durable audit and needs a new decision after uncertainty”. (3) Durable scheduled invoice and appointment reminders under a shared recipient rate cap, restart and unknown-acknowledgment refusal: `tests/satchel/providers.test.mjs` — “Scheduled invoice and appointment reminders survive restart, share a recipient rate cap, and never automatically resend unknown acknowledgments”. (4) Consent withdrawal and current merged-identity consent, portal authority, permissions and matter walls: `tests/satchel/providers.test.mjs` — “Client reminder withdrawal and merged consent, portal revocation, permission and matter walls are rechecked before scheduled sends”. (5) Every send audited with its approved template version and a new audited decision for another uncertain attempt: `tests/satchel/providers.test.mjs` — “Every scheduled client reminder send retains its approved template version in durable audit and needs a new decision after uncertainty”. Populated existing Reviewed email screens, exact retained template versions and outcomes, no overflow and all controls visibly labelled: `tests/satchel/providers-journey.test.mjs` — “Scheduled client reminders show approved template versions and durable outcomes at 1440px” and its 390px counterpart. Real HTTP handlers and durable scheduled state are exercised; only the provider network edge is fake. Ct ruling, 25 October 2026 at 10:10 UTC, applied in full: **Satchel CLIENT-006: APPROVED as a PARTIAL slice, default adopted with one rider.** Counsel-reviewed plain-text mail to active, portal-authorized client contacts, only where affirmative consent is recorded on EVERY merged identity of that contact; minimal issued-invoice sign-in notification (no amounts, matter names or invoice contents, a link to sign in only); counsel-only explicit review and send; authority rechecked at send; no outbound attachments (documents travel through the portal); an uncertain attempt is never resent automatically and another attempt needs a new audited decision. RIDER (no incumbent job dropped; Clio and MyCase send reminders on their own): counsel-only send is the slice default, not the product line. Add a NAMED Gap and a new row at the next free CLIENT id, 'Automated client reminders' (missing): per-matter opt-in by the responsible counsel, template approved once by counsel, scheduled invoice and appointment reminders under a rate cap, withdrawal of consent stops the next send, each send audited with the template version. DONE assertions for CLIENT-006: (1) a contact with one unconsented merged identity gets no mail, positive beside it with all consented; (2) a contact without portal authority or after authority removal gets none (recheck at send); (3) the mail is plain text with no attachment and the invoice notice carries no amount or matter name; (4) a provider-edge unknown acknowledgement is recorded unknown and no second send happens, a new audited decision sends once; (5) withdrawing consent blocks the next send. Counts at the landing line. CLIENT-010 decisions to apply (from that ruling): current active portal-recipient authority and affirmative consent on every merged identity of the contact; current permission, matter-wall and revocation checks at send; plain-text content, no outbound attachments; invoice notices carry only sign-in instructions, no amount, matter name or invoice content; appointment reminders inherit the same confidentiality and recipient boundary; an uncertain acknowledgment never triggers an automatic resend and another attempt needs a new audited decision; CLIENT-006's manual-send default is NOT the authority for scheduled reminders, the per-matter opt-in plus the counsel-approved template version is. Implemented authority is the current responsible counsel recorded on the matter profile, with current active membership and custom permissions rechecked at send; even the principal must be assigned as responsible counsel to opt in. Exact generic invoice and appointment templates are previewed and approved through the documented human routes. An opt-in supersedes earlier decisions; reassignments, source changes, authority withdrawal and cap denials stop pending jobs with explicit reasons, never implicit renewal. The cap counts attempted reminder sends to a recipient across both kinds and all matters in the trailing seven days, including unknown acknowledgments. Provider acceptance is never mailbox delivery. CLIENT-008, BILL-009 and MOVE-008 inherit these authority, rate-cap, exact-version audit and uncertain-attempt obligations before shipping.

TIME-001 evidence record: `src/satchel/timers.ts`; `src/satchel/timesheets.ts`; `src/ui/timesheet.tsx`; `migrations/core/0046_timesheets.sql`; `tests/satchel/timesheets.test.mjs`; `tests/satchel/timesheets-journey.test.mjs`

TIME-003 evidence record: `tests/satchel/rates.test.mjs` — “TIME-003 versioned client, attorney, matter and task rates with increments and discounts price work either side of a change, cross the budget once per level and never rewrite issued bills” proves precedence, exact prices, frozen entries and bill bytes, permissions, per-version threshold/exceeded alerts and their exported actor, budget revision, source entry, policy and outcome, including budget changes, costs, restart, archive restore and wall fencing. `tests/satchel/rates-journey.test.mjs` — “TIME-003 client override and future rate set at 1440px, work recorded either side, budget crossed and the alert inspected at 1440px and 390px” proves the agreement, posting, alerts and audit download at both widths. `tests/satchel/invoice-numbering.test.mjs` proves released-entry edits and moves audit crossings once despite concurrent requests and replay.

TIME-004 evidence record: `src/satchel/fee-plans.ts`; `src/satchel/fee-scheduler.ts`; `src/satchel/billing.ts`; `src/satchel/trust-transfers.ts`; `tests/satchel/fee-plans.test.mjs`; `tests/satchel/fee-plans-journey.test.mjs`

TIME-005 evidence record: Native implementation evidence: `tests/satchel/fee-plans.test.mjs` — “Settlement statements reconcile recovery and refuse spending without current approvals and cleared funds” invokes settlementExecutionFlow in `tests/satchel/settlement-execution-flow.mjs` (fractional-cent fee and referral rounding, reserved-fund exclusion, exact payee and amount binding, changed roles, officer designation, grants, custom ceilings and walls, recorded sole-practitioner approval, attributed restricted audit and restored-authority refusal), settlementBillingFlow in `tests/satchel/settlement-billing-flow.mjs` (explicit earning and eligibility, active codes and guideline checks, immutable nonhourly LEDES, exact source and once-only charging, current authority at transfer approval and bank reconciliation, reciprocal double-spend refusal), and settlementRetentionFlow in `tests/satchel/settlement-retention-flow.mjs` (legal holds, principal-only expired disposal, preserved attribution, irreversible restricted-payload erasure and the older-archive fence). `tests/satchel/fee-plans-journey.test.mjs` — “Settlement workspace prepares recovery, records sole-practitioner settings and binds exact disbursements with approval and funds refusals at 1440 and 390” invokes settlementExecutionJourney in `tests/satchel/settlement-browser.mjs` through populated and refused settlement and firm-setting screens. Fresh-judgment assertion map: `tests/satchel/fee-plans.test.mjs` — “Settlement statements reconcile recovery and refuse spending without current approvals and cleared funds”, lines 185–189 asserts all original obligations, reductions, net amounts and source references; lines 201–213 refuses pending replacement without changing terms, approvals or custody and permits replacement after decline; lines 215–226 asserts both attributable terms-review records and their archive preservation. `docs/evidence/time005-assertions.md` records the three formerly surviving mutations and their failing assertions.

TIME-006 evidence record: `src/satchel/expenses.ts`; `src/satchel/billing.ts`; `src/ui/expenses.tsx`; `migrations/core/0067_expense_details.sql`; `tests/satchel/expenses.test.mjs`; `tests/satchel/expenses-journey.test.mjs`

TIME-007 evidence record: `src/satchel/utbms-codes.ts`; `src/satchel/ledes-guidelines.ts`; `src/satchel/ledes.ts`; `src/satchel/billing.ts`; `src/ui/ledes.tsx`; `migrations/core/0055_ledes.sql`; `tests/satchel/ledes.test.mjs`; `tests/satchel/ledes-journey.test.mjs`; `src/satchel/ledes-xml-profile.ts`; `src/satchel/ledes-xml.ts`; `src/ui/ledes-xml.tsx`; `migrations/core/0056_ledes_xml.sql`; `fixtures/ledes/Ledes213.xsd`

TIME-008 evidence record: `tests/satchel/timesheets.test.mjs` — “TIME-001 cross-device timers never overlap, intervals draft one entry each, timesheets post a day or week once with exact totals” proves mixed weekly time and expense import, specific invalid-row refusal and repair, retained originals and original timekeeper separate from submitter, current attribution access, active UTBMS validation, expense receipt provenance, work-date pricing and approved cost snapshots, atomic once-only posting, changed-request refusal, restart and archive recovery. `tests/satchel/trust-transfer.test.mjs` — “Offline operating receipts allocate once, preserve credit, refuse unauthorized write-offs and release payments before an immutable void” proves explicit exact-version principal rule approval, source-linked partial collections and exact shares and commissions, independent write-offs and unapplied credit, applied credit, rule history, linked reversals and replay, principal-only economics including custodian audit refusal, current walls and archive recovery; its “TRUST-004 BILL-016 native payment/void guards / TRUST-005 inherited reconciliation: exact partial earned-fee reservations, distinct dual officers, interrupted bank reconciliation paired invoice payments and exact reviewed reversal post once” proves trust custody and pending bank applications excluded, cleared operating collections and once-only reversal, plus a taxed invoice with an explicit earned-work-only bank application, exact commission basis and archive recovery. `tests/satchel/providers.test.mjs` — “Hosted invoice collection allocates exact card and ACH funds once, preserves pending and returned states, and fences trust protection” proves paid operating sources, pending ACH and protected trust exclusion, and partial refunds before and after exact net-receipt allocation approval. `tests/satchel/timesheets-journey.test.mjs` — “TIME-001 timer started on a 390px phone, resumed and switched at 1440px, day reviewed with UTBMS codes and posted once”, continued by `tests/satchel/bulk-revenue-journey.mjs` function bulkRevenueJourney, proves the populated weekly import, invalid row, repair, reviewed post, agreement approval, billing, actual partial operating receipt, fee and expense and tax apportionment, attributed commissions and source-linked return at both 1440 and 390 pixels without changing original work records.

BILL-001 evidence record: `tests/satchel/invoice-numbering.test.mjs` — Reviewed prebill runs and immutable invoice issue preserve approvals, reservations, trust clearance and archive continuation (three matters prepared by billing staff with payer, period and arrangement; counsel returns one, revises narratives, excludes a source and writes down another; two exact approvals issue twice with two permanent numbers, assigned template versions, unchanged source reservations and identical PDF bytes; officer approval and bank clearance produce a trust-paid invoice; stale authority and partial batches refuse atomically; capped, blended and nonhourly occurrences retain their reviewed terms, source identity and LEDES exports; restart and archive restore retain the run and replay). The same test proves historical numbering, immutable originals and atomic issue; `tests/satchel/invoice-numbering-journey.test.mjs` — Prebill review, exact numbered issue and rebilling preserve retained invoices at 1440px and 390px, extended by `tests/satchel/prebill-journey.mjs` (template assignment, three-matter run, counsel review, billing request, cleared paid issue and new or explicitly adopted retainer occurrence through the workspace; existing correction and void journeys retain original files).

BILL-002 evidence record: `tests/satchel/providers.test.mjs` — Reviewed invoice delivery retains branded payer artifacts, verifies provider outcomes and requires a new authorized attempt after failure (client and insurer PDFs, logo, address, remittance, terms, due date, matter header, trust balance, separate statements, retained bytes, signed provider bounce, consent and authority at send, explicit resend, uncertain attempt and void replacement refusal); `tests/satchel/providers-journey.test.mjs` — OSS-001 provider charges: disclosure, terms review and no payment prompt at 1440px and at 390px, extended by `tests/satchel/invoice-delivery-journey.mjs` and `tests/satchel/stripe-browser.mjs` (approved templates, portal delivery, bounced and uncertain notification, audited resend, client statement download and invoice page); `tests/satchel/invoice-qr-scan.swift` (independent scan of the downloaded PDF to its exact authenticated invoice page, passed in the desktop journey); `tests/satchel/invoice-sendgrid-sandbox.mjs` (held-key SendGrid sandbox validation passed 25 October 2026 in the sx-satchel-c-i816 injector task transcript; no mailbox delivery claimed)

BILL-004 evidence record: `src/satchel/tax-reviews.ts`; `src/satchel/trust-transfers.ts`; `src/satchel/ledes.ts`; `src/satchel/ledes-xml.ts`; `src/ui/tax-reviews.tsx`; `src/ui/trust-transfers.tsx`; `tests/satchel/tax-reviews.test.mjs`

BILL-006 evidence record: `tests/satchel/stripe-sandbox.mjs` — held-key hosted card and ACH journey (sandbox receipts, exact operating reconciliation and replay; passed 26 October 2026 in the sx-satchel-c-i816 injector task transcript); `tests/satchel/providers.test.mjs` — Hosted invoice collection allocates exact card and ACH funds once, preserves pending and returned states, and fences trust protection (unverified protection refusal, approved protected arrangement at the paid provider edge, exact invoice allocation, replay, returns and restored state); `tests/satchel/providers-journey.test.mjs` — OSS-001 provider charges: disclosure, terms review and no payment prompt at 1440px and at 390px, extended by `tests/satchel/stripe-browser.mjs` (client invoice page, settings and visible unpaid, pending, paid, returned and void end states)

BILL-007 evidence record: `tests/satchel/providers.test.mjs` — “Hosted invoice collection allocates exact card and ACH funds once, preserves pending and returned states, and fences trust protection”, extended by `tests/satchel/stripe-reconciliation-flow.mjs`, proves lost-response recovery without another collection, event replay, exact partial refund and authority refusals, processor gross, fee and net totals, unknown and failed payout refusal, bank matching, dispute correction, restart and archive recovery. “Hosted invoice collection allocates exact card and ACH funds once, preserves pending and returned states, and fences trust protection” proves ACH return and invoice allocation. `tests/satchel/providers-journey.test.mjs` — “OSS-001 provider charges: disclosure, terms review and no payment prompt at 1440px” and its 390px counterpart invoke `tests/satchel/payment-money-browser.mjs` for populated refund and bank reconciliation screens.

BILL-008 evidence record: `tests/satchel/providers.test.mjs` — “Exact client mandates dispatch each installment once and stop imported, revoked, failed, disputed and uncertain plans for human review” proves the three-installment definition, client-only hosted mandate, one exact charge, revocation across restart with a native human task, paused source plans with an owner task due before the first installment, source-credential refusal, fresh reauthorization, hardship revision with renewed consent, failure, dispute, uncertainty and archive recovery. `tests/satchel/providers-journey.test.mjs` — “OSS-001 provider charges: disclosure, terms review and no payment prompt at 1440px” and its 390px counterpart invoke `tests/satchel/payment-money-browser.mjs` for staff plan definition, client confirmation, one paid installment and stopped-plan screens.

BILL-010 evidence record: `src/satchel/billing.ts`; `src/satchel/trust-transfers.ts`; `src/ui/billing.tsx`; `src/ui/trust-transfers.tsx`; `tests/satchel/trust-transfer.test.mjs`

BILL-011 evidence record: `tests/satchel/providers.test.mjs` — “Reviewed invoice delivery retains branded payer artifacts, verifies provider outcomes and requires a new authorized attempt after failure” proves two selected same-client matters, excluded third, exact recipient, line source and fee agreement, responsible attorney, PDF allocation totals, recipient view audit, revoked secondary grant denial and immutable staff download. `tests/satchel/providers-journey.test.mjs` — “OSS-001 provider charges: disclosure, terms review and no payment prompt at 1440px” and its 390px counterpart call `tests/satchel/invoice-delivery-journey.mjs` to select the two matters in Time & bills and inspect the client statement portal. `src/satchel/payer-statements.ts`; `src/ui/invoice-delivery.tsx`. Explicit selection consolidates already delivered issued invoices for the same recorded client and exact authenticated payer. Each source allocation freezes matter, responsible attorney, recorded fee rule or reviewed fee plan, recipient and amount. Legacy entries lacking a recorded fee-rule identity remain labelled legacy recorded entry terms. No work narrative is copied into the statement. Creation rechecks staff access and existing payer invoice authority on every matter; each listing and download reapplies access to every included matter, and a lost grant suppresses the entire statement. Recipient and PDF view events are retained; no automatic outbound send is introduced.

BILL-012 evidence record: `tests/satchel/trust-transfer.test.mjs` — “Offline operating receipts allocate once, preserve credit, refuse unauthorized write-offs and release payments before an immutable void” proves recorded methods and operating-account enforcement, oldest-first and explicit allocation, short balances, principal-approved reasoned write-off and assistant refusal, overpayment and later credit application, append-only bounce, concurrent request reconciliation, changed-request refusal, authority removal, refusal of bank-balance-only custom roles, ethical-wall refusal, restart and archive recovery. Its proveOfflineBalances journey proves populated payment balances and retained void notice at 1440 and 390 pixels. `src/satchel/offline-payments.ts`; `src/satchel/offline-balances.ts`; `migrations/core/0103_offline_payments.sql`; `API.md`.

BILL-013 evidence record: (1) Principal and billing-staff branding, client and matter headers, terms, due date, authenticated payment link, QR and trust display: `tests/satchel/providers-journey.test.mjs` — “OSS-001 provider charges: disclosure, terms review and no payment prompt at 1440px” and its 390px counterpart, through `tests/satchel/invoice-template-journey.mjs` — “invoiceTemplateJourney”. (2) Detailed and summary layouts and each detail choice, including no-charge lines and discounts, without repricing: `tests/satchel/providers.test.mjs` — “Billing staff approve immutable invoice display revisions and issued PDFs retain selected detail without changing approved amounts”. (3) Firm, client and matter precedence, prior balance presentation and prospective retirement: `tests/satchel/providers.test.mjs` — “Invoice defaults resolve firm then client then matter, retirement affects future issues only, and prior balances stay separate from the invoice total”; the same browser journey asserts the exact selected revision and scope in prebill review. (4) Two populated matter assignments, issue, PDF logo and selected detail inspection, editing an earlier detailed revision, later issue, retirement, original revision identity and byte-identical earlier PDF downloads: “invoiceTemplateJourney” at both widths. (5) Restart and archive recovery of issued bytes, defaults and retirement: the two named public-door API tests. Exact revision pinning and dated separate-balance semantics are documented in `API.md`; editing appends a revision that a person assigns prospectively, and a retired assignment refuses until explicitly replaced.

BILL-015 evidence record: `src/satchel/invoice-schemes.ts`; `src/satchel/invoice-issue.ts`; `src/satchel/invoice-pdf.ts`; `src/ui/invoice-numbering.tsx`; `migrations/core/0064_invoice_numbers.sql`; `tests/satchel/invoice-numbering.test.mjs`; `tests/satchel/invoice-numbering-journey.test.mjs`

BILL-016 evidence record: `src/satchel/invoice-void.ts`; `src/satchel/billing.ts`; `src/satchel/ledes.ts`; `src/ui/invoice-void.tsx`; `migrations/core/0069_invoice_voids.sql`; `tests/satchel/invoice-numbering.test.mjs`; `tests/satchel/invoice-numbering-journey.test.mjs`; `tests/satchel/trust-transfer.test.mjs`; `src/satchel/released-entries.ts`; `src/ui/released-entries.tsx`; `migrations/core/0070_entry_edits.sql`; `tests/satchel/fee-plans.test.mjs`

TRUST-001 evidence record: `src/satchel/trust.ts`; `src/ui/trust.tsx`; `tests/satchel/trust.test.mjs`; `tests/satchel/trust-journey.test.mjs`

TRUST-002 evidence record: `src/satchel/trust-transactions.ts`; `src/ui/trust-transactions.tsx`; `tests/satchel/trust.test.mjs`; `tests/satchel/trust-journey.test.mjs`

TRUST-003 evidence record: `src/satchel/trust-guards.ts`; `src/satchel/trust-transactions.ts`; `tests/satchel/trust.test.mjs`

TRUST-004 evidence record: `src/satchel/trust-transfers.ts`; `src/satchel/trust-reversals.ts`; `tests/satchel/trust-transfer.test.mjs`; `tests/satchel/trust-transfer-journey.test.mjs`

TRUST-005 evidence record: `src/satchel/trust-periods.ts`; `src/satchel/trust-reports.ts`; `tests/satchel/trust-period.test.mjs`; `tests/satchel/trust-period-journey.test.mjs`; `tests/satchel/trust-transfer.test.mjs`

TRUST-006 evidence record: `src/satchel/trust-journal.ts`; `src/satchel/trust-periods.ts`; `src/satchel/trust-reports.ts`; `migrations/core/0035_trust_periods.sql`; `tests/satchel/trust-history.test.mjs`; `tests/satchel/trust-period-journey.test.mjs`

TRUST-008 evidence record: `src/satchel/trust-periods.ts`; `src/satchel/trust-reports.ts`; `src/satchel/trust-statement-releases.ts`; `src/satchel/trust-retainers.ts`; `src/satchel/trust-state-records.ts`; `src/ui/trust-periods.tsx`; `tests/satchel/trust-period.test.mjs` — “TRUST-005: import original statements, drill $12.50 suspense and outstanding check, correct by journal, sign exact consecutive monthly packets” proves signed source-traced CA and NY previews, exact values and missing-record boundaries; “TRUST-008: exact signed statements require principal release and current named client grants; withdrawal, walls and restore never revive access” proves explicit signed release and current-grant fences; “TRUST-008: a posted threshold crossing produces an exact approved portal replenishment request and never a debit” proves exact alerts and once-only portal publication without money movement; `tests/satchel/trust-history.test.mjs`; `tests/satchel/trust-period-journey.test.mjs` — officer reconciliation and state-preview downloads at the selected 1440 or 390 width.

TRUST-009 evidence record: `src/satchel/trust-checks.ts`; `src/satchel/trust-check-operating.ts`; `src/satchel/trust-check-print.ts`; `src/ui/trust-checks.tsx`; `tests/satchel/trust-checks.test.mjs`; `tests/satchel/trust-checks-journey.test.mjs`

TRUST-010 evidence record: `src/satchel/trust-matter-transfers.ts`; `src/satchel/trust-matter-transfer-bank.ts`; `src/satchel/trust-matter-transfer-context.ts`; `src/ui/trust-matter-transfers.tsx`; `tests/satchel/trust-matter-transfer.test.mjs`; `tests/satchel/trust-matter-transfer-journey.test.mjs`

CONNECT-001 evidence record: `src/satchel/integrations.ts`; `src/satchel/webhooks.ts`; `docs/integrations.md`; `tests/satchel/integrations.test.mjs`; `tests/satchel/integrations-journey.test.mjs`

CONNECT-003 evidence record: `src/satchel/integration-journal.ts`; `src/satchel/webhooks.ts`; `src/ui/connector-journal.tsx`; `tests/satchel/connector-journal.test.mjs`; `tests/satchel/connector-journal-journey.test.mjs`

REPORT-001 evidence record: `src/satchel/reports.ts`; `src/satchel/report-data.ts`; `src/satchel/report-stage-clock.ts`; `src/satchel/report-export.ts`; `src/satchel/matter-lifecycle.ts`; `src/satchel/leads.ts`; `src/satchel/intake-submissions.ts`; `src/ui/reports.tsx`; `migrations/core/0057_matter_outcomes.sql`; `migrations/core/0058_lead_practice.sql`; `tests/satchel/reports.test.mjs`; `tests/satchel/reports-journey.test.mjs`; `tests/satchel/lifecycle.test.mjs`; `tests/satchel/leads.test.mjs`; `tests/satchel/intake.test.mjs`

REPORT-002 evidence record: `tests/satchel/reports.test.mjs` — “Firm economics reconciles current source values, approved staff cost, void and corrected-rate rebilling without duplicate realization” proves recorded-time utilization, explicit approved costing and unknown profitability without it, source-linked write-down, live issue, partial settlement, pending trust application versus trust cash, append-only reversal, void exclusion, corrected-rate once-only rebill, formula-basis export, denied staff-cost access and archive recovery. `src/satchel/economics.ts`; `migrations/core/0101_economics_cost_rates.sql`.  Implementation proof added in this round: `tests/satchel/reports.test.mjs` — “Firm economics reconciles current source values, approved staff cost, void and corrected-rate rebilling without duplicate realization” now also reconciles an issued additive correction, exact source-linked billed and earned value, realization, effective rate and profitability, repeated issue, unchanged original export and archive recovery. `tests/satchel/providers.test.mjs` — “Hosted invoice collection allocates exact card and ACH funds once, preserves pending and returned states, and fences trust protection” now asserts populated processor-pending economics beside cleared receipts, trust cash, earned revenue and collection rate. These assertions close those two narrow implementation gaps; the ruling’s other named proof obligations remain open.

REPORT-003 evidence record: `src/satchel/report-schedules.ts`; `src/ui/report-schedules.tsx`; `migrations/core/0089_report_schedules.sql`. `tests/satchel/report-schedules.test.mjs` — “REPORT-003 a weekly overdue-work report reaches current permitted recipients with counts only; a revoked recipient is excluded and a failed delivery opens an owned exception” (principal-only schedules whose recipients must open reports; a Monday 08:00 firm-timezone slot sends one count-only email per current recipient once, across a worker restart; removing a recipient excludes them from every later slot; a failed provider result opens an exception owned by the principal with a due date and resolving it is recorded; a recipient who loses report permission is skipped and that is an exception too; in-workspace summaries; definitions and filters in the firm archive). `tests/satchel/report-schedules-journey.test.mjs` — “REPORT-003 the principal schedules a weekly overdue-work summary, sees a failed delivery as an exception and removes a recipient at 1440px / 390px”. `tests/satchel/report-schedules.test.mjs` — “Saved report definitions preserve filters in CSV and archive without creating a schedule” proves independent definitions, saved date and status filters, filtered CSV with override refusal, restart and archive; “Portal report recipients receive shared counts only and revoked readers receive neither future nor stored summaries” proves portal-reader counts, hidden work exclusion, payer refusal, revocation at send and read, and content-free exceptions. The existing named weekly-report test now asserts next-day due dates and no automatic resend for failed and uncertain delivery. The named report journey saves and exports a definition at both widths; `tests/satchel/client-requests-journey.test.mjs` — “CLIENT-003 counsel requests two records, explains an incomplete upload and accepts the corrected one while the second stays due at 1440px” and its 390px counterpart prove the client summary screen. Approved riders (ct, 23 October 2026, as supplied): counts only; permission re-evaluated at send; failed or skipped delivery never resent, next-day principal exception shows no report content. Only the principal saves report definitions and schedules or removes recipients. Definitions retain the report dashboard and validated practice, owner, status and date filters; their CSV route uses those saved filters and ignores overrides, and definitions travel in the firm archive. Staff counts use current report grants and walls; client counts use only currently shared requests, client tasks and confirmed deadlines under current reader grants. A payer receives no report summaries. Portal reads recompute counts under current permission and disclose no schedule name or filters to clients. Email subject and body carry no matter, client or filter; mail requires the principal's provider review. Failed, skipped, uncertain and interrupted deliveries are never automatically resent and open a next-day exception owned by the principal without report content.

MOBILE-001 evidence record: `src/ui/workspace.tsx`; `src/ui/documents.tsx`; `src/ui/billing.tsx`

MOVE-001 evidence record: `tests/satchel/matter-import.test.mjs` — “MATTER-008 / MOVE-002 matter subset previews without writes, preserves source numbers and bytes, resumes after restore and replays without duplicates”, invoking proveWholeFirmMove in `tests/satchel/migration-flow.mjs`: A1 schema, mapping, counts, source and original hashes, relationships, errors and coverage; A2 unmatched-client repair; A3 missing-original repair; A4 interrupted restore and exact repeated apply; A6 separate count, balance and coverage refusals, final delta and signed cutover. “matter import requires principal authority and exact fresh human clearance, and refuses duplicate source rows and native number collisions” invokes proveMoveRefusals: A5 unchanged safe rows removed while used and edited contacts remain, current authority, private authors and erased-original replay fences. `tests/satchel/numbering-journey.test.mjs` invokes `tests/satchel/migration-journey.mjs` at 1440px for package repair, reviewed apply and signed reconciliation.

MOVE-002 evidence record: `tests/satchel/matter-import.test.mjs` — “MATTER-008 / MOVE-002 matter subset previews without writes, preserves source numbers and bytes, resumes after restore and replays without duplicates” invokes proveWholeFirmMove in `tests/satchel/migration-flow.mjs`: A1 two active and one closed matter, typed fields, source identities and native history; A2 Grow lead and staff mappings; A3 originals and dates, CSV and ICS calendar values and native relationships; A4 exact billed, unbilled, AR and two-client trust totals with separate reconciliation refusals; A5 historic original PDF and byte-identical portal re-send; A6 exact repeated import and restored checkpoints without duplicates; A7 source invoice number and ordinal, the next native issue, prospective prefix change and byte-identical source number and file through restore. “matter import requires principal authority and exact fresh human clearance, and refuses duplicate source rows and native number collisions” additionally asserts a non-principal mapped timekeeper, Grow assignee and private author, wrong-client and wrong-invoice refusals and erasure. `tests/satchel/numbering-journey.test.mjs` invokes `tests/satchel/migration-journey.mjs` for opening the source PDF from its matter and delivering identical bytes. `tests/satchel/invoice-numbering.test.mjs` retains inherited BILL-015 atomic issue, tax, legacy reservation, correction and replay assertions.

AGENT-003 evidence record: `src/satchel/deadlines.ts`; `src/satchel/proposals.ts`; `tests/satchel/flows.test.mjs`

AGENT-010 evidence record: `tests/satchel/flows.test.mjs` — agent keys only prepare; human decisions are atomic and cannot be replayed (calls `tests/satchel/agent-execution-flow.mjs`: authorized and licensed context, agreement state, injected instruction refusal, limits, durable scheduling, revocation, erasure, replay, audit and archive); `tests/satchel/journey.test.mjs` — SAT-013 sign-in, setup and every workspace tab with real records at 1440px and 390px (calls `tests/satchel/agent-execution-browser.mjs`: agreement and delegation approval, redacted context, refused queue and preserved proposal); `tests/satchel/custom-roles.test.mjs` — FIRM-008 custom roles gate bank, contacts, documents, settings, agent keys and every listed door without conferring authority

## 28 October 2026 — Legacy contract notes

The following notes retain the prior source record; current promises and status live in CONTRACT.md.

This is the product being built towards. Missing implementation is a gap, never a reason to narrow the product. Each named clause describes buyer behavior and an acceptance journey through a public screen, route, download, command or real provider boundary. Current status is judged separately from that target. ACCEPTANCE.md lists the same journeys and statuses for build rounds. No product code, approved homepage, UI or behavior changes in this documentation round.

Satchel is US-first and uses USD by default. Licensed lawyers decide legal interpretation, conflicts, advice, filings and jurisdiction-specific professional duties. The software supports evidence, review and execution controls; it does not act as counsel or guarantee conflict clearance. Licensed Westlaw/LexisNexis/vLex access supplies external legal authority; restricted licensed content is not silently copied or redistributed.

A regulated US bank owns each IOLTA/operating account. LawPay or a firm-verified Stripe arrangement processes payments; provider onboarding, trust protections, ACH authorization and bank agreements are required engineering and setup, not excluded scope. Satchel still owns the complete legal ledger, approval workflow, three-way reconciliation and discrepancy resolution. It neither takes custody of client money nor claims that a payment request is settlement.

LawToolBox/CalendarRules provide contracted court-rule content; counsel confirms results and resolves uncovered courts through source-cited manual review. InfoTrack and authorized courts provide filing/service networks and stamped results. Satchel owns orchestration, returned evidence and follow-up; provider outages or rejected filings remain open work. Health records and agent processing require the firm’s applicable data/health agreements, subprocessors and access policy before processing; implementing those agreements is part of delivery.

Microsoft 365/Word and Google Workspace remain editing and mail platforms; Box/Dropbox remain repositories. Satchel supplies integrated matter filing, versions, search and permissions, rather than rebuilding desktop Word or a general enterprise e-discovery hosting network. Matter evidence productions and source-cited drafts stay in scope. US tax and trust treatment is configured and reviewed by the firm’s lawyer/accountant; Satchel records calculation provenance and does not guarantee professional compliance by installation alone.

Generated from CONTRACT.md; regenerate with the documented contract-docs command. Acceptance requirements and status remain in that source.

| Clause | Title | Status |

| SAT-001 | Invite a firm team | done |

| SAT-002 | Review fresh conflicts before opening | done |

| SAT-003 | Grant matter access | done |

| SAT-004 | Record exact USD work | done |

| SAT-005 | Review immutable bill exports | done |

| SAT-006 | Correct by reviewed additions | done |

| SAT-007 | Keep private original versions | done |

| SAT-008 | Confirm source-linked deadlines | done |

| SAT-009 | Let agents prepare for people | done |

| SAT-010 | Preview Clio contact move-in | done |

| SAT-011 | Restore a private firm archive | done |

| SAT-012 | Erase originals with a restore fence | done |

| SAT-013 | Keep the chosen product surfaces | done |

| OSS-001 | Free and open source, MIT licensed | done |

| FIRM-001 | Set up an empty US firm | done |

| FIRM-002 | Separate finance and legal rights | done |

| FIRM-003 | Enforce ethical walls | done |

| FIRM-004 | Secure sessions and connected secrets | partial |

| FIRM-005 | Export a complete action audit | done |

| FIRM-006 | Apply retention and legal holds | done |

| FIRM-007 | Operate and recover the owned system | partial |

| FIRM-008 | Define custom roles and rate visibility | done |

| BASE-001 | Preserve Base guarantees through replacements | done |

| INTAKE-001 | Publish conditional intake forms | done |

| INTAKE-002 | Manage a lead pipeline | done |

| INTAKE-003 | Book consultations | done |

| INTAKE-004 | Maintain a legal contact graph | done |

| INTAKE-005 | Review conflicts across the whole firm | done |

| INTAKE-010 | Route walled conflict matches to wall custodians | done |

| INTAKE-006 | Execute engagement agreements | missing |

| INTAKE-007 | Convert a lead without losing history | partial |

| INTAKE-008 | Follow up prospects under consent | partial |

| INTAKE-009 | Synchronize Google and Microsoft 365 contacts | missing |

| MATTER-001 | Model practice-specific matters | done |

| MATTER-002 | Track stages and milestones | done |

| MATTER-003 | Assign dependent work | done |

| MATTER-004 | Run editable matter workflows | done |

| MATTER-005 | Keep a complete matter timeline | done |

| MATTER-006 | Manage staff capacity and handoff | done |

| MATTER-007 | Close and reopen matters deliberately | done |

| MATTER-008 | Number matters by firm scheme | done |

| MATTER-009 | Search the whole firm from one box | done |

| DOC-001 | Store real working files | partial |

| DOC-002 | Preview and compare versions | done |

| DOC-003 | Search OCR and full text | missing |

| DOC-004 | Organize and act on document sets | done |

| DOC-005 | Work in Microsoft Word | missing |

| DOC-006 | Assemble legal documents and forms | done |

| DOC-007 | Sign and file matter documents | missing |

| DOC-008 | File Outlook email and attachments | missing |

| DOC-009 | File Gmail email and attachments | missing |

| DOC-010 | Connect SharePoint OneDrive and Drive | missing |

| DOC-011 | Connect Box and Dropbox | missing |

| DOC-012 | Build medical and bill chronologies | done |

| DOC-013 | Prepare controlled evidence productions | done |

| DOC-014 | Open matter folders on the desktop | missing |

| CAL-001 | Schedule matter appointments | done |

| CAL-002 | Synchronize Google Calendar both ways | missing |

| CAL-003 | Synchronize Outlook calendars both ways | missing |

| CAL-004 | Calculate LawToolBox deadlines | missing |

| CAL-005 | Calculate CalendarRules deadlines | missing |

| CAL-006 | Propagate reviewed source changes | partial |

| CAL-007 | Remind and escalate deadlines | done |

| CAL-008 | Show firm deadline coverage | done |

| CAL-009 | File and serve through InfoTrack | missing |

| CAL-010 | Track court docket changes | missing |

| CAL-011 | Remind staff of appointments and tasks | missing |

| CLIENT-001 | Invite a secure client portal | done |

| CLIENT-002 | Retain secure two-way messages | done |

| CLIENT-003 | Chase document requests to receipt | done |

| CLIENT-004 | Give clients tasks and events | done |

| CLIENT-005 | Text clients and leads with Twilio | missing |

| CLIENT-006 | Deliver and reconcile email | done |

| CLIENT-007 | Keep call records and authorized recordings | missing |

| CLIENT-008 | Send reviewed matter updates | done |

| CLIENT-009 | Control sharing and communication preferences | partial |

| CLIENT-010 | Automated client reminders | done |

| TIME-001 | Run timers and timesheets | done |

| TIME-002 | Capture email calendar and document activity | missing |

| TIME-003 | Apply versioned rates and budgets | done |

| TIME-004 | Bill flat and recurring fees | done |

| TIME-005 | Manage contingency and settlements | partial |

| TIME-006 | Capture reimbursable expenses | partial |

| TIME-007 | Code LEDES and UTBMS work | done |

| TIME-008 | Submit bulk work and allocate revenue | done |

| BILL-001 | Run prebill review and batch invoices | done |

| BILL-002 | Deliver invoices and payer statements | done |

| BILL-003 | Split payers and handle foreign invoices | missing |

| BILL-004 | Calculate US billing tax explicitly | done |

| BILL-005 | Collect through 8am LawPay | missing |

| BILL-006 | Collect through Stripe legal configurations | done |

| BILL-007 | Reconcile payments refunds and disputes | partial |

| BILL-008 | Run consented payment plans | partial |

| BILL-009 | Pursue collections until resolved | missing |

| BILL-010 | Show client ledgers and receivables | partial |

| BILL-011 | Consolidate multi-matter billing | done |

| BILL-012 | Record offline payments against invoices | partial |

| BILL-013 | Brand versioned invoice templates | done |

| BILL-014 | Charge interest and late fees by agreement | missing |

| BILL-015 | Number invoices by firm scheme | partial |

| BILL-016 | Void issued invoices and rebill their entries | partial |

| TRUST-001 | Keep built-in IOLTA client ledgers | done |

| TRUST-002 | Record deposits and disbursements | done |

| TRUST-003 | Prevent overdrafts and commingling | done |

| TRUST-004 | Authorize earned-fee trust transfers | partial |

| TRUST-005 | Reconcile all three trust views | done |

| TRUST-006 | Correct and lock trust history | done |

| TRUST-007 | Match banks and legal processor settlements | missing |

| TRUST-008 | Report trust and replenish retainers | partial |

| TRUST-009 | Produce checks and deposit records | done |

| TRUST-010 | Transfer trust between one client’s matters | done |

| BOOKS-001 | Synchronize QuickBooks Online operations | missing |

| BOOKS-002 | Synchronize Xero operations | missing |

| CONNECT-001 | Expose scoped APIs and webhooks | partial |

| CONNECT-002 | Connect Zapier and Clio APIs | missing |

| CONNECT-003 | Reconcile connector work durably | done |

| REPORT-001 | Report case status and outcomes | done |

| REPORT-002 | Report firm economics | partial |

| REPORT-003 | Schedule actionable reports | done |

| MOBILE-001 | Complete practice work on phones | partial |

| MOBILE-002 | Protect offline work and push alerts | missing |

| MOVE-001 | Preview and reconcile a whole firm move | done |

| MOVE-002 | Migrate Clio Manage and Grow completely | done |

| MOVE-003 | Migrate 8am MyCase completely | missing |

| MOVE-004 | Migrate Smokeball completely | missing |

| MOVE-005 | Migrate PracticePanther completely | missing |

| MOVE-006 | Migrate Filevine completely | missing |

| MOVE-007 | Migrate Eve work and source references | missing |

| MOVE-008 | Prove finance and authority at cutover | missing |

| AGENT-001 | Build evidence-closed matter plans | missing |

| AGENT-002 | Chase authorized evidence to acceptance | missing |

| AGENT-003 | Explain deadline changes before propagation | partial |

| AGENT-004 | Draft substantive work with verified sources | missing |

| AGENT-005 | Review active matters every night | missing |

| AGENT-006 | Reconcile matter work to collected cash | missing |

| AGENT-007 | Keep client promises through delivery | missing |

| AGENT-008 | Coordinate milestones with billing and collection | missing |

| AGENT-009 | Measure recovered work and agent decisions | missing |

| AGENT-010 | Constrain agent data and execution | partial |

Every capability and provider that exists today records this evidence

Until FIRM-002 and FIRM-008 define a custodian role, expiration asks the principal, who approves disposal.

Approved disposal removes originals and every derivative, and its journal counts each kind removed: today Satchel keeps no previews, OCR text, search vectors or connector caches, so the journal records zero of each;

(zero previews, OCR text, search vectors and connector caches today)

Until INTAKE-001 forms ship, staff record leads by hand; each INTAKE-001 submission must become one of these leads at its door.

Until FIRM-003 ships the custodian is the principal, the current native custodian (FIRM-005, FIRM-006).

labelled "practitioner-recorded, not signed through Satchel" until INTAKE-006 supplies signatures

acting for the firm administrator until FIRM-008 custom roles exist

Until FIRM-002 and FIRM-008 define a supervisor role, the principal is the supervisor.

before workflow transitions ship

before approved transitions ship

before those capabilities ship

before their capabilities ship

before their new fee or bill doors ship

before those doors ship

Every capability that exists today conforms

The recorded native release boundary remains an interim implementation; full authority scope is retained pending the unprovided ct ruling.
