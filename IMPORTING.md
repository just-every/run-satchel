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

## Reviewed whole firm Clio packages

The **Whole firm Clio move** panel complements the older contact and matter CSV
subsets. It accepts a prepared JSON package assembled from authorized Clio
Manage exports, Grow exports and separately exported originals. It never asks
for source credentials or contacts the Clio API. Missing history must be obtained
through an authorized supplemental export or vendor-assisted extraction, added
to the package and reconciled before cutover. A count or coverage declaration is
the principal's source inventory, not a claim of independent provider verification.

Use `schema: "satchel-clio-v1"`, a stable non-secret `account` reference,
`phase: "snapshot"`, and an `extractedAt` UTC timestamp. `datasets` contains the
following CSV strings, including the header for empty datasets. All identities
are original source IDs, scoped to that same source account. CSV quoting, BOM
and CRLF are accepted. Unknown columns stay in raw row provenance.

| Dataset | Required columns |
| --- | --- |
| contacts | id, name |
| matters | id, display_number, description, client_id, adverse_party, status, opened_at |
| relationships | id, matter_id, contact_id, relation |
| documents | id, matter_id, file_id, date, visibility |
| notes, calls, emails | id, matter_id, title, body, occurred_at, visibility |
| calendar | id, matter_id, title, date, time, timezone, duration_minutes |
| tasks | id, matter_id, title, due_date, status |
| time | id, matter_id, date, description, minutes, rate_cents, amount_cents, invoice_id |
| expenses | id, matter_id, date, description, amount_cents, invoice_id |
| invoices | id, matter_id, number, ordinal, date, total_cents, ar_cents, pdf_file_id |
| trust | id, matter_id, client_id, balance_cents, statement_date, source_reference, document_id |
| grow | id, name, summary, created_at |

Dates are YYYY-MM-DD; historical instants are UTC ISO timestamps. Calendar time
is local 24-hour HH:MM with an IANA timezone. Source appointments enter the
native calendar; court deadlines still require their separate source and human
confirmation. Matter status is open or closed; a closed matter also supplies
`closed_at`. Source closed dates remain in its history without inventing a
Satchel closure review. Relations use client or adverse. Documents explicitly
map matter or private visibility; notes, calls and email history explicitly map
team or private visibility. A private history entry is visible to its mapped
author alone. Source data never creates portal credentials or access grants.

Optional contact `email` and `aliases` map to the conflict register; a `profile`
JSON cell uses the native contact fields kind, name, aliases, formerNames, emails,
phones and addresses. Matter `case_number` maps directly. For the remaining
fields, a `fields` JSON cell uses caseNumber, court, insuranceLimit (exact USD),
feeArrangement, feeTerms, typeId, typeVersion and custom. Custom values must map
to an existing native matter type and pass its exact adopted version's required
and typed checks; a later type version never silently changes an imported matter.
The optional `practice_code` must match that mapped type's practice. Grow may
also supply email, phone, referral_source and staff_id. Other raw custom source
fields remain available in the matter's source history and package journal.

`staff` maps each source staff_id to an active native firm member. Mapped authors,
timekeepers, task owners and Grow assignments use that identity. `clientRepairs`
starts as an empty object and explicitly maps an unmatched source client ID to
the correct source contact ID. Preview and repair create no product records;
every repair invalidates the old fingerprint and requires another preview.

`files` supplies original objects with id, name, sha256, contentBase64 and
modifiedAt. Each file is 1 byte to 1 MiB; its hash is verified against its actual
bytes. Supply every document and historic invoice PDF before applying. Historic
invoices keep their source number, ordinal, original PDF and recorded paid
balance. They appear with their matter, in Time & bills and in the authorized
payer portal. Delivering or re-sending a historic invoice preserves its PDF
byte-for-byte, even when a current template is selected. No PDF is reconstructed
from source totals. The permanent invoice register reserves each imported number;
an existing native counter advances beyond the greatest imported ordinal. The
first later saved scheme must also start above that floor.

