# Documents and deadlines

Choose **Current matter** before adding documents or deadlines. Each original file may be up to 1 MiB.

## Save an original

1. Open **Documents**. Under **Add a document**, choose **Original file**.
2. In **Who can read it**, select **Everyone assigned to this matter** or **Uploader and principal only**.
3. Choose **Save original**.

The file appears under **Originals & versions**. Use **Download version 1** or the corresponding version link to retrieve its original bytes. A private document is available only to its uploader and the principal, subject to their current firm and matter access.

The original uploader or principal can add a revision: choose **Append version** on the existing document, select the new **Original file**, then **Save original**. This retains the earlier versions and the document's visibility. Use **Cancel** to return to adding a separate document.

## Propose and confirm a deadline

1. Open **Deadlines**. Under **Propose a deadline**, enter **Deadline title**, **Date**, **Timezone**, and **Source and citation**.
2. Use an IANA timezone such as `America/New_York`. Check the date against the cited source.
3. If available, select **Source document (optional)**. The proposal links the document's current version. Otherwise leave **External source / no uploaded document** selected.
4. Choose **Propose deadline**.
5. The principal or a lawyer reviews the proposed record under **Dates to act on**, enters a **Review note**, then chooses **Confirm deadline**.

Only confirmed deadlines are active. Satchel records the date and timezone you review; your firm determines the correct deadline from its source.

## Record completion or review a changed source

For a confirmed deadline, the principal or a lawyer enters **What was done (evidence or reference)** and chooses **Mark complete**. Expand **Decision history** to see recorded actions, people and times.

Appending a new version of a linked source document supersedes its earlier pending or confirmed deadlines. Review the new source, propose the appropriate deadline again and have a lawyer confirm it. Erasing a source document also invalidates affected deadlines.

Document erasure is managed by the principal in **Team & safety**. See [Backup and restore](backup-and-restore.md) before erasing originals.

## Schedule reminders

Expand **Reminders for** on a confirmed deadline. The principal or a lawyer can choose **Set up reminders** (or **Edit reminder rule**), select a primary recipient and a different backup lawyer, and choose email, workspace, or both. Recipients must be active lawyers or the principal with access to the matter.

Set the number of days before the deadline and the local send time. Send time and quiet hours use the deadline’s IANA timezone. Clear both quiet-hour fields to turn quiet hours off. The scheduled worker checks every 15 minutes; this is not an exact-minute alarm. Saving a replacement rule supersedes the earlier rule’s unsent work. A stale deadline revision must be refreshed before saving.

Email uses the firm’s configured native mail provider. A provider accepting a message does not prove mailbox delivery. Workspace reminders are durable notifications visible to the recipient in the deadline’s reminder record. **Delivery results** lists each actual recipient, channel, stage, status, scheduled and attempted times, provider, and provider reference. Review the result for each channel separately.

The actual recipient can choose **Acknowledge reminder**. Acknowledgment records receipt only; it never marks the deadline complete. If the primary fails, has an uncertain result, or remains unacknowledged after the configured delay, the backup receives one escalation per selected channel.

Failed and uncertain attempts remain visible. For a failed or uncertain provider result, the principal or a lawyer checks the provider, opens **Resolve delivery**, and records whether it was delivered together with evidence or a provider reference. Do not blindly resend an uncertain message.

Use **Cancel reminders**, enter a reason, and choose **Cancel reminder rule** to stop the active rule. Delivery and rule history remain available, including after deadline completion. Record the legal work separately with **Mark complete** and its evidence.

Ambiguous clock times during a daylight-saving transition use the earlier instant. A nonexistent local send time is refused so counsel can choose a valid time. Quiet hours can defer a send until the next scheduler check outside the quiet window. Backup escalation waits until the configured delay after the actual primary attempt. Changing recipients cancels unsent work; a send already begun keeps its result and uncertainty history. A source change, completion, cancellation, loss of scheduling authority or loss of recipient access prevents future sends. Messages contain a generic workspace link rather than confidential matter or source text.

## Organize document sets

In **Documents**, create matter folders and select documents to file together. A bulk preview shows each original, its versions, present and proposed folder, tags and document type, and who may read it. Apply the reviewed preview to change metadata; an intervening version or metadata change requires a fresh preview. Filing retains the same document IDs, original bytes and version links.

Folder counts, tag/type totals, saved-filter counts and duplicate warnings include only documents you can currently read. A duplicate warning identifies matching original hashes without replacing either original. Private documents keep their existing readers when filed into a folder.
