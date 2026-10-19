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
