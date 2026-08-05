-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 · Evento 6 (comisión empresa) — guards + tercero del CR corregido.
--   postear_comision_empresa de Fase 1 no tenía guards y acreditaba 13301510 con
--   CONSUMIDOR FINAL. Cambios:
--     · DB 61450580 Comisión empresa → tercero CONSUMIDOR FINAL (a quién se pagó).
--     · CR 13301510 Anticipo a trabajadores → tercero del CONDUCTOR (se deriva de la
--       legalización de origen), consistente con el evento 5 (porcentaje): el sub-libro
--       de 13301510 queda limpio por conductor, no mezclado con Consumidor Final.
--     · GUARD pre-corte (p_fecha < 2026-07-01) y anti-duplicado POR CUENTA (61450580).
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_comision_empresa(
  p_placa text, p_monto numeric, p_fecha date,
  p_tercero uuid default null, p_origen_id uuid default null
) returns uuid language plpgsql as $$
declare v_ter uuid; v_conductor uuid; v_entry uuid; v_consec integer; v_dup uuid;
begin
  -- Tercero del DB (comisión): CONSUMIDOR FINAL por defecto (a quién se pagó, no el conductor)
  v_ter := p_tercero;
  if v_ter is null then
    select id into v_ter from terceros where numero_identificacion='222222222222' and merged_into is null limit 1;
    if v_ter is null then raise exception 'No se encontró el tercero CONSUMIDOR FINAL (222222222222)'; end if;
  end if;
  if coalesce(p_placa,'') = '' then raise exception 'La comisión requiere placa (centro de costo)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser > 0'; end if;

  -- Conductor de la legalización: el CR a 13301510 va a su nombre (consistente con evento 5)
  if p_origen_id is null then
    raise exception 'La comisión requiere la legalización de origen (p_origen_id) para resolver el conductor';
  end if;
  select d.tercero_id into v_conductor
    from legalizations lg
    join drivers d on d.id = lg.driver_id
   where lg.id = p_origen_id;
  if v_conductor is null then
    raise exception 'No se encontró el conductor (drivers.tercero_id) de la legalización %', p_origen_id;
  end if;

  -- GUARD pre-corte: nada anterior al corte (el costo ya está en el resultado acumulado 3610)
  if p_fecha < date '2026-07-01' then
    raise exception 'Comisión pre-corte (%): ya está en la apertura; no se contabiliza.', p_fecha;
  end if;

  -- GUARD anti-duplicado POR CUENTA: no repetir el CG de comisión (61450580) de esta legalización
  select e.id into v_dup
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
   where e.origen_tabla = 'legalizations' and e.origen_id = p_origen_id
     and e.tipo_comprobante = 'CG' and e.estado = 'CONTABILIZADO'
     and l.cuenta_puc = '61450580'
   limit 1;
  if v_dup is not null then
    raise exception 'La legalización % ya tiene comisión empresa contabilizada (asiento %)', p_origen_id, v_dup;
  end if;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CG', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'), 'Comisión empresa · placa '||p_placa, 'legalizations', p_origen_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '61450580', v_ter,       p_placa, p_monto, 0);  -- DB Comisión empresa (Consumidor Final)
  perform contab_insert_linea(v_entry, '13301510', v_conductor, p_placa, 0, p_monto);  -- CR Anticipo a trabajadores (conductor)
  return v_entry;
end; $$;
