-- ============================================================================
-- Cuentas del catálogo real de Dataico (histórico feb-jun 2026) que faltaban en
-- puc_accounts. 22 cuentas SIN asientos previos → creación limpia, sin riesgo.
--   · Gastos personales del propietario 5297xx (14) — GASTO_PERSONAL_PROPIETARIO
--   · Costos operativos 6145xx (4) — COSTO_OPERACIONAL, concepto_exogena 1001
--   · Otros gastos admin (2), financiero (1), impuesto ICA (1)
-- Todas naturaleza DÉBITO, exige_tercero=true (Consumidor Final satisface), como la familia.
-- + Alineación de 11 nombres al histórico (cosmético). Idempotente. Aplicar en SQL Editor.
-- NO se crean las 4 cuentas de balance (130505, 24121510, 310515, 52454010): 2 son
-- duplicados de cuentas existentes (13050501/502 cartera; 241215 SIMPLE), 310515 a
-- confirmar, 52454010 ambigua (pendiente de aclarar contra la fuente Dataico).
-- ============================================================================
insert into puc_accounts (codigo, nombre, tipo, naturaleza, exige_tercero, exige_centro_costo, concepto_exogena, active) values
  ('529710','Creditos','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529715','Helados','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529720','Mercados','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529725','Telefonia','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529730','Ropa','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529735','Medicos','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529740','Manutencion doña rosa','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529745','Sobregiros','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529750','Seguridad social','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529755','Cuota poliza','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529760','Comisión','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529765','Cuota vehiculo','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529770','Seguros de vida','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('529799','Otros gastos','GASTO_PERSONAL_PROPIETARIO','DEBITO',true,false,null,true),
  ('61450501','Alimentacion','COSTO_OPERACIONAL','DEBITO',true,false,'1001',true),
  ('61450502','Bascula','COSTO_OPERACIONAL','DEBITO',true,false,'1001',true),
  ('61450503','Carpada y Desencarpada','COSTO_OPERACIONAL','DEBITO',true,false,'1001',true),
  ('61450505','Alojamiento','COSTO_OPERACIONAL','DEBITO',true,false,'1001',true),
  ('513595','Otros','GASTO_ADMIN','DEBITO',true,false,null,true),
  ('523095','Otros','GASTO_ADMIN','DEBITO',true,false,null,true),
  ('53959510','Intereses por mora','GASTO_FINANCIERO','DEBITO',true,false,null,true),
  ('54050510','Impuestos ICA','IMPUESTO','DEBITO',true,false,null,true)
on conflict (codigo) do nothing;

-- Alineación de 11 nombres al histórico de Dataico (misma cuenta, etiqueta consistente)
update puc_accounts set nombre = 'Aportes a entidades promotoras de salud, EPS'       where codigo = '23700510';
update puc_accounts set nombre = 'Aportes a administradoras de riesgos profesionales, ARP' where codigo = '23700610';
update puc_accounts set nombre = 'Aportes al ICBF, SENA y cajas de compensación'       where codigo = '23701010';
update puc_accounts set nombre = 'Aportes a administradoras de riesgos profesionales, ARP' where codigo = '52056810';
update puc_accounts set nombre = 'Aportes a fondos de pensiones y/o cesantías'         where codigo = '52057010';
update puc_accounts set nombre = 'Examenes medicos'                                    where codigo = '52058410';
update puc_accounts set nombre = 'Combustibles y lubricantes'                          where codigo = '52953510';
update puc_accounts set nombre = 'GMF IMPTO GOBIERNO 4X1000'                           where codigo = '53050510';
update puc_accounts set nombre = 'Otros servicios'                                     where codigo = '61450525';
update puc_accounts set nombre = 'Repuestos y mantenimiento de vehículo'               where codigo = '61450530';
update puc_accounts set nombre = 'Comision empresa'                                    where codigo = '61450580';
