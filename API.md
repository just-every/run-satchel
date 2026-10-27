# Satchel API

People use their native session cookie. Every human mutation requires the
installation's exact `Origin` header. Owner, lawyer/assistant role and matter
membership are checked at the handler and at transactional writes. Private files
also require uploader or principal access. No API trusts a role from the caller.

Create an agent key in Team & safety. Send `Authorization: Bearer YOUR_KEY` to
these routes only. Keys inherit their person's current role and matter access;
revocation is immediate. Never send a session cookie to an untrusted agent.

| Route | JSON body / purpose |
| --- | --- |
| `GET /api/satchel/agent/context` | Assigned matters and the person's proposals |
| `GET /api/satchel/agent/matters/:id` | Accessible entries, bills, document metadata and deadlines for preparation |
| `POST /api/satchel/agent/prepare-matter` | `{title,client,adverse,aliases?}` |
| `POST /api/satchel/agent/prepare-bill` | `{matterId,title,date,entryIds}` |
| `POST /api/satchel/agent/prepare-deadline` | `{matterId,title,date,timezone,source,documentId?,version?}` |

A preparation returns `{id,kind,status:'pending',payload}`. It does not open a
matter, reserve bill sources or activate a deadline. The person opens
**Preparations**, reviews it and approves or declines. The server records their
identity, decision time and result ID in the same transaction as acceptance.
Agent credentials cannot reach human approval, export, import, backup or erasure.

Human routes are under `/api/satchel`: `state`, `conflicts`, `matters`,
`matters/:id/access`, `matters/:id/entries`, `matters/:id/bills`,
`bills/:id/approve`, `bills/:id/export`, `bills/:id/correct`, `bills/:id/void`,
`matters/:id/documents`, `documents/:id/file?version=N`,
`matters/:id/deadlines`, `deadlines/:id/confirm`, `deadlines/:id/complete`,
`proposals/:id/decide`, `team`, `team/invite`, `keys`, `keys/:id/revoke`,
`import`, `import/:op`, `backup`, `restore`, `documents/:id/erase`.
GET reads; POST mutates except bill exports, whose GET records export history.
`POST /matters/:id/entries` takes `kind`, `date`, `description` and either `minutes` (with an optional
`rateCents`, `utbmsTask`, `utbmsActivity` and `billable`) or `amountCents`. An explicit `rateCents` is
recorded exactly as entered; without one the TIME-003 fee agreement prices the work and the entry
reports `billedMinutes`, `discountBps`, `rateSource` and `rateRuleId`. `GET /matters/:id/rates` returns
the matter's firm, client and matter rules, budget and alerts; `POST /matters/:id/rates` adds a rule
(`scope`, `effectiveFrom`, `rateCents`, `incrementMinutes`, `discountBps`, `billable`, `note`, optional
`timekeeperEmail` and `utbmsTask`) and `POST /matters/:id/budget` sets a budget version (`cents`,
`alertPercent`, `note`).
INTAKE-002 leads: `GET/POST /leads`, `GET /leads/report`, `GET/POST /lead-stages`, `GET/POST /leads/:id`
(`revision` plus `stageId`, `assignedEmail`, `qualification`, `consultationOutcome`, `nextAction`, `nextActionDate`,
`lostReason` or `matterId`) and `POST /leads/:id/merge` (`revision`, `intoId`, `intoRevision`, `reason`).
MATTER-004 workflows: `GET/POST /workflows` (`name`, `trigger` manual/opening/stage, `triggerStageId`, `steps`,
`note`), `POST /workflows/:id/versions` (`version`, `steps`, `note`), `GET/POST /workflows/:id/rollout`
(`version`, `matterIds`), `GET /matters/:id/workflows`, `POST /matters/:id/workflow-preview` (`workflowId`),
`POST /matters/:id/workflow-runs` (`workflowId`, `version`, `steps`, live run `revision`),
`POST /workflow-runs/:id/stop|restart` (`revision`, `reason`) and `POST /document-requests/:id/receive`
(`documentId`). Document requests are recorded only; nothing is sent.
`GET /matters/:id/billing` returns entries and bill snapshots. All errors are JSON
`{error}` with a non-2xx status. The UI uses these exact routes.

Dates are `YYYY-MM-DD` with a separate IANA timezone on deadlines. Money is an
integer number of USD cents; rates are cents/hour. Time charges round half-up to
the nearest cent. Bill decisions require the current `revision`; document and
deadline changes use compare-and-swap guards. An exported package is immutable,
and a source entry can belong to only one live original bill. Corrections add a
reviewed delta and preserve the original package.

Matter-document originals are base64, at most 1 MiB each. INTAKE-001 originals use the separate R2 path below, up to 10 MiB each. The restore convenience route
accepts `{archive,confirm:'RESTORE',journal?}` with up to 24 MB of JSON; the CLI
and `Content-Type: application/x-ndjson` with `X-Satchel-Confirm: RESTORE` support streamed archives without a total-byte ceiling. `journal` is the complete newer archive, validated for
its erasure checkpoint. Import CSV details and fixtures are in IMPORTING.md.

## Native trust records (TRUST-001, TRUST-002)

The principal creates `POST /api/satchel/trust/accounts` with `name`, `kind` (`trust` or `operating`) and `bankReference`. Save a member with role `trust_officer` to designate them; an owner also needs this explicit designation to authorize trust work. Designation does not grant matter access or legal approval.

