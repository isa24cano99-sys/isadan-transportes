-- ============================================================================
-- Endurecimiento de postear_reversion: además de no reversar un RV, tampoco se
-- puede reversar la APERTURA (CA) ni el CIERRE (CC) — reversar el balance de
-- apertura completo o un cierre de periodo es catastrófico y tiene sus propios
-- mecanismos. Defensa en profundidad (la UI ya deshabilita el botón para estos).
-- Aplicar en SQL Editor (create or replace, idempotente).
-- ============================================================================
create or replace function postear_reversion(
  p_entry_id uuid, p_motivo text, p_fecha date default null
) returns uuid language plpgsql as $$
declare
  v_orig journal_entries%rowtype;
  v_fecha date; v_consec integer; v_rv uuid; v_lin record;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'La reversión exige un motivo escrito (no puede ir vacío)'; end if;

  select * into v_orig from journal_entries where id = p_entry_id;
  if not found then raise exception 'El asiento a reversar % no existe', p_entry_id; end if;
  if v_orig.estado <> 'CONTABILIZADO' then
    raise exception 'Solo se reversa un asiento CONTABILIZADO (estado actual: %)', v_orig.estado; end if;
  if v_orig.tipo_comprobante = 'RV' then
    raise exception 'No se puede reversar una reversión (RV-%); corrige el asiento original', v_orig.consecutivo; end if;
  if v_orig.tipo_comprobante = 'CA' then
    raise exception 'No se puede reversar el balance de apertura (CA-%)', v_orig.consecutivo; end if;
  if v_orig.tipo_comprobante = 'CC' then
    raise exception 'No se puede reversar un cierre de periodo (CC-%); usa el mecanismo de reapertura', v_orig.consecutivo; end if;
  if exists (select 1 from journal_entries where anula_a = p_entry_id) then
    raise exception 'El asiento %-% ya fue reversado', v_orig.tipo_comprobante, v_orig.consecutivo; end if;

  v_fecha := coalesce(p_fecha, v_orig.fecha);
  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede reversar en periodo cerrado/pre-corte (%)', to_char(v_fecha, 'YYYY-MM'); end if;

  v_consec := consecutivo_siguiente('RV');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, anula_a, origen_tabla, origen_id)
    values ('RV', v_consec, v_fecha, to_char(v_fecha, 'YYYY-MM'),
            'Reversión de ' || v_orig.tipo_comprobante || '-' || v_orig.consecutivo || ' · Motivo: ' || trim(p_motivo),
            'Reversión ' || v_orig.tipo_comprobante || '-' || v_orig.consecutivo,
            p_entry_id, 'journal_entries', p_entry_id)
    returning id into v_rv;

  for v_lin in select cuenta_puc, tercero_id, centro_costo, debito, credito
                 from journal_entry_lines where journal_entry_id = p_entry_id loop
    perform contab_insert_linea(v_rv, v_lin.cuenta_puc, v_lin.tercero_id, v_lin.centro_costo, v_lin.credito, v_lin.debito);
  end loop;

  return v_rv;
end; $$;
