export const offlinePaidSql=(billSql:string)=>`COALESCE((SELECT SUM(oa.cents) FROM s_offline_allocations oa WHERE oa.bill_id=${billSql} AND NOT EXISTS(SELECT 1 FROM s_offline_releases rel WHERE rel.allocation_id=oa.id)),0)`;
export const writeoffSql=(billSql:string)=>`COALESCE((SELECT SUM(wo.cents) FROM s_invoice_writeoffs wo WHERE wo.bill_id=${billSql}),0)`;
export const offlineCountSql=(billSql:string)=>`(SELECT COUNT(*) FROM s_offline_allocations oa WHERE oa.bill_id=${billSql})`;
