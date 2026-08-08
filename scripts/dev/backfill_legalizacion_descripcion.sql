-- BACKFILL (aplicado en firme) — normaliza descripcion + documento_soporte de los 13 asientos
-- de legalización ya existentes (CG-87..99) al nuevo formato con manifiesto, usando el mismo
-- helper legalizacion_doc_ref que usa aprobar_legalizacion (no se desincronizan).
-- Solo texto (no montos/cuentas/tercero_id); misma excepción sancionada de inmutabilidad.
do $$
declare r record; v_desc text; v_doc text; v_n int := 0;
begin
  alter table journal_entries disable trigger trg_bloquea_edicion_entries;
  for r in select id, origen_id from journal_entries
            where origen_tabla='legalizations' and tipo_comprobante='CG' and estado='CONTABILIZADO' loop
    select descripcion, documento into v_desc, v_doc from legalizacion_doc_ref(r.origen_id);
    update journal_entries set descripcion=v_desc, documento_soporte=v_doc where id=r.id;
    v_n := v_n + 1;
  end loop;
  alter table journal_entries enable trigger trg_bloquea_edicion_entries;
  raise notice 'Encabezados actualizados: %', v_n;
end $$;

select 'CG-'||consecutivo as asiento, fecha, documento_soporte, descripcion
  from journal_entries
 where origen_tabla='legalizations' and tipo_comprobante='CG' and estado='CONTABILIZADO'
 order by consecutivo;
