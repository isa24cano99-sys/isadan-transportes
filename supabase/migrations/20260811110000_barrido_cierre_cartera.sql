-- ============================================================================
-- Barrido de cierre — cruce anticipo↔cartera A NIVEL TERCERO (no por factura).
-- Al cierre de mes, un tercero puede quedar con anticipo (28050510 crédito) Y cartera
-- (13050501 débito) simultáneamente sin cruzar (p.ej. Jamar: anticipo $2.265.290 +
-- cartera $2.605.208). El cruce por-factura (postear_cruce_cartera_v2) no alcanza (una
-- factura pre-corte o ya con su CX no se puede re-cruzar). Este barrido cruza el residuo
-- por tercero, por el MENOR valor (mismo criterio del mecanismo individual).
--
--   postear_cruce_tercero(tercero, fecha): CX  DB 28050510 / CR 13050501  por LEAST(ant,cartera).
--   postear_barrido_cierre_cartera(fecha): corre el anterior para TODO tercero con saldo en ambas.
-- Aplicar en SQL Editor.
-- ============================================================================
create or replace function postear_cruce_tercero(p_tercero uuid, p_fecha date)
returns uuid language plpgsql as $$
declare v_ant numeric; v_car numeric; v_monto numeric; v_entry uuid; v_consec integer; v_nom text;
begin
  if p_tercero is null then raise exception 'tercero requerido'; end if;
  if periodo_bloqueado(p_fecha) then raise exception 'No se puede cruzar en periodo cerrado/pre-corte (%)', to_char(p_fecha,'YYYY-MM'); end if;

  select coalesce(sum(l.credito) - sum(l.debito), 0) into v_ant
    from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '28050510' and l.tercero_id = p_tercero and e.estado = 'CONTABILIZADO';
  select coalesce(sum(l.debito) - sum(l.credito), 0) into v_car
    from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '13050501' and l.tercero_id = p_tercero and e.estado = 'CONTABILIZADO';

  v_monto := least(v_ant, v_car);
  if coalesce(v_monto,0) <= 0 then
    raise exception 'Nada que cruzar para el tercero — anticipo %, cartera %', v_ant, v_car; end if;

  select razon_social into v_nom from terceros where id = p_tercero;
  v_consec := consecutivo_siguiente('CX');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
  values ('CX', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'),
     'Cruce de cierre — anticipo aplicado a cartera · ' || coalesce(v_nom,''),
     'terceros', p_tercero)
  returning id into v_entry;
  perform contab_insert_linea(v_entry, '28050510', p_tercero, null, v_monto, 0);  -- DB anticipo
  perform contab_insert_linea(v_entry, '13050501', p_tercero, null, 0, v_monto);  -- CR cartera
  return v_entry;
end; $$;

create or replace function postear_barrido_cierre_cartera(p_fecha date)
returns integer language plpgsql as $$
declare v_id uuid; v_n integer := 0;
begin
  for v_id in
    select t.id from terceros t
    where (select coalesce(sum(l.credito)-sum(l.debito),0) from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
            where l.cuenta_puc='28050510' and l.tercero_id=t.id and e.estado='CONTABILIZADO') > 0
      and (select coalesce(sum(l.debito)-sum(l.credito),0) from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
            where l.cuenta_puc='13050501' and l.tercero_id=t.id and e.estado='CONTABILIZADO') > 0
  loop
    perform postear_cruce_tercero(v_id, p_fecha);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
