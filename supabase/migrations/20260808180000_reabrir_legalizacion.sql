-- ════════════════════════════════════════════════════════════════════════════
-- "Reabrir para corregir" una legalización APROBADA (flujo explícito de corrección).
-- Convierte la excepción sancionada de inmutabilidad (desactivar trigger + borrar CG)
-- en un mecanismo reusable y auditable, en vez de repetir el patrón manual cada vez.
--
-- reabrir_legalizacion(leg): borra el CG del leg (origen=legalizations) + sus líneas y
-- pone status=BORRADOR, para que el usuario edite (incl. el dropdown de FE) y al reaprobar
-- aprobar_legalizacion la regenere correcta. NO toca asientos de conciliación ni otros eventos.
-- SECURITY DEFINER (dueño postgres) para poder desactivar el trigger de inmutabilidad.
-- Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function reabrir_legalizacion(p_leg_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_asientos uuid[];
begin
  select status into v_status from legalizations where id = p_leg_id;
  if not found then raise exception 'Legalización % no existe', p_leg_id; end if;
  if v_status <> 'APROBADA' then
    raise exception 'Solo se puede reabrir una legalización APROBADA (está en %)', v_status;
  end if;

  -- CG(s) del leg (origen=legalizations). Los de conciliación (origen=dian_invoices_import)
  -- NO se tocan: si una FE ya se causó por conciliación, sigue causada y el reaprobar la salta.
  select array_agg(id) into v_asientos
    from journal_entries
   where origen_tabla='legalizations' and origen_id=p_leg_id
     and tipo_comprobante='CG' and estado='CONTABILIZADO';

  -- Excepción sancionada de inmutabilidad, encapsulada: desactivar → borrar → reactivar.
  alter table journal_entry_lines disable trigger trg_bloquea_edicion_lines;
  alter table journal_entries     disable trigger trg_bloquea_edicion_entries;
  if v_asientos is not null then
    delete from journal_entry_lines where journal_entry_id = any(v_asientos);
    delete from journal_entries     where id = any(v_asientos);
  end if;
  alter table journal_entries     enable trigger trg_bloquea_edicion_entries;
  alter table journal_entry_lines enable trigger trg_bloquea_edicion_lines;

  update legalizations set status='BORRADOR' where id=p_leg_id;

  return jsonb_build_object('reabierta', p_leg_id, 'asientos_borrados', coalesce(array_length(v_asientos,1),0));
end; $$;

grant execute on function reabrir_legalizacion(uuid) to service_role;
