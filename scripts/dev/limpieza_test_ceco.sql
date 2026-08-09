-- ============================================================================
-- Limpieza de los 4 asientos de prueba del test final de centro de costo:
--   CB-99, CB-100 (posteos de prueba) + CX-26, CX-27 (sus reversiones).
-- Excepción sancionada de inmutabilidad. max real sin ellos: CB=98, CX=25 →
-- reset gapless: CB→99, CX→26. Correr UNA vez en SQL Editor.
-- ============================================================================
alter table journal_entries      disable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines  disable trigger trg_bloquea_edicion_lines;
delete from journal_entry_lines where journal_entry_id in (
  '1b2918e0-d9b5-4bc0-9b92-078af59c7cab','f3b82a67-45e3-4b56-9ed5-8c2e5d848103',
  'a727b251-e7c8-4c8b-9253-4cdcc499985e','d1988715-e8ee-4fcf-b668-2c816d707c1d');
delete from journal_entries      where id in (
  '1b2918e0-d9b5-4bc0-9b92-078af59c7cab','f3b82a67-45e3-4b56-9ed5-8c2e5d848103',
  'a727b251-e7c8-4c8b-9253-4cdcc499985e','d1988715-e8ee-4fcf-b668-2c816d707c1d');
alter table journal_entries      enable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines  enable trigger trg_bloquea_edicion_lines;

update tipos_comprobante set siguiente_consecutivo = 99 where codigo = 'CB';
update tipos_comprobante set siguiente_consecutivo = 26 where codigo = 'CX';
