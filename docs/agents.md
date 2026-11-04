# Company preparation agents

<!-- agent-reference:start -->

## Tools by job

The specialist is **legal-practice coordinator**. These are the registry's possible classes, not a permission grant. An authenticated listing also requires current policy answers; an unset or paused policy can hide the tools. On narrow screens, scroll tables sideways, or focus a table and use the arrow keys.

| Job | Tool | Scope | Read only | Possible classes |
| --- | --- | --- | --- | --- |
| Read admitted identity | `satchel.agent.identity` | `satchel:identity` | Yes | `standard` |
| List delegated preparation work | `satchel.agent.context` | `satchel:context` | Yes | `standard` |
| Read delegated matter evidence | `satchel.matter.context` | `satchel:context` | Yes | `standard`, `sensitive` |
| Prepare matter proposal | `satchel.proposal.prepare_matter` | `satchel:prepare` | No | `standard`, `sensitive` |
| Prepare bill proposal | `satchel.proposal.prepare_bill` | `satchel:prepare` | No | `standard`, `sensitive` |
| Prepare deadline proposal | `satchel.proposal.prepare_deadline` | `satchel:prepare` | No | `standard`, `sensitive` |

Every tool carries input and output schemas in the authenticated MCP listing. Mutating calls require an idempotency key; a replay returns the retained outcome. These jobs prepare native records for a person's review and never grant external execution.

## Computed class fixtures

`standard` describes an internal preparation with measure 1. Approved selected health-source versions add `sensitive` with their native record count and kind `health`. Caller risk flags and instructions embedded in source text cannot remove it. The fixture calls below independently declare their expected classes in [agent-surface.json](../agent-surface.json); [tests/agent-door/native-journey.mjs](../tests/agent-door/native-journey.mjs) executes them through MCP and the maintained conformance journey checks the actual decisions under autonomous and held policies.

| Fixture call | Tool | Expected classes and facts |
| --- | --- | --- |
| `read-matter1` | `satchel.matter.context` | `standard` `{"measure":1}`; `sensitive` `{"measure":1,"kind":"health"}` |
| `matter1` | `satchel.proposal.prepare_matter` | `standard` `{"measure":1}`; `sensitive` `{"measure":1,"kind":"health"}` |
| `bill1` | `satchel.proposal.prepare_bill` | `standard` `{"measure":1}`; `sensitive` `{"measure":1,"kind":"health"}` |
| `deadline1` | `satchel.proposal.prepare_deadline` | `standard` `{"measure":1}`; `sensitive` `{"measure":1,"kind":"health"}` |

The paired calls without health sources are `identity`, `context`, `read-matter0`, `matter0`, `bill0`, `deadline0`. Read the descriptor for their exact argument references and injected caller flags; fixture expectations are proof targets, not classification input.

## Declared capability families

Declared: `tools`, `policy`, `pause`, `audit`, `idempotency`. Undeclared and refused: `events`, `resources`, `prompts`, `subscriptions`.

| Public surface | Current behavior |
| --- | --- |
| Resource templates | None. The resource-template listing is empty; resource reads return `capability_not_declared`. |
| Event types | None published. The event-list tool is absent and calls return `capability_not_declared`. |
| Specialist prompts | None published. The prompt listing is empty and retrieval returns `capability_not_declared`. |
| Subscriptions | Undeclared. Listening returns `capability_not_declared`; discovery advertises no change subscription. |

Internal pending-proposal adapters and internal event records do not declare a public resource or event family. The current descriptor enables only the families above; it does not narrow the full contract.

## Capacity and refusals

The installation admits 600 requests per minute per agent and at most 1048576 request-body bytes. Capacity protects the installation; it is not a daily business allowance, a provider-spend budget or execution authority. Overrun returns HTTP 429 with `Retry-After`; an oversized body returns HTTP 413. Transport and policy errors are described in [the door protocol reference](../src/modules/agent-door/README.md).

| Common code | Meaning and next step |
| --- | --- |
| `capability_not_declared` | This public family is not enabled; a different credential does not enable it. |
| `policy_unset` | A person must complete current company policy setup. |
| `policy_blocked` | The current policy refuses the classified call. |
| `approval_required` | The named person must decide at the supplied approval URL. |
| `agents_paused` | A person must resume agents before another call. |
| `native_delegation_required` | The sponsor must review the exact native key and agent binding. |
| `native_authority_required` | Current native role, matter access or delegation refuses the call. |
| `native_conflict` | Current native state conflicts with the requested preparation. |
| `resource_unavailable` | The selected native record is unavailable to this authority. |
| `idempotency_conflict` | That identity was already used for different arguments; reconcile the original outcome. |

## Outstanding contract obligations

This reference documents the declared preparation subset. Registry-derived discovery instructions, public specialist prompt delivery, the complete stranger-agent specialist journey and every remaining full-contract conformance point under autonomous and held policies remain required by BASE-AGENT-013. Resource refresh, successful multi-sponsor isolation, provider mail, timed and queued lifecycle, dual-host operation, owner-native administration, broader ct workflow parity and client custody and redaction remain unproved. See [the contract and its Status gaps](../CONTRACT.md).

