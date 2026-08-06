-- FASE 5 · Exógena — remapeo de concepto_exogena en el plan de cuentas.
--
-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ REGLA GENERAL (verificar contra CUALQUIER cuenta nueva del catálogo)          ║
-- ╠══════════════════════════════════════════════════════════════════════════════╣
-- ║ concepto_exogena solo vive en la cuenta de RESULTADO (gasto/costo) que         ║
-- ║ reconoce el hecho económico real a favor de un tercero.                        ║
-- ║                                                                                ║
-- ║ Toda cuenta de BALANCE (activo/pasivo) que sea el espejo de partida doble de   ║
-- ║ esa misma transacción — mismo tercero, mismo monto — debe quedar en NULL: su   ║
-- ║ saldo ya está disponible en el Balance de Comprobación y el Libro Mayor, y     ║
-- ║ dejarla con concepto DUPLICARÍA el hecho económico en el universo de exógena.  ║
-- ║                                                                                ║
-- ║ Se aplicó tras un barrido completo del catálogo. Cuatro veces apareció el      ║
-- ║ mismo patrón: 13301510, 220501, y el bloque de pasivos laborales (250505 +     ║
-- ║ 251xxx/252xxx). El día que se agregue una cuenta nueva (p.ej. si se activan    ║
-- ║ aportes patronales como concepto propio), verificar este criterio ANTES de     ║
-- ║ asignarle concepto_exogena.                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- El reporte de consulta de exógena (/contabilidad/exogena-consulta) lee el concepto
-- EN VIVO desde puc_accounts, así que corregir aquí corrige el reporte para pasado y
-- futuro sin tocar líneas contabilizadas (respeta inmutabilidad — el snapshot de la
-- línea queda como registro histórico, pero el reporte usa el concepto de la cuenta).
--
-- NOTA: ya aplicado vía PostgREST durante la sesión; esta migración lo deja reproducible.
-- Es idempotente.

-- ── A NULL — cuentas de BALANCE que son el espejo de una cuenta de resultado ──────
--   Ingresos / cuentas por cobrar / anticipos (su saldo agregado ya lo dice todo):
--     41450510  Servicio de transporte    → es INGRESO (lo que nos pagan), no un pago
--     13050501  Cartera facturada          → cuenta por cobrar (activo)
--     13050502  CxC por facturar           → cuenta por cobrar (activo)
--     28050510  Anticipo de clientes        → anticipo recibido (pasivo)
--   Cuentas puente del ciclo del conductor / proveedor (duplican el costo real):
--     13301510  Anticipo a trabajadores    → préstamo al conductor. Duplicaba, por el
--               CR de cada porcentaje, la plata ya contada en 61450550.
--     220501    Proveedores nacionales     → pasivo espejo de los costos 6145xx. Su DB
--               (pagos que liquidan el pasivo) duplicaba el costo ya contado (ej. F2X:
--               peaje $11.57M en 61450575 + pagos $10.36M en 220501 = doble).
--     23809510  Acreedores varios - Flypass → pasivo espejo del costo de peaje/Flypass.
--   Pasivos laborales — espejo de los gastos de nómina 52xxxx (mismo tercero=conductor,
--   mismo monto; la nómina postea DB gasto + CR pasivo). La renta de trabajo se reporta
--   vía el GASTO (52xxxx), no vía el pasivo:
--     250505    Salarios por pagar         → espejo de 52050610 / 52052710
--     251015    Cesantías consolidadas      → espejo de 52053010
--     251510    Intereses sobre cesantías   → espejo de 52053310
--     252010    Prima de servicios          → espejo de 52053610
--     252510    Vacaciones consolidadas     → espejo de 52053910
update puc_accounts set concepto_exogena = null
 where codigo in (
   '41450510', '13050501', '13050502', '28050510',
   '13301510', '220501', '23809510',
   '250505', '251015', '251510', '252010', '252510'
 );

-- ── Fix: 61450550 Porcentaje conductor → 2276 ─────────────────────────────────────
-- Es renta de trabajo del conductor (el costo real reconocido a su favor), no un pago
-- a un tercero-proveedor.
update puc_accounts set concepto_exogena = '2276'
 where codigo = '61450550';

-- ── Estado final del mapeo (solo cuentas de RESULTADO) ────────────────────────────
--   1001 (Pagos):          6145xx (todos los costos de operación: combustible, peajes,
--                          cargue/descargue, repuestos, comisión empresa, etc.).
--                          61450580 comisión — su tercero es CONSUMIDOR FINAL
--                          (222222222222), tratamiento correcto de "cuantías menores"
--                          de la DIAN para un receptor no identificado.
--   2276 (Rentas trabajo): 61450550 porcentaje + gastos de nómina 52xxxx (sueldos,
--                          auxilio, prestaciones, aportes).
--
-- PENDIENTE PARA EL CONTADOR (no es patrón de duplicación — es clasificación fiscal):
--   Los aportes patronales (52056810/910 EPS/ARP, 52057010/210 pensión/caja) están hoy
--   en 2276 con tercero=conductor. Si el aporte patronal pertenece a 2276 (componente
--   del trabajador) o a 1001 (pago a la entidad EPS/fondo) es criterio de la DIAN, no
--   verificable con datos. Su pasivo (237xxx) ya está en NULL — no hay doble conteo.
