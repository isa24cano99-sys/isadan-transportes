-- ============================================================================
-- Evento 4 (v3): Cruce de cartera dirigido por TERCERO, desde el libro contable real.
--
-- Reemplaza el candidato "por AR entry" (accounts_receivable_entries) por el saldo
-- real del libro: la facturación (postear_facturacion_viaje) postea la cartera en
-- 13050501 vía comprobante CF pero NO crea AR entries, así que el cruce v2 no veía
-- las facturas nuevas (ej. las 25 de agosto). v3 calcula todo desde journal_entry_lines:
--   · anticipo del tercero = 28050510 (CR - DB), CONTABILIZADO
--   · cartera del tercero   = 13050501 (DB - CR), CONTABILIZADO
--   · monto a cruzar = MENOR de los dos (a nivel tercero)
--
-- Postea CX  DB 28050510 / CR 13050501  (tercero, monto). origen = 'terceros'
-- (cruce a nivel tercero, sin factura puntual). NO toca accounts_receivable_entries
-- (esa tabla sigue viva para /cartera, /terceros, /viajes — solo el cruce deja de
-- depender de ella). No necesita guard de "factura real": la cartera sale del CF ya
-- contabilizado, luego cartera>0 ⇒ facturación real existe. No necesita guard pre-corte
-- por factura: opera sobre SALDOS abiertos reales (la apertura CA-1 ya está neta), no
-- sobre el valor nominal de una factura. Mantiene el guard de periodo del asiento.
--
-- Idempotente por diseño: tras cruzar, el saldo menor queda en 0 y el tercero ya no
-- califica; un segundo intento falla con "nada que cruzar". Aplicar en SQL Editor.
-- ============================================================================
create or replace function postear_cruce_cartera_v3(p_tercero uuid)
returns uuid language plpgsql as $$
declare
  v_anticipo numeric; v_cartera numeric; v_monto numeric;
  v_entry uuid; v_consec integer; v_fecha_cf date; v_fecha_rc date; v_fecha date; v_nombre text;
begin
  if p_tercero is null then raise exception 'Debe indicar el tercero'; end if;

  -- saldos a nivel tercero (solo CONTABILIZADO)
  select coalesce(sum(l.credito) - sum(l.debito), 0) into v_anticipo
    from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '28050510' and l.tercero_id = p_tercero and e.estado = 'CONTABILIZADO';
  select coalesce(sum(l.debito) - sum(l.credito), 0) into v_cartera
    from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '13050501' and l.tercero_id = p_tercero and e.estado = 'CONTABILIZADO';

  v_monto := least(v_anticipo, v_cartera);
  if coalesce(v_monto,0) <= 0 then
    raise exception 'Nada que cruzar para este tercero — anticipo disponible %, cartera pendiente %', v_anticipo, v_cartera; end if;

  -- fecha del asiento = hecho económico más tardío (última CF de cartera vs último RC de anticipo)
  select max(e.fecha) into v_fecha_cf
    from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
   where e.tipo_comprobante = 'CF' and e.estado = 'CONTABILIZADO'
     and l.cuenta_puc = '13050501' and l.tercero_id = p_tercero;
  select max(e.fecha) into v_fecha_rc
    from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
   where e.tipo_comprobante = 'RC' and e.estado = 'CONTABILIZADO'
     and l.cuenta_puc = '28050510' and l.tercero_id = p_tercero;
  v_fecha := coalesce(greatest(v_fecha_cf, v_fecha_rc), current_date);
  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;

  select case when t.tipo_persona = 'NATURAL'
              then nullif(trim(concat_ws(' ', t.primer_nombre, t.otros_nombres, t.primer_apellido, t.segundo_apellido)), '')
              else t.razon_social end
    into v_nombre from terceros t where t.id = p_tercero;

  v_consec := consecutivo_siguiente('CX');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CX', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Cruce de anticipo aplicado a cartera · ' || coalesce(v_nombre,''),
            'terceros', p_tercero)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '28050510', p_tercero, null, v_monto, 0);  -- DB Anticipo clientes
  perform contab_insert_linea(v_entry, '13050501', p_tercero, null, 0, v_monto);  -- CR Cartera facturada
  return v_entry;
end; $$;
