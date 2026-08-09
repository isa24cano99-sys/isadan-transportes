-- ============================================================================
-- FIRME — GMF julio 2026: borrar los 29 CB individuales y consolidar en 1 asiento.
--   Excepción sancionada de inmutabilidad (sistema en construcción; los 29 eran
--   posteos de prueba del primer día del mecanismo, nadie los tomó como definitivos).
--   Los 16 CB restantes (82-97) son gastos reales distintos y NO se tocan.
--   El hueco de consecutivos 53-81 es transitorio y esperado (documentado en memoria).
--   Requiere la migración 20260809140000 (postear_gastos_consolidados) ya aplicada.
--   Correr UNA vez en SQL Editor.
-- ============================================================================

-- 1) Borrar los 29 CB de GMF (consecutivos 53-81) — encabezado + líneas
alter table journal_entries      disable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines  disable trigger trg_bloquea_edicion_lines;

delete from journal_entry_lines where journal_entry_id in (
  '8aba5cc2-2002-44b3-80c0-8712940bcd8c','e044787b-c95a-4887-8693-91f319c80e49','3d1ba139-8605-4e16-89f2-80b80a39c185',
  'e17627ce-c0e2-4322-b315-597f7576477e','8b9daf4c-2379-4e02-aa27-4cabaeab2425','563550f0-fb16-49ba-9537-4a0acd7d7d2e',
  '92200e70-22dd-4ec3-b667-98b78a8dd81d','24a895d7-c399-46cd-b701-b85333af12e5','ba7c12c0-df12-40d7-b06e-ca0c8427d5d9',
  '72a187d7-2181-4fa7-b57b-3373d6d3aa5b','261f69a4-b8ad-421b-aa9c-e06cf30d37f0','48cfada5-9a3c-40da-ad33-246842c89a7b',
  '22aad101-ec6f-40b9-9b28-58bc91d7634e','f418b356-40ae-4337-8c0e-ec2dfecf71ca','377661f3-6b01-4cc2-bc8d-637a96ad4501',
  '77e91e79-c12e-4cdd-83d8-3f1ac114ce4c','147625e8-7c7a-49d0-b2b6-e971a5b6e39e','2951f4b0-cc10-4842-978b-42ddf74972a3',
  '22551860-c70a-49f8-8dea-e77ba90b86bf','85b1a025-5b67-43db-8e79-43b360d3ea0c','aa7b0533-771a-4a51-8c3d-74889d7c39b3',
  '50259843-99cd-49ba-a129-2520c9a08677','9ce05967-58f6-4e00-8cd7-ece7e551cdd0','50148b7c-0d3a-4da3-a07d-d49d254a043d',
  '513fbc90-9702-4964-b267-110fe87aee87','f9e2a38a-538d-4b19-bda8-f07a12ab3a95','ee895b46-f3a4-4988-8bc4-79987a54dcce',
  'fdcee08f-26a8-40a2-ad0d-1cc2b2449aa7','c6b09cfa-b04e-40f1-ae35-74c4cdc477de');
delete from journal_entries where id in (
  '8aba5cc2-2002-44b3-80c0-8712940bcd8c','e044787b-c95a-4887-8693-91f319c80e49','3d1ba139-8605-4e16-89f2-80b80a39c185',
  'e17627ce-c0e2-4322-b315-597f7576477e','8b9daf4c-2379-4e02-aa27-4cabaeab2425','563550f0-fb16-49ba-9537-4a0acd7d7d2e',
  '92200e70-22dd-4ec3-b667-98b78a8dd81d','24a895d7-c399-46cd-b701-b85333af12e5','ba7c12c0-df12-40d7-b06e-ca0c8427d5d9',
  '72a187d7-2181-4fa7-b57b-3373d6d3aa5b','261f69a4-b8ad-421b-aa9c-e06cf30d37f0','48cfada5-9a3c-40da-ad33-246842c89a7b',
  '22aad101-ec6f-40b9-9b28-58bc91d7634e','f418b356-40ae-4337-8c0e-ec2dfecf71ca','377661f3-6b01-4cc2-bc8d-637a96ad4501',
  '77e91e79-c12e-4cdd-83d8-3f1ac114ce4c','147625e8-7c7a-49d0-b2b6-e971a5b6e39e','2951f4b0-cc10-4842-978b-42ddf74972a3',
  '22551860-c70a-49f8-8dea-e77ba90b86bf','85b1a025-5b67-43db-8e79-43b360d3ea0c','aa7b0533-771a-4a51-8c3d-74889d7c39b3',
  '50259843-99cd-49ba-a129-2520c9a08677','9ce05967-58f6-4e00-8cd7-ece7e551cdd0','50148b7c-0d3a-4da3-a07d-d49d254a043d',
  '513fbc90-9702-4964-b267-110fe87aee87','f9e2a38a-538d-4b19-bda8-f07a12ab3a95','ee895b46-f3a4-4988-8bc4-79987a54dcce',
  'fdcee08f-26a8-40a2-ad0d-1cc2b2449aa7','c6b09cfa-b04e-40f1-ae35-74c4cdc477de');

alter table journal_entries      enable trigger trg_bloquea_edicion_entries;
alter table journal_entry_lines  enable trigger trg_bloquea_edicion_lines;

-- 2) Postear el asiento consolidado "GMF julio 2026" sobre las mismas 29 bank_transactions
--    (toma el siguiente consecutivo disponible → CB-98; hueco 53-81 queda transitorio)
select postear_gastos_consolidados(
  array[
    'f69a3d09-40e6-451a-a0fa-d0e4ca29ee60','80afe7aa-1773-480a-865c-2443c837ec86','a9f476c6-2263-47c6-994d-c4001baf9a6c',
    'bc4edde1-fe67-4261-b606-2923e4dbb6c7','7b4e1d6b-fbb1-4dfb-8a26-9b18d30d74c0','58360ebc-938e-4460-87fb-febe412f0411',
    '07a9a2d1-26e2-4d4c-aa68-9993a8cbe8ef','eaaf8e5b-c3df-436a-bc76-44d0ae65e225','6e271f08-dd29-4e8c-b87e-354a25167b2c',
    'f8140bd4-555e-4cb9-a4d0-7965d62e842e','eedc4f4d-bbc9-4911-8736-5eaff24995dd','7c33c3c3-874e-427f-b60d-809953b8b5ce',
    '53180a66-c342-456c-ba5b-cfecb66084d0','a06f160f-4de2-4f06-995c-de2254032970','36ac8e28-85ca-44e3-a48f-32ea91875c1d',
    '2215b354-d7aa-45fd-88b5-6e9f9eb6cfbf','0b6043c7-632c-4eba-be8d-9ebc7a9e865d','2f19e0fa-540d-4792-b78c-a6a33f398275',
    '74c13423-df1c-40f6-ac89-018477b1a280','bab90863-e0eb-4d62-abe6-53fa0936f077','4aa1e2c4-0133-466a-84c5-f91b8cade849',
    'd5ec7178-c89c-4a67-b551-e6573293f606','be406e9d-ed28-41d3-afc5-9beb80a9fa6c','c00e1dff-42eb-4a8d-b1ca-821b77c31887',
    '24f0899f-69a9-44af-b933-034bc6c2c509','bd2025a1-f5f6-42bc-aa72-98589009c9fa','73ced6be-0cc7-4960-9d48-d5e7a34eabb2',
    '2e8c7a24-7626-4e2f-ad72-4d7b33d0ab7c','0b7a730a-cae4-4fdf-8f10-6aa8bc5d00a6'
  ]::uuid[],
  'GMF julio 2026',
  '2026-07-30'::date
);
