# Move Clio contacts and matters into Satchel

Only a signed-in human owner can preview, commit, inspect, resume or undo an
import. Agents, lawyers and assistants cannot use this move-in path.

## Prepare the CSV

This kit supports a **documented-shape subset**, not every Clio export format.
Use the contact fields from Clio's [contacts migration template](https://help.clio.com/hc/en-us/articles/50600879151003-Import-Contacts-with-Migration-Templates).
For a Clio Manage export, [export contacts as CSV](https://help.clio.com/hc/en-us/articles/9290532034843-Filter-and-Export-Contacts),
then prepare these columns. Clio exports reflect selected columns and filters;
this importer does not guess mappings from arbitrary export headers.

| Column | Treatment |
| --- | --- |
| `first_name` | Person's first name; required together with last name for a person |
| `last_name` | Person's last name |
| `company` | Party name when both person-name fields are empty |
| `email_address` | Primary email, or empty; trimmed and lowercased |
| `id` | Optional Satchel input extension: preserve the original Clio contact ID |
| `aliases` | Optional Satchel input extension: additional conflict-search names |

The first four headers must exist even when their cells are empty. Names are
limited to 300 characters, aliases to 2,000, and IDs to 300. Each file contains
1–1,000 contacts and at most 1 MB of UTF-8 CSV. Quoted commas, quoted newlines,
escaped quotes, CRLF/LF and a leading BOM are supported. Invalid rows and
duplicate source identities block the entire commit. Structurally invalid CSV
returns an error before planning. See [the example CSV](fixtures/clio-contacts.csv).

If a person also has a company value, the person becomes one party and the
company stays in provenance with a warning. No company relationship is created.
Unmapped columns, including phone/address/custom fields, remain in the exact
original file and raw row provenance; the preview lists those columns.

If `id` is supplied, it is the stable source identity. Otherwise identity is a
SHA-256 digest of the normalized contact name and email. Without original IDs,
a changed name/email is a different identity; supply IDs when reconciling exports.
Native parties are keyed by a digest of that identity and marked `source='clio'`.
The kit does not merge contacts by name or overwrite native/edited parties.
An exact source replay is idempotent; changed content for an already imported
identity fails with a conflict and requires deliberate reconciliation.

## Review, commit, and recover

`importAction(db, actor, op, body)` exposes the following operations to the
authenticated server transport:

| `op` | `body` | Response |
| --- | --- | --- |
| `preview` | `{csv, filename?}` | `{fingerprint, mappingVersion, counts, summary, parties, diagnostics}` |
| `commit` | Same CSV/filename plus `{fingerprint}` from preview | The review fields plus `{job}` |
| `resume` | `{id, mappingVersion?}` | `{job}` |
| `undo` | `{id, mappingVersion?}` | `{job}` |
| `status` | `{id, mappingVersion?, offset?, limit?}` | `{job, originals, undo}` |

`importState(db, actor)` returns `{jobs}` with each job's ID, mapping version,
fingerprint, state, checkpoint, total and error. `mappingVersion`, if supplied,
must match `clio-contacts-v1`.

Preview calls Base's real `planD1Import` and performs no writes. Review errors,
warnings and the normalized parties before committing. Commit requires the exact
reviewed fingerprint, which covers original bytes, filename, mapping, destination
and owner principal. Changing any of these requires a fresh preview. Commit
creates a durable Base job and applies bounded native batches. When the job is
still `applying`, use `resume` until it completes; do not upload a different file
as a substitute. Repeating an identical commit reuses its job. A fully undone
file can be deliberately imported again as a new job.

Status exposes Base's retained originals (including exact CSV bytes as base64),
source locations/hashes and per-party undo dispositions. These are private owner
records. The undo report returns 100 entries by default; use its `nextOffset`
with `status`'s `offset` to read subsequent pages (`limit` accepts 1–1,000).
Jobs, raw provenance, originals and checkpoints live in the `ik_*`
tables and must travel with the native parties in backup/restore. A stable
`role:owner` principal permits the restored installation's current owner to use
its jobs; every operation rechecks the active native owner in SQL.

Undo uses Base's `preserve-conflicts` policy. It deletes only unchanged parties
created by that job. Changed parties, including same-revision field edits, and
parties linked to any matter remain, with reasons in the undo report. The exact
party and incoming matter-link snapshots are rechecked inside the atomic undo
transaction, so a new link or edit cannot slip between observation and deletion.
Undo may require repeated `undo` calls while its state is `undoing`; `status`
shows progress and dispositions. A dependency-retained party is a terminal
retention for that undo, even if its link is removed later.

Contact imports affect only `s_parties`. Existing party triggers advance the conflict
revision, invalidating pre-import conflict searches. The importer cannot create
matters, conflict clearance, access grants, time entries, invoices, trust entries
or client credentials. A matter must still pass Satchel's ordinary fresh conflict
search and human opening procedure.

## Shared implementation

The unmodified Base import-kit source is copied from
`runeditrun/base@fc0e1041efa55771142bbb57c4ab4743147e264d` into
`src/modules/import-kit`; [base-import-copies.json](base-import-copies.json)
records the exact files and SHA-256 checksums. No Base test suite is copied.
Migration `0023_import.sql` is generated from Base's schema exports in
`initializeD1ImportStorage` order. Satchel supplies only the CSV mapping,
native-party adapter, incoming-matter dependency observations and owner checks.
There is no shadow party store or alternate conflict-opening path.

## Import reviewed matters with source numbers

The separate **Clio matters** panel accepts a prepared Satchel CSV subset. This
is not a claim that every Clio CSV export has these headers. Clio's official
[API permissions example](https://docs.developers.clio.com/api-docs/clio-manage/permissions/)
identifies matters by `id` and `display_number`, with a nested client identity;
its [fields documentation](https://docs.developers.clio.com/api-docs/fields/)
also identifies a matter's `description`. Prepare those values and the reviewed
party names in the following exact, case-sensitive columns:

| Required column | Treatment |
| --- | --- |
| `id` | Stable original Clio matter ID, at most 300 characters; never inferred from a name or number |
| `display_number` | Original displayed matter number, at most 200 characters; preserved on the native matter |
| `description` | Matter title, at most 200 characters |
| `client` | Client name, at most 200 characters; explicitly flatten Clio's nested client name |
| `adverse_party` | Satchel input extension: independently reviewed adverse party name, at most 200 characters |

For example:

```csv
id,display_number,description,client,adverse_party
842,2019-0042,Lease review,Barton Workshop LLC,Riverbend Holdings LLC
843,2019-0043,Boundary dispute,Pine Studio,Cedar Property
```

An optional `case_number` column (Satchel input extension, at most 100
characters without control characters) records the court case number on the
imported matter's fields with its source row as provenance (MATTER-001); an
empty cell records none.

All five required cells must be present and free of control characters. The file
limits are 1–1,000 matters and 1 MB of UTF-8 CSV. BOM, LF/CRLF, quoted commas,
escaped quotes and quoted newlines are parsed; mapped cells still have the
field restrictions above. Unknown columns are retained in the original and raw
row provenance, with a preview warning. Source IDs and numbers must be unique
within the file. Supply a complete, stable source ID from the same Clio account
for every later export; combining accounts requires deliberate reconciliation.

Preview performs reads only. It returns a SHA-256 fingerprint covering the
exact uploaded bytes, filename, mapping version, destination and owner role,
along with normalized rows, diagnostics and each row's pending/imported/conflict
state. Errors anywhere in the file block commits. An existing source ID with
different cell content, or a number already held by another native matter,
requires principal reconciliation; import never overwrites or merges it.
Raw cells, including unknown fields, determine the source digest. Reordering
columns alone does not change that digest; changing any cell does.

For each pending row, run its conflict search, review all possible matches,
record a conclusion and any necessary clearance, and explicitly confirm the
authority to open it. Import uses the ordinary matter-opening transaction and
fresh party-revision guard. Searches must belong to the current principal and
exactly match the row's client and adverse party. Importing one row may invalidate
other previously run searches, so search and commit one row at a time. The
importer never treats a source matter or an empty match list as legal clearance.

The original source number is reserved atomically with the native matter,
access grant, parties, conflict conclusion and source journal. Native numbering
skips already reserved source numbers. No matter, journal entry or number is
partially committed on a failure. Exact row replay returns the existing matter;
concurrent identical commits also converge on that same matter. Changed source
content is refused even when uploaded in a different file.

| Matter endpoint | Body / result |
| --- | --- |
| `GET /api/satchel/matter-import` | `{imports}` with retained files and first-import row counts |
| `POST /api/satchel/matter-import/preview` | `{csv, filename?}` → `{fingerprint, mappingVersion, rows, diagnostics, summary}` |
| `POST /api/satchel/matter-import/commit` | `{csv, filename?, fingerprint, sourceId, conflictId, confirmed: true, reviewNote}` → `{matter, replayed, sourceId, fingerprint}` |
| `POST /api/satchel/matter-import/resume` | Same row contract as commit; exact replay needs no new conflict review |
| `POST /api/satchel/matter-import/status` | `{fingerprint}` → `{original, rows}` including original CSV bytes as base64 and source/review provenance |

On interruption, use **Resume from original CSV** in the journal. It restores
the retained bytes and previews again; completed identities remain imported,
and every remaining row still needs its own human review. The journal counts
rows first committed from each file; replaying rows originally imported from
another file does not create another journal row. Files are retained when their
first row commits, so a preview-only file has no durable journal.

Migration `0028_clio_matters.sql` stores exact originals in
`s_matter_import_files` and durable unique source IDs, source digests, original
numbers, native matter IDs, raw cells and human conflict reviews in
`s_matter_import_rows`. Both tables automatically travel in native backup and
restore. The restored installation's active principal can inspect and resume
imports. Matter import has no undo path: a reviewed native matter and its
provenance remain durable. It imports the fields above only; source status,
dates, billing, balances, documents and Grow records remain outside this subset.
