# Matters and conflict review

The principal or a lawyer opens a matter after reviewing a fresh conflict search. The search covers your firm's records, including imported contacts. It supports your review; the person opening the matter decides whether it may proceed.

## Open a matter

1. Open **Matters**. Under **Open a matter**, enter **Client name** and **Adverse party name**.
2. Enter known names in **Additional names or aliases (separate with ;)**. For example, include a previous company name and a trading name separated by a semicolon.
3. Choose **Run conflict search**. Read every possible match, including its aliases. Complete any further checks your firm requires.
4. Enter a **Matter title** and **Review conclusion and any conflict clearance**. Record the actual conclusion and any clearance supporting it.
5. Check **I reviewed these results and am authorized to open this matter.** Choose **Open reviewed matter**.

If the app says the search is stale, run it again and review the current results. Adding parties or importing contacts can change the records against which the search was made.

## Revisit the review

Choose a matter in **Matter register** or **Current matter**. Its detail shows the client, adverse party, conflict conclusion and reviewer. Expand **Recorded conflict search** to inspect the recorded results and search time.

**Current matter** also selects the records shown in **Time & bills**, **Documents** and **Deadlines**. Check it before adding work or files.

## Give someone matter access

Only the principal manages access. First save an active member in **Team & safety**, then:

1. Open **Matters** and select the matter.
2. Under **Matter access**, select the **Firm member**.
3. Choose **Grant access**.

Use **Remove** beside a person's email to remove that matter assignment. The principal continues to see all matters. Firm membership alone does not give a lawyer or assistant access to every matter.

For access across the whole firm, use **Deactivate** in **Team & safety**. For private document visibility, see [Documents and deadlines](documents-and-deadlines.md).

## Matter numbers

In **Firm → Matter numbering**, the principal chooses a starting sequence,
minimum digits and a pattern. Use `{sequence}` once, with optional `{year}`,
`{client}` and `{practice}` tokens and separators. For example,
`{year}/{practice}/{client}/{sequence}` with a start of 1050 and four digits
produces a number such as `2026/LIT/BAK/1050`. The year comes from the matter's
opening date in UTC. Padding is a minimum width; larger sequences grow.

A firm-wide sequence is shared by all clients. To use a separate sequence per
client, enable that option and include `{client}` in the pattern. Enter a client
number when opening that client's first matter or let Satchel assign one;
later matters reuse it. Practice codes come from the firm's configured practice
areas. A pattern using `{practice}` requires a practice selection.

Allocation, conflict clearance and matter creation commit together. Simultaneous
openings receive distinct numbers. Imported Clio matters keep their source
numbers and new allocations skip them. Changing the pattern or starting number
never renumbers existing matters. The saved number accompanies matter searches,
documents, calendar records and reviewed bill packages. Search **Matters** by
name or number; only matters you can access appear.

## Maintain legal contacts

**Legal contacts** on **Matters** searches names, aliases, former names, related entities, source IDs and permitted matter roles. The principal or a lawyer can create a person or organization, edit its profile, add an entity relationship or attach its client, adverse, insurer, witness, expert or counsel role to a permitted matter. Staff see only contacts linked to matters they can access; contact access grants no new matter access.

To deduplicate imported aliases, classify both contacts, select the survivor, expand **Merge a duplicate**, choose the duplicate and record why they are the same identity. **Preview contact merge** shows the exact source identities and relationships. **Apply reviewed contact merge** retains both original IDs, source provenance and every existing link. A changed graph needs a new preview. Earlier recorded conflict searches remain unchanged; opening a new matter requires fresh review.

Record communication evidence against its exact source identity and channel, with its evidence date and source reference. Unknown is the default. After a merge any denied identity denies that channel; otherwise every identity must allow before it becomes allowed. The evidence date records what was attested, rather than scheduling a future change. These are evidence records; sending and contact sync require their own explicit authority.

## Publish an intake form

In **Matters → Intake forms**, a principal or lawyer sets the firm's name and optional logo, practice, lead assignee and inquiry-review consent. Add text, date, choice or yes/no questions; a question may depend on an earlier choice or yes/no answer. Create a draft, then **Publish form** and share its `/intake/…` link. Editing saves a new version; unpublishing stops new inquiries without deleting earlier submissions.

Prospects can complete the form on a phone and attach up to three PDF/PNG/JPEG originals, 10 MiB each. Successful submission displays an opaque receipt; it does not send an acknowledgment email. Consent is for receiving and reviewing that inquiry, and does not authorize automated contact.

Open **Lead pipeline → Intake submissions** to read the original answers, receipt and exact consent text/time, and download private originals. Files are not malware-scanned. Assistants see only assigned leads; a merge does not grant access to another lead's original files. Earlier consent and form versions remain unchanged when the form is edited. Closed leads retain their intake history under **Closed leads**.

## Book consultations

In **Matters → Consultations**, the principal or a lawyer approves weekly availability: weekdays, a window, the length, buffers before and after, minimum notice and how many days ahead a prospect may book. Times are in the availability timezone, so daylight saving moves the UTC instant. A booking page is published at `/book/<offer>`; the prospect sees times in their own timezone and cannot book outside what is approved or while the lawyer already has a matter appointment or consultation there.

A fee is disclosed and must be acknowledged; it is recorded as due at the consultation. Satchel collects no payment. The booking creates one lead assigned to the responsible lawyer and, when the page has a linked intake form, the same immutable intake record a form submission makes. Two prospects racing for the last time get one appointment and one refusal. The prospect's confirmation link lets them move the booking to another approved time or cancel it; either change keeps one appointment, appends history and leaves a next action on the lead. The lawyer or principal can also cancel with a reason.

## Follow up prospects under consent

**Matters → Consented follow-ups** (principal) configures consultation reminders, unanswered-inquiry follow-ups and engagement chases: the steps, quiet hours with their timezone and a contact limit per lead in seven days. Only email exists, and only after the principal records the mail provider review in **Team & safety → Provider charges**: that review is the firm's recorded sending authority. SMS and other channels are not available.

A message is sent only while the lead's own email consent is active. Record consent on the lead under **Consent and follow-ups** (how the prospect agreed and what to), or the prospect ticks it on the booking form. A contact merge supplies neither authority nor consent. Every message carries a link that stops them. A reply, a conflict stop (principal or lawyer), a decline or an opt-out halts every active sequence for the lead and names the next human action and its owner, visible on the lead; so does losing or converting the lead. A message is held during quiet hours or when the contact limit is reached, and a restart of the worker never resends one.
