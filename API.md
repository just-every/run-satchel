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
