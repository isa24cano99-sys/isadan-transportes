-- TEST con ROLLBACK — guard monto-línea vs total-FE (±1 peso) en aprobar_legalizacion.
-- Caso 1: línea 526.952 enlazada a FE CCC 476.952 (50k extra mezclado) → debe RECHAZAR.
-- Caso 2: línea 476.952 = FE CCC 476.952 (coincide) → debe PASAR (CG con proveedor + IVA).
-- Ambos revierten (RAISE). trip VJ-0047 (Jorge/SSZ922); FE CCC LOGISTICOL 3544 (08767d1b).

-- CASO 1 — desajuste → rechaza
do $$
declare v_leg uuid;
begin
  insert into legalizations(trip_id,driver_id,vehicle_id,date,advance_amount,total_expenses,status)
    values('b7e2a545-864e-4e09-89f2-f8d3f05369d5','3d0e66d3-6ccf-483e-8a35-9f65dc4e26af','4c2ddad9-40c2-441b-b052-3e2fc23fe84d',date '2026-07-04',0,526952,'BORRADOR') returning id into v_leg;
  insert into legalization_expenses(legalization_id,expense_type,date,amount,matched_invoice_id)
    values(v_leg,'descargue',date '2026-07-04',526952,'08767d1b-1917-44a3-bd4c-bc3618b6c34b');
  perform aprobar_legalizacion(v_leg);
  raise exception 'NO deberia llegar aqui (el guard debio rechazar)';
end $$;

-- CASO 2 — coincide → pasa
do $$
declare v_leg uuid; v_ret jsonb; v_res text;
begin
  insert into legalizations(trip_id,driver_id,vehicle_id,date,advance_amount,total_expenses,status)
    values('b7e2a545-864e-4e09-89f2-f8d3f05369d5','3d0e66d3-6ccf-483e-8a35-9f65dc4e26af','4c2ddad9-40c2-441b-b052-3e2fc23fe84d',date '2026-07-04',0,476952,'BORRADOR') returning id into v_leg;
  insert into legalization_expenses(legalization_id,expense_type,date,amount,matched_invoice_id)
    values(v_leg,'descargue',date '2026-07-04',476952,'08767d1b-1917-44a3-bd4c-bc3618b6c34b');
  v_ret := aprobar_legalizacion(v_leg);
  select 'CG-'||e.consecutivo||E'\n  '||string_agg(l.cuenta_puc||' t='||coalesce(l.tercero_nombre_snapshot,'—')||' D='||l.debito||' C='||l.credito, E'\n  ' order by l.credito,l.debito desc)
    into v_res from journal_entries e join journal_entry_lines l on l.journal_entry_id=e.id
    where e.origen_tabla='legalizations' and e.origen_id=v_leg and e.estado='CONTABILIZADO' group by e.id,e.consecutivo;
  raise exception E'MATCH → %\n  %', v_ret, v_res;
end $$;
