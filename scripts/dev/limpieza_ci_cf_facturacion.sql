-- LIMPIEZA (excepción sancionada, sistema en construcción) — cambio de política:
-- el ingreso se reconoce SOLO con FEIT verificada contra la DIAN, no al finalizar el viaje.
-- Borra la cadena vieja completa: 5 CI (causación) + 2 CF (emisión) = 7 asientos + sus líneas.
-- Nunca se presentó exógena ni reporte oficial con estos números. Correr en el SQL Editor.
begin;
alter table journal_entries     disable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines disable trigger trg_bloquea_edicion_lines;
delete from journal_entries where id in (
  'fa2bedc1-e839-4988-b165-561b33f0f061',   -- CF-1 (VJ-0006, FEIT17)
  'e8f3a252-483a-4e9e-b9a9-c03d1e017e0f',   -- CF-2 (VJ-0048, FEIT22)
  'e88ff752-f439-4b5a-a6d6-2716bdb8829f',   -- CI-1 (VJ-0055 TSG)
  'a894bd7e-e4f9-4d99-93d4-f92cf3949b1a',   -- CI-2 (VJ-0045 Transgraneles)
  '4b358763-c194-4769-8681-e68d9e98819c',   -- CI-3 (VJ-0006 Antioqueña)
  '5695c39f-448f-4fcd-8122-14ba62d08763',   -- CI-4 (VJ-0048 Jamar)
  '764eb71a-f84c-454c-916b-124f6d473b69');  -- CI-5 (VJ-0052 Antioqueña)
alter table journal_entries     enable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines enable trigger trg_bloquea_edicion_lines;
commit;
