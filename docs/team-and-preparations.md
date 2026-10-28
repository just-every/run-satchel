# Team and preparations

The principal manages firm membership. Each lawyer or assistant also needs a matter assignment to see that matter's records. The principal can see all matters.

## Invite a firm member

1. Open **Team & safety**. Under **Firm members**, enter **Full name**, **Email** and **Firm role**: **Lawyer** or **Assistant**.
2. Choose **Save member**.
3. Find that member's record and choose **Send invitation**. In local development, retrieve it from the development outbox.
4. Open the matter in **Matters** and use **Matter access** → **Firm member** → **Grant access**.

Lawyers can review and open matters, prepare and approve bills, export reviewed CSVs, and confirm and complete deadlines. Assistants can record time and disbursements, save documents and propose deadlines on assigned matters.

Choose **Deactivate** to remove a person's firm access immediately. **Reactivate** restores their active membership. To remove a single matter assignment, use **Remove** under that matter's **Matter access**.

## Give an agent preparation access

The principal or a lawyer can create a key for their own account:

1. Under **Agent preparation keys**, enter **Agent name**.
2. Choose **Create preparation key**. Copy the **New private key** immediately; it is shown only once.
3. Keep the key private and give it only to the agent you intend to use. Choose **Hide key** when finished.
4. The principal opens **Agent data & execution** and records the named processor, exact model or native preparation revision, reviewed agreement reference, retention and deletion terms, no-training terms and expiry. Health context also needs the applicable health-data agreement reference.
5. Under **Approve a bounded delegation**, choose the key, agreement, matter, permitted actions, sponsor recipient, execution count, expiry and stop rule. Select each permitted original version explicitly. Research sources also require the firm's reviewed entitlement, provenance, permitted processing use and entitlement expiry. An unconfigured key receives no matter context.
6. Follow the repository's [API reference](https://github.com/just-every/run-satchel/blob/main/API.md), passing the delegation identity with the key.

The key follows your current role and matter access. Use **Revoke** beside its name to stop access immediately. Agents prepare proposals; they cannot perform human approvals, export bills, import contacts, restore archives or erase originals.

The current native preparation policy allows no spend or external execution. The principal approves processing scope; a lawyer can inspect their own approved scope. Recorded agreement references retain the firm's review, rather than claiming that Satchel verified a vendor entitlement or agreement externally.

Choose **Inspect redacted context** on an active delegation to inspect exactly the selected source versions. Source text is untrusted evidence: an instruction inside an upload cannot add an action, recipient or budget. Unselected originals and firm settings do not enter agent context. Later uploads do not expand the selected source versions.

Agent requests may reserve finite scheduled preparations. Execution rechecks current key, sponsor, matter access, role permissions, source availability, agreement and delegation. The execution count is reserved when queued and is never refunded by a stop. A repeated request identity returns its existing job; changed work under that identity is refused. Stops retain their outcome for the principal to inspect and send no automatic escalation message.

Use **Revoke agent delegation** with a reason, or **Withdraw processing agreement**, to cancel the corresponding queued authority immediately. Key revocation also cancels its queue. Prepared proposals and decisions remain history. Archives preserve agreement, delegation and execution records, while credentials remain excluded; restoring history cannot reactivate a key or execute its queued work.

## Review a preparation

Open **Preparations** and inspect the pending proposal's kind, agent name and full payload.

- For a matter, choose **Search proposed parties**, review all results, enter **Conflict review conclusion**, check the authority confirmation and choose **Accept preparation**. This opens the reviewed matter.
- For a bill, choose **Accept preparation** after checking its sources. It creates a draft bill; continue in **Time & bills** to inspect and **Approve exact bill** before downloading.
- For a deadline, choose **Accept preparation** after checking its source and date. It remains proposed; continue in **Deadlines** for a lawyer's **Confirm deadline** review.

To decline, expand **Decline**, enter a **Reason**, and choose **Decline preparation**. The preparation records who decided and when. The principal can also inspect **Recent activity** in **Team & safety**.
