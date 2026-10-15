# Move Clio contacts into Satchel

The principal uses **Move in** to add contacts to the firm's conflict-search register. Imported contacts still need the normal [matter conflict review](matters.md) before a matter opens.

## Prepare the contacts file

Use UTF-8 CSV with these four headers, even where cells are empty:

| Header | Value |
| --- | --- |
| `first_name` | Person's first name |
| `last_name` | Person's last name |
| `company` | Company name when both person-name fields are empty |
| `email_address` | Primary email, or empty |

For a person, supply both first and last names. Optional `id` preserves the original contact ID; optional `aliases` adds conflict-search names. A file supports 1–1,000 contacts and at most 1 MB. Satchel expects these headers rather than guessing mappings from an arbitrary export.

Keep source IDs where possible. Without an ID, identity comes from the normalized name and email, so changing either creates a different identity. If a person has a company value too, the person is imported and the company remains in provenance with a warning. Other columns remain in the retained source file and raw row provenance.

See the repository's [import format reference](https://github.com/just-every/run-satchel/blob/main/IMPORTING.md) and [example CSV](https://github.com/just-every/run-satchel/blob/main/fixtures/clio-contacts.csv) for preparation details.

## Preview and commit

1. Open **Move in** and select **Contacts CSV**, or enter the CSV in **CSV contents**.
2. Choose **Preview import**. The **Dry run** makes no contact changes. Review its counts, summary, warnings and normalized parties; resolve errors before continuing.
3. Choose **Commit reviewed import** for that exact file. Editing its contents requires another preview.
4. Check **Import journal**. If the job is still applying, choose **Resume** until it completes. Choose **View journal** to inspect its progress and retained source names and hashes.

An identical replay reuses the source import. Changed content for an already imported identity needs deliberate reconciliation; Satchel does not silently overwrite edited or native contacts.

## Undo an import

Choose **Undo import** on the completed job. If its state remains `undoing`, repeat **Undo import** until processing finishes. Use **View journal** to inspect the **Journal and undo report**.

Undo removes only unchanged contacts created by that job. Edited contacts and contacts linked to a matter remain, with their retention reasons in the journal. The originals and import journal are included in your [firm archive](backup-and-restore.md).
