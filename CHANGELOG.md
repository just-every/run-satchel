# Changelog

## 0.1.0 — 2026-11-27

The first release. Satchel is practice management for a 1–10 lawyer US firm, and it runs in your own Cloudflare account.

- **Runs on rer 0.2.143.** The pinned platform moves from 0.2.91.
- **Mail optional.** `MAIL_PROVIDER=none` deploys with no sender or mail key: the owner signs in with `rer signin`, and sign-in email, letters, invoice notices, reminders, follow-ups, portal notices and report emails are refused and recorded as `mail_off` without contacting a provider. A configured provider works as before.
- **Demo follows releases.** The run-demo workflow redeploys the demo at each published release's tag (Base fc087acf), instead of on pushes to main.

### Not in this release

CONTRACT.md tracks the product contract: 106 clauses done, 56 partial and 54 missing at this release. Trust funds stay in the firm's existing trust ledger.

### Earlier work

- Pin RER 0.2.30: the hosted demo runs on the native Worker Loader host (each visitor gets an isolate with its own SQLite storage); vendored Base copies refreshed from `rer-v0.2.30`.
- Apply Satchel’s picked paper, cognac leather and brass style across the run site, sign-in, setup and workspace.
- Add a static run site with local run instructions and Markdown owner guides; keep the installed Lobby.
- Pin RER 0.2.20 and add a run-site workflow with deployment disabled until the release gate enables it.
