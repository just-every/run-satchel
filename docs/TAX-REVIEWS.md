# Native tax calculation reviews (BILL-004, partial)

Authenticated HTTP doors under `/api/satchel`:

- `GET/POST /matters/:id/tax-rules`: inspect or record an immutable reviewed rule.
- `GET/POST /bills/:id/tax-reviews`: inspect retained calculations or calculate an original draft at its exact revision.

The principal or an authorized matter lawyer records `reviewed: true`, a `state`
(US state abbreviation or DC), an explicit `jurisdiction` including locality,
a counsel/accountant `reference`, and `rounding` (`half_up`, `half_even`, `down`).
Both `service` and `expense` must specify `eligibility` (`taxable` or `exempt`),
`ratePpm` (integer parts per million, 0–1000000) and a reviewed treatment or
exemption `reference`. Exempt treatment requires zero. No rate, exemption,
locality, legal eligibility or provider verification is inferred.

POST a calculation with `revision` (the draft revision) and `ruleId` (one rule
from that matter). Time and nonhourly fees use service treatment; disbursements
use expense treatment. Nonnegative original draft line amounts in integer USD
cents are multiplied by the supplied rate and divided by 1000000 using exact
integer arithmetic, rounded per line using the selected rule. Half-even ties go
to the even cent; down truncates. Rounded line tax is summed. Inputs, rule ID,
reviewer, references, source revisions, base cents, rate, result, and draft
revision are retained. A later rule is a new record; it never rewrites an earlier
review. Native results identify themselves and record a null external provider
result. Archive recovery includes rules and reviews.

This door does not issue tax, change invoice totals, move trust funds or export
LEDES. Reviewed calculations remain readable after a draft is voided; that draft
cannot receive a new calculation. Corrections and provider calculations are not
supported here. Existing bill approval has not yet acquired BILL-004's required
unknown-treatment refusal. Before BILL-004 can become done, integrate reviewed
eligibility, tax totals and frozen artifacts, correction deltas, explicit trust
eligibility/allocation and reviewed per-client 1998B/XML tax mappings, and prove
all acceptance points through their public doors. Never interpret a calculation
review as authorization to issue, export or transfer funds.
