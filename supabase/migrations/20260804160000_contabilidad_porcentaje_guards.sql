-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 · Evento 5 (porcentaje conductor) — guards para uso real.
--   postear_porcentaje_conductor de Fase 1 no tenía guards (probada con rollback).
--   Se agregan dos, sin tocar la lógica contable (DB 61450550 / CR 13301510):
--     · PRE-CORTE: rechaza p_fecha < 2026-07-01. El costo pre-corte ya está en el
--       resultado acumulado (3610) y el CR a 13301510 ya viene neteado por conductor
--       en el asiento de apertura CA-1 → postearlo duplicaría ambos lados.
--     · ANTI-DUPLICADO POR CUENTA: rechaza si ya existe un CG CONTABILIZADO de esta
--       legalización (origen_id) con línea a 61450550. Debe ser por cuenta y no por
--       (tabla,origen,tipo): porcentaje (61450550) y comisión empresa (61450580)
--       comparten CG + origen_tabla='legalizations' + origen_id, y un guard genérico
--       los haría colisionar entre sí.
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_porcentaje_conductor(
  p_driver_id uuid,
  p_placa     text,
  p_monto     numeric,
  p_fecha     date,
  p_origen_id uuid default null
) returns uuid language plpgsql as $$
declare v_ter uuid; v_entry uuid; v_consec integer; v_dup uuid;
begin
  select tercero_id into v_ter from drivers where id = p_driver_id;
  if not found then raise exception 'Conductor % no existe', p_driver_id; end if;
  if v_ter is null then raise exception 'El conductor % no tiene tercero_id enlazado', p_driver_id; end if;
  if coalesce(p_placa,'') = '' then raise exception 'El porcentaje requiere placa (centro de costo)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser > 0'; end if;

  -- GUARD pre-corte: nada anterior al corte de apertura (ya está en CA-1 / 3610)
  if p_fecha < date '2026-07-01' then
    raise exception 'Legalización pre-corte (%): su porcentaje ya está en la apertura; no se contabiliza.', p_fecha;
  end if;

  -- GUARD anti-duplicado POR CUENTA: no repetir el CG de porcentaje (61450550) de esta legalización
  if p_origen_id is not null then
    select e.id into v_dup
      from journal_entries e
      join journal_entry_lines l on l.journal_entry_id = e.id
     where e.origen_tabla = 'legalizations' and e.origen_id = p_origen_id
       and e.tipo_comprobante = 'CG' and e.estado = 'CONTABILIZADO'
       and l.cuenta_puc = '61450550'
     limit 1;
    if v_dup is not null then
      raise exception 'La legalización % ya tiene porcentaje conductor contabilizado (asiento %)', p_origen_id, v_dup;
    end if;
  end if;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries
    (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
  values
    ('CG', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'),
     'Porcentaje conductor · placa '||p_placa, 'legalizations', p_origen_id)
  returning id into v_entry;

  perform contab_insert_linea(v_entry, '61450550', v_ter, p_placa, p_monto, 0);  -- DB Porcentaje
  perform contab_insert_linea(v_entry, '13301510', v_ter, p_placa, 0, p_monto);  -- CR Anticipo a trabajadores
  return v_entry;
end;
$$;
