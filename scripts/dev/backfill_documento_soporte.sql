-- BACKFILL (aplicado en firme) — normaliza documento_soporte de los ~41 asientos ya existentes
-- (36 CB + 4 RC + 1 peaje) a la misma referencia corta de las funciones de 20260808150000.
-- Recalcula desde el bank_transaction / periodo de origen. Solo texto; excepción sancionada
-- de inmutabilidad (trg_bloquea_edicion_entries off puntual). Verificado con rollback antes de firme.
--   CB con DB 220501    -> 'Pago 220501 · <periodo>'
--   CB con DB 13301510  -> manifiesto si el mov. liga a viaje (reference_type=TRIP), si no 'Anticipo · <conductor>'
--   RC                  -> manifiesto si liga, si no 'Anticipo · <cliente>'
--   CG peaje F2X        -> 'F2X <periodo>'
do $$
declare r record; v_ref text; v_reftype text; v_refid uuid; v_nombre text; v_n int:=0;
begin
  alter table journal_entries disable trigger trg_bloquea_edicion_entries;
  for r in select e.id, e.tipo_comprobante, e.fecha, e.periodo, e.origen_id from journal_entries e
            where e.estado='CONTABILIZADO'
              and ((e.tipo_comprobante in ('CB','RC') and e.origen_tabla='bank_transactions')
                   or (e.tipo_comprobante='CG' and e.descripcion like '%peaje F2X%')) loop
    v_ref:=null; v_reftype:=null; v_refid:=null; v_nombre:=null;
    if r.tipo_comprobante='CG' then
      v_ref := 'F2X ' || r.periodo;
    elsif r.tipo_comprobante='RC' then
      select bt.reference_type, bt.reference_id,
             coalesce(t.razon_social, nullif(trim(concat_ws(' ',t.primer_nombre,t.otros_nombres,t.primer_apellido,t.segundo_apellido)),''))
        into v_reftype, v_refid, v_nombre
        from bank_transactions bt left join terceros t on t.id=bt.tercero_id where bt.id=r.origen_id;
      if v_reftype='TRIP' and v_refid is not null then
        select coalesce(nullif(trim(manifest_number),''),trip_number) into v_ref from trips where id=v_refid; end if;
      v_ref := coalesce(v_ref, 'Anticipo · '||coalesce(v_nombre,'—'));
    elsif r.tipo_comprobante='CB' then
      if exists(select 1 from journal_entry_lines l where l.journal_entry_id=r.id and l.cuenta_puc='220501' and l.debito>0) then
        v_ref := 'Pago 220501 · '||to_char(r.fecha,'YYYY-MM');
      elsif exists(select 1 from journal_entry_lines l where l.journal_entry_id=r.id and l.cuenta_puc='13301510' and l.debito>0) then
        select bt.reference_type, bt.reference_id into v_reftype, v_refid from bank_transactions bt where bt.id=r.origen_id;
        if v_reftype='TRIP' and v_refid is not null then
          select coalesce(nullif(trim(manifest_number),''),trip_number) into v_ref from trips where id=v_refid; end if;
        v_ref := coalesce(v_ref, 'Anticipo · '||coalesce((select full_name from drivers d where d.tercero_id=(select tercero_id from bank_transactions where id=r.origen_id) limit 1),'—'));
      end if;
    end if;
    if v_ref is not null then update journal_entries set documento_soporte=v_ref where id=r.id; v_n:=v_n+1; end if;
  end loop;
  alter table journal_entries enable trigger trg_bloquea_edicion_entries;
  raise notice 'Backfill firme: % asientos', v_n;
end $$;

select tipo_comprobante||'-'||consecutivo as asiento, to_char(fecha,'YYYY-MM-DD') as fecha, documento_soporte
  from journal_entries
 where estado='CONTABILIZADO'
   and ((tipo_comprobante in ('CB','RC') and origen_tabla='bank_transactions') or (tipo_comprobante='CG' and descripcion like '%peaje F2X%'))
 order by tipo_comprobante, consecutivo;
