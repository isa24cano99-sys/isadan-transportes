-- ============================================================================
-- Backfill de naturaleza faltante en puc_accounts (39 cuentas con NULL).
--   Sin naturaleza, saldoNaturaleza() (src/lib/contabilidad-saldos.ts) cae al ELSE
--   y trata la cuenta como de CRÉDITO → los gastos clase 5/6 saldrían con el signo
--   invertido en el balance de comprobación y el estado de resultados. Prerequisito
--   antes de postear cualquier gasto por el mecanismo de gasto bancario directo.
--   Regla PUC estándar: clase 1/5/6/7 = DÉBITO, clase 4 = CRÉDITO. Verificado que
--   ninguna clase 1 NULL es contra-activo (no hay depreciación/provisión/deterioro:
--   son Moneda nacional, anticipos, retenciones en la fuente por cobrar, préstamos).
--   Idempotente: solo toca filas con naturaleza NULL. Aplicar en SQL Editor.
-- ============================================================================
update puc_accounts set naturaleza = 'DEBITO'
 where naturaleza is null and left(codigo,1) in ('1','5','6','7');

update puc_accounts set naturaleza = 'CREDITO'
 where naturaleza is null and left(codigo,1) in ('2','3','4');
