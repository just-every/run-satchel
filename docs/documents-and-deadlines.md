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

## Prepare and release an evidence production

The principal or a lawyer opens **Evidence productions** in Documents. Enter the intended recipient, a Bates prefix of uppercase letters, digits and hyphens, and the first number. Expand each source and choose **Produce PDF**, **Withhold entire original**, or **Do not select**. Enter a privilege label. To redact, list the whole pages to remove, separated by commas, and give a reason; withheld originals also require a reason.

Choose **Prepare production**. Every redacted page becomes a new black page with a Bates footer. When only some pages of a PDF are redacted, your browser first renders each retained page of the exact selected version to a page image, and the produced PDF is rebuilt from those images and the black pages: no source text layer, metadata, attachments or other PDF resources are copied. A PDF produced without redactions keeps its source pages. Expand **Manifest and privilege log** to review the source versions, Bates ranges, labels, reasons and legal holds, then use **Download review packet**. Each produced PDF has its own hash. The ZIP includes manifest.json and privilege-log.json; the log lists every withheld, redacted or privilege-labelled source version with its privilege label, withholding decision, reason, redacted pages and legal holds. Unredacted originals remain separately available through the original-file door.

Enter a counsel review note and choose **Approve exact production** before exporting or releasing the packet. Approval binds the exact ZIP hash. Bates labels are never reused within a matter, including recalled packets. The current limits are 20 source documents, 500 produced pages and 1 MiB for the complete ZIP; output accepts PDF originals, while withholding can reference any retained original format.

**Recall unexported production** withdraws a draft or approved packet before internal export. **Refresh production status** reads the first internal export timestamp and the state of each recipient release.

Only the principal releases an approved packet, and only to the recipient it names. Choose **Invite named recipient** so that person can sign in with their own account, then enter **Recipient access expires** and a **Principal release authorization** note and choose **Authorize recipient release**. Send the release address shown under **Recipient releases** to the recipient separately; the address alone grants nothing. Signed in as the named recipient, they choose **Download packet**: Satchel serves the exact approved bytes and records a delivery receipt with the packet hash, size and time. The recipient gets no firm, matter or original access and cannot release the packet or invite anyone. **Recall unopened release** withdraws a release that has not been opened; an opened packet stays disclosed and remains in the audit. A release also ends at its expiry, when the authorizing principal loses access to the matter, or while a new legal hold applies to a source, which needs a newly prepared and approved packet so the hold travels with it. An archive restore brings back packets but no releases: the principal releases again after restoring.

Every current source must remain readable before review, approval, export or release. Erasing any source removes the entire derived production packet and manifest and ends its releases. The principal alone can inspect the production decision audit.

## Review a native medical chronology

The principal records the health-data authorization and reviewed native storage and processing agreement references under **Medical and bill chronologies**, with explicit confirmation. Only the principal imports, publishes or inspects chronology decision audits. Processing is native: no external processor or recipient receives these records.

Upload the received PDFs as **Uploader and principal only**, using the principal's own account. Chronologies refuse shared originals and private originals or versions uploaded by another person.

### Extract records from the original PDFs

Under **Extract treatment packet**, select up to 20 private PDF originals (each version is listed separately), enter the packet's reported bill total in USD cents and the record interval threshold in days, and choose **Extract treatment packet**. Satchel reads each page's embedded text and records every dated service with its provider, date, description, charge, page and the source's hash and version. Numeric dates such as 03/01/2026 are read month first (March 1, 2026). Each record keeps the original source wording, shown beside its date for counsel review; descriptions are the source's own words, never an automated medical conclusion. Scanned or unreadable pages, a service without an identifiable provider or description, several dates or amounts in one service row, a credit, and packets over 200 records are refused with the reason, and no partial chronology is saved.

### Import a reviewed record file

Expand **Import reviewed record file** to import counsel's transcription instead. Prepare a JSON record file containing an array of transcribed source entries in this format:

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

### Review and publish

Review the date-ordered records, the gross and reported bill totals and their difference. Each record's source link opens the exact cited original version at its page. Equal provider, date and charge values flag a possible overlapping bill; nothing is excluded automatically. A long interval flags the space between received treatment records, not a conclusion about missing care or causation.

For every candidate choose explicitly whether to keep the charge or exclude it from the reconciled total, and record the reason. Enter the counsel publication review and choose **Publish reviewed chronology**. Publication freezes those decisions and shows the reconciled total and its difference from the reported total; it grants no external access. Originals remain unchanged. Erasing any cited source removes its chronology snapshot and review, and disposal records the derivative count.
