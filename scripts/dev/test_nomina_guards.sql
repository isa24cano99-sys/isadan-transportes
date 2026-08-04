-- ════════════════════════════════════════════════════════════════════════════
-- HARNESS TEMPORAL — Fase 2 · evento 8 (nómina): verifica los 2 guards con rollback.
-- NO es una migración. NO deja nada en el libro (la función hace RAISE al final →
-- rollback de todo). Solo reporta el resultado de las 3 pruebas en el mensaje.
--
-- Uso:
--   1) Aplica primero la migración de guards (20260804170000_contabilidad_nomina_guards.sql).
--   2) Aplica ESTE archivo (crea la función _test_nomina_guards).
--   3) Claude corre  select _test_nomina_guards();  por RPC y lee el resultado.
--   4) Bótalo:  drop function _test_nomina_guards();
-- ════════════════════════════════════════════════════════════════════════════
create or replace function _test_nomina_guards() returns void language plpgsql as $$
declare
  v_cond  uuid := '2393c4ea-a090-456b-8248-80138e25f28e';  -- Daniel Cano (tercero)
  v_fondo uuid := '20ea4552-0375-45f4-aaaf-b6550e1409ed';  -- Protección
  v_id uuid; v_n int; v_d numeric; v_c numeric;
  v_r1 text; v_r2 text; v_r3 text;
begin
  -- 1) nómina válida de julio → debe postear y cuadrar (20 líneas balanceadas)
  begin
    v_id := postear_nomina_mensual(
              v_cond, date '2026-07-31',
              1000000, 200000, 0, 0, 0, 0,          -- sueldo, auxilio, ces, int, prima, vac
              85000, 9000, 120000, 40000,           -- eps, arl, pension, caja
              null, null, null, v_fondo);           -- overrides eps/arl/caja/fondo
    select count(*), coalesce(sum(debito),0), coalesce(sum(credito),0)
      into v_n, v_d, v_c from journal_entry_lines where journal_entry_id = v_id;
    v_r1 := format('OK · %s líneas · DB %s = CR %s · cuadra=%s', v_n, v_d, v_c, (v_d = v_c));
  exception when others then v_r1 := 'FALLO INESPERADO: '||sqlerrm; end;

  -- 2) misma (conductor, mes) otra vez → anti-duplicado debe RECHAZAR
  begin
    perform postear_nomina_mensual(v_cond, date '2026-07-31', 1000000,0,0,0,0,0,0,0,0,0);
    v_r2 := 'NO rechazó (mal)';
  exception when others then v_r2 := 'rechazó → '||sqlerrm; end;

  -- 3) periodo pre-corte (junio) → pre-corte debe RECHAZAR
  begin
    perform postear_nomina_mensual(v_cond, date '2026-06-30', 1000000,0,0,0,0,0,0,0,0,0);
    v_r3 := 'NO rechazó (mal)';
  exception when others then v_r3 := 'rechazó → '||sqlerrm; end;

  -- RAISE final: reporta resultados y hace rollback de todo
  raise exception E'== HARNESS NOMINA ==\n 1) valida:    %\n 2) anti-dup:  %\n 3) pre-corte: %', v_r1, v_r2, v_r3;
end; $$;
