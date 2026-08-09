-- ============================================================================
-- Reclasificación del catch-all 52959510 → cuentas granulares 5297xx.
--   Solo cambia cuenta_puc en las líneas existentes (NO re-postea; no toca montos,
--   terceros ni fechas). El cuadre global es idéntico. Excepción sancionada de
--   inmutabilidad (periodo 2026-07 abierto, sin aprobación formal).
--   24 líneas: 16 "Gastos terreno" → 529775 ($14.529.688) · 7 "Invitaciones a almorzar"
--   + 1 HOGAR/MUEBLES (CB-53, $336.699, Isabella decidió Otros gastos) → 529799 ($966.699).
--   Requiere 529775 "Gastos terreno" ya creada. Correr UNA vez en SQL Editor.
-- ============================================================================
alter table journal_entry_lines disable trigger trg_bloquea_edicion_lines;

-- 16 líneas "Gastos terreno" → 529775
update journal_entry_lines set cuenta_puc = '529775' where id in (
  'fbf6a3b7-ca42-43a3-8e54-e26ba046735d','93ec4a85-91c7-420f-a6f4-cb99473925f0','1601f415-9f92-42ff-a84a-baa157b40e0f',
  '6c97b361-0775-4bf9-92f6-7a85ca90df50','4e061699-0ed2-4f65-b67e-fd47c8216319','9ccdf961-7d4f-43af-b0f9-0d58f448e85d',
  'cd952a54-cc14-4df4-94a6-879a04f6c348','3557243e-773b-43f5-854b-e6bc1832a83d','b9b6de1a-ed2e-41cb-959f-0909529b9b81',
  'c2cf01b5-42c3-4bbd-b38e-dc6c587dc674','2df0b276-fd4d-49a1-b8a1-d1e73434c1f0','5cddec39-698b-4bf9-8b86-02a728f8e7de',
  '7de6e30f-1d6e-4310-b79f-33de497d4961','66423dbc-73e3-40f5-bb1c-6b679d774ab5','157a7c86-aea8-4504-a475-2b25272d18e6',
  'a6450863-e3bb-4f73-b055-a1be417f3f5f');

-- 7 líneas "Invitaciones a almorzar" + 1 HOGAR/MUEBLES (CB-53) → 529799
update journal_entry_lines set cuenta_puc = '529799' where id in (
  'a382e6a9-6c4b-422f-8736-3417b792377e','074f1b7e-5acd-4b85-a1ba-f0fcca46b538','5107ce91-9871-48c1-b02d-b72e365d9a80',
  'f0881cae-debe-43f8-8b00-d3ac7eb5068a','346ccb28-e3b8-437d-8fce-ab69ffc9cf21','f9d8d652-bd88-4cc0-92e2-6838fd24e12a',
  '651c7c1f-59f6-42d5-be26-bc3cb130bbf5','4c2b31f1-2c76-437d-b5ca-5cdb7781263c');

alter table journal_entry_lines enable trigger trg_bloquea_edicion_lines;
