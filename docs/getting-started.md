# Get started with Satchel

Satchel keeps your firm's matters, time, disbursements, original files, deadlines and reviewed bill packages together. Start with one matter and work through its first bill.

## Start Satchel

Run this line in a terminal. It is the same line as the [Run Satchel](https://run-satchel.com/run) page:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-satchel
```

Git is required; rer brings Node and pnpm. Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-satchel` does the same. The line installs `rer` for you alone, with its own Node if you have no Node 22 or later, then gets Satchel into `run-satchel`, installs everything and starts it. If the installer prints an `export PATH=…` line, run that line too. To start it again later, run the same line from the same folder, or `cd run-satchel && rer dev`.

The first launch can take several minutes. If it is interrupted, run the same command again. Open the printed `RER_OPEN` link, confirm the owner on **Finish setup**, and enter the workspace. Keep that link private: it is a local sign-in credential. The printed `RER_READY` address is the running app's address.

For an existing installation, open **Sign in** and follow the email-link sign-in. In local development, mail appears in the development outbox; it sends no email. If the launch prints `RER_SIGN_IN`, use that outbox link.

## Do your first jobs

A new installation starts empty, with no sample clients or matters. The principal first lands on **Firm**: enter the firm's name, email, phone and US address, its IANA timezone, USD billing defaults (hourly rate, billing increment, payment terms), fiscal year and accounting basis, each office and each practice area with a short code, then choose **Save firm settings**. Lawyers and assistants see these settings read-only; new time entries start at the firm rate and new deadlines at the firm timezone. **Download firm settings** saves them as a file, and **Import a firm settings file** loads one from another Satchel installation, recording the file name and its SHA-256 as their source. The firm archive in **Team & safety** includes them.

1. Open **Matters**. Enter the client, adverse party and known aliases, then choose **Run conflict search**. Review the results, record your conclusion and open the matter. See [Matters and conflict review](matters.md).
2. Open **Time & bills** and check **Current matter**. Record work, prepare a bill, review its exact lines and download its approved CSV. See [Time and bills](time-and-bills.md).
3. Open **Documents** to save an original. In **Deadlines**, record its date, timezone and source for a lawyer's confirmation. See [Documents and deadlines](documents-and-deadlines.md).
4. In **Team & safety**, save and invite firm members. Grant each person access from the matter. See [Team and preparations](team-and-preparations.md).
5. Download a firm archive from **Team & safety**. See [Backup and restore](backup-and-restore.md).

The principal sees every matter. Lawyers and assistants see assigned matters. Assistants can record work, upload files and propose deadlines; the principal or a lawyer performs the reviews.

Moving contacts from Clio? Follow [Move in](move-in.md) before running the conflict searches for your new matters.

Satchel is free software with no payment or license step; providers you connect later bill your firm directly. See [Free software and provider charges](free-and-providers.md).

To stop your local app, run `rer dev --stop` from the same checkout.
