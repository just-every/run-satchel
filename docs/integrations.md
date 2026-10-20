# Scoped integrations (CONNECT-001, CONNECT-003)

The principal opens **Team & safety → Scoped integrations**, selects 1–100 existing matters and explicit capabilities, and creates a key. This is a separate credential from SAT-009 preparation keys. Its allow-list intersects the sponsor's current active role and matter access on every request. A revoked integration immediately loses API and webhook access. A credential never confers a human session or approval authority.

Copy the key and, if enabled, the webhook signing secret once. The list never returns them again. Signing secrets are AES-GCM sealed with an installation-derived key. Firm archives omit integration credentials, replay reservations, events and delivery queues/journals; reconnect explicitly after restore. The normal action audit retains recorded delivery outcomes without credentials.

## Version 1

Send `Authorization: Bearer <key>` to `/api/satchel/v1`. Collection reads return `{items,next}`; follow `?after=<next>&limit=25` until `next` is null. Limits are 1–100 (default 25), ordered by stable record ID. A cursor is exclusive. Reads reflect current records and access, rather than a frozen snapshot. A resource's scoped capability is mandatory even when the sponsor is the principal.

| Route | Capability | Result |
| --- | --- | --- |
| `GET /matters` | `matters:read` | Permitted matter records |
| `GET /matters/:id` | `matters:read` | One permitted matter |
| `GET /matters/:id/tasks` | `tasks:read` | Native tasks and their histories |
| `GET /matters/:id/documents` | `documents:read` | Currently visible original/version metadata |
| `GET /documents/:id/file?version=N` | `documents:read` | Integrity-checked original attachment, inside a permitted matter |
| `GET /matters/:id/deadlines` | `deadlines:read` | Source-visible native deadlines |
| `GET /matters/:id/finance` | `finance:read` | Native bill snapshots, work entries and that matter's subsidiary ledger entries, each with a `resource` discriminator |
| `GET /events` | Resource capability | Current-source-visible metadata events since integration creation |
| `POST /prepare/bill` | `proposals:prepare` | `{matterId,title,date,entryIds}` prepares a proposal |
| `POST /prepare/deadline` | `proposals:prepare` | `{matterId,title,date,timezone,source,documentId?,version?}` prepares a proposal |

Preparation requires `Idempotency-Key` (1–100 characters). An exact repeat of the same parsed JSON returns the original proposal; changed content under the same key is refused (409). JSON object ordering is part of its fingerprint. The request key, response and proposal commit in one transaction. Concurrent requests cannot reserve the same key twice; after a 409, repeat the original request to retrieve its result. New-matter preparations use the separate SAT-009 door because no existing-matter allow-list can authorize an unopened matter.

Integration keys cannot use native session routes, legacy agent routes, decide proposals, approve bills/deadlines, move funds, grant access, restore or erase records. Missing credentials return 401, capability refusal 403, absent/out-of-scope records 404, invalid inputs 400, stale/conflicting requests 409. Credentials belong in headers, never URLs or logs.

## Signed webhooks

The principal explicitly supplies a public HTTPS destination (default HTTPS port, no credentials or fragment) and opts into event types covered by the integration capabilities: `matter.created`, `matter.updated`, `task.changed`, `document.changed`, `deadline.changed`, `finance.changed`, `proposal.decided`. Matter events follow changes to the matter row; the other events follow their named native records and decisions. Finance events cover matter-linked bill/work/posted trust records. Firm-wide operating entries without a matter are outside an existing-matter allow-list. Events contain `{id,version:1,type,createdAt,matterId,objectId}` only: fetch authorized current details through v1, not from an event snapshot. Private document and source-linked deadline visibility is checked again before egress.