Designated officers read `/trust` and `/trust/transactions` under the same `/api/satchel` prefix. `POST /trust/ledgers` takes `accountId` and `matterId`. `POST /trust/openings` takes `accountId`, `ledgerId` (trust only), integer `cents`, `statementDate`, `documentId` and `note`; `/trust/openings/:id/approve` takes its exact `revision` and `reviewNote`. The original document version and SHA-256 remain linked to that review.

`POST /trust/transactions` takes a stable `requestKey`, `accountId`, `ledgerId` (empty for an unidentified receipt), `direction` (`receipt` or `disbursement`), `kind` (`receipt`, `retainer`, `check`, `wire`, `ach`, `cash`; disbursements use a payment method), integer positive `cents`, `counterparty`, `bankReference`, `receivedDate`, `depositDate`, optional bank-confirmed `clearedDate`, `documentId` and `purpose`. Replaying a request key with changed content is refused. `/trust/transactions/:id/decide` takes `revision`, `decision` (`approved` or `declined`) and `reviewNote`; replay never posts a second entry. Pending disbursements reserve that matter ledger’s cleared available funds. Unidentified receipts stay in suspense and never increase another client’s availability.

`POST /trust/entries/:id/clear` records an actual bank result with `clearedDate`, `bankReference` and `documentId`. It appends evidence rather than rewriting the posted entry. These doors record bank activity; they do not claim to send money. Dates are inclusive YYYY-MM-DD dates, cannot be future UTC dates, and received/deposit/cleared dates must be ordered. New transaction posting dates cannot precede the bank register’s latest posting date. Agents have no trust authorization door.

## Earned-fee trust applications (TRUST-004 native slice)

Officers use `/trust/transfers` to request and inspect applications; requests take `billId`, `ledgerId`, `operatingAccountId` and stable `requestKey`. The invoice must be reviewed and belong to that exact matter. Satchel reserves the smaller of unpaid earned fees and the client ledger’s cleared available funds. Approved correction amounts are included; a pending draft correction or changed reviewed invoice requires fresh review.

The principal configures `/trust/transfer-policy` with its current `revision` and `dualAuthorization`. Each request freezes the required one or two distinct designated officers. `/trust/transfers/:id/decide` takes the application `revision`, `decision` and `reviewNote`. `/trust/transfers/:id/bank-result` takes `revision`, `outcome` (`submitted`, `cleared`, `not_executed`), `bankReference`, `bankDate`, `documentId` and `evidence`. Submission is a human-recorded bank instruction, never a Satchel bank send. After submission the record awaits bank reconciliation across restart; actual cleared evidence posts linked trust debit, operating credit and one invoice payment exactly once. A bank-confirmed non-execution releases the reservation without posting money.

`/trust/transfers/:id/reversal` takes a `reason` and reserves the exact original payment for return. `/trust/transfers/:id/reversal/action` takes its reversal `revision`, `kind` (`approved`, `declined`, `submitted`, `cleared`, `not_executed`) and `note`; bank actions also take `bankReference`, `bankDate` and `documentId`. Reversal requires at least the original approval threshold (or the current dual threshold if stronger). It appends opposite bank/ledger entries and a payment reversal naming the original only after the bank confirms clearance. The original invoice artifact and original payment remain intact; the invoice reopens by the returned amount. These are native records; batch approval, collection sequences, complete client statements, three-way reconciliation and QuickBooks synchronization remain the named TRUST-004 gaps.

## Action audit (FIRM-005)

The principal reads `GET /api/satchel/audit` and downloads `/audit/export`. Both apply the same optional `matterId`, `from`, `to`, exact `actor` email/system name and exact `action` filters. Date bounds include the full selected UTC days. Browse uses `offset`/`limit`; export streams every matching row from a frozen append-only snapshot and returns its count in `X-Satchel-Audit-Count`. Its own export-request action is appended after that snapshot, so it appears in the next export. `/team` now returns personal preparation keys; its former recent-100 audit field is replaced by this complete audit door.

JSONL rows retain actor ID/email/role/channel, object and matter IDs, revision, exact record evidence, human decisions, applicable automation policy and observed provider/bank outcome evidence. Native bank results remain human-recorded evidence, not bank-API verification. The source snapshots exclude session credentials, agent-key digests and original file bytes. Earlier rows keep every original field unchanged: unavailable evidence is null, with `legacy: true`, displayed as “legacy, not recorded”. Present roles never rewrite past actions. Archive export/restore and original downloads record custody; restore adds its own source-hash action without changing imported history.

## Document sets (DOC-004)

`GET /api/satchel/matters/:id/document-sets` returns accessible originals, folders with accessible counts, tag/type facets and saved filters. Duplicate matches are hash matches among accessible versions of distinct documents in that matter; neither original is replaced.

`POST /matters/:id/document-sets/folder` takes `{name}`. `/preview` takes `{documents:[{id,revision}],folderId?,tags?,documentType?}` and records the exact before/after metadata, retained versions and reader descriptions. `folderId:null` unfiles, an empty tag array clears tags and an empty document type clears that classification. `/apply` takes `{previewId}` and applies that preview once to the same person's current-authority, unchanged originals. A stale source requires another preview. Metadata filing retains document IDs, original bytes, visibility and every version.

`/view` takes `{name,filters:{folderId?,tag?,documentType?,query?,duplicatesOnly?}}`; saved filters belong to the signed-in person within that matter and confer no sharing access. Every use rechecks the current document/private-read boundary. Filing authority remains the original uploader or principal.

