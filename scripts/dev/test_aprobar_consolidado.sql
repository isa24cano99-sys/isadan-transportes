-- TEST con ROLLBACK — asiento CONSOLIDADO de legalización.
-- Crea una legalización de prueba fresca (VJ-0045: Daniel / TSV130) con 5 conceptos:
-- porcentaje, comisión, acpm sin FE, lavada, parqueo. aprobar_legalizacion debe generar
-- UN solo CG con 5 líneas de débito (cada una su cuenta+tercero) + 1 línea de crédito
-- 13301510 conductor por el total. RAISE revierte todo (leg, líneas, asiento).
do $$
declare
  v_leg uuid; v_trip uuid; v_driver uuid; v_veh uuid; v_date date := date '2026-07-03';
  v_ret jsonb; v_res text;
begin
  select id, driver_id, vehicle_id into v_trip, v_driver, v_veh from trips where trip_number='VJ-0045';
  insert into legalizations(trip_id,driver_id,vehicle_id,date,advance_amount,total_expenses,status)
    values(v_trip,v_driver,v_veh,v_date,0,2602000,'BORRADOR') returning id into v_leg;
  insert into legalization_expenses(legalization_id,expense_type,date,amount,matched_invoice_id) values
    (v_leg,'porcentaje',      v_date, 520000, null),
    (v_leg,'comision_empresa',v_date, 100000, null),
    (v_leg,'acpm_contado',    v_date,1700000, null),
    (v_leg,'lavada',          v_date,  50000, null),
    (v_leg,'parqueos',        v_date, 232000, null);

  v_ret := aprobar_legalizacion(v_leg);

  select 'CG-'||e.consecutivo||'  '||e.descripcion||E'\n  '||
    string_agg(l.cuenta_puc||' t='||coalesce(l.tercero_nombre_snapshot,'—')||' cc='||coalesce(l.centro_costo,'—')
               ||' D='||l.debito||' C='||l.credito, E'\n  ' order by l.credito, l.debito desc)
    into v_res
    from journal_entries e join journal_entry_lines l on l.journal_entry_id=e.id
   where e.origen_tabla='legalizations' and e.origen_id=v_leg and e.tipo_comprobante='CG' and e.estado='CONTABILIZADO'
   group by e.id, e.consecutivo, e.descripcion;
  raise exception E'TEST consolidado → %:\n  %', v_ret, v_res;
end $$;
