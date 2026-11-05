# Satchel contract rulings

## RL-102 — BILL-008: Run consented payment plans

**Date:** 2026-10-28
**Ruled by:** ct
**Governs:** BILL-008
**Outcome:** adopt with rider

**Question:** May payment plans and hardship revisions charge only after fresh client authorization of the exact schedule?

**Default proposed and adopted:** Principal-reviewed operating schedule, current-client agreement and fresh hosted mandate; imports paused and failures and uncertainty escalated without automatic retry.

**Clause outcome:** Require authorized finance setup and current client agreement and mandate for each schedule revision, start imported plans paused and stop disputed, revoked, failed or uncertain collection for human resolution.

**Why:** Clio provides administrator and billing-authorized payment plans; client authorization is the recurring-payment boundary. No common norm prescribes this exact no-retry policy, so keep it as the conservative local default without excluding LawPay or future delegated billing.

**Placement:** BILL-008 owns plan authority and cites BILL-007 for uncertain reconciliation; the full migration, LawPay and operating-provider acceptance remains owed.

**Sources:** [Clio restricts payment-plan management to administrators and billing-authorized users.](https://help.clio.com/hc/en-150/articles/9285735777819-Set-Up-and-Manage-Payment-Plans).

**Main read:** `e3eed8a421ff83058618aa389b9f4a6abc07b746`, `CONTRACT.md:436`. No status change; all unfinished acceptance and proof remain owed.

## RL-101 — BILL-007 — 28 October 2026

Ct adopted the operating refund and reconciliation policy with a rider. Finance approval is explicit and binds the exact invoice revision, integer USD cents and reason. The active principal is the current finance authority. The full scoped finance delegation target remains owed by BILL-007; this principal-only mapping is the current authority, rather than a prohibition on future delegated finance staff.

An uncertain provider response remains unresolved until authenticated readback; it never triggers an automatic repeat of the financial effect. Refunds, write-offs and their corrections retain linked append-only history. Bank settlement requires a completed payout and an exact statement match. Provider events, processor fees, receipt posting, bank posting and reversal of an incorrect bank match remain within BILL-007.

Source: ct one-pass rulings index, Satchel RL-101; main read e3eed8a421ff83058618aa389b9f4a6abc07b746. This records the existing ruling and changes no acceptance point.

### RL-103 — Add the firm diagnostics, upgrade history and delegate replacement splits

**Date:** 2026-11-04
**Ruled by:** ct
**Governs:** FIRM-007, FIRM-009, FIRM-010, CLIENT-009, CLIENT-011
**Outcome:** additive split; existing judgments unchanged

**Source ruling:** ct's 4 November scope ruling, following the two blocking A findings at gate 1 for `sx-satchel-c-f25` and the blocking A finding at gate 1 for `sx-satchel-c-f22` (former-grant confidential bytes returned read200).

**Clause outcome:** Add FIRM-009 for native invoice notification attempts moving queued and uncertain diagnostic counts after authorization and provider503; FIRM-010 for an existing successful Microsoft read remaining visible as the last successful sync after upgrade; and CLIENT-011 for immediate former-grant refusal once an existing delegate's successor grant is recorded, reviewed and granted, with no state change on refusal and working successor access. Each is a separate Core capability, From new, initially missing with no evidence claim.

**Frozen review requirements:** `docs/contract/FIRM-009-rubric.md`, `docs/contract/FIRM-010-rubric.md` and `docs/contract/CLIENT-011-rubric.md` retain the required public doors and outcomes. Migration0129, retained successful-job timestamps, `last_success_at` seeding and getter behavior are provenance for the upgrade rubric, rather than product-contract mechanism.

**Preserved scope:** FIRM-007, CLIENT-009 and every existing clause, acceptance, Status, Evidence and Gap remain unchanged. The FIRM-007 carrier `sx-satchel-c-f25` may land as gated for its remaining obligations; the CLIENT-009 carrier `sx-satchel-c-f22` stays deferred and does not land. This ruling grants neither a DONE judgment nor a field-proof exclusion. The supported lane hold pending independent Opus review of these exact additive clauses remains in force; this change releases no hold and requests no landing.