AGENT-010 retains the principal-approved native-preparation, sponsor-recipient, zero-spend, no-training and no-outbound-execution floor. Full scoped delegation and provider boundaries await ct approval; canonical generated contract documents await ct cleanup. This guide enables no capability or authority and releases no other lane hold.

<!-- agent-reference:end -->

## Preparation authority

Satchel's legal-practice coordinator is available through `/mcp` in both supported
MCP eras. Discovery publishes the native tool schemas, scopes and classes.
`/agents` is the person's policy, Pause, review, approval and audit door. A company
sends signed policy to `/api/rer/agent-policy`; an unset, expired or paused policy
permits no tool effects. The door uses the installation's existing owner-claim
trust, with Business subjects bound by signed Business settings to native people.

The identity read shows the signed company display name when paired. The declared jobs are reading an admitted identity, listing approved preparation
delegations, reading selected matter evidence, and preparing pending matter, bill
and deadline proposals. `agent-surface.json` is the executable registry and
journey. Source text is untrusted evidence. Preparation never clears a conflict,
approves a bill or legal date, sends a message, moves money, or makes a filing.
People keep those native responsibilities. No provider cost or spend is granted.

A principal first creates a native key through Team & safety, approves the named
processor's agreement and no-training terms, and approves a matter delegation
with explicit source versions, actions, expiry and a finite preparation count.
After inspecting `satchel.agent.identity`, the key's sponsor binds the exact
Business agent with their native session:

```
POST /api/satchel/agent-keys/<native-key-id>/business
{"agentId":"<admitted-Business-agent-id>","confirmed":true}
```

The native person session, same-origin request and firm role are required. The
binding creates no person, native role, source permission or delegation. Revoking
the key, agreement, delegation or native sponsor stops subsequent preparation.
The server checks native matter access and custom-role field restrictions too.
A local native key at MCP has only identity, context and preparation scopes.
A recognizable invalid Business token never falls back to a native key.

Business owner identity binds to the native setup owner's operator ID. Signed
teammate IDs bind only to existing native operators and preserve the firm's
assigned legal role. A Business admin is an editor of company policy only; this
does not promote them to principal or lawyer. A native promotion does not make a
person a Business editor. Unknown, inactive and natively inadmissible sponsors
are refused. Token email never selects a sponsor, and must still match that native person’s current address; changing it refuses the token without moving the binding. New teammates must first
complete Satchel's existing person invitation and firm membership lifecycle.

`standard` describes a pending internal preparation. Approved health-source
versions add `sensitive` using the native selected record count. The caller's
risk flags and instructions in documents cannot remove that class. Approval
summaries name the sponsor, delegated matter and proposed title. The internal
proposal visibility adapter permits only its current sponsor and
preparing agent while its native delegation remains valid. The public resource
family is undeclared: templates and resource links are withheld, and reads return
typed `capability_not_declared` refusals. Native proposals and audit retain the
preparer's agent and sponsor IDs;
company approval does not substitute for counsel's later native decision.

Device admission, human legal/financial decisions, installation, import and
connector credentials retain their existing native doors. The company MCP subset
does not schedule the legacy local preparation queue, subscribe to provider
changes, deliver external mail, refresh resources, or erase retained door evidence.
The public events, resources, prompts and subscriptions families are undeclared.
Discovery reports the exact five CORE capabilities: tools, policy, pause, audit
and idempotency. Event-tool calls, resource reads, prompt retrieval and listening
receive typed `capability_not_declared` refusals without effects. Resource refresh,
multi-sponsor, mail, timed/queued lifecycle, dual-host and owner-native
administration remain unproved; the subset switch does not scope those duties.
Door policy, identity, pending approvals,
retained replay and audit stores are installation authority and are excluded
from portable firm archives. An explicit empty-destination restore records destination-local links to admitted native sponsors; it preserves all historical proposal rows and restores no key or company authority. Client custody/redaction of retained door data is
not established; original-file erasure alone is not a claim to erase that data.

The disposable conformance fixtures use the production signed owner claim and
person-only key/agreement/delegation routes. They use no database writes or
production credentials. RER 0.2.91's agent initializer receives each chosen conformance agent ID
before its first request and binds that exact ID through the existing person-only
native route. No inventory lookup or first-call admission is needed. Native preparation,
classification, held approval, replay and revocation remain real. No declared
tool reaches an outbound provider, so no provider edge is declared.

This is a preparation subset of the ct Agent surface at
`6aeb26a1acb80840ba1babf1a7249746fe89d2d3`, which has not landed on main.
Its broader workflow tools, resource types, business events, prompts and seeded
practice week are target work, not capabilities of this registry. There is no
`AGENT-013` clause at that head; `BASE-AGENT-013` is the shared manifest duty.
Legacy native preparation credentials and scheduling retain their own native
controls and do not establish company-door queue coverage. See the partial
BASE-AGENT rows in CONTRACT.md for the remaining scope and proof gaps.
