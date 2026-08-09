-- TEST con ROLLBACK — postear_facturacion_viaje sobre los 3 FEIT reales de julio.
-- Requiere la migración 20260808270000 aplicada. RAISE al final → rollback (no deja asientos).
-- Espera: cada FEIT → DB 13050501 / CR 41450510 por su total, tercero=cliente, doc=folio, viaje en la glosa.
do $$
declare v_e1 uuid; v_e2 uuid; v_e3 uuid; v_res text; v_db numeric; v_cr numeric;
begin
  v_e1 := postear_facturacion_viaje('85536865-2bc5-4328-9798-9a556138c3d3');  -- FEIT17 → VJ-0006 · Antioqueña 5.558.300
  v_e2 := postear_facturacion_viaje('5fe4e832-801f-4c83-9ee2-32ac45c323ac');  -- FEIT18 → VJ-0052 · Antioqueña 5.168.000
  v_e3 := postear_facturacion_viaje('0a6b353e-a833-47ec-9a70-8287de983c65');  -- FEIT22 → VJ-0048 · Jamar 6.967.350
  set constraints all immediate;

  select string_agg('CF-'||e.consecutivo||' "'||e.descripcion||'" doc='||e.documento_soporte||E'\n    '||l.det, E'\n  ' order by e.consecutivo),
         sum(l.db), sum(l.cr)
    into v_res, v_db, v_cr
  from journal_entries e
  join lateral (
     select string_agg(x.cuenta_puc||' '||coalesce(x.tercero_nombre_snapshot,'—')||' D='||to_char(x.debito,'FM999G999G990')||' C='||to_char(x.credito,'FM999G999G990'), '  ·  ' order by x.debito desc) det,
            sum(x.debito) db, sum(x.credito) cr
       from journal_entry_lines x where x.journal_entry_id = e.id
  ) l on true
  where e.id in (v_e1, v_e2, v_e3);

  raise exception E'FACTURACIÓN (rollback) — 3 FEIT:\n  %\n  Σ ingreso reconocido = % (DB=CR)  ·  esperado 17.693.650',
    v_res, to_char(v_db,'FM999G999G990');
end $$;
