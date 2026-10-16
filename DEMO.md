# Satchel demo

Run `rer demo` after ordinary local setup, then open its private `RER_OPEN`
link. `rer demo --stop` deletes the throwaway state under `.rer/demo/`.
The ordinary `.wrangler/state` is retained. Restarting creates a fresh firm.

The owner, Julia Bennett (`julia.bennett@bennettlaw.example`), opens **Satchel Demo** with six conflict-reviewed matters, three
firm members, the three existing Clio fixture contacts in the conflict register,
24 time/disbursement entries, six draft/approved/exported bill
packages, 12 downloadable originals, 18 proposed/confirmed/completed deadlines
and three preparations awaiting a person's decision. The fictional dates are
relative to the visitor's start. Nothing in the seed hook fetches the network.
Fixed record IDs and conflict-safe inserts make the hook idempotent.

Base's v2 guard has no bar or outbox. Public reads run for real; writes to
other people or accounts are mocked. Satchel's native product has no public
network-read feature and no embedded model call: agent preparations arrive
through its own authenticated API. Its outbound effects are sign-in,
invitation and identity-provider email/OIDC flows. Mail selects Base’s development sender under `RER_DEMO`; it validates the
message and completes silently without contacting a provider.
OIDC discovery/JWKS remain real reads; provider write requests pass through
Base's guard. Local dev mail is silently suppressed by Base.

All vendored modules, including the import kit's D1 transport dependency,
are from `rer-v0.2.30` (`d434ea67989fe10b6ddff01daba8bb350975e54a`), recorded
by Base's `record-base` flow. Two maintained fixes stay outside the record:
the dependencies module's `logout.mjs` (exact-claim-key fence check) and the
mail module's `src/inbound/headers.mjs` (header parsing without backtracking). The edition's supported source lock replaces
the obsolete composition inventory. Applied migration files are unchanged.

`.github/workflows/run-demo.yml` uses the `run-demo` environment on the
RunEditRun account. Manual dispatch with `test_only` deploys
`https://demo.test.run-satchel.com/` with Cloudflare's published test keys;
`test_only` plus `remove` removes it and reads back the provider resources.
Production dispatch uses the environment's real Turnstile keys at
`https://demo.run-satchel.com/`. No repository deployment variable is needed.
Each visitor receives their own native Worker Loader isolate with separate
SQLite storage and a signed owner claim, ending after 60 minutes or 15 minutes
idle, when the copy's storage is erased. Settings such as the demo's
mail sender live in `deploy-demo.json`; credentials do not.
