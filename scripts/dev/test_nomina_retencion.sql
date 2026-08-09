-- TEST con ROLLBACK — postear_nomina_mensual corregida (retención empleado/patronal).
-- Ejemplo real: Sueldo (IBC) = 1.750.905, Auxilio = 249.095 (los demás conceptos en 0 para
-- aislar las líneas corregidas; provisiones/ARL/caja no cambian su lógica). Debe dar EXACTO:
--   250505 = 1.859.928 · 23700510 = 70.036 · 23803010 = 280.145 · 52057010 = 210.109
--   y NINGUNA línea 52056910. RAISE al final → rollback (no deja asiento).
-- Requiere la migración 20260808200000 ya aplicada.

do $$
declare
  v_cond uuid; v_entry uuid; v_res text; v_deb numeric; v_cre numeric; v_52056910 numeric;
begin
  select tercero_id into v_cond from drivers where tercero_id is not null limit 1;
  if v_cond is null then raise exception 'No hay conductor con tercero_id para la prueba'; end if;

  v_entry := postear_nomina_mensual(
    p_conductor := v_cond,
    p_periodo   := date '2026-07-31',
    p_sueldo    := 1750905,
    p_auxilio   := 249095
  );

  -- Forzar la validación del trigger de cuadre (DEFERRABLE) antes del rollback
  set constraints all immediate;

  select string_agg(l.cuenta_puc||'  D='||to_char(l.debito,'FM999G999G990')||'  C='||to_char(l.credito,'FM999G999G990'),
                    E'\n    ' order by l.cuenta_puc, l.debito desc),
         sum(l.debito), sum(l.credito),
         coalesce(sum(l.debito) filter (where l.cuenta_puc='52056910'),0)
    into v_res, v_deb, v_cre, v_52056910
    from journal_entry_lines l where l.journal_entry_id = v_entry;

  raise exception E'ASIENTO CN (rollback) — Sueldo 1.750.905 / Auxilio 249.095:\n    %\n  ΣDB=% ΣCR=%  ·  gasto 52056910 (debe ser 0) = %',
    v_res, to_char(v_deb,'FM999G999G990'), to_char(v_cre,'FM999G999G990'), v_52056910;
end $$;
