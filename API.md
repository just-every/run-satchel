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
