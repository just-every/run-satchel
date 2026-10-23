CREATE TRIGGER s_entries_money_insert AFTER INSERT ON s_entries BEGIN UPDATE s_billing_money_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER s_entries_money_update AFTER UPDATE ON s_entries BEGIN UPDATE s_billing_money_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER s_entries_money_delete AFTER DELETE ON s_entries BEGIN UPDATE s_billing_money_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER s_invoice_issues_money_insert AFTER INSERT ON s_invoice_issues BEGIN UPDATE s_billing_money_revision SET revision=revision+1 WHERE id=1; END;