## Legal contacts (INTAKE-004)

`GET /api/satchel/contacts?q=` searches names, aliases, former names, contact details, source IDs, related entities and permitted matter roles using normalized word prefixes (all query words must match). The principal/lawyer manages firm contacts; assistants/trust officers receive only contacts on permitted matters. Every matter title/link and related contact applies current access. `GET /contacts/:id` resolves a retained losing ID to the visible surviving contact.

`POST /contacts` saves `{id?,revision,kind,name,aliases:[],formerNames:[],emails:[],phones:[],addresses:[]}` using the current graph `revision`; `kind` is person or organization. Imported source rows remain intact alongside editable profiles. `/contacts/:id/matter-role` adds `{revision,matterId,role}`; `/relationship` adds `{revision,otherId,relationship}`. Roles are client, adverse, insurer, witness, expert or counsel. `/consent` adds `{revision,channel,decision,evidenceDate,source}` for that exact source identity. Evidence is recorded, not provider-verified; no message sends. The latest recorded decision per identity/channel controls in durable recording order. Any denied identity denies the merged channel; all must allow before it is allowed; otherwise unknown. Evidence dates do not schedule future changes.

`POST /contacts/merge-preview` takes `{survivorId,duplicateId,reason}` and records a same-kind, exact graph review for the current person/role. `/contacts/merge` takes `{previewId}` and applies it once if the graph and authority still match. Source IDs, import provenance, related entities, matter roles, consent history and earlier conflict snapshots remain; historical matter/financial text does not change. Changed graph data requires a new conflict review before opening a matter. Source-import replay reuses its original job; undo preserves graph dependencies. These merge and consent records round-trip in native firm archives.

## Published intake forms (INTAKE-001)

Counsel lists and versions `/api/satchel/intake/forms`. A save takes `id?`, current `revision?`, `title`, `practice`, `firmName`, optional PNG/JPEG `logoDataUrl`, active `assignedEmail`, `consentText`, `published` and `questions`. Each question has a unique `key`, `label`, `type` (`text`, `select`, `date`, `yesno`), `required`, choice `options?` and optional `when:{key,equals}` referring to an earlier choice/yes-no question. Editing publishes a new immutable numbered version; stale edits are refused.

The public page is `/intake/:id`. `GET /api/satchel/intake/public/:id` reads its published definition and issues a hashed, twenty-minute revision-bound submission token. `POST` to the same API path is multipart: `data` is JSON `{token,revision,name,email,phone,summary,answers,consent:true,website:''}`, and up to three `files` are PDF/PNG/JPEG originals of at most 10 MiB each. The upload stream is bounded before parsing at 32 MiB. Conditions and type signatures are checked by the server. Exact Origin and non-cross-site requests are required. A honeypot and ten accepted submissions per form/hour/HMAC-IP limit spam; no raw IP is stored, and hourly digests expire within two hours. The form's current assignee is checked inside the native lead/receipt/provenance transaction.

Success returns only `{receipt,receivedAt}`; token replay returns that receipt while the token remains valid. No mail or anonymous receipt-retrieval door exists. Inquiry-review consent creates no contact identity, channel consent or authority to contact the prospect.

`GET /api/satchel/leads/:id/intake` returns permitted source submissions, recorded consent, answers and original-file metadata. `/intake/files/:id` streams an authenticated attachment after hash and current source/survivor ACL checks. Originals are explicitly **not malware-scanned**. Lead reassignment and merging do not create a second access boundary. Native archives include originals and immutable provenance; ephemeral tokens, network digests and temporary upload reservations are excluded. Unfinished uploads prevent an incomplete archive; expired uncommitted R2 keys are collected through the scheduled/public/backup cleanup paths.

## Scoped versioned integrations (CONNECT-001)

Principal-created, explicitly scoped integration keys use `/api/satchel/v1`, separate from legacy agent keys. See [the complete versioned API, pagination, preparation idempotency, signing and delivery guide](docs/integrations.md). Team & safety exposes matter/capability selection, opt-in webhooks, once-only credentials, durable outcome journals, replay and revocation.

## Numbered checks and deposit records (TRUST-009)

Officers read `GET /trust/checks`. `POST /trust/checks` takes `{transactionId,checkNumber,requestKey}` for an approved uncleared check disbursement; reissues also take `{originalCheckId,reason}` and must match the voided original account, ledger, payee and amount. Check/slip numbers accept 1–12 positive decimal input digits, normalize leading zeros and remain unique per account after voids. `GET /trust/checks/:id/print` returns a printable record, never a payment authorization.

`POST /trust/checks/:id/void` takes `{revision,reason,effectiveDate,documentId}`; `/void/decide` takes `{checkRevision,revision,decision,reviewNote}` for exact append-only reversal review. `/match` takes `{revision,checkNumber,cents,clearedDate,bankReference,documentId}`. A voided/pending-void check cannot clear; a cleared check cannot be voided.

The principal with an active officer designation records operating transactions at `POST /trust/operating-transactions` using the trust transaction fields without a client ledger. `/trust/operating-transactions/:id/decide` reviews `{revision,decision,reviewNote}`. Both this and the older generic decision door enforce the same operating guards. Cleared funds minus pending operating disbursements and earned-fee reversals cover each payment. Satchel records bank activity; it sends no money.

