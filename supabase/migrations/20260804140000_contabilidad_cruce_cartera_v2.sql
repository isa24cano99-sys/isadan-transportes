-- ─────────────────────────────────────────────────────────────────────────────
-- Evento 4 (v2): Cruce de cartera dirigido por AR entry.
--
-- Toma una accounts_receivable_entries específica (origen + trazabilidad + guard
-- anti-duplicado). Calcula el monto a cruzar como el MENOR de:
--   · saldo de anticipo disponible del tercero en 28050510 (CR - DB), CONTABILIZADO
--   · saldo de cartera facturada del tercero en 13050501 (DB - CR), CONTABILIZADO
--   · saldo pendiente de ESTA factura (invoice_amount - advance_amount)
-- El tercer tope evita sobre-abonar una sola factura cuando el anticipo del tercero
-- supera lo que esta factura debe (los dos primeros son el criterio contable a
-- nivel tercero; el tercero es la coherencia operativa de la entry).
--
-- En la MISMA transacción:
--   a) postea el asiento CX  DB 28050510 / CR 13050501  (tercero, monto)
--   b) UPDATE accounts_receivable_entries: advance_amount += monto, status
--      recalculado. balance NO se toca (es columna GENERADA = invoice - advance).
--
-- Si el monto calculado es <= 0, falla con mensaje claro (no postea asiento cero).
-- Fecha del asiento = el hecho económico más tardío entre el CF de la factura y el
-- RC del anticipo que se cruzan (GREATEST), no la fecha del clic.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function postear_cruce_cartera_v2(p_entry_id uuid)
returns uuid language plpgsql as $$
declare
  v_tercero      uuid;
  v_invoice_num  text;
  v_invoice_amt  numeric;
  v_advance      numeric;
  v_saldo_fact   numeric;   -- pendiente de esta factura
  v_anticipo     numeric;   -- disponible del tercero en 28050510
  v_cartera      numeric;   -- pendiente del tercero en 13050501
  v_monto        numeric;
  v_new_advance  numeric;
  v_new_status   text;
  v_entry        uuid;
  v_consec       integer;
  v_dup          uuid;
  v_fecha_cf     date;
  v_fecha_rc     date;
  v_fecha        date;
begin
  -- 1) traer la AR entry
  select tercero_id, invoice_number, invoice_amount, advance_amount
    into v_tercero, v_invoice_num, v_invoice_amt, v_advance
    from accounts_receivable_entries
   where id = p_entry_id;
  if not found then
    raise exception 'La cartera (AR entry) % no existe', p_entry_id;
  end if;
  if v_tercero is null then
    raise exception 'La AR entry % (%) no tiene tercero_id; no se puede cruzar', p_entry_id, v_invoice_num;
  end if;

  -- 2) guard anti-duplicado: no puede haber ya un CX contabilizado para esta entry
  select id into v_dup
    from journal_entries
   where origen_tabla = 'accounts_receivable_entries'
     and origen_id    = p_entry_id
     and tipo_comprobante = 'CX'
     and estado = 'CONTABILIZADO'
   limit 1;
  if v_dup is not null then
    raise exception 'La factura % ya tiene un cruce (CX) contabilizado (asiento %)', v_invoice_num, v_dup;
  end if;

  -- 3) saldos a nivel tercero (solo asientos CONTABILIZADO)
  select coalesce(sum(l.credito) - sum(l.debito), 0) into v_anticipo
    from journal_entry_lines l
    join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '28050510' and l.tercero_id = v_tercero and e.estado = 'CONTABILIZADO';

  select coalesce(sum(l.debito) - sum(l.credito), 0) into v_cartera
    from journal_entry_lines l
    join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '13050501' and l.tercero_id = v_tercero and e.estado = 'CONTABILIZADO';

  v_saldo_fact := coalesce(v_invoice_amt,0) - coalesce(v_advance,0);

  -- 4) monto = MENOR de los tres topes
  v_monto := least(v_anticipo, v_cartera, v_saldo_fact);

  if coalesce(v_monto,0) <= 0 then
    raise exception 'Nada que cruzar para % — anticipo disponible %, cartera pendiente %, saldo factura %',
      v_invoice_num, v_anticipo, v_cartera, v_saldo_fact;
  end if;

  -- 5) fecha del asiento = hecho económico más tardío (CF de la factura vs RC del anticipo).
  --    GREATEST ignora NULLs; si faltan ambos, cae en current_date.
  select max(e.fecha) into v_fecha_cf
    from journal_entries e
   where e.tipo_comprobante = 'CF' and e.estado = 'CONTABILIZADO'
     and e.documento_soporte = v_invoice_num;

  select max(e.fecha) into v_fecha_rc
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
   where e.tipo_comprobante = 'RC' and e.estado = 'CONTABILIZADO'
     and l.cuenta_puc = '28050510' and l.tercero_id = v_tercero;

  v_fecha := coalesce(greatest(v_fecha_cf, v_fecha_rc), current_date);

  -- 5a) asiento CX  DB 28050510 / CR 13050501
  v_consec := consecutivo_siguiente('CX');
  insert into journal_entries
    (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
  values
    ('CX', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
     'Cruce de anticipo aplicado a cartera · factura ' || coalesce(v_invoice_num,''),
     v_invoice_num, 'accounts_receivable_entries', p_entry_id)
  returning id into v_entry;

  perform contab_insert_linea(v_entry, '28050510', v_tercero, null, v_monto, 0);  -- DB Anticipo clientes
  perform contab_insert_linea(v_entry, '13050501', v_tercero, null, 0, v_monto);  -- CR Cartera facturada

  -- 5b) UPDATE atómico de la AR entry (balance es GENERADA, no se toca)
  v_new_advance := coalesce(v_advance,0) + v_monto;
  v_new_status  := case
                     when v_new_advance >= v_invoice_amt then 'PAGADA'
                     when v_new_advance >  0             then 'ABONADA'
                     else 'PENDIENTE'
                   end;
  update accounts_receivable_entries
     set advance_amount = v_new_advance,
         status         = v_new_status,
         paid_date      = case when v_new_advance >= v_invoice_amt then v_fecha else paid_date end
   where id = p_entry_id;

  return v_entry;
end;
$$;