`counts` lists cumulative source counts for every dataset, `balances` supplies
billedCents, unbilledCents, arCents and trustCents in exact USD cents, and
`coverage` identifies complete history for every dataset. Missing coverage is
shown as a retrieval gap and always prevents cutover. A trust package also maps
`trustAccountId` to an existing native trust bank account. Applying each trust
opening requires the principal to hold the designated trust officer role,
explicitly approve the exact statement and client allocation, and supply its
imported supporting document. It posts a source-backed native opening into a
new subsidiary ledger; it never transfers bank funds or bypasses trust authority.

After committing the reviewed fingerprint, apply one durable record at a time.
Each new matter needs its own fresh conflict search, conclusion and explicit
human clearance. A record and its checkpoint commit atomically. Resume uses the
retained package after an interruption or archive restore; identical commits and
completed applies reuse the existing job and identities. A changed, erased or
undone source identity is refused rather than overwritten or resurrected.
Undo removes only unused, unchanged contact rows. Edited contacts, linked
contacts and native append-only matter, billing, file and activity history are
preserved with dispositions in the journal. Signed cutovers cannot be undone.

For the final delta, use `phase: "delta"` and `previousFingerprint` naming the
preceding completed package. Include new records and complete cumulative counts,
balances and coverage; unchanged source identities may be repeated. Reconcile
source counts, mapped matter fields, originals, native invoice balances, unbilled
work and each native trust ledger. The principal can sign only a completed final
delta with no remaining gap, the exact current report fingerprint and an explicit
signed declaration. The signature and report are retained with the archive.

The authenticated administrative doors are `GET /api/satchel/migration` and
`POST /api/satchel/migration/{preview,commit,status,resume,undo,reconcile,cutover}`.
Preview takes `{package}`; commit adds its fingerprint; subsequent operations
name the job id. Resume supplies a `review` for a matter or trust opening;
cutover supplies fingerprint, confirmed and declaration. Matter source history
is at `GET /api/satchel/matters/:id/migration`, subject to native matter, private
history and document permissions. Original erasure also removes the matching
bytes from retained packages, while durable source fences prevent replay.

The calendar dataset can alternatively contain a complete ICS calendar. Supply
`calendarMatters` mapping each original UID to its source matter ID, or add an
explicit X-SATCHEL-MATTER-ID property when preparing the export. Original ICS
bytes are retained. Native mapping preserves the UID, local date, time, timezone,
location and finite daily or weekly recurrence. CSV can also supply frequency,
repeat_interval and occurrences. Unsupported exceptions or recurrence rules are
rejected for explicit expansion to a complete prepared CSV; they are never
silently omitted or treated as confirmed court deadlines.

Matter relationships may also use the native insurer, witness, expert and
counsel roles. A relationship with an `other_contact_id` instead maps the two
source contact identities to a native contact relationship with its source
relation text; no access permission or portal invitation follows from a role.
Preview lists the SHA-256 and byte size of every retained data export as well
as the separately supplied originals. Packages span bounded source rows and
separate original rows, so multiple originals do not exceed a single D1 row.

## Reviewed MyCase Full Backup data

The Whole firm move panel also accepts `schema: "satchel-mycase-v1"`.
This is a MyCase data adapter, with its own source namespace and reviewed
mappings. It does not convert a MyCase package label into a Clio import, contact
the vendor, infer authority from source roles or certify a complete migration.
Obtain the Full Backup from an authorized source-account administrator. Export
headers vary: map the actual headers explicitly, retaining the exact source
ZIP or CSV bytes rather than replacing them with the normalized values.

Use a JSON envelope with these fields:

- `account`: a stable non-secret MyCase source-account reference.
- `phase` and `extractedAt`: snapshot or delta and a UTC extraction timestamp.
  A delta also names its completed `previousFingerprint`.