`POST /trust/deposit-slips` takes `{accountId,slipNumber,bankReference,entryIds,requestKey}` with distinct approved uncleared receipts in one bank account; each receipt belongs to one immutable slip. `GET /trust/deposit-slips/:id/print` preserves original receipt sources and says it is not bank confirmation. Numbered records, reviews and sources round-trip through native archives.

## Same-client matter trust transfers (TRUST-010)

Designated officers who currently see both matters list `GET /trust/matter-transfers`. `POST /trust/matter-transfers` takes `{fromLedgerId,toLedgerId,clientId,cents,effectiveDate,documentId,reason,requestKey}`. `clientId` must resolve through INTAKE-004 to one canonical client identity related as client on both matters. Written authority is an exact matter-visible retained original in the source matter; its hash/version stays pinned even after a later version.

`POST /trust/matter-transfers/:id/decide` takes `{revision,decision,reviewNote}`. One or two distinct active officers, frozen by the request’s policy, approve the exact record. Same-account final approval posts a paired subsidiary allocation with no bank movement. Between accounts it reserves only. `/bank-result` takes `{revision,outcome,bankReference,destinationBankReference,bankDate,destinationBankDate,debitCents,creditCents,documentId,destinationDocumentId,evidence}`. Record submitted, then cleared or confirmed not_executed; references and source/destination originals identify both actual bank outcomes. Amounts are exact transfer cents, or both zero for confirmed non-execution. Uncertainty retains funds across restart; only cleared evidence posts. This door never sends funds.

`POST /trust/matter-transfers/:id/reversal` takes a new `{requestKey,effectiveDate,documentId,reason}` and creates a separately reviewed opposite transfer linked to its original. Its threshold is the greater of the original and current policy. Pending requests share cleared availability with checks and earned-fee applications; stale authority, different clients, overdraw and uncleared borrowing refuse. Individual entry reversal/clearance cannot split a transfer. Same-account allocations appear in client statements and reconciliation while staying out of bank-register rows. All records, authorizations and decisions round-trip in native archives; signed periods require explicit reopening and retain their prior packets.

## Document review and retained save conflicts (DOC-002)

`POST /api/satchel/matters/:id/documents` appends to `documentId` only with its base `revision`. A successful save returns `saveOutcome: "published"`; a stale or racing save returns `saveOutcome: "conflict"` and `conflictId`, retaining the attempted bytes separately without changing the current original. Omitting a base revision is refused.

`GET /documents/:id/review` lists version-bound annotations and retained conflict metadata under the same `/api/satchel` prefix. `POST /documents/:id/annotations` accepts `{version,page,note}`; page means the original page or content section. It records author and time without changing the original or its revision. `GET /documents/:id/conflicts/:conflictId/file` downloads the exact attempted original after an integrity check. `POST /documents/:id/conflicts/:conflictId/resolve` accepts the current `{revision}` and appends the copy once, or identifies an already-retained identical original. The document's existing uploader/principal append authority applies. All review and conflict reads use current matter/private visibility; erasure and scheduled disposal remove their content and fence old archives.


## Counsel conflict evidence

Only a native principal or lawyer session uses these doors. Agent and integration keys cannot search, dispose, record a waiver or set restrictions. Conflict evidence supports counsel's decision; it never asserts legal clearance.

- `POST /api/satchel/contacts/:id/conflict-classification`: with the current graph `revision`, record `classification: prospective_client`, an unconverted `leadId` and evidence `note`; or `classification: staff_relationship` with `staffEmail`, relationship `kind`, `startDate`, optional `endDate` and source `note`. A public inquiry never claims a contact identity or consent automatically. Prospective labels use the linked lead's stage and firm-local received year.
- `GET /api/satchel/conflicts/:id/review` resumes the current person's search. `POST .../disposition` records `decision` (`no_conflict`, `waiver_recorded`, `restrictions`, `decline`), `note`, disclosed `restrictions`, optional `excludedStaff` emails and `screenCustodian` email. Excluding the principal requires an inside screen custodian. A required screen creates its wall in the atomic opening operation.
- `POST /api/satchel/conflicts/:id/referrals` takes the opaque `wallId` shown in the result (`principal` for ordinary ungranted matches). `GET /api/satchel/conflict-referrals` gives requesters only routing, outcome, custodian, time and disclosed conditions; designated custodians get their private evidence. `POST /api/satchel/conflict-referrals/:id/decide` uses the same closed decision set. Conditions attach at opening; decline or a missing/stale decision refuses opening.
- A `waiver` records `parties` (client contact IDs on the affected matter), `date`, `scope`, answered `matchId`, and either written `confirmation` or original `name`, `mime`, `contentBase64` (up to 5 MiB). It is labelled “practitioner-recorded, not signed through Satchel”. Only the current custodian reads a restricted waiver's file.
- `POST /api/satchel/matters/:id/restrictions/remove` requires a principal or a lawyer on the matter, the excluded `email` and a `reason`. Until removed, the grant door refuses the staff member naming the restriction, and reads intersect that exclusion. Wall membership remains a separate custodian decision.
- `POST /api/satchel/conflict-waivers/:id/dispose` is a principal-only native door with `confirm` (the exact filename) and `reason`. Every affected matter needs an expired whole-matter retention schedule and no active whole-matter hold. Disposal removes original chunks and written confirmation, retains metadata/digest/attribution, audits one receipt and advances the archive erasure fence. It never removes an engagement exclusion or grants access. Restriction payload disposal remains a contract Gap.

