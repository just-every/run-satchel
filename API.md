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
`GET /matters/:id/billing` returns entries and bill snapshots. All errors are JSON
`{error}` with a non-2xx status. The UI uses these exact routes.

Dates are `YYYY-MM-DD` with a separate IANA timezone on deadlines. Money is an
integer number of USD cents; rates are cents/hour. Time charges round half-up to
the nearest cent. Bill decisions require the current `revision`; document and
deadline changes use compare-and-swap guards. An exported package is immutable,
and a source entry can belong to only one live original bill. Corrections add a
reviewed delta and preserve the original package.

Document originals are base64, at most 1 MiB each. The restore convenience route
accepts `{archive,confirm:'RESTORE',journal?}` with up to 24 MB of JSON; the CLI
supports larger archives. `journal` is the complete newer archive, validated for
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
