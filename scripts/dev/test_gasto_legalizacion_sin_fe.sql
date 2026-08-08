-- TEST con ROLLBACK — evento de gasto de legalización sin FE (julio).
-- Postea las líneas ACPM/cargue/descargue sin matched_invoice_id de legalizaciones
-- APROBADAS de julio, captura los asientos y RAISE para revertir TODO. Nada queda en firme.
-- Esperado: ~7 asientos CG (2 acpm + 3 cargue + 2 descargue), cada uno:
--   DB 61450510/515/535  tercero=CONSUMIDOR FINAL  cc=placa
--   CR 13301510          tercero=conductor         cc=placa
-- Pegar en Supabase SQL Editor; el resultado sale en el error.
do $$
declare v_n integer; v_res text;
begin
  v_n := postear_gastos_legalizacion_sin_fe(date '2026-07-01');
  select string_agg(x.txt, E'\n  ' order by x.consec) into v_res from (
    select e.consecutivo as consec,
      'CG-' || e.consecutivo || '  ' || e.descripcion || E'\n     ' ||
      string_agg(
        l.cuenta_puc || ' t=' || coalesce(l.tercero_nombre_snapshot,'—')
        || ' cc=' || coalesce(l.centro_costo,'—')
        || ' D=' || l.debito || ' C=' || l.credito,
        E'\n     ' order by l.debito desc) as txt
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
    where e.origen_tabla = 'legalization_expenses' and e.tipo_comprobante = 'CG' and e.estado = 'CONTABILIZADO'
    group by e.id, e.consecutivo, e.descripcion
  ) x;
  raise exception E'TEST sin-FE: % asientos (revertido):\n  %', v_n, v_res;
end $$;
