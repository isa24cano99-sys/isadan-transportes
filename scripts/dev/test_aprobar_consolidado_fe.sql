-- TEST con ROLLBACK — ruta con FE INLINE en el asiento consolidado.
-- 2 líneas acpm enlazadas a FE Distracom. Esperado: UN CG con, por cada FE, DB 61450510·Distracom
-- (base) + DB 53152010·Distracom (IVA proporcional), y UN crédito 13301510·conductor por el total.
-- postear_costo_dian NO se llama (crédito NO va a 220501). RAISE revierte todo.
do $$
declare
  v_leg uuid; v_trip uuid; v_driver uuid; v_veh uuid; v_date date := date '2026-07-15';
  v_fe1 uuid := '89c1d159-594c-4920-a229-d67c31ae3c3f';  -- Distracom $710.653
  v_fe2 uuid := '45f33d3f-c40c-4591-b741-5a519241751e';  -- Distracom $990.000
  v_ret jsonb; v_res text;
begin
  select id, driver_id, vehicle_id into v_trip, v_driver, v_veh from trips where trip_number='VJ-0045';
  insert into legalizations(trip_id,driver_id,vehicle_id,date,advance_amount,total_expenses,status)
    values(v_trip,v_driver,v_veh,v_date,0,1700653,'BORRADOR') returning id into v_leg;
  insert into legalization_expenses(legalization_id,expense_type,date,amount,matched_invoice_id) values
    (v_leg,'acpm_contado',v_date,710653,v_fe1),
    (v_leg,'acpm_contado',v_date,990000,v_fe2);

  v_ret := aprobar_legalizacion(v_leg);

  select 'CG-'||e.consecutivo||E'\n  '||string_agg(l.cuenta_puc||' t='||coalesce(l.tercero_nombre_snapshot,'—')
           ||' cc='||coalesce(l.centro_costo,'—')||' D='||l.debito||' C='||l.credito, E'\n  ' order by l.credito, l.debito desc)
    into v_res from journal_entries e join journal_entry_lines l on l.journal_entry_id=e.id
    where e.origen_tabla='legalizations' and e.origen_id=v_leg and e.estado='CONTABILIZADO' group by e.id,e.consecutivo;
  raise exception E'TEST FE inline → %:\n  %', v_ret, v_res;
end $$;
