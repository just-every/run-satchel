# Documents and deadlines

Choose **Current matter** before adding documents or deadlines. Each original file may be up to 1 MiB.

## Save an original

1. Open **Documents**. Under **Add a document**, choose **Original file**.
2. In **Who can read it**, select **Everyone assigned to this matter** or **Uploader and principal only**.
3. Choose **Save original**.

The file appears under **Originals & versions**. Use **Download version 1** or the corresponding version link to retrieve its original bytes. A private document is available only to its uploader and the principal, subject to their current firm and matter access.

The original uploader or principal can add a revision: choose **Append version** on the existing document, select the new **Original file**, then **Save original**. This retains the earlier versions and the document's visibility. Use **Cancel** to return to adding a separate document.

## Search document contents

Use **Search the firm** to find words in retained originals. Satchel reads
embedded PDF text and UTF-8 text, recognizes English text in scanned PDF pages,
PNG and JPEG originals, reads stored Word, spreadsheet and slide text, and reads retained EML message bodies and supported
attachments locally. Search never sends originals to an OCR service or follows
remote message images. Extraction creates no malware clearance.

Expand **Document filters** to narrow results by matter, the current original’s
upload date, or its filed document type. Use type Email for native reviewed correspondence. Those messages use their review date and retain their current counsel-only read permission. Each text hit shows its exact original
version, SHA-256 hash, page and index time. Open a hit to read that page’s indexed
text and download its matching original. For a message, cited sections identify
the message body, nested message or attachment and its source page. Office citations identify stored sections, worksheets or slides without claiming a reproduced print layout.

**Document text coverage** distinguishes current, incomplete and unavailable
text. Encrypted originals, unreadable scans, unsupported formats and unsupported
attachments remain explicit in that coverage; retain or supply a readable
original when necessary. The local PDF reader accepts up to 200 pages and OCR
accepts images up to eight million pixels. OCR text can contain recognition
errors, so verify quotations against the retained original.

Appending a new version invalidates old search text and old search citations.
Current firm roles, matter access, ethical walls and private-document rules
apply before text, counts or snippets are returned. Search results are discarded
when focus leaves the search and are requested again on refocus. Legal holds
block erasure and disposal; permitted disposal removes indexed text along with
originals, and older archives cannot restore it across the erasure fence.

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

## Prepare an internal evidence production

The principal or a lawyer opens **Evidence productions** in Documents. Enter the intended recipient, a Bates prefix of uppercase letters, digits and hyphens, and the first number. Expand each source and choose **Produce PDF**, **Withhold entire original**, or **Do not select**. Enter a privilege label. For redaction, list every page number in the selected PDF, separated by commas, and give a reason; withheld originals also require a reason.

Choose **Prepare production**. Review the source versions, Bates range, manifest and privilege log, then download the review packet. Each produced PDF has its own hash; the ZIP includes manifest.json and privilege-log.json. Every redacted page is a new black page with a Bates footer: none of that source PDF is copied. Selective page redaction is refused because shared PDF resources can retain content from omitted pages. Unredacted originals remain separately available through the original-file door.

Enter a counsel review note and choose **Approve exact production** before exporting the packet. Approval binds the exact ZIP hash. Bates labels are never reused within a matter, including recalled packets. The current limits are 20 source documents, 500 produced pages and 1 MiB for the complete ZIP; output accepts PDF originals, while withholding can reference any retained original format.

**Recall unexported production** withdraws a draft or approved packet before internal export. **Refresh production status** reads the first internal export timestamp. This is an internal counsel workflow: it creates no external share, sends no email, and does not prove recipient delivery. External delivery and recall of unopened recipient shares remain unavailable.

Every current source must remain readable before review, approval or export. Erasing any source removes the entire derived production packet and manifest. The principal alone can inspect the new production decision audit.

## Review a native medical chronology

The principal records the health-data authorization and reviewed native storage and processing agreement references under **Medical and bill chronologies**, with explicit confirmation. No external processor is configured. This conservative default permits only the principal to import, publish or inspect chronology decision audits, pending policy approval.

Upload the received PDFs as **Uploader and principal only**, using the principal's own account. Chronology imports refuse shared originals and private originals uploaded by another person. Prepare a JSON record file containing an array of transcribed source entries in this format:

```json
[
  {
    "documentId": "<retained private PDF document id>",
    "version": 1,
    "page": 1,
    "kind": "treatment",
    "provider": "Clinic",
    "date": "2026-01-01",
    "treatment": "Reviewed visit description"
  },
  {
    "documentId": "<retained private PDF document id>",
    "version": 1,
    "page": 2,
    "kind": "bill",
    "provider": "Clinic",
    "date": "2026-01-01",
    "treatment": "Received bill charge",
    "chargeCents": 2000
  }
]
```

Choose **Chronology record file**, enter the packet's reported bill total in USD cents and the record interval threshold, then choose **Import chronology records**. A file contains at most 200 entries and may be at most 1 MiB. Page numbers must exist in the retained PDF version. Treatment descriptions are counsel's transcription, not an automated medical conclusion.

Review the date-ordered entries and each source citation, the gross and reported bill totals and their difference. Equal provider, date and charge values flag a possible overlapping bill; nothing is excluded automatically. A long interval flags the space between received treatment records, not a conclusion about missing care or causation.

For every candidate choose explicitly whether to keep the charge or exclude it from the reconciled total, and record the reason. Enter the counsel publication review and choose **Publish reviewed chronology**. Publication freezes those decisions and shows the reconciled total and its difference from the reported total; it grants no external access. Originals remain unchanged. Erasing any cited source removes its chronology snapshot and review, and disposal records the derivative count.
