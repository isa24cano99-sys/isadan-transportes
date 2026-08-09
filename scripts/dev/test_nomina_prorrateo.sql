-- TEST con ROLLBACK — nómina con prorrateo (valores tal como los calcula la pantalla).
-- Requiere la función 20260808200000 aplicada. Cada bloque hace RAISE → rollback (no deja asiento).
-- Caso A: mes completo real (30 días) — debe reproducir los comprobantes de abril/mayo/junio.
-- Caso B: prorrateado sintético (20 días) — verifica el prorrateo de sueldo+auxilio y sus derivados.

-- ── CASO A · MES COMPLETO (30 días) ──────────────────────────────────────────
do $$
declare v_cond uuid; v_entry uuid; v_res text; v_db numeric; v_cr numeric; v_gastoEps numeric;
begin
  select tercero_id into v_cond from drivers where tercero_id is not null limit 1;
  v_entry := postear_nomina_mensual(
    p_conductor := v_cond, p_periodo := date '2026-07-31',
    p_sueldo := 1750905, p_auxilio := 249095,
    p_cesantias := 166600, p_intereses_cesantias := 19992,
    p_prima := 166600, p_vacaciones := 73013,
    p_aporte_arp := 76164, p_aporte_caja := 70036);
  set constraints all immediate;
  select string_agg(l.cuenta_puc||'  D='||to_char(l.debito,'FM999G999G990')||'  C='||to_char(l.credito,'FM999G999G990'), E'\n    ' order by l.cuenta_puc, l.debito desc),
         sum(l.debito), sum(l.credito), coalesce(sum(l.debito) filter (where l.cuenta_puc='52056910'),0)
    into v_res, v_db, v_cr, v_gastoEps
    from journal_entry_lines l where l.journal_entry_id = v_entry;
  raise exception E'CASO A · MES COMPLETO (30d) — Sueldo 1.750.905 / Auxilio 249.095:\n    %\n  ΣDB=% ΣCR=%  · 52056910=% (debe 0)',
    v_res, to_char(v_db,'FM999G999G990'), to_char(v_cr,'FM999G999G990'), v_gastoEps;
end $$;

-- ── CASO B · PRORRATEADO 20/30 ───────────────────────────────────────────────
do $$
declare v_cond uuid; v_entry uuid; v_res text; v_db numeric; v_cr numeric; v_gastoEps numeric;
begin
  select tercero_id into v_cond from drivers where tercero_id is not null limit 1;
  v_entry := postear_nomina_mensual(
    p_conductor := v_cond, p_periodo := date '2026-07-31',
    p_sueldo := 1167270, p_auxilio := 166063,
    p_cesantias := 111067, p_intereses_cesantias := 13328,
    p_prima := 111067, p_vacaciones := 48675,
    p_aporte_arp := 50776, p_aporte_caja := 46691);
  set constraints all immediate;
  select string_agg(l.cuenta_puc||'  D='||to_char(l.debito,'FM999G999G990')||'  C='||to_char(l.credito,'FM999G999G990'), E'\n    ' order by l.cuenta_puc, l.debito desc),
         sum(l.debito), sum(l.credito), coalesce(sum(l.debito) filter (where l.cuenta_puc='52056910'),0)
    into v_res, v_db, v_cr, v_gastoEps
    from journal_entry_lines l where l.journal_entry_id = v_entry;
  raise exception E'CASO B · PRORRATEADO 20/30 — Sueldo 1.167.270 / Auxilio 166.063:\n    %\n  ΣDB=% ΣCR=%  · 52056910=% (debe 0)',
    v_res, to_char(v_db,'FM999G999G990'), to_char(v_cr,'FM999G999G990'), v_gastoEps;
end $$;
