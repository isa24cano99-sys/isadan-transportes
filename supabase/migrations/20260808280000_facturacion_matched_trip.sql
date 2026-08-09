-- ════════════════════════════════════════════════════════════════════════════
-- Enlace MANUAL viaje↔factura emitida (para las FEIT sin match automático por folio).
-- El ingreso se reconoce por la FEIT independientemente del viaje; el viaje es solo traza
-- en la glosa. matched_trip_id permite fijarlo a mano cuando el folio no lo resuelve.
-- postear_facturacion_viaje: glosa = matched_trip_id (manual) → si no, folio→invoices→trip.
-- Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
alter table dian_invoices_import add column if not exists matched_trip_id uuid references trips(id);

create or replace function postear_facturacion_viaje(p_import_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_total numeric; v_folio text; v_prefix text; v_fecha date; v_tipo text; v_grupo text; v_status text; v_mtrip uuid;
  v_folioComp text; v_trip text; v_entry uuid; v_consec integer; v_x uuid;
begin
  select tercero_id, total, folio, prefix, issue_date, document_type, grupo, status, matched_trip_id
    into v_ter, v_total, v_folio, v_prefix, v_fecha, v_tipo, v_grupo, v_status, v_mtrip
    from dian_invoices_import where id = p_import_id;
  if not found then raise exception 'La factura % no existe', p_import_id; end if;
  if v_tipo is distinct from 'Factura electrónica' then
    raise exception 'El documento % no es una factura electrónica (tipo=%)', p_import_id, coalesce(v_tipo,'—'); end if;
  if v_grupo is distinct from 'EMITIDO' then
    raise exception 'La factura % no es emitida por ISADAN (grupo=%)', p_import_id, coalesce(v_grupo,'—'); end if;
  if v_ter is null then raise exception 'La factura % no tiene cliente (tercero) resuelto', p_import_id; end if;
  if coalesce(v_total,0) <= 0 then raise exception 'La factura % no tiene monto > 0', p_import_id; end if;
  if v_status ilike '%anul%' then
    raise exception 'La factura % está anulada en la DIAN — no se reconoce ingreso', p_import_id; end if;

  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;

  select id into v_x from journal_entries
   where origen_tabla='dian_invoices_import' and origen_id=p_import_id and tipo_comprobante='CF' and estado='CONTABILIZADO' limit 1;
  if v_x is not null then raise exception 'La factura % ya está contabilizada como ingreso (asiento %)', p_import_id, v_x; end if;

  v_folioComp := coalesce(v_prefix,'') || coalesce(v_folio,'');
  -- viaje (traza): manual (matched_trip_id) si existe, si no por folio → invoices → trip
  v_trip := coalesce(
    (select t.trip_number from trips t where t.id = v_mtrip),
    (select t.trip_number from invoices i join trips t on t.id = i.trip_id where i.invoice_number = v_folioComp limit 1)
  );

  v_consec := consecutivo_siguiente('CF');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CF', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Facturación ' || v_folioComp || coalesce(' · viaje ' || v_trip, ''), v_folioComp, 'dian_invoices_import', p_import_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '13050501', v_ter, null, v_total, 0);  -- DB Cartera facturada
  perform contab_insert_linea(v_entry, '41450510', v_ter, null, 0, v_total);  -- CR Ingreso transporte
  return v_entry;
end; $$;
