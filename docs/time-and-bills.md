# Time and bills

Open **Time & bills** and check **Current matter**. Everyone assigned to the matter can record work; the principal or a lawyer prepares, approves and exports bills.

## Record work

1. Under **Record work**, choose **Time** or **Disbursement** in **Entry type**.
2. Enter the **Date** and **Description**.
3. For time, enter whole **Minutes** and **Hourly rate (USD cents)**. For a disbursement, enter **Amount (USD cents)**.
4. Choose **Record entry** and check **Unbilled work**.

Amounts and rates use whole USD cents: a $250 hourly rate is `25000`; a $42.50 disbursement is `4250`. A 90-minute entry at `25000` produces $375.00. Time charges round to the nearest cent, with half cents rounded up.

## Review and export a bill

1. Check every entry in **Unbilled work**. Enter **Bill title** and **Bill date**.
2. Choose **Prepare bill from all unbilled work**. This includes all entries currently shown as unbilled and reserves them for that bill.
3. Under **Reviewed bill packages**, inspect the draft's exact lines, date and total.
4. Enter a **Review note**, then choose **Approve exact bill**.
5. Choose **Download reviewed CSV**. Keep the file with your accounting records.

Preparing a bill accepts between 1 and 100 source entries. A source entry belongs to only one live original bill. To discard a draft, expand **Discard draft**, give a **Reason**, and choose **Void draft**; its sources return to unbilled work.

The downloaded CSV preserves the approved package. Downloading it again retains the same reviewed contents. If another person changes a bill while you review it, reload and review the current revision before deciding.

## Correct an exported amount

1. On the exported package, expand **Prepare a correction**.
2. Choose **Source line**. Enter **Correct total for this source (USD cents)**, a **Reason** and **Date**.
3. Choose **Prepare correction for review**.
4. Inspect the correction package, enter its **Review note**, choose **Approve exact bill**, then **Download reviewed CSV**.

Enter the desired total for the source, not the adjustment. Changing a $375.00 source to $350.00 means entering `35000`; the correction is −$25.00. The original export stays unchanged. For another correction, use the latest reviewed correction after exporting it.