Opening acknowledges the disclosed restrictions with `restrictionsAcknowledged: true`. Party changes invalidate every prior search and disposition; run and review a fresh search. Archives retain the evidence and active exclusions.

Ethical wall lifecycle (FIRM-003): the current custodian updates `POST /matters/:id/wall` with an inside active counsel `custodianEmail` for handover, or posts `{revision, reason}` to `/ethical-walls/:id/dissolve`. With no active custodian, an inside active lawyer/principal posts `{revision, reason}` to `/ethical-walls/:id/take-custody`. Every change revokes exceptional grants. These native-session doors refuse outsiders, including the principal. Exceptional access never permits whole-firm archives, import originals or aggregates.

Conflict retention (INTAKE-005): `POST /conflicts/:id/dispose` takes `{confirm: <search id>, reason}` in a principal native session. Every affected source/opened matter must have an expired matter schedule and no legal hold. It disposes counsel notes and restriction payloads, including audit payload copies, while retaining ids, decisions, attribution, times and original audit digests. Staff exclusions and walls remain enforced; the disposed search cannot clear an engagement or be given a new disposition. Waiver original bytes retain the separate `/conflict-waivers/:id/dispose` confirmation. `screenRequired: true` on a disposition creates a wall at opening, defaulting its custodian to the recording counsel unless `screenCustodian` explicitly names active inside counsel.


## Automated client reminders

All routes below use a human native session under `/api/satchel`. Agent keys cannot
approve templates, opt in a matter or schedule these messages. Custom roles need
write permission for contacts, documents and billing. The principal can assign the
responsible counsel through the existing matter stage-profile route; only that
currently responsible counsel may enable, withdraw or schedule reminders.

- `GET /matters/:id/client-reminders` returns `availableTemplates` for review,
  immutable approved `templates`, the matter's append-only `authorizations` and
  durable `jobs` with provider outcomes or explicit stop reasons.
- `POST /client-reminder-templates` takes `{kind, confirmed:true, reason}`.
  `kind` is `invoice` or `appointment`. Counsel approves the exact previewed
  plain-text content once; the returned `id` is its immutable version. Supplied
  subject, body, markup and attachments cannot alter these confidential templates.
- `POST /matters/:id/client-reminders` takes
  `{enabled, invoiceTemplate, appointmentTemplate, maxContacts, reason}`.
  Both approved template versions are required when enabling. `maxContacts` is
  from 1 through 7, counting all attempted reminder sends to that recipient across
  matters and both kinds during the trailing seven days, including uncertainty and
  refusals at the provider. A new decision supersedes the old one and stops its
  pending jobs; changing responsible counsel also invalidates old authority.
- `POST /matters/:id/client-reminders/schedule` takes
  `{recipient, dueAt, billId}` or `{recipient, dueAt, appointmentId}`. `dueAt` is
  a canonical UTC instant, such as `2026-11-01T12:00:00.000Z`. It records one
  durable reminder under the current authorization and exact source version.
  The invoice must already be issued and active. A changed or cancelled source
  stops its reminder instead of silently changing the approved instructions.

The existing scheduled worker processes due jobs. At the final durable send claim
it rechecks the active responsible counsel, current custom permissions and matter
walls, the latest per-matter opt-in, active portal authority, affirmative consent
on every merged identity, source version and recipient rate cap. A denial stops
that job with its reason; renewal requires a fresh explicit scheduling decision.
Invoice and appointment notices contain only generic sign-in instructions and a
link to the authenticated portal. No amount, matter name, appointment facts,
invoice contents, markup or outbound attachment is sent.

The existing **Reviewed email** screen displays each generated message, retained
approved template version, attempts and provider outcomes. A send-start audit and
its result retain the template version. Unknown acknowledgments never retry
automatically, including after restart. The existing explicit **Review another
attempt** action requires a new audited human decision and still applies current
authority and the reminder rate cap. Provider acceptance is not mailbox delivery.
The dedicated live-mail key is not provisioned; this implementation has native
handler and provider-edge proof, not live-provider delivery proof.

### Invoice template revisions and defaults

Human principals, lawyers and billing staff can approve `POST /invoice-templates`
with an exact `previousId`, branding, a name, reason and `confirmed:true`. Each
approval appends an immutable revision. Optional boolean display fields are
`showTimeEntryDetail`, `showHours`, `showRates`, `showTimekeepers`, `showUtbms`,
`showNoChargeLines` and `showDiscounts`; `layout` is `detailed` or `summary`.
Existing callers retain detailed dates, narratives and no-charge lines while
other detail fields default to hidden. Summary layout aggregates services and
expenses and suppresses individual source details. Display choices never reprice
the reviewed sources or change the invoice total. A displayed hourly quantity is
the recorded worked duration; the recorded hourly rate is shown independently
of agreement discounts and reviewed reductions.

`includeTrustBalance` shows the separately dated matter trust balance, never a
payment or deduction. Optional `includePriorBalance` shows the net balance of
other nonvoid issued invoices on the same matter issued before this invoice's
issue timestamp, less their currently cleared payments. This dated presentation
is separate from the current invoice total. Payment changes and prior-invoice
changes during rendering cause the atomic write to refuse rather than freeze a
mixed snapshot. Pending provider funds are not cleared payments. The prior
balance is native invoice presentation, not the full client ledger in BILL-010.

