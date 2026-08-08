-- TEST con ROLLBACK — split de IVA asumido en postear_costo_dian.
-- Postea la FE de Reciservicios 2026-07-09 ($154.462, iva $24.662) a descargue (61450535)
-- y captura las 3 líneas del asiento; RAISE para revertir TODO (nada queda en firme, la FE
-- sigue sin postear). Esperado: DB 61450535 base $129.800 + DB 53152010 IVA $24.662 /
-- CR 220501 total $154.462, tercero Reciservicios. Pegar en Supabase SQL Editor.
do $$
declare
  v_fe    uuid := 'e54fe37d-e69a-43d5-956c-641e405b22fb';  -- Reciservicios 2026-07-09 · $154.462
  v_entry uuid;
  v_res   text;
begin
  v_entry := postear_costo_dian(v_fe, '61450535', '220501');
  select string_agg(
           l.cuenta_puc || '  tercero=' || coalesce(l.tercero_nombre_snapshot, '—')
           || '  cc=' || coalesce(l.centro_costo, '—')
           || '  D=' || l.debito || '  C=' || l.credito,
           E'\n  ' order by l.debito desc, l.credito desc)
    into v_res
    from journal_entry_lines l
   where l.journal_entry_id = v_entry;
  raise exception E'TEST split IVA (revertido):\n  %', v_res;
end $$;
