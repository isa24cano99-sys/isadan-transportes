-- ============================================================================
-- 3 correcciones (correr UNA vez en SQL Editor):
-- (1) OVERLOAD: la migración 20260809200000 agregó postear_gasto_bancario_directo
--     con firma nueva (2 params) sin eliminar la vieja (1 param) → llamar con 1 arg
--     es ambiguo (PostgREST HTTP 300, rompe todo gasto sin ceco). Se elimina la vieja.
-- (2) LIMPIEZA del par de prueba del test de ceco: CB-73 (3022f284) + CX-26 (d2634fb3).
-- (3) CONTADOR CB inconsistente (pre-existente): tipos_comprobante.siguiente_consecutivo
--     estaba en 74 pero existen CB hasta 98 → el próximo posteo colisionaría en CB-82.
--     Se sube a 99 (max+1). CX vuelve a 26 (el test era el último CX).
-- ============================================================================

-- (1) eliminar el overload viejo
drop function if exists postear_gasto_bancario_directo(uuid);

-- (2) borrar el par de prueba (excepción sancionada de inmutabilidad)
alter table journal_entries      disable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines  disable trigger trg_bloquea_edicion_lines;
delete from journal_entry_lines where journal_entry_id in
  ('3022f284-c273-42c1-b8a6-2fcc6acaf8d8', 'd2634fb3-94e3-4197-8d6c-f9c51fd99bc6');
delete from journal_entries      where id in
  ('3022f284-c273-42c1-b8a6-2fcc6acaf8d8', 'd2634fb3-94e3-4197-8d6c-f9c51fd99bc6');
alter table journal_entries      enable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines  enable trigger trg_bloquea_edicion_lines;

-- (3) contador CB al máximo real + 1 (evita colisión); CX vuelve a 26
update tipos_comprobante set siguiente_consecutivo = 99 where codigo = 'CB';
update tipos_comprobante set siguiente_consecutivo = 26 where codigo = 'CX';
