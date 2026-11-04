# FIRM-010 frozen acceptance rubric

Frozen by ct on 2026-11-04 under RL-103. This is a requirement for later implementation and review, not a proof claim. Source: `sx-satchel-c-f25`, gate 1, blocking A upgrade-history finding.

**Capability:** Last successful sync survives upgrade.

**Public doors:** Upgrade a firm with prior successful Microsoft read data, then open sync settings and its corresponding read door. A fresh-install-only journey or a new successful read after upgrade cannot establish preservation of prior history.

1. Begin with a firm that already has a retained successful Microsoft read job and its successful timestamp in the prior data. Apply the real upgrade, including migration0129.
2. Before performing another Microsoft read, open sync settings and read the same sync state through its public door. Both show the retained last successful timestamp, rather than an empty or unknown last success.

**Mechanism provenance:** Retained successful-job timestamps must seed `last_success_at`, and the getter must read that retained value. The product outcome is preserved last success after the upgrade; neither the migration name nor the storage mechanism is an extra product capability.

Retain before/after prior-data state and the post-upgrade settings/read results. FIRM-007 keeps its other obligations and existing judgment.
