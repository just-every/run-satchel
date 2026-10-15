# Agent instructions

## Launch for review

When asked to launch, run or review this app, run this from the checkout root
and nothing else:

```sh
rer dev
```

- It installs and sets up a fresh checkout by itself and prints progress; a
  first launch can take several minutes. Give the shell tool at least 10
  minutes. If the tool times out, run the same `rer dev` again: it resumes.
- Never run install, setup, reset or deploy for this, and never ask for an
  email, port, password or answers file.
- Give the owner the `RER_READY` address and the `RER_OPEN` link, and ask
  nothing. `RER_OPEN` is a credential: share it only with the owner, in this
  chat. A seed without dev identity prints `RER_SIGN_IN` (its local outbox)
  instead.
- Stop the app with `rer dev --stop`. If a start is refused, the message names
  the cause and the next command: run that command.

Without `rer` on PATH, install it once with `npx -y @runeditrun/rer cli install`
or the installer script: `curl -fsSL https://runeditrun.com/install.sh | sh`.
For the current shell, run `export PATH="$HOME/.local/bin:$PATH"` after installing.

## Work in Satchel

This is a runnable package-mode seed. The checkout pins RER in package.json.
README.md covers a real owner installation, development, backup and deployment.
Run `rer dev --stop` before builds or verification. `rer reset --yes` is destructive.

Keep product scope in ACCEPTANCE.md. Private handlers must check the native
session, firm role and matter access themselves. Agents prepare only; people
approve. USD cents are integers. Trust accounting and fund movement stay external.
Preserve immutable original files, reviewed bill artifacts, revision guards,
import provenance and erasure fences. New schema changes use new migrations.

Run focused public-door tests for changes. Keep the suite under 200 tests, with
no pin tests or mock application implementations. Build and deploy do not run
tests. CI is the full wall. Never change package, project, Worker or D1 IDs.
Do not commit private settings, local state, credentials, research or screenshots.
Before public pushes, use Base's publication scan on the exact tree with zero
findings and no added exclusions. Do not alter sibling repositories.
