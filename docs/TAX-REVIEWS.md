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

## Apply an exact calculation at native bill approval

For a matter with any reviewed tax rule, `POST /bills/:id/approve` requires
`taxReviewId` alongside the existing exact `revision` and `reviewNote` (plus any
fee earning evidence). The ID must name a retained calculation for that exact
bill, matter and draft revision. Approval freezes its complete provenance,
`subtotalCents`, `taxCents` and tax-inclusive `totalCents` into the invoice
view and the immutable reviewed CSV. A separate append-only tax approval
retains that view; the original draft snapshot is never changed. The retained calculation itself keeps
its original calculation-only label; the approved bill records its application.
Later rule reviews do not change any frozen invoice or export. Tax is included
in the amount due and excluded from earned service/expense amounts. Fee earning
still needs TIME-004's separate event review; tax never supplies that evidence.

This is an interim integration, not completed BILL-004. Matters with no reviewed
tax rules still use the legacy approval door without a mandatory tax review;
that remains an explicit issuance gap. The current screen does not select a tax
calculation: it displays the approval refusal and the final approved total;
review and selection use the authenticated HTTP doors documented above.

Tax-reviewed invoices cannot yet receive corrections or trust applications,
because tax deltas and explicitly reviewed trust eligibility/allocation are
unimplemented. A draft with a LEDES profile and selected tax review cannot be
approved until reviewed per-client 1998B/XML tax mapping exists; no export may
silently omit the selected tax. These refusals preserve the original rather than
fabricating an allocation, exemption or mapping. Existing untaxed invoices and
artifacts remain unchanged. No Avalara calculation is claimed.

Complete the unconfigured-matter issuance gate, tax UI, correction deltas,
reviewed trust eligibility/allocation and reviewed client mappings, and prove all
acceptance points, before marking BILL-004 done. Native rules and calculations
continue to restore with firm archives. Voided drafts cannot get new reviews.
