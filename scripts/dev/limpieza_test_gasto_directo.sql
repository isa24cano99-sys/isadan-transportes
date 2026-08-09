-- ============================================================================
-- Limpieza de los asientos de PRUEBA del test de postear_gasto_bancario_directo.
--   CB-53 (f53073fd) — posteo de prueba de un Combustible directo real ($400.000)
--   CX-26 (e871df7c) — su reversión de prueba (anula_a=CB-53)
-- Neto $0, pero dejan la tx marcada como contabilizada (sale del pool de candidatas).
-- Excepción sancionada de inmutabilidad (disable trigger + delete + enable). Son los
-- últimos de su tipo → reset de consecutivos sin gap (próximo CB=53, próximo CX=26).
-- Correr UNA vez en SQL Editor.
-- ============================================================================
alter table journal_entries      disable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines  disable trigger trg_bloquea_edicion_lines;

delete from journal_entry_lines where journal_entry_id in
  ('f53073fd-95ac-4db0-9571-2d93bd0494eb', 'e871df7c-f7e9-4ff8-b459-50681756a8ff');
delete from journal_entries      where id in
  ('f53073fd-95ac-4db0-9571-2d93bd0494eb', 'e871df7c-f7e9-4ff8-b459-50681756a8ff');

-- Reset de consecutivos (CB-53 y CX-26 eran los últimos → sin hueco)
update tipos_comprobante set siguiente_consecutivo = 53 where codigo = 'CB';
update tipos_comprobante set siguiente_consecutivo = 26 where codigo = 'CX';

alter table journal_entries      enable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines  enable trigger trg_bloquea_edicion_lines;
