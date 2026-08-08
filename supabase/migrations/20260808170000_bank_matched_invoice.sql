-- ════════════════════════════════════════════════════════════════════════════
-- Vínculo bidireccional FE↔banco (PASO 1 · solo esquema).
-- Columna dedicada bank_transactions.matched_invoice_id, simétrica a
-- legalization_expenses.matched_invoice_id (20260806120000). NO se reutiliza
-- reference_type/reference_id (ya tienen semántica TRIP/FLYPASS_PEAJE).
--
-- Índice parcial (solo filas asignadas) para la consulta de la vista de
-- conciliación "¿qué transacción bancaria pagó esta FE?" — pocas filas no nulas.
-- NO se toca postear_costo_dian ni ninguna función aquí. Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
alter table bank_transactions
  add column if not exists matched_invoice_id uuid references dian_invoices_import(id);

create index if not exists bank_transactions_matched_invoice_idx
  on bank_transactions (matched_invoice_id)
  where matched_invoice_id is not null;
