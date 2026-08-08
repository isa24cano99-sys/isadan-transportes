-- TEST con ROLLBACK — ciclo "Reabrir para corregir" de una legalización aprobada.
-- Leg de prueba (VJ-0047: Jorge/SSZ922) con acpm SIN FE → aprobar (CG con Consumidor Final)
-- → reabrir_legalizacion (borra el CG, vuelve a BORRADOR) → agregar la FE que faltaba (CCC
-- LOGISTICOL, sin clasificar) → reaprobar → el CG nuevo sale con el PROVEEDOR + IVA inline.
-- RAISE revierte todo (leg, líneas, ambos asientos).
do $$
declare
  v_leg uuid; v_line uuid; v_ret jsonb; v_before text; v_after text;
  v_trip uuid := 'b7e2a545-864e-4e09-89f2-f8d3f05369d5';
  v_driver uuid := '3d0e66d3-6ccf-483e-8a35-9f65dc4e26af';
  v_veh uuid := '4c2ddad9-40c2-441b-b052-3e2fc23fe84d';
  v_fe uuid := '08767d1b-1917-44a3-bd4c-bc3618b6c34b';   -- CCC LOGISTICOL 3544 · 476.952 · IVA 76.152 · sin clasificar
begin
  insert into legalizations(trip_id,driver_id,vehicle_id,date,advance_amount,total_expenses,status)
    values(v_trip,v_driver,v_veh,date '2026-07-04',0,476952,'BORRADOR') returning id into v_leg;
  insert into legalization_expenses(legalization_id,expense_type,date,amount,matched_invoice_id)
    values(v_leg,'acpm_contado',date '2026-07-04',476952,null) returning id into v_line;
  perform aprobar_legalizacion(v_leg);
  select 'CG-'||e.consecutivo||E'\n    '||string_agg(l.cuenta_puc||' t='||coalesce(l.tercero_nombre_snapshot,'—')||' D='||l.debito||' C='||l.credito, E'\n    ' order by l.credito,l.debito desc)
    into v_before from journal_entries e join journal_entry_lines l on l.journal_entry_id=e.id
    where e.origen_tabla='legalizations' and e.origen_id=v_leg and e.estado='CONTABILIZADO' group by e.id,e.consecutivo;
  set constraints all immediate;   -- (solo en el test) flush del cuadre diferido del CG "antes" para poder ALTER TABLE en reabrir
  v_ret := reabrir_legalizacion(v_leg);
  set constraints all deferred;    -- re-diferir para el reaprobar
  update legalization_expenses set matched_invoice_id=v_fe where id=v_line;
  perform aprobar_legalizacion(v_leg);
  select 'CG-'||e.consecutivo||E'\n    '||string_agg(l.cuenta_puc||' t='||coalesce(l.tercero_nombre_snapshot,'—')||' D='||l.debito||' C='||l.credito, E'\n    ' order by l.credito,l.debito desc)
    into v_after from journal_entries e join journal_entry_lines l on l.journal_entry_id=e.id
    where e.origen_tabla='legalizations' and e.origen_id=v_leg and e.estado='CONTABILIZADO' group by e.id,e.consecutivo;
  raise exception E'CICLO reabrir→editar→reaprobar\n  ANTES (sin FE):\n    %\n  reabrir → %\n  DESPUÉS (FE CCC inline):\n    %', v_before, v_ret, v_after;
end $$;
