# Get started with Satchel

Satchel keeps your firm's matters, time, disbursements, original files, deadlines and reviewed bill packages together. Start with one matter and work through its first bill.

## Open your workspace

For a local review, run one line. It clones Satchel, installs `rer` if you do not have it and starts the app:

```sh
npx -y @runeditrun/rer dev just-every/run-satchel
```

Without Node, `curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-satchel` does the same. To start it again later, run `rer dev` from the `run-satchel` folder.

The first launch can take several minutes. If it is interrupted, run the same command again. Open the printed `RER_OPEN` link, confirm the owner on **Finish setup**, and enter the workspace. Keep that link private: it is a local sign-in credential. The printed `RER_READY` address is the running app's address.

For an existing installation, open **Sign in** and follow the email-link sign-in. In local development, mail appears in the development outbox; it sends no email. If the launch prints `RER_SIGN_IN`, use that outbox link.

## Do your first jobs

1. Open **Matters**. Enter the client, adverse party and known aliases, then choose **Run conflict search**. Review the results, record your conclusion and open the matter. See [Matters and conflict review](matters.md).
2. Open **Time & bills** and check **Current matter**. Record work, prepare a bill, review its exact lines and download its approved CSV. See [Time and bills](time-and-bills.md).
3. Open **Documents** to save an original. In **Deadlines**, record its date, timezone and source for a lawyer's confirmation. See [Documents and deadlines](documents-and-deadlines.md).
4. In **Team & safety**, save and invite firm members. Grant each person access from the matter. See [Team and preparations](team-and-preparations.md).
5. Download a firm archive from **Team & safety**. See [Backup and restore](backup-and-restore.md).

The principal sees every matter. Lawyers and assistants see assigned matters. Assistants can record work, upload files and propose deadlines; the principal or a lawyer performs the reviews.

Moving contacts from Clio? Follow [Move in](move-in.md) before running the conflict searches for your new matters.

To stop your local app, run `rer dev --stop` from the same checkout.
