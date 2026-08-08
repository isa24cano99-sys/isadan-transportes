-- TEST con ROLLBACK — aprobar_legalizacion contra VJ-0045 (julio, 7 tipos de gasto).
-- Postea TODOS los costos de la legalización (porcentaje, comisión, acpm/cargue/descargue
-- sin FE → Consumidor Final, lavada, carrozada) en una transacción, captura los asientos
-- y RAISE para revertir TODO. Nada queda en firme.
-- Verifica de paso que lavada va a 61450555 (no 61450550/Porcentaje) — cuenta corregida.
do $$
declare
  v_leg uuid := '685b5a37-6acc-4b84-b143-0f49dade167a';  -- VJ-0045
  v_res jsonb; v_lines text;
begin
  v_res := aprobar_legalizacion(v_leg);
  select string_agg(x.txt, E'\n  ' order by x.consec) into v_lines from (
    select e.consecutivo as consec,
      'CG-' || e.consecutivo || '  ' || e.descripcion || E'\n     ' ||
      string_agg(
        l.cuenta_puc || ' t=' || coalesce(l.tercero_nombre_snapshot,'—')
        || ' cc=' || coalesce(l.centro_costo,'—')
        || ' D=' || l.debito || ' C=' || l.credito,
        E'\n     ' order by l.debito desc) as txt
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
    where e.tipo_comprobante = 'CG' and e.estado = 'CONTABILIZADO'
      and ( (e.origen_tabla = 'legalizations' and e.origen_id = v_leg)
         or (e.origen_tabla = 'legalization_expenses'
             and e.origen_id in (select id from legalization_expenses where legalization_id = v_leg)) )
    group by e.id, e.consecutivo, e.descripcion
  ) x;
  raise exception E'TEST aprobar VJ-0045 → %:\n  %', v_res, v_lines;
end $$;
