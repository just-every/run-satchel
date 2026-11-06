# FIRM-009 frozen acceptance rubric

Frozen by ct on 2026-11-04 under RL-103. This is a requirement for later implementation and review, not a proof claim. Source: `sx-satchel-c-f25`, gate 1, blocking A diagnostics finding.

**Capability:** Firm diagnostics count native invoice notification attempts.

**Public doors:** Native invoice notification authorization and submission, followed by the principal's firm diagnostic read. A correspondence-only or connector-only count does not establish this invoice-notification outcome.

1. Read queued and uncertain baseline counts for a firm with no other jobs changing. Authorize one eligible native invoice notification through its public door. Read diagnostics: queued increases by one and uncertain is unchanged.
2. Submit that attempt once through its public door, with provider503 and no confirmed acknowledgment at the provider boundary. Read diagnostics again: that attempt leaves queued and enters uncertain, so queued returns to baseline and uncertain is baseline plus one.

Retain the before/authorized/after diagnostic reads and the notification outcome for the same attempt. Only the provider boundary may supply the failure; the application's own authorization, submission and diagnostic reads must carry the journey. FIRM-007 keeps its other obligations and existing judgment.
