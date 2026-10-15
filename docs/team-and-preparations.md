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
4. Follow the repository's [API reference](https://github.com/just-every/run-satchel/blob/main/API.md) to prepare matters, bills or deadlines.

The key follows your current role and matter access. Use **Revoke** beside its name to stop access immediately. Agents prepare proposals; they cannot perform human approvals, export bills, import contacts, restore archives or erase originals.

## Review a preparation

Open **Preparations** and inspect the pending proposal's kind, agent name and full payload.

- For a matter, choose **Search proposed parties**, review all results, enter **Conflict review conclusion**, check the authority confirmation and choose **Accept preparation**. This opens the reviewed matter.
- For a bill, choose **Accept preparation** after checking its sources. It creates a draft bill; continue in **Time & bills** to inspect and **Approve exact bill** before downloading.
- For a deadline, choose **Accept preparation** after checking its source and date. It remains proposed; continue in **Deadlines** for a lawyer's **Confirm deadline** review.

To decline, expand **Decline**, enter a **Reason**, and choose **Decline preparation**. The preparation records who decided and when. The principal can also inspect **Recent activity** in **Team & safety**.
