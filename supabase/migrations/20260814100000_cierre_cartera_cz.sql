-- ============================================================================
-- Serie CZ — "Cierre de cartera". El barrido de cierre a nivel tercero deja de
-- vivir bajo CX (que es cruce individual factura↔anticipo). CZ es un ajuste de
-- cierre de periodo por tercero, conceptualmente distinto de CX y de RV.
--   1) Nuevo tipo de comprobante CZ.
--   2) postear_cruce_tercero / postear_barrido_cierre_cartera pasan a emitir CZ.
-- Aplicar en SQL Editor. (El re-etiquetado del CZ-1 histórico —Jamar, hoy CX-26—
-- va en el script one-off aparte, porque toca un asiento CONTABILIZADO.)
-- ============================================================================
insert into tipos_comprobante (codigo, nombre) values
  ('CZ', 'Cierre de cartera')
on conflict (codigo) do nothing;

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
  v_consec := consecutivo_siguiente('CZ');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
  values ('CZ', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'),
     'Cruce de cierre — anticipo aplicado a cartera · ' || coalesce(v_nom,''),
     'terceros', p_tercero)
  returning id into v_entry;
  perform contab_insert_linea(v_entry, '28050510', p_tercero, null, v_monto, 0);  -- DB anticipo
  perform contab_insert_linea(v_entry, '13050501', p_tercero, null, 0, v_monto);  -- CR cartera
  return v_entry;
end; $$;

-- (postear_barrido_cierre_cartera no cambia su cuerpo: llama a postear_cruce_tercero,
--  que ahora emite CZ. Se re-declara por claridad/idempotencia.)
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
