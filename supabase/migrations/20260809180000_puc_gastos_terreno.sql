-- ============================================================================
-- Cuenta 529775 "Gastos terreno" — nueva en la familia de gastos personales 5297xx
-- (no venía en el histórico de Dataico; el trabajo del terreno —retroexcavadora,
-- semillas, transporte de material— estaba lumpeado en el catch-all 52959510).
-- Naturaleza DÉBITO, GASTO_PERSONAL_PROPIETARIO, exige_tercero=true (como la familia).
-- Idempotente. Aplicar en SQL Editor.
--
-- Con esta cuenta, se reclasificaron las 24 líneas de 52959510 ($15.496.387) — solo
-- cambio de cuenta_puc, sin re-postear (excepción sancionada, periodo abierto):
--   · 16 "Gastos terreno" → 529775 ($14.529.688)
--   · 7 "Invitaciones a almorzar" + 1 hogar/muebles → 529799 ($966.699)
-- Ver scripts/dev/firme_reclasificar_52959510.sql. Cuadre global intacto.
-- ============================================================================
insert into puc_accounts (codigo, nombre, tipo, naturaleza, exige_tercero, exige_centro_costo, concepto_exogena, active) values
  ('529775','Gastos terreno','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true)
on conflict (codigo) do nothing;
