-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 · Evento nuevo — Entrega de anticipo a conductor (bank-based).
--   Complemento del evento 5 (porcentaje): el conductor RECIBE el anticipo (lado
--   DÉBITO de 13301510); el porcentaje lo acredita cuando se legaliza el gasto.
--   DB 13301510 Anticipo a trabajadores (tercero=conductor) / CR 11100510 Banco.
--   Gemela de postear_recibo_anticipo_banco. Comprobante CB (Pago Banco, egreso).
--
--   Config previa (idempotente): 13301510 deja de exigir centro de costo — el
--   anticipo se entrega a la PERSONA, no a un vehículo (un conductor maneja varios).
--   No afecta al porcentaje/comisión, que siguen pasando la placa (ahora opcional).
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
update puc_accounts set exige_centro_costo = false where codigo = '13301510';

create or replace function postear_anticipo_conductor_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text;
  v_es_conductor boolean; v_es_anticipo boolean; v_pre_corte boolean;
  v_entry uuid; v_consec integer; v_cb uuid;
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description,
         exists(select 1 from drivers d where d.tercero_id = bt.tercero_id),
         (c.puc_code = '13301510'),
         bt.periodo_pre_corte
    into v_ter, v_monto, v_fecha, v_desc, v_es_conductor, v_es_anticipo, v_pre_corte
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  if v_ter is null then raise exception 'El movimiento % no tiene tercero', p_bank_transaction_id; end if;

  -- GUARD pre-corte: los anticipos <= 30-jun ya están en el asiento de apertura (13301510);
  -- registrarlos de nuevo duplicaría el saldo por conductor.
  if coalesce(v_pre_corte, false) or v_fecha < date '2026-07-01' then
    raise exception 'El movimiento % es pre-corte (<= 30-jun): su anticipo ya está en el asiento de apertura, no se registra de nuevo', p_bank_transaction_id;
  end if;

  -- GUARD es-conductor: el tercero debe ser un conductor (existe en drivers). Atrapa el
  -- caso de un anticipo mal atribuido a un cliente antes de contabilizarlo.
  if not coalesce(v_es_conductor, false) then
    raise exception 'El tercero del movimiento % no es un conductor (no existe en drivers); un anticipo a conductor requiere un conductor', p_bank_transaction_id;
  end if;

  if not coalesce(v_es_anticipo, false) then
    raise exception 'El movimiento % no está categorizado como "Anticipo conductor" (puc 13301510)', p_bank_transaction_id;
  end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  -- GUARD anti-duplicado: una misma transacción no se contabiliza dos veces
  select id into v_cb from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then
    raise exception 'El movimiento % ya tiene entrega de anticipo contabilizada (asiento %)', p_bank_transaction_id, v_cb;
  end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Entrega de anticipo a conductor'||coalesce(' · '||v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '13301510', v_ter, null, v_monto, 0);  -- DB Anticipo a trabajadores (conductor)
  perform contab_insert_linea(v_entry, '11100510', null,  null, 0, v_monto);  -- CR Banco (exige_tercero=false)
  return v_entry;
end;
$$;