`POST /invoice-template-defaults` takes `scope` (`firm` or `client`),
`templateId`, `previousId` and `reason`; client scope also requires an accessible
`matterId` and uses that matter's current recorded client value, like native fee
agreements. `GET /invoice-template-defaults` returns the current firm default.
`GET /matters/:id/invoice-template` returns the effective assignment and the
current client default only after matter access checks. Resolution is explicit
matter assignment, then client default, then firm default. Matter assignment
writes take the prior explicit matter-assignment ID, or null when overriding an
inherited default. Prebill review names the effective scope and exact revision.
Defaults and matter assignments pin a revision: editing creates another revision
that a person selects for future invoices, and never silently changes an existing
assignment or issue.

`POST /invoice-templates/:id/retire` takes a reason and permanently retires that
revision for future assignment, issue and delivery rendering. Existing issued
and delivered bytes remain retained and downloadable under their original access
rules. An assignment to a retired revision requires an explicit active replacement;
retirement never silently falls back to another template. All template, default,
assignment and retirement decisions are audited. Notification wording approval
remains counsel-only and these changes authorize no outbound send.

### Consolidated payer statements and current economics

`POST /api/satchel/matters/:id/payer-statements` accepts an optional `matterIds`
array containing the route matter and up to 49 other accessible matters of the
same recorded client. Omission retains the single-matter behavior. Every selected
matter must already have a current issued invoice delivered to the exact
`recipient` and a current invoice portal grant for that payer. No automatic email
is sent. The frozen statement retains invoice allocations and source fee terms;
its list and PDF routes refuse disclosure unless the reader still has access to
every included matter. Losing one grant suppresses the whole statement.

The principal may use `POST /api/satchel/reports/staff-costs` with `email`,
`effectiveFrom`, `hourlyCents`, `reason` and `confirmed: true` to record an immutable
staff cost approval. One approval per staff member and effective date is allowed;
a later effective date changes costing prospectively by work date. These costs
never change billing rates. CT approved the principal-only policy with riders on 26 October 2026; complete implementation proof remains partial.

`GET /api/satchel/reports/economics` returns current permitted matter economics,
formulas, a UTC read timestamp and the source entries, live issued lines, invoice
balances and cost approvals used. The existing practice, owner, opening-date and
case-status filters select matters; they are not transaction-period filters.
`GET /api/satchel/reports/economics/export` downloads that same formula basis as
JSON and records an export audit event. Both doors are principal-only. An `asOf`
input is refused: the read timestamp describes current state and does not claim
historical accounting. Missing staff cost makes profitability unknown. Pending
applications and trust cash stay separate from cleared operating receipts.

The economics workspace screen, populated aging and the remaining CT policy riders
remain REPORT-002 gaps. Current processor-pending values and additive correction
reconciliation are asserted through the public report doors.

### Recorded contact preferences

`POST /api/satchel/contacts/:id/preferences` records `language`, `accessibility`
and a `source` reference against one source identity, with the current contact
graph `revision`. Current counsel contact authority and visibility are required.
Stale writes refuse. The contact read returns append-only `preferences` history
with actor and time; merged identities keep their separate instructions. This
records communication instructions without granting consent, representative
authority, automatic translation or a new recipient.

### Offline operating receipts

These native commands record received funds; they move no money and initiate no
provider call. Active human principals and billing staff need current billing
write permission, full bank transaction permission and access to every included matter.
Payer identity is the exact native client name. A hidden allocation suppresses
the entire receipt, its history and residual credit. Agents cannot post receipts.

`POST /api/satchel/offline-payments` accepts `requestKey`, `payer`, `method`
(`cash`, `check`, `wire` or `ach`), `reference`, `receivedDate`, `depositDate`,
`operatingAccountId`, integer `cents` and `purpose: "operating"`. The deposit date
cannot precede receipt. Select `oldestFirst: true` or explicit `allocations`
containing `billId` and integer `cents`. Oldest first uses invoice work date,
creation time and ID. Only live approved original invoices qualify. Allocations
cannot exceed the unreserved invoice balance; excess receipt becomes unapplied
credit. Trust account selection and trust purpose are refused: use TRUST-002.
No bank statement clearance or trust tax split is inferred from this record.

`GET /api/satchel/offline-payments/:id` returns receipt, retained actions,
allocations, released allocation links, status and `creditCents`.
`POST /api/satchel/offline-payments/:id/actions` requires a fresh `requestKey`,
`reason` and `kind`. With `allocate`, provide invoice `allocations` from remaining
credit. With `credit`, provide `billId` to release that invoice's live allocations
to credit without returning the receipt. With `bounce`, return an unpaid check or
ACH receipt, releasing all its live allocations, including reused credit, and
extinguishing its remaining credit. Cash and wire returns and refunds are refused.
Every release names its original allocation. Replays retain the original result;
a changed decision under an existing reference is refused. Competing allocation
transactions cannot spend the same invoice balance or receipt credit twice.

`POST /api/satchel/invoices/:id/writeoff` requires principal authority,
`approve: true`, `requestKey`, the current invoice `revision`, integer `cents`
and a `reason`. Default ADOPTED pending ct approval: the principal alone supplies
finance approval. A write-off reduces due, remains separate from actual paid
amount, and is not undone by a later payment return. No automatic refund or
write-off reversal exists. Invoices with a retained write-off cannot be voided.
Billing staff and assistants cannot approve write-offs. Live offline allocations
refuse invoice void; an explicit credit release permits the existing counsel void.