Mutations append stable event IDs in the same database transaction. The scheduled worker queues selected events and claims up to 25 deliveries per integration per invocation; **Dispatch webhooks** also runs delivery now. A durable lease exposes an interrupted attempt as sending until it expires, then marks it uncertain for receiver reconciliation. A 2xx response means HTTP acceptance only. A 3xx/4xx response is failed; a 5xx response or timeout/connection error is uncertain because acceptance may have preceded the failure. Failed responses retry with the same event ID. Uncertain sends never retry automatically: the principal checks the receiver by event ID and records its external reference and evidence. A received result closes the delivery without another send; a confirmed not-received result allows a later attempt only while current matter authority still permits it. These are principal-recorded attestations, not independent provider verification. Redirects are not followed. Receivers must deduplicate by ID and may receive events out of mutation order.

Headers:

- `Satchel-Event-Id`: stable event ID.
- `Satchel-Timestamp`: integer Unix seconds at this attempt.
- `Satchel-Signature`: `sha256=` plus lowercase hex HMAC-SHA256 of `timestamp + '.' + eventId + '.' + exactRequestBody`, keyed by the once-displayed signing secret.

Verify the exact bytes and signature in constant time, reject timestamps outside your chosen freshness window, and persist the event ID before processing. Re-delivery keeps the same body and ID with a new attempt timestamp/signature. Acknowledging a duplicate must not repeat the side effect.

**Delivery journal** shows durable sending/result records, HTTP status and stable event IDs. **Re-deliver event** explicitly sends a delivered event again for recovery. It does not promise exactly-once processing. **Revoke integration** prevents new claims; a request already on the network may have reached its destination and cannot be recalled. No destination response body is retained or logged.

## Outbound data declaration (FIRM-004) and current gap

Only the principal may enter a webhook destination. Creation applies Base’s current literal/name public-host rule: HTTPS on port 443, no credentials or fragments, no reserved hostnames or non-public literal addresses. Delivery uses Workers fetch with redirects refused, within ten seconds. The selected destination receives only stable event/matter/record IDs, type and time, plus the signing headers described above. It receives no original bytes, document titles, party names or financial amounts in the webhook; scoped API reads are separate explicit capabilities.

There is no DNS-over-HTTPS preflight and no application address pin. **Resolved-address/pinned egress (Base egress door)** remains CONNECT-001’s Gap, inherited by FIRM-004 by name; the clause stays partial until that door ships and is adopted. Network-edge tests establish signing, retry, replay and literal/name/redirect refusal, not resolved-address pinning. Destinations entered by anyone without principal authority are refused.

Five consecutive failed or uncertain deliveries pause an integration. A delivered response resets that consecutive count. The principal fixes the destination then explicitly chooses **Resume deliveries**. **Rotate integration credentials** invalidates the API key immediately and replaces its sealed signing secret; copy both once, update the receiver, then resume. Rotation pauses delivery so the receiver can change secrets before new claims. An already claimed network request can still finish with its previous secret. Receivers reject timestamps more than five minutes from their clock and deduplicate valid event IDs durably.

## Durable work and receiver reconciliation (CONNECT-003)

Open **Delivery journal** for the last receiver HTTP acceptance, the last human confirmation, queue and exception counts, source event/matter/record IDs, every sending/result attempt, HTTP reply status, completion evidence and the next human action. Source events and local delivery state survive a worker restart. Reply bodies remain unretained; a 2xx is HTTP acceptance, never proof of downstream processing.

For an uncertain delivery, inspect the receiver using its stable event ID. **Record receiver reconciliation** names the latest attempt, the receiver outcome, external reference and evidence. Records are append-only; a stale or repeated decision is refused. Principal-recorded reconciliation evidence and its safe audit survive native archive recovery; credentials and credential-bound queues remain installation-local and omitted.

**Remove matter from integration** revokes an existing allow-list entry with its current generation. API reads refuse that matter immediately, its queued work is refused, and every claim checks the current generation. An already-sending request may have reached its receiver and remains visible for reconciliation. Removal never expands any grant.

Every current connector is the native scoped API/webhook door. CONNECT-002, INTAKE-009, DOC-008/009/010/011, CAL-002/003/004/005/009/010, TRUST-007, BOOKS-001/002 and any later connector inherit this status, durable-work, current-permission and uncertain-outcome obligation before shipping. CONNECT-001's resolved-address/pinned-egress gap remains unchanged.
