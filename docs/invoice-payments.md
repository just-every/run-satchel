# Invoice payments and delivery

The principal reviews Stripe's terms in Team & safety, then approves operating
collection under Stripe collection. Supply `STRIPE_SECRET_KEY` through the
installation's private environment. Collection defaults to test mode. A production operator must explicitly configure
`STRIPE_MODE=live`, use matching credentials and obtain a new principal approval
for that environment in a separate installation. The stored payment environment
is immutable: changing the runtime mode refuses private application requests,
so test receipts never become production money. This campaign uses only held
test credentials. Enable card and US bank account payments in the
Stripe payment configuration. Payment details and bank verification remain on
Stripe's hosted page; Satchel stores neither card numbers nor bank credentials.

A client, co-client or payer opens **View and pay invoice** in their authenticated
portal. The page shows only that issued invoice, its balance and collection
history. **Pay by card or ACH** reserves the exact remaining amount before
opening Stripe. Returning from Stripe does not mark an invoice paid. A cancelled
open checkout can be continued; a pending or uncertain collection prevents a
second collection. The provider's event identity is read back through the
configured Stripe account before any financial record changes. Configure the
Stripe event destination as `POST /api/satchel/stripe/events`. Connected-account
events include their account identity. Repeated events retain one allocation;
refunds, disputes and returns retain append-only adjustments.

Operating collections reduce the invoice balance. Native trust applications and
Stripe reservations cannot collect the same remaining amount. A voided invoice
refuses payment; counsel records its issued replacement under Invoice delivery,
and the existing URL and QR destination name that replacement.

## Protected trust arrangements

Trust collection starts refused. The principal must record an intact bank and
processor protection agreement, its document reference, a separate connected
Stripe account and its verified default USD settlement bank. The processor must
report platform fee liability, platform payment-loss liability and disabled
negative-balance debits of the protected bank. Operating and trust collection
cannot share a processor account. Satchel rechecks these protections before
opening or resuming trust checkout and before posting a provider-confirmed
receipt. The principal also records that fees and chargebacks use separate
operating funds. A trust receipt enters its matter subsidiary ledger once and
never becomes operating invoice revenue. A subsequent return requires an
officer-reviewed bank correction; a provider event never silently debits protected
client principal.

The held ordinary Stripe sandbox account has no protected connected destination
and refuses connected-account creation until Connect setup is completed. No
verified trust arrangement or actual trust collection is claimed for that account.

## Branded delivery

In Firm, counsel uploads a firm logo and approves a numbered invoice template
with address, remittance instructions, payment terms, due date and the trust
balance choice. An explicitly selected template can render the original atomic
issue. Invoice delivery creates a frozen payer artifact from that exact approved
issue and template version; existing issued files remain unchanged. Its QR code
and link reach only the authenticated page for that invoice. Each payer receives
only their delivered artifact and statement. Clients and insurers use separate
portal identities. A staff role lacking full bank permission cannot prepare or
download a frozen artifact containing trust figures.

Counsel approves the generic plain-text sign-in notice once. Billing staff then
authorize exactly one send after reviewing current recipient authority, consent
on every retained merged identity and the prior provider outcome. The sender
rechecks these facts, membership, custom permissions and matter walls. Email
contains only sign-in instructions, with no invoice content or attachment.

For SendGrid, configure `MAIL_PROVIDER`, `MAIL_FROM` and private `MAIL_API_KEY`,
and the event verification public key as `SENDGRID_EVENT_PUBLIC_KEY`. The signed
event destination is `POST /api/satchel/providers/sendgrid/events`. Provider
acceptance is distinct from delivered, bounced, deferred and other signed events.
Replayed event identities cannot create another delivery outcome. A failed or
uncertain attempt is never resent automatically; a new attempt requires a new
recorded authorization that names the preceding attempt. Withdrawal of consent,
portal authority or staff permission stops the next send.

Use `SENDGRID_SANDBOX=1` for provider sandbox validation. It records
`sandbox_validated`, never mailbox delivery. SendGrid sandbox mode sends no email
and emits no delivered or bounced event. The native outcome handling is exercised
with signed events at the provider network edge; it makes no live-mailbox claim.
