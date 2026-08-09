-- ============================================================================
-- Alinea bt_gasto_contabilizado con asientoContabilizadoDeTransaccion (/bancos):
-- una transacción está "contabilizada" por CUALQUIER vía, no solo CB directo:
--   (a) cualquier asiento directo (origen_tabla='bank_transactions', CUALQUIER comprobante)
--   (b) consolidado (tabla puente gasto_consolidado_items)
--   (c) FE vinculada (matched_invoice_id cuyo costo se posteó desde la factura DIAN)
-- Cierra el hueco: un combustible/descargue con FE vinculada ya tiene su CG posteado por
-- el lado de la factura; postearlo como gasto directo duplicaría el costo. Ahora
-- postear_gasto_bancario_directo y postear_gastos_consolidados (que llaman a esta función)
-- lo rechazan aunque se invoquen por RPC directo. Aplicar en SQL Editor.
-- ============================================================================
create or replace function bt_gasto_contabilizado(p_bt uuid) returns boolean language sql stable as $$
  select exists(  -- (a) cualquier asiento directo desde la transacción (no solo CB)
           select 1 from journal_entries e
            where e.origen_tabla = 'bank_transactions' and e.origen_id = p_bt
              and e.estado = 'CONTABILIZADO')
      or exists(  -- (b) consolidado (tabla puente)
           select 1 from gasto_consolidado_items i
             join journal_entries e on e.id = i.journal_entry_id
            where i.bank_transaction_id = p_bt and e.estado = 'CONTABILIZADO')
      or exists(  -- (c) FE vinculada: el costo se posteó desde la factura DIAN
           select 1 from bank_transactions bt
             join journal_entries e on e.origen_tabla = 'dian_invoices_import'
                                   and e.origen_id = bt.matched_invoice_id
            where bt.id = p_bt and bt.matched_invoice_id is not null
              and e.estado = 'CONTABILIZADO');
$$;