BILL-009 collection, complete BILL-010 historical statements, BOOKS-001 provider
synchronization and payment-management screens remain separate unproved work.

### Reviewed bulk work and collected revenue

`GET /api/satchel/time/bulk` lists the current person's visible import batches.
`POST /api/satchel/time/bulk` accepts a stable `requestId`, a `sourceSystem` and
between one and 100 `rows`. A row names `matterId`, `kind` (`time` or
`disbursement`), `sourceId`, `date`, `description`, `billable`, and optionally
`timekeeperEmail`. Time supplies `minutes` and an optional explicit `rateCents`;
otherwise the work-date agreement applies. Expenses supply `amountCents` and the
native `expense` provenance object, including an optional exact receipt version.
Task, activity and expense codes use the existing UTBMS fields and checks.
The principal can import another eligible staff member's work; everyone else
imports their own. The submitter remains the creator, separately from the
original timekeeper. Retaining attribution grants no authority to act as that person.

Validation retains each original row and its specific errors without recording
work. `POST /api/satchel/time/bulk/:id/rows` accepts the current batch `revision`,
a `rowId` and its complete repaired `row`. Repair refreshes every row's pricing,
codes, expense provenance and approved cost basis. Posting at
`POST /api/satchel/time/bulk/:id/post` requires that exact `revision`,
`reviewDigest` and stable posting `requestId`. It rechecks current native
eligibility, both people's matter access, ethical walls and all reviewed financial
inputs, then records the whole batch atomically. Invalid or stale review posts no
work. An unchanged replay returns the original result; changed request terms
refuse. Posted rows, originals and source identities remain retained through
restart and archive recovery. Staff cost figures remain principal-only.

`GET /api/satchel/matters/:id/revenue` is a principal-only review of actual applied
operating collections, approved allocation rules and calculation history. It
separates invoice value, uncollected balances, write-offs, pending payments,
trust custody and unapplied receipt credit from collected money. Credit counts
only when applied to an invoice. Sources include offline invoice allocations,
verified paid operating processor collections and bank-cleared operating
applications; their releases, refunds and reversals retain their source identities.

`POST /api/satchel/matters/:id/revenue/rules` requires `approve: true`, a stable
`requestKey`, `previousId` (null for the first version), `reference`, and the
reviewed supporting `sourceDocumentId`, `sourceVersion` and `sourceDigest`.
The sole supported basis is `proportional_fee_receipts`. Two `splits` name
`origination` and `responsible`, each with an active attorney `email`, `shareBps`
and `commissionBps`. Combined shares cannot exceed 10,000 basis points; the firm
retains the remainder. Native principal approval is explicit, never inferred from
a job title, rate, imported row, custom role, agent or integration credential.
Rules are append-only versions with retained approver, approval time and source.

Each eligible source returns its exact calculation and `reviewDigest`.
`POST /api/satchel/matters/:id/revenue/allocations` requires `approve: true`,
`requestKey`, `sourceKey`, `ruleId` and `reviewDigest`. It freezes that source's
reviewed net receipt, prior reversal identities, invoice components and rule.
Retained bank earned-work and tax components take precedence; only the earned-work component is apportioned across pre-tax lines. Unsplit receipt cents are apportioned across frozen net source lines and tax by largest
remainder, with source identity breaking ties. Only collected fee cents are shared;
expense and tax receipts are separate. Shares use the same cent-conserving method,
and each commission is its allocated share times the approved commission basis
points, rounded half-up to whole cents. Later source reversals subtract successive
calculations on that retained basis exactly once, including any rounding remainder;
pre-approval returns are already excluded from the approved original. Rule changes
never rewrite earlier allocations, work records or bill artifacts. These records
calculate compensation; they authorize no payout or other money movement.

## Native evidence packets and medical chronologies

Counsel prepares `POST /api/satchel/matters/:id/productions` with the intended recipient, Bates range and exact source versions. Each item includes its current document revision, privilege label, withheld choice and whole-page redactions. Selective redaction includes `renderedPages: {sourceSha256,pages:[{page,pngBase64}]}` from the authenticated original renderer. The server requires exactly the retained pages, decodes their pixels into a new PDF and creates fresh black pages for removed content. The immutable packet carries its manifest, privilege log, active hold labels and exact hashes; originals remain separate.

`POST /api/satchel/productions/:id/approve` records counsel review of `sha256` and `reviewNote`. The principal explicitly requests the named recipient's native account invitation with `POST /api/satchel/productions/:id/invite-recipient`; this grants no firm or matter access. The principal authorizes each release with `POST /api/satchel/productions/:id/release` and `{sha256,recipientEmail,expiresAt,reason}`. Expiry is an ISO timestamp. The recipient must match the packet and authenticate as that exact native account. No email or release is sent automatically.

The returned recipient address opens an authenticated page. `GET /api/satchel/production-shares/:id` reads its availability; only authenticated `POST /api/satchel/production-shares/:id/file` opens the packet and records its exact hash, byte count and receipt. `POST /api/satchel/production-shares/:id/recall` accepts a principal's `reason` only while unopened. An opened packet remains disclosed in the audit. There is no recipient sharing door or link-only byte access. Every read rechecks expiry, recall, current account and authorizer authority, source availability and hold labels. New hold labels require a newly prepared and approved packet. Archive recovery retains packet and audit evidence but requires fresh external release authorization.

