-- ════════════════════════════════════════════════════════════════════════════
-- HARNESS TEMPORAL — Fase 4 · pieza 2 (cierre): prueba postear_cierre_periodo
-- con ROLLBACK. NO deja nada en el libro (RAISE al final → rollback de todo,
-- incluido el CC y el marcado CERRADO). Solo reporta la verificación.
--   1) Aplica la migración 20260805050000 (la función).
--   2) Aplica este archivo (crea _test_cierre_periodo).
--   3) Corre  select _test_cierre_periodo();  y lee el mensaje.
--   4) Bótalo:  drop function _test_cierre_periodo();
-- ════════════════════════════════════════════════════════════════════════════
create or replace function _test_cierre_periodo() returns void language plpgsql as $$
declare
  v_id uuid; v_n int; v_d numeric; v_c numeric;
  v_3610d numeric; v_3610c numeric; v_ing numeric; v_cos numeric; v_est text;
begin
  v_id := postear_cierre_periodo(date '2026-07-01');

  select count(*), coalesce(sum(debito),0), coalesce(sum(credito),0)
    into v_n, v_d, v_c from journal_entry_lines where journal_entry_id = v_id;
  select coalesce(sum(debito),0), coalesce(sum(credito),0)
    into v_3610d, v_3610c from journal_entry_lines where journal_entry_id = v_id and cuenta_puc='3610';
  -- ingresos zanjados (clase 4 = DB en el CC) y costos (clase 5/6/7 = CR en el CC)
  select coalesce(sum(debito),0) into v_ing from journal_entry_lines
    where journal_entry_id = v_id and left(cuenta_puc,1)='4';
  select coalesce(sum(credito),0) into v_cos from journal_entry_lines
    where journal_entry_id = v_id and left(cuenta_puc,1) in ('5','6','7');
  select estado into v_est from periodos_contables where periodo='2026-07';

  raise exception E'== HARNESS CIERRE 2026-07 ==\n asiento: %\n lineas: % · DB % = CR % · cuadra=%\n ingresos zanjados (DB): %\n costos zanjados (CR): %\n 3610: DB % / CR % → neto CR %\n periodo (en tx, se revierte): %',
    v_id, v_n, v_d, v_c, (v_d = v_c), v_ing, v_cos, v_3610d, v_3610c, (v_3610c - v_3610d), v_est;
end; $$;
