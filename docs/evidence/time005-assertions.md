# TIME-005 fresh judgment assertions

TIME-005 remains PARTIAL. The original settlement acceptance, CT policy text and TRUST-004 execution boundary are preserved. No provider execution or legal compliance is claimed.

The brief reports seven mutations caught and three surviving at main commit `1e92ef14d1beadef364b6f39872540ea2e429cdc`. This round addresses those three survivors. All production source is unchanged from that main commit; no existing assertion is removed or weakened and no test registration is added. The three experiments below use assertion commit `3d1b45debcfbc660c2e2763a29190cf7462577ca`. Later changes in this round only document the results and regenerate the source lock; the relevant production and test bytes are identical.

Each experiment modifies the real settlement source, builds the application, then invokes the public-door test “Settlement statements reconcile recovery and refuse spending without current approvals and cleared funds” in `tests/satchel/fee-plans.test.mjs`. Every build exits zero; each mutated test exits one at the indicated assertion. The unmodified flow passes. Mutations are restored after each experiment.

| Previously surviving mutation | Applied mutation | Assertion that fails | Result |
| --- | --- | --- | --- |
| Original amounts | Replace returned originalCents with zero for each obligation, retaining the correct net amounts. | Line 185: the full explicit expense, lien and medical obligation set differs; expected originals 100000, 200000 and 50000 cents, actual zero. | KILLED: build 0, test 1. |
| Terms-review audit | Remove settlement.terms_reviewed audit insertion while saving reviewed terms normally. | Line 216: exactly two attributable review records expected, actual zero. Lines 217–222 also bind both terms IDs, versions, actor, role, person channel, matter, revision and creation metadata. | KILLED: build 0, test 1. |
| Pending replacement | Remove the pending-decision condition from both the explicit replacement query and the atomic unspent guard; retain the posted-allocation condition. | Line 205: replacement while the exact 150000-cent lien allocation awaits review must return 409, actual 200. Lines 208–213 assert unchanged state on refusal, then successful replacement after decline. | KILLED: build 0, test 1. |

The original obligation set includes source evidence, the zero expense reduction and the nonzero lien and medical reductions, independently specified rather than derived from the submitted body. Existing replacement, restart and archive comparisons preserve that exact snapshot. The terms audit explicitly checks two records; refused saves add none, and archive restore retains both records unchanged at line 226.

The existing execution, billing, retention and browser flows remain loaded by the same settlement test and push Verify. They cover fractional-cent rounding, unrelated reservations, exact disbursement binding, current roles, officer designation, grants, custom ceilings and ethical walls, policy changes and separate capacity approvals, closed periods, restored authority refusal, earning and coding, immutable exports, source exclusivity, retention holds and irreversible restricted-payload erasure.

Status counts agree for every ID in both documents: 72 done, 24 partial, 43 missing, 139 total. The three missing assertions are now supplied for fresh ct judgment; no DONE status is counted by this round.
