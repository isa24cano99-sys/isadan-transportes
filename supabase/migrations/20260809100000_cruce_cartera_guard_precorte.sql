-- ============================================================================
-- Defensa en profundidad — guard de PERIODO en postear_cruce_cartera_v2.
--   El guard existente usa v_fecha = GREATEST(fecha CF, fecha RC) (fecha del asiento),
--   que para una factura pre-corte cuyo tercero tiene un RC de julio resuelve a julio
--   → NO bloquea. Se agrega un guard sobre el issue_date de la PROPIA factura (AR entry):
--   una factura pre-corte (<= 2026-06) ya está neta en la apertura (CA-1) y cruzarla
--   duplicaría contra ese saldo histórico. Mismo criterio periodo_bloqueado() que el
--   resto de los eventos. Cierra el hueco aunque se llame el RPC directo (sin pantalla).
--   Aplicar en SQL Editor.
-- ============================================================================
create or replace function postear_cruce_cartera_v2(p_entry_id uuid)
returns uuid language plpgsql as $$
declare
  v_tercero      uuid;
  v_invoice_num  text;
  v_invoice_amt  numeric;
  v_advance      numeric;
  v_invoice_date date;      -- fecha de la factura (para el guard de periodo)
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
  select tercero_id, invoice_number, invoice_amount, advance_amount, invoice_date
    into v_tercero, v_invoice_num, v_invoice_amt, v_advance, v_invoice_date
    from accounts_receivable_entries
   where id = p_entry_id;
  if not found then
    raise exception 'La cartera (AR entry) % no existe', p_entry_id;
  end if;
  if v_tercero is null then
    raise exception 'La AR entry % (%) no tiene tercero_id; no se puede cruzar', p_entry_id, v_invoice_num;
  end if;

  -- GUARD pre-corte (defensa en profundidad): una factura <= 2026-06 ya está neta en la
  -- apertura (CA-1); cruzar su anticipo/cartera duplicaría contra ese saldo histórico.
  -- Se evalúa sobre el issue_date de la factura, no sobre la fecha del asiento (que puede
  -- ser de julio por el RC del anticipo y dejar pasar un pre-corte).
  if v_invoice_date is null then
    raise exception 'La factura % no tiene fecha (invoice_date); no se puede validar el periodo', v_invoice_num;
  end if;
  if periodo_bloqueado(v_invoice_date) then
    raise exception 'No se puede cruzar: la factura % es de un periodo cerrado o pre-corte (%)', v_invoice_num, to_char(v_invoice_date,'YYYY-MM');
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

  -- GUARD periodo cerrado/pre-corte sobre la fecha del asiento (centralizado en periodos_contables)
  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
  end if;


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
