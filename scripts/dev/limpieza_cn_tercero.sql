-- LIMPIEZA (excepción sancionada de inmutabilidad, fase de construcción de nómina) —
-- borra los CN originales con el bug de tercero (CN-1/2/3) y sus reversiones (CX-5/6/7).
-- Quedan SOLO CN-4/5/6 (correctos). Las líneas se borran por cascade (FK on delete cascade).
-- Orden: CX primero (referencian los CN vía anula_a). Correr en el SQL Editor.
begin;
alter table journal_entries     disable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines disable trigger trg_bloquea_edicion_lines;

-- 1) reversiones primero
delete from journal_entries where id in (
  '7da49dad-f309-4d23-bbf6-54a3a2f563d6',   -- CX-5 (anula CN-1)
  'b464ad0e-4423-46eb-b8f5-81354c3054a3',   -- CX-6 (anula CN-2)
  '24a641f2-7947-4823-9c08-65e49e676070');  -- CX-7 (anula CN-3)

-- 2) originales con el bug de tercero
delete from journal_entries where id in (
  '8aa58fad-25e3-4a4e-a9b1-8971a02b4f5f',   -- CN-1 Daniel
  '253b3b19-b919-4a7b-99cc-000614fef95d',   -- CN-2 Jhon
  '688e87d3-3bf1-4bbb-acd9-42fd0ba7b817');  -- CN-3 Jorge

alter table journal_entries     enable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines enable trigger trg_bloquea_edicion_lines;
commit;
