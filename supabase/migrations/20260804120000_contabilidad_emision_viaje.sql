-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 · Evento 2 (emisión de factura) — versión TRIP-BASED con guards.
--   postear_emision_factura (v2, genérica) no exige CI previo ni anti-duplica CF, y
--   usa origen_tabla='invoices'. Esta versión, gemela de postear_causacion_viaje:
--     · toma el viaje (tercero, flete, FEIT) directamente,
--     · GUARD 1: exige que exista causación CI contabilizada (no se emite sin causar),
--     · GUARD 2: anti-duplicado de CF contabilizado,
--     · origen_tabla='trips' (consistente con todo Fase 1: el origen es el evento real).
--   DB 13050501 Cartera facturada / CR 13050502 CxC por facturar, mismo tercero y monto.
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_emision_viaje(p_trip_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_flete numeric; v_fecha date; v_num text; v_feit text;
  v_entry uuid; v_consec integer; v_ci uuid; v_cf uuid;
begin
  select t.tercero_id, t.freight_value, t.load_date, t.trip_number,
         (select i.invoice_number from invoices i where i.trip_id = t.id order by i.created_at desc limit 1)
    into v_ter, v_flete, v_fecha, v_num, v_feit
    from trips t where t.id = p_trip_id;
  if not found then raise exception 'Viaje % no existe', p_trip_id; end if;
  if v_ter is null then raise exception 'El viaje % no tiene tercero (cliente)', p_trip_id; end if;
  if coalesce(v_flete,0) <= 0 then raise exception 'El viaje % no tiene flete > 0', p_trip_id; end if;

  -- GUARD 1: debe existir causación CI contabilizada
  select id into v_ci from journal_entries
   where origen_tabla='trips' and origen_id=p_trip_id and tipo_comprobante='CI' and estado='CONTABILIZADO' limit 1;
  if v_ci is null then
    raise exception 'El viaje % no tiene causación (CI) contabilizada; no se puede emitir sin causar antes.', p_trip_id;
  end if;

  -- GUARD 2: no debe existir ya una emisión CF contabilizada
  select id into v_cf from journal_entries
   where origen_tabla='trips' and origen_id=p_trip_id and tipo_comprobante='CF' and estado='CONTABILIZADO' limit 1;
  if v_cf is not null then
    raise exception 'El viaje % ya tiene emisión de factura contabilizada (asiento %)', p_trip_id, v_cf;
  end if;

  v_consec := consecutivo_siguiente('CF');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CF', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Emisión factura '||coalesce(v_feit,'')||' · viaje '||coalesce(v_num, p_trip_id::text), v_feit, 'trips', p_trip_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '13050501', v_ter, null, v_flete, 0);  -- DB Cartera facturada
  perform contab_insert_linea(v_entry, '13050502', v_ter, null, 0, v_flete);  -- CR CxC por facturar
  return v_entry;
end;
$$;
