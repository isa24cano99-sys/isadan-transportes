-- TEST con ROLLBACK — dos líneas de ACPM del mismo viaje, cada una con su propia FE.
-- Crea una legalización de prueba con VJ-0045 (conductor/placa reales) + 2 líneas acpm_contado,
-- una enlazada a Distracom $710.653 y otra a Distracom $990.000; aprueba (aprobar_legalizacion
-- postea cada una vía postear_costo_dian contra el proveedor real) y RAISE para revertir TODO
-- (legalización, líneas y asientos). Nada queda en firme.
do $$
declare
  v_leg uuid; v_trip uuid; v_driver uuid; v_veh uuid; v_date date := date '2026-07-15';
  v_fe1 uuid := '89c1d159-594c-4920-a229-d67c31ae3c3f';  -- Distracom $710.653
  v_fe2 uuid := '45f33d3f-c40c-4591-b741-5a519241751e';  -- Distracom $990.000
  v_ret jsonb; v_res text;
begin
  select id, driver_id, vehicle_id into v_trip, v_driver, v_veh from trips where trip_number = 'VJ-0045';
  insert into legalizations(trip_id, driver_id, vehicle_id, date, advance_amount, total_expenses, status)
    values (v_trip, v_driver, v_veh, v_date, 0, 1700653, 'BORRADOR') returning id into v_leg;
  insert into legalization_expenses(legalization_id, expense_type, date, amount, matched_invoice_id)
    values (v_leg, 'acpm_contado', v_date, 710653, v_fe1),
           (v_leg, 'acpm_contado', v_date, 990000, v_fe2);

  v_ret := aprobar_legalizacion(v_leg);

  select string_agg(x.txt, E'\n  ' order by x.consec) into v_res from (
    select e.consecutivo as consec,
      'CG-' || e.consecutivo || '  ' || e.descripcion || E'\n     ' ||
      string_agg(l.cuenta_puc || ' t=' || coalesce(l.tercero_nombre_snapshot,'—')
                 || ' cc=' || coalesce(l.centro_costo,'—') || ' D=' || l.debito || ' C=' || l.credito,
                 E'\n     ' order by l.debito desc) as txt
    from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
    where e.origen_tabla = 'dian_invoices_import' and e.origen_id in (v_fe1, v_fe2) and e.estado = 'CONTABILIZADO'
    group by e.id, e.consecutivo, e.descripcion
  ) x;
  raise exception E'TEST 2 ACPM (2 FE) → %:\n  %', v_ret, v_res;
end $$;