The principal records explicit authorization and agreement references through `POST /api/satchel/matters/:id/chronologies/setup`. The existing chronology POST accepts `{sources:[{documentId,version}],reportedTotalCents,gapDays}` to extract readable private PDF originals uploaded by that principal. Native PDF processing reads provider, service date, description, integer-cent charges and source-page evidence without an external processor. Unreadable or unsupported pages fail visibly and save no partial chronology. The snapshot retains source totals, record intervals, duplicate candidates and discrepancy totals without deciding causation or excluding charges. `POST /api/satchel/chronologies/:id/publish` still requires the exact snapshot hash, an explicit decision on every candidate and counsel's review note. Reviewed record-file import remains an explicit alternative.


### Reviewed matter updates

Confirming a legal date tied to a current original version creates a source-cited draft in the same transaction. An exact replacement retains the previous confirmed date. Drafts include outstanding shared client tasks; they grant no delivery authority.

- `GET /matters/:id/matter-updates` returns visible drafts, approved packets, separate portal and email states, reviewed promises, replies and unresolved follow-ups.
- `POST /matters/:id/matter-updates/generate` takes `deadlineId` and optional `previousDeadlineId` for an explicit reviewed association.
- `POST /matter-updates/:id/edit` takes the current `revision`, `title`, plain-text `body`, exact `recipients`, `promises` containing `text` and `responsibleEmail`, `responsibleEmail`, ISO UTC `dueAt` and `maxContacts`. Current responsible counsel reviews this entire saved packet.
- `POST /matter-updates/:id/approve` takes its exact `revision`, `confirmed: true` and `reviewNote`; approval freezes the saved packet and schedules each exact recipient.
- `GET /portal/matters/:id/updates` returns only published updates addressed to the currently authenticated, authorized client. `POST /portal/matter-updates/:id/replies` takes `body` and opens a responsible follow-up.
- `POST /matter-update-replies/:id/complete` requires completion `evidence`. A later reply opens new work.
- `POST /matter-update-promises/:id/fulfil` takes a retained original `documentId`, exact `version`, `digest` and explanatory `evidence`. Reviewed promises remain in the live closure inventory until source-backed fulfillment or an individual counsel carry decision.

Scheduled delivery rechecks active approving counsel, current responsible assignment, custom permissions, matter walls, exact current source, current portal authority and affirmative email consent on every merged identity. Updates and reminders consume one trailing seven-day recipient contact budget, including uncertain attempts. A refusal stops the job visibly; renewed consent does not restart it. Portal publication and provider email outcomes are recorded separately. Existing reviewed correspondence routes reconcile email or authorize one deliberate new attempt; no uncertain attempt retries automatically. Closing pauses unsent jobs, and reopening resumes only explicitly selected approved schedules without sending or granting access in that transaction.

### Operating processor reconciliation and installment plans

All paths below use the existing authenticated API prefix. Processor readback supplies money facts; browser redirects and callback bodies supply no payment authority. Trust collection protection is unchanged.

- `GET /bills/:id/reconciliation` returns principal-only retained collection events, linked corrections, refund approvals, settlement observations and bank matches.
- `POST /stripe/collections/:id/reconcile` recovers a lost hosted checkout response by exact native identity, or reads back the known checkout or intent. It creates no collection.
- `POST /stripe/collections/:id/refund` currently requires Stripe test mode and principal approval with `requestKey`, exact invoice `revision`, positive integer `cents`, `reason` and `confirmed: true`. The approval precedes one idempotent provider call. Replays do not send again; changed requests are refused. An uncertain outcome stays reserved for human reconciliation.
- `POST /stripe/collections/:id/settlement` takes `payoutId` and retains authenticated payout and complete balance-transaction readback, including exact gross, fees and net. `POST /stripe/collections/:id/bank-match` requires `observationId`, exact `cents`, unique `bankReference`, `reason` and `confirmed: true`. Incomplete, unknown, failed or mismatched payouts cannot be matched. Observations and matches are append-only; no bank movement is initiated.
- `GET /bills/:id/payment-plans` lists accessible plans. Its `POST` requires principal `approve: true`, current `billRevision`, `balanceCents`, `startDate`, `reason` and ordered `installments` with `dueDate` and integer `cents`. A hardship change also supplies `planId` and current plan `revision`; it retains history, pauses collection and requires new client consent.
- Source schedules use `sourceSystem` and `sourceReference` only. Source payment credentials are refused. The new plan starts paused with a principal task due before its first installment.
- `GET /payment-plans/:id` returns current schedule, consent evidence, attempts and retained history to staff. Clients receive only the current schedule, collection states and their own consent; internal approval reasons, provider credentials and event history remain private. Client-session `POST /payment-plans/:id/mandate` requires exact `revision`, `agree: true` and `requestKey`, and opens hosted Stripe setup. On return, `/payment-plans/:id/mandate/confirm` requires `setupId`, current `revision` and fresh `agree: true`; authenticated readback verifies the exact mandate and customer.
- `POST /payment-plans/:id/actions` takes current `revision`, `kind` and `reason`. The consenting client can `revoke` or `dispute`; the principal can also `pause`. The scheduler rechecks current principal authority, invoice revision, portal authority, provider configuration, payment method, bank mandate and available balance before dispatch. An installment identity is claimed atomically before one provider call. Failed, returned, disputed, revoked and uncertain work stops with a human task. Plans currently accept Stripe test mode only.
