# Satchel

Satchel is practice management for a 1–10 lawyer US firm: conflict-reviewed
matters, time and disbursements, private original files, confirmed deadlines and
reviewed bill exports. It runs in your own Cloudflare account. MIT licensed.
Trust funds remain in your existing trust ledger.

## Clone and run

```sh
npx -y @runeditrun/rer dev just-every/run-satchel
```

That one line clones Satchel, installs `rer` if you do not have it and starts the app. Without Node, `curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-satchel` does the same. To start it again later, run `cd run-satchel && rer dev`.

`rer dev` installs the locked dependencies, selects pinned Node 22.20.0 and
pnpm 10.12.4, prepares local D1, and claims a local review owner on a free port.
Allow several minutes for the first launch. If interrupted, repeat the same
command. Open the `RER_OPEN` link printed in your terminal, confirm the owner on
**Finish setup**, then enter the workspace. The link is a local credential;
keep it private. Local mail stays in the development outbox and sends no email.

For a real local owner installation, run `npx -y @runeditrun/rer install just-every/run-satchel` and then, from the checkout, before first launch:

```sh
rer setup --owner-email you@example.com
rer dev
```

For ordinary email-link sign-in use `rer dev --login`, open its printed outbox
link, request a sign-in at `/signin`, and follow the newest confirmation link.
`rer dev --stop` stops this checkout's server. Stop it before build or verify.

## Guides and run site

The public site is at https://run-satchel.com.

The public run site has **Run Satchel** instructions at `/run` and owner guides
at `/docs`. Its pages are built from the Markdown in `docs/`, `README.md`,
`API.md` and `IMPORTING.md` with `rer build --site`. The installed `/` remains
the Lobby. Start with [the getting-started guide](docs/getting-started.md).

## Do the first jobs

1. **Matters:** enter a client, adverse party and known aliases; run the conflict
   search. Review every possible match, write the clearance conclusion, confirm
   your authority and open the matter. Search covers this firm's records only.
2. **Time & bills:** select the matter. Record minutes and an hourly rate in USD
   cents, or a disbursement in cents. Prepare a bill from unbilled work, inspect
   its exact lines, approve with a review note, and download the CSV. Exported
   bills stay unchanged; prepare and approve a correction for a changed amount.
3. **Documents:** upload an original of up to 1 MiB. Choose matter visibility or
   uploader/principal only. Download any version or append a new version.
   **Deadlines:** record the date, IANA timezone and citation; link an uploaded
   source if available. A lawyer confirms it and records completion evidence.
   A new source version supersedes earlier pending or confirmed deadlines.
4. **Team & safety:** save a lawyer or assistant and send an invitation. Locally,
   it arrives in the printed development outbox. Grant the person access from
   the matter's **Matter access** section. Deactivation removes firm access
   immediately. The principal sees every matter; others see only assigned ones.
5. **Preparations:** create an agent key in **Team & safety**, keep it private,
   and use [API.md](API.md). Review its proposals here. Matter proposals still
   need your conflict search; bill and deadline proposals still need final review.
6. **Move in:** upload [the documented fixture](fixtures/clio-contacts.csv),
   preview the dry run, then commit the exact reviewed file. Inspect the journal,
   resume a large import, or undo it. Used or changed contacts survive undo.
   Follow [IMPORTING.md](IMPORTING.md) to prepare your own Clio contacts CSV.
7. **Team & safety:** download a private firm archive. Restore into an empty
   installation. To erase an original, choose its matter, type the document name
   and a reason. All version bytes are removed; names, hashes and history remain.

The exact first-release scope is [ACCEPTANCE.md](ACCEPTANCE.md). Satchel does not
calculate court deadlines, establish legal conflict clearance, send invoices,
calculate tax, handle trust accounting or move money.

## Backup and restore

The UI archive includes domain data, originals, bills, approvals, import originals
and journals. Auth credentials, sessions, agent keys and local outboxes are excluded.
The CLI uses the same Base archive format and policy:

```sh
rer export --output exports/firm.rer
# On an empty checkout/installation:
rer import --input exports/firm.rer --yes
rer dev
```

`rer reset --yes` deletes local data, settings and owner state. Export first.
Restore never merges into a populated firm. After erasure, make a new archive and
retire older backups. If an older archive must be restored elsewhere, supply a
trusted newer archive containing the erasure journal:

```sh
rer import --input exports/old.rer --journal exports/after-erasure.rer --yes
```

The old archive is refused when it predates an erasure. An offline copy cannot
know about later erasures without that newer journal. Restore the latest archive.
Re-enter private configuration and create new agent keys after a move.

## Deploy your installation

A Cloudflare account with Workers and D1, a verified sending mailbox, and a real
Resend API key are needed for hosted email sign-in. Do not put credentials in Git.

1. Stop local serving and commit intended source changes. Edit `deploy.json`'s
   `MAIL_FROM` to your verified sending address. Keep project, package, Worker and
   D1 identities unchanged. `AUTH_LOCAL` must stay `false` for deployment.
2. Supply `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` privately in the shell.
   Supply `OWNER_EMAIL`, `SESSION_SECRET`, `SETUP_TOKEN` and `MAIL_API_KEY` through
   the private environment. Generate independent random secrets of at least
   32 characters for the session and setup values. Never paste them into commands,
   screenshots, tracked files or chat. Use your secret manager to populate them.
3. Run `rer deploy --dry-run` to build and inspect the plan without provider calls.
   Then run `rer deploy`. Base creates/uses the declared D1, applies its migrations,
   deploys the Worker and assets, and verifies health. The output gives the URL.
4. Base claims the configured hosted owner and retires the one-time setup token.
   Open the printed installation's `/signin`, request an email link, and follow
   it from that mailbox. Confirm **Finish setup** before opening the workspace.

[ONBOARDING.md](ONBOARDING.md) and [RUN-LOCALLY.md](RUN-LOCALLY.md) describe the
Base owner-account command contract. Domain purchase and a public run site are
outside this release. The deploy command has no test step and no provider calls
were needed to build this seed.

## Development

```sh
rer build
pnpm run typecheck
pnpm run test:satchel
pnpm exec playwright install chromium
rer verify
```

Verify builds, typechecks, runs the public Worker journeys and ordinary email-link
sign-in, then Base checks hosted assets and hydration. Tests use fresh local D1
through real HTTP routes; no provider account is needed. One GitHub **Verify**
workflow runs per push. [SOURCES.md](SOURCES.md) records Base and sibling reuse.
