-- ════════════════════════════════════════════════════════════════════════════
-- FASE 1 · PASO 2 — Seed del catálogo PUC extendido
--   Puebla naturaleza / exige_tercero / exige_centro_costo / concepto_exogena.
--   Solo DATOS: UPDATE de cuentas existentes + INSERT de 4 cuentas nuevas aprobadas.
--   Ningún ALTER estructural.
--
-- REMAPEOS aprobados (el plan de Dataico usa otros códigos que tu lista original):
--   1110→11100510 · 2505→250505 · 2805→28050510 · 4145→41450510 · 2495→241215
--   2335→220501 (genérico "costos y gastos por pagar" para la conciliación de FE; hoy
--                ningún evento lo usa, no bloquea nada)
--   2610 (consolidado) → 4 cuentas reales de Dataico: 251015 / 251510 / 252010 / 252510
--
-- DIFERIDO / ANOTADO PARA EL CONTADOR (no se toca aquí):
--   · SIMPLE gasto (54xxxx): no existe cuenta de gasto y la Fase 4 no arranca → el evento 9
--     queda diferido; su función de posting debe fallar con mensaje claro.
--   · Peajes 61450575: se configura, pero el proveedor (F2X) no está resuelto → la función
--     del evento 7 debe fallar con mensaje claro, sin usar un tercero genérico.
--   · 310515 (Dataico, "Capital suscrito por cobrar" mal usada, -$10.000.000): NO está en
--     puc_accounts de la app; el capital de la app se lleva en 310505 (nueva). Reconciliación
--     patrimonio app↔Dataico: pendiente contador.
--   · Socios: se mantienen como gasto (529710 / 529745), pendiente contador. 1355 no se crea.
--   · 52054810 (vacía) y 52059510 (patrón seguridad social Daniel/Jhon sin tercero): NULL.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Bancos y cuentas de control ──────────────────────────────────────────────
update puc_accounts set naturaleza='DEBITO',  exige_tercero=false, exige_centro_costo=false                          where codigo='11100510'; -- Bancos (tu 1110)
update puc_accounts set naturaleza='DEBITO',  exige_tercero=true,  exige_centro_costo=true,  concepto_exogena='2276' where codigo='13301510'; -- Anticipo a trabajadores
update puc_accounts set naturaleza='CREDITO', exige_tercero=true,  exige_centro_costo=false, concepto_exogena='1001' where codigo='28050510'; -- Anticipo clientes (tu 2805)
update puc_accounts set naturaleza='CREDITO', exige_tercero=true,  exige_centro_costo=false, concepto_exogena='1001' where codigo='41450510'; -- Ingresos transporte (tu 4145)
update puc_accounts set naturaleza='CREDITO', exige_tercero=false, exige_centro_costo=false                          where codigo='241215';   -- SIMPLE por pagar (tu 2495; el nombre dice "anticipo", anotar contador)
update puc_accounts set naturaleza='CREDITO', exige_tercero=true,  exige_centro_costo=false, concepto_exogena='1001' where codigo='220501';   -- Proveedores nacionales (tu 2335; genérico C&G x pagar, FE)

-- ── Nómina — DÉBITO, grupo 5 (SE QUEDA en 52xxx, NO se reclasifica) ──────────
--    Devengado + aportes patronales (ARP/EPS/pensión/caja). El tercero es el conductor.
update puc_accounts set naturaleza='DEBITO', exige_tercero=true, exige_centro_costo=false, concepto_exogena='2276'
 where codigo in ('52050610','52052710','52053010','52053310','52053610','52053910',
                  '52056810','52056910','52057010','52057210');

-- ── Nómina — CRÉDITO (salarios + prestaciones por pagar, cuentas reales de Dataico) ─
update puc_accounts set naturaleza='CREDITO', exige_tercero=true, exige_centro_costo=false, concepto_exogena='2276'
 where codigo in ('250505',                                -- Salarios por pagar (tu 2505)
                  '251015','251510','252010','252510');    -- Cesantías/Intereses/Prima/Vacaciones (tu 2610 desagregado)

-- ── Aportes patronales POR PAGAR (tercero = EPS/ARL/Caja/Fondo real, no el conductor) ─
update puc_accounts set naturaleza='CREDITO', exige_tercero=true, exige_centro_costo=false
 where codigo in ('23700510','23700610','23701010','23803010');

-- ── Costos de operación grupo 61 — las 17 cuentas 61450xxx ──────────────────
--    Todas: DEBITO · tercero=sí · centro_costo=sí (placa) · concepto=1001.
--    Incluye 61450550 (Porcentaje), 61450580 (Comisión empresa) y 61450575 (Peajes).
--    RECORDATORIO 61450575: F2X sin resolver → el posting del evento 7 debe fallar claro.
update puc_accounts set naturaleza='DEBITO', exige_tercero=true, exige_centro_costo=true, concepto_exogena='1001'
 where codigo like '61450%';

-- ── Cuentas NUEVAS (aprobadas; verificadas LIBRES antes de escribir esto) ────
--    Sin ON CONFLICT a propósito: si algún código estuviera ocupado, el UNIQUE del PASO 1
--    lo atrapa con error visible (no debe pasar en silencio). Es un seed de una sola vez.
insert into puc_accounts
  (id, codigo, nombre, tipo, active, naturaleza, exige_tercero, exige_centro_costo, concepto_exogena)
values
  (gen_random_uuid(), '13050501', 'Cartera facturada',           'ACTIVO', true, 'DEBITO',  true, false, '1001'),
  (gen_random_uuid(), '13050502', 'CxC por facturar',            'ACTIVO', true, 'DEBITO',  true, false, '1001'),
  (gen_random_uuid(), '23809510', 'Acreedores varios - Flypass', 'PASIVO', true, 'CREDITO', true, false, '1001');

-- ── 310505 Capital Suscrito y Pagado — DIFERIDA ──────────────────────────────
-- Verificado: `puc_accounts_tipo_check` RECHAZA tipo='PATRIMONIO' (no está en el set
-- permitido). Crearla exige extender ese CHECK (ALTER estructural, fuera del alcance de
-- este paso) o usar un tipo stopgap ('PASIVO'). El evento 10 (apertura) está diferido a
-- PASO 4, así que la cuenta de capital se resuelve ahí. Pendiente decisión.