- `backup`: `{name, contentBase64, sha256}` for the Full Backup data ZIP;
  alternatively `csvFiles` is an array of those objects for individual CSVs.
  Use exactly one representation. SHA-256 must match the original bytes.
- `mappingRevision`: the human-reviewed mapping version, for example `review-1`.
- `mappings`: the contacts, cases and documents mappings described below.
- `clientRepairs` and `caseRepairs`: initially empty objects. Explicitly map an
  unmatched client ID to a source contact, or a document's unmatched case ID
  to its reviewed source case. Every repair requires a fresh preview.
- `files`: separately downloaded document originals in the existing original
  format: `{id, name, contentBase64, sha256, modifiedAt}`. Each original is
  1 byte to 1 MiB. Match its ID to the document index; never reconstruct it.

Each mapping has a `file` naming the exact relative CSV path and `columns`
mapping the following target fields to exact source header names:

| Mapping | Required target fields | Optional target fields |
| --- | --- | --- |
| contacts | id, name | aliases, email |
| cases | id, display_number, description, client_id, adverse_party, status, opened_at, closed_at | case_number |
| documents | id, matter_id, file_id, date, visibility | document_type |

For example, cases may use `columns: {"id":"Case ID", "status":"Case Status"}`
as part of the full mapping. It must also supply explicit value mappings such
as `values: {"status":{"Active":"open","Archived":"closed"}}`.
Documents likewise supply `values: {"visibility":{"Firm":"matter","Private":"private"}}`.
No status or visibility is guessed. Preserve archived cases; map their actual
archived UTC instant to `closed_at`. Empty active-case closure cells are allowed.
Opened instants use UTC; document dates use YYYY-MM-DD. Map adverse-party names
from reviewed source information and still perform native human conflict review.

The data ZIP supports at most 4 MiB compressed, 100 CSV files, 1 MiB per CSV and
6 MiB expanded. Individual UTF-8 CSVs have the same count and expanded limits.
CSV paths may contain folders; file identities and names must be unique. Put
binary originals in `files`, outside the data ZIP. Other archive entries are
refused explicitly, so their omission cannot silently count as coverage.
Missing required mappings, unknown mapped headers, duplicate IDs, unknown status
or visibility, unmatched cases and missing originals prevent apply. Unknown
columns and every unselected CSV remain in retained source bytes and are listed
as unsupported in preview. No source file is silently treated as imported.

The preview displays active and archived counts, exact source hashes, mappings,
relationships, missing originals and unsupported datasets without writing.
Commit saves the exact reviewed package; resume applies one native record per
checkpoint. Every case uses the ordinary fresh conflict search, human conclusion
and clearance. Imported contacts are identified as MyCase; source identities are
isolated from Clio even when the source-account and row IDs match. The journal
retains the original status, raw row, source file, line, mapping version, client
repair and case repair. Authorized native downloads return the supplied original
bytes. Current matter and document permissions and native erasure fences apply.

A principal can retrieve the exact source envelope with
`POST /api/satchel/migration/source` and `{id}`. It includes the original ZIP or
CSV objects, explicit mappings, mapping revision, client repairs and case repairs.
The checkpoint’s Review retained MyCase source button opens these details and
lets the principal download the exact original data ZIP or CSVs. These travel
in the existing firm archive with durable checkpoints and provenance. Document
originals remain in the separate erasure-aware original store.

This slice imports contacts, active and archived cases and the document index
with supported-size separately supplied originals. Tasks, calendars, time, fees,
expenses, financial activity, portal, email and SMS history, historic invoice
PDFs and their invoice associations, full AR and trust activity and reconciliation,
authorized supplemental extraction and complete cutover remain unsupported.
These are always reported as gaps even if an envelope declares coverage complete;
retaining their CSVs is not import or reconciliation. Source shutdown and signed
cutover remain refused. BILL-015 number-preservation duties and its provider and
ledger prerequisites remain unchanged. This path grants no quarantine clearance,
malware verdict, large-file support, source-account authority or other hold release.
