-- TEST con ROLLBACK — fix del tercero en las 3 líneas de gasto patronal.
-- Requiere la migración 20260808220000 aplicada. RAISE al final → rollback (no deja asiento).
-- Verifica: 52057010/52056810/52057210 (gasto patronal) llevan la ENTIDAD (fondo/ARL/caja),
-- y sueldo/auxilio/provisiones llevan el CONDUCTOR.
do $$
declare v_cond uuid; v_entry uuid; v_res text;
begin
  select tercero_id into v_cond from drivers where tercero_id is not null limit 1;
  v_entry := postear_nomina_mensual(
    p_conductor := v_cond, p_periodo := date '2026-08-31',  -- periodo limpio (julio ya tiene CN sin reversar)
    p_sueldo := 1750905, p_auxilio := 249095,
    p_cesantias := 166600, p_intereses_cesantias := 19992,
    p_prima := 166600, p_vacaciones := 73013,
    p_aporte_arp := 76164, p_aporte_caja := 70036);
  set constraints all immediate;
  select string_agg(
           l.cuenta_puc||' '||(case when l.debito>0 then 'DB' else 'CR' end)||'  ter='||coalesce(l.tercero_nombre_snapshot,'—'),
           E'\n    ' order by l.cuenta_puc, l.debito desc)
    into v_res
    from journal_entry_lines l where l.journal_entry_id = v_entry
     and l.cuenta_puc in ('52057010','52056810','52057210','52050610','52052710','23803010','23700610','23701010');
  raise exception E'TERCEROS del CN (rollback):\n    %\n  → 5205701x/5205681x/5205721x (gasto patronal) deben decir la ENTIDAD, no el conductor',
    v_res;
end $$;
