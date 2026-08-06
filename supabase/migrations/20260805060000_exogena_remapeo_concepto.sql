-- FASE 5 · Exógena — remapeo de concepto_exogena en el plan de cuentas.
--
-- Contexto: el concepto_exogena estaba sobre-aplicado. Se usaba 1001 (pagos a terceros)
-- en cuentas que NO son pagos que hace la empresa, y 2276 (rentas de trabajo) en una
-- cuenta de balance. El reporte de consulta de exógena lee el concepto EN VIVO desde
-- puc_accounts, así que corregir aquí corrige el reporte para pasado y futuro sin tocar
-- líneas contabilizadas (respeta inmutabilidad — el snapshot de la línea queda como
-- registro histórico, pero el reporte usa el concepto de la cuenta).
--
-- Criterio: concepto_exogena solo tiene sentido donde el detalle por tercero, línea por
-- línea, importa para el reporte (pagos y rentas de trabajo). Las cuentas cuyo SALDO
-- agregado ya lo dice todo (ingresos, cartera, anticipos) van a NULL — esa información
-- ya está disponible en el Balance de Comprobación y el Libro Mayor.
--
-- NOTA: ya aplicado vía PostgREST durante la sesión; esta migración lo deja reproducible.
-- Es idempotente.

-- 1) A NULL — no son "pagos a terceros". Son ingresos / saldos de balance cuyo dato
--    agregado ya vive en balance/mayor:
--      41450510  Servicio de transporte   → es INGRESO (lo que nos pagan), no un pago
--      13050501  Cartera facturada         → cuenta por cobrar (activo)
--      13050502  CxC por facturar          → cuenta por cobrar (activo)
--      28050510  Anticipo de clientes      → anticipo recibido (pasivo)
--      13301510  Anticipo a trabajadores   → préstamo al conductor (activo). Dejarlo en
--                2276 duplicaba, por el lado contrario de cada porcentaje (CR 13301510),
--                la misma plata ya contada como costo real en 61450550.
update puc_accounts set concepto_exogena = null
 where codigo in ('41450510', '13050501', '13050502', '28050510', '13301510');

-- 2) Fix: 61450550 Porcentaje conductor → 2276. Es renta de trabajo del conductor (el
--    costo real reconocido a su favor), no un pago a un tercero-proveedor.
update puc_accounts set concepto_exogena = '2276'
 where codigo = '61450550';

-- Queda, tras el remapeo:
--   1001 (Pagos):            220501, 61450510, 61450575, 61450580 (comisión — su tercero
--                            es CONSUMIDOR FINAL 222222222222, tratamiento correcto de
--                            "cuantías menores" de la DIAN para receptor no identificado).
--   2276 (Rentas trabajo):   61450550, y las prestaciones 251015/251510/252010/252510.
--                            La nómina 52xxxx entrará a 2276 cuando se capture.
