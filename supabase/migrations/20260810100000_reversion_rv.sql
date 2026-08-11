-- ============================================================================
-- Serie de comprobante propia para REVERSIONES/ANULACIONES: tipo RV, separada del
-- cruce de cartera (que sigue en CX). Así "¿cuántas correcciones hubo este mes?" =
-- contar RV, sin filtros. Los CX existentes (19 cruces + 2 reversiones legacy CX-3/CX-4)
-- NO se tocan ni renumeran; el cambio es solo hacia adelante.
--
-- postear_reversion(entry, motivo[, fecha]): postea el asiento espejo (débito↔crédito)
-- con anula_a apuntando al original y un MOTIVO ESCRITO OBLIGATORIO en la descripción —
-- fricción deliberada para que reversar sea una decisión consciente y auditable, y no
-- quede texto de trabajo interno en el libro oficial.
-- Aplicar en SQL Editor.
-- ============================================================================

insert into tipos_comprobante (codigo, nombre) values ('RV', 'Reversión')
on conflict (codigo) do nothing;

create or replace function postear_reversion(
  p_entry_id uuid, p_motivo text, p_fecha date default null
) returns uuid language plpgsql as $$
declare
  v_orig journal_entries%rowtype;
  v_fecha date; v_consec integer; v_rv uuid; v_lin record;
begin
  -- GUARD motivo obligatorio (no vacío)
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'La reversión exige un motivo escrito (no puede ir vacío)'; end if;

  select * into v_orig from journal_entries where id = p_entry_id;
  if not found then raise exception 'El asiento a reversar % no existe', p_entry_id; end if;
  if v_orig.estado <> 'CONTABILIZADO' then
    raise exception 'Solo se reversa un asiento CONTABILIZADO (estado actual: %)', v_orig.estado; end if;
  if v_orig.tipo_comprobante = 'RV' then
    raise exception 'No se puede reversar una reversión (RV-%); corrige el asiento original', v_orig.consecutivo; end if;
  if exists (select 1 from journal_entries where anula_a = p_entry_id) then
    raise exception 'El asiento %-% ya fue reversado', v_orig.tipo_comprobante, v_orig.consecutivo; end if;

  -- Fecha de la reversión: por defecto la del original (misma periodo → neteo limpio),
  -- o la que pase el llamador si ese periodo ya está cerrado.
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

  -- Espejo: cada línea del original con débito↔crédito invertidos (mismo tercero/ceco).
  for v_lin in select cuenta_puc, tercero_id, centro_costo, debito, credito
                 from journal_entry_lines where journal_entry_id = p_entry_id loop
    perform contab_insert_linea(v_rv, v_lin.cuenta_puc, v_lin.tercero_id, v_lin.centro_costo, v_lin.credito, v_lin.debito);
  end loop;

  return v_rv;
end; $$;
