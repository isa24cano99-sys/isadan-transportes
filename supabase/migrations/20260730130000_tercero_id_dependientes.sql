-- Consolidación en terceros — agregar tercero_id a las tablas dependientes.
-- Solo DDL (ADD COLUMN). Los UPDATE de backfill los corre la app/scripts por API luego.
-- IF NOT EXISTS → idempotente; bank_transactions ya lo tenía desde Semana 1 (no-op).
alter table trips                        add column if not exists tercero_id uuid references terceros(id);
alter table accounts_receivable          add column if not exists tercero_id uuid references terceros(id);
alter table accounts_receivable_entries  add column if not exists tercero_id uuid references terceros(id);
alter table bank_transactions            add column if not exists tercero_id uuid references terceros(id);
alter table description_patterns         add column if not exists tercero_id uuid references terceros(id);
alter table dian_invoices_import         add column if not exists tercero_id uuid references terceros(id);
alter table invoices                     add column if not exists tercero_id uuid references terceros(id);
