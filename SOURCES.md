# Source provenance

Satchel was generated and assembled from the committed Base foundation at
`runeditrun/base@fc0e1041efa55771142bbb57c4ab4743147e264d`.
`composition.lock.json` records the original composition. Satchel owns subsequent
product integration; the package-mode CLI is pinned to `@runeditrun/rer@0.2.15`.
The current public Coaster, Beam and Pier mains were read as package-mode examples.

Copied/adapted MIT application source:

| Source | Commit | Satchel adaptation |
| --- | --- | --- |
| just-every/run-gauge | `89dad1e9e7bcb6baaa621931fccfdfa20d3c595a` | `billing.ts`, `billing-corrections.ts`: source reservations, exact money, immutable reviewed artifacts and corrections |
| just-every/run-chest | `7bf6e3eff153323fedfdd2ef6abb7bfd0222419a` | `documents.ts`: matter/private access and immutable original versions |
| just-every/run-locket | `82478229f356d017bda62b4944b584138ef9671c` | `deadlines.ts`: exact cited sources and human-confirmed transitions |
| just-every/run-orbit | `38cef87571a413802dbaa7aa6afbab332d8cd778` | `matters.ts`: party identities, associations and recorded search |

Base import-kit is copied unmodified; `base-copies.json` records the
exact files and hashes. `0023_import.sql` composes its exported D1 schema. Base
operator-auth copies remain unchanged. The application uses Base theme tokens,
font, auth/setup/lobby frames and hydration component. Product design is deferred.

The RER package has a small pnpm patch: macOS `lsof` gets 15 seconds instead
of 3 for socket diagnostics. A controlled owned listener was missed when the
three-second lookup expired; the longer lookup retains the fail-closed ownership
check. Its package inspector also recognizes pnpm’s patch-hash suffix while
checking the exact upstream version and integrity. The copied Lobby identity also permits an absent run-site origin, showing
plain product credit while the domain is unpurchased.
