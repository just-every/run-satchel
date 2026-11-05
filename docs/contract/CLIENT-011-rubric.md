# CLIENT-011 frozen acceptance rubric

Frozen by ct on 2026-11-04 under RL-103. This is a requirement for later implementation and review, not a proof claim. Source: `sx-satchel-c-f22`, gate 1, blocking A former-grant bytes read200 finding.

**Capability:** Replacing a delegate grant revokes the former grant at once.

**Public doors:** Record, review and grant a successor for an existing delegate through the grant replacement workflow; exercise both former and successor grant downloads through the document door. A refused metadata read does not establish refusal of confidential bytes.

1. Establish the existing delegate's former grant and download confidential bytes through the document door. Retain the grant and document state before replacement.
2. Record, review and grant the successor for that same existing delegate. Capture the resulting grant and document state, then immediately request the confidential bytes again using the former grant. The document door must refuse and release no bytes; the attempted download changes no state. Compare the state immediately before and after this refused download.
3. Through the same document door, use the successor's own permitted access and receive the correct document bytes. Retain this allowed result beside the former-grant refusal, with the before/after state.

No delayed expiry, next sync or later manual revocation satisfies immediate replacement. CLIENT-009 keeps its existing judgment and wider obligations; its `sx-satchel-c-f22` carrier remains deferred and does not land.
