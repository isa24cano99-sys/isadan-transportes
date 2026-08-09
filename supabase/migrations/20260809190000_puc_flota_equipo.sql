-- ============================================================================
-- Cuenta 52454010 "Flota y equipo de transporte" (del histórico Dataico). Isabella
-- confirmó que es un GASTO (clase 5, DÉBITO): compras de vehículos que llevaban como
-- gasto, no capitalizadas. tipo GASTO_ADMIN (igual que su hermana 52304010 Seguro flota).
-- + Re-apunta la categoría "Flota y equipo" (Compras mayores vehículos, 0 transacciones)
--   que apuntaba por error a 52304010 (Seguro flota) → a su cuenta correcta 52454010.
--   "Seguros vehículos" y "Soat" se quedan en 52304010 (sí son seguro). Idempotente.
-- Aplicar en SQL Editor.
-- ============================================================================
insert into puc_accounts (codigo, nombre, tipo, naturaleza, exige_tercero, exige_centro_costo, concepto_exogena, active) values
  ('52454010','Flota y equipo de transporte','GASTO_ADMIN','DEBITO',true,false,null,true)
on conflict (codigo) do nothing;

update transaction_categories set puc_code = '52454010'
 where name = 'Flota y equipo' and puc_code = '52304010';
