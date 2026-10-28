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
