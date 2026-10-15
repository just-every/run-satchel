# Backup and restore

The principal manages firm archives and document erasure in **Team & safety**. Store archives privately: they include matter data and original files.

## Download an archive

1. Open **Team & safety**.
2. Under **Backup & restore**, choose **Download firm archive**.
3. Keep the downloaded `.rer` archive in your firm's backup storage.

The archive includes domain records, document originals and versions, reviewed bills and approvals, import originals and journals. Sign-in credentials, sessions, agent keys and local outboxes are excluded.

From the checkout, the same archive format is available through:

```sh
rer export --output exports/firm.rer
```

## Restore into an empty installation

Restore requires an empty destination; it does not merge two firms.

1. Sign in as the destination's principal and open **Team & safety**.
2. Expand **Restore into this empty firm** under **Backup & restore**.
3. Select the `.rer` file in **Satchel archive**.
4. Enter `RESTORE` in **Type RESTORE**, then choose **Restore archive**.

For larger archives, use the CLI in the empty destination checkout:

```sh
rer import --input exports/firm.rer --yes
rer dev
```

After the move, re-enter private configuration, sign in again and create new agent preparation keys. Check restored matters, document versions, reviewed bill packages and import journals before resuming work.

## Erase document originals

Erasure removes every version's bytes. Names, hashes and decision history remain, and affected deadlines are invalidated.

1. Under **Erase document originals**, choose the **Matter** and expand the document name.
2. Enter its exact name in **Document name to confirm** and record an **Erasure reason**.
3. Choose **Erase all original bytes**.
4. Download a new firm archive and retire older backups according to your firm's retention policy.

An older offline archive cannot know that a later erasure occurred. If an old archive must be restored elsewhere, supply a trusted newer archive containing the erasure journal:

```sh
rer import --input exports/old.rer --journal exports/after-erasure.rer --yes
```

The newer journal prevents restoration of erased original bytes. Prefer the latest archive.
