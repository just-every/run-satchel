// Hosted operating collections pay invoices. Trust collections are deposits into
// their own subsidiary ledger and never discharge an invoice here.
export const stripePendingStatuses=['creating','open','pending','uncertain'] as const;
const pendingSql=stripePendingStatuses.map(s=>`'${s}'`).join(',');
export const stripePrincipalSql=(checkout='sc')=>`${checkout}.cents-COALESCE((SELECT SUM(sa.cents) FROM s_stripe_adjustments sa WHERE sa.checkout_id=${checkout}.id),0)`;
export const stripePaidSql=(billSql='?')=>`COALESCE((SELECT SUM(${stripePrincipalSql()}) FROM s_stripe_checkouts sc WHERE sc.bill_id=${billSql} AND sc.purpose='operating' AND sc.status IN('paid','returned')),0)`;
export const stripeReservedSql=(billSql='?')=>`COALESCE((SELECT SUM(sc.cents) FROM s_stripe_checkouts sc WHERE sc.bill_id=${billSql} AND sc.purpose='operating' AND sc.status IN(${pendingSql})),0)`;
export const stripeApplicationCountSql=(billSql='?')=>`(SELECT COUNT(*) FROM s_stripe_checkouts sc WHERE sc.bill_id=${billSql} AND sc.purpose='operating' AND sc.status IN('paid','returned'))`;
// There is no retained earned and tax split for a processor collection. A native
// trust application must wait until it is fully returned or its pending attempt
// is resolved, rather than infer which component the processor collected.
export const noStripeInvoiceFundsSql=(billSql='?')=>`NOT EXISTS(SELECT 1 FROM s_stripe_checkouts sc WHERE sc.bill_id=${billSql} AND sc.purpose='operating' AND (sc.status IN(${pendingSql}) OR (sc.status IN('paid','returned') AND (${stripePrincipalSql()})>0)))`;
