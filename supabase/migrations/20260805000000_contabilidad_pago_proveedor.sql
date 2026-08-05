-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 · Pago a proveedor (bank-based) — pieza de PAGO del evento 7 (peajes).
--   Complemento de la causación mensual: el banco paga el pasivo con el proveedor.
--   DB 220501 Proveedores nacionales (tercero del movimiento) / CR 11100510 Banco.
--   Comprobante CB. Genérica: valida que la categoría apunte a 220501 y lee el
--   tercero del movimiento — reutilizable para cualquier pago a proveedor por 220501,
--   no solo Flypass/F2X.
--   Guards: pre-corte, categoría (puc 220501), monto>0, anti-duplicado (CB por origen).
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_pago_proveedor_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text; v_puc text; v_pre boolean;
  v_entry uuid; v_consec integer; v_cb uuid;
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description, c.puc_code, bt.periodo_pre_corte
    into v_ter, v_monto, v_fecha, v_desc, v_puc, v_pre
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  if v_ter is null then raise exception 'El movimiento % no tiene tercero (proveedor)', p_bank_transaction_id; end if;

  -- GUARD pre-corte: un pago pre-corte ya está reflejado en el saldo de apertura del pasivo
  if coalesce(v_pre, false) or v_fecha < date '2026-07-01' then
    raise exception 'El movimiento % es pre-corte (<= 30-jun): el pasivo ya está en la apertura, no se registra de nuevo', p_bank_transaction_id;
  end if;

  -- GUARD categoría: debe apuntar a 220501 (pago de proveedor)
  if v_puc is distinct from '220501' then
    raise exception 'El movimiento % no está categorizado como pago a proveedor (puc 220501)', p_bank_transaction_id;
  end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  -- GUARD anti-duplicado: una misma transacción no se contabiliza dos veces
  select id into v_cb from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then
    raise exception 'El movimiento % ya tiene pago contabilizado (asiento %)', p_bank_transaction_id, v_cb;
  end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Pago a proveedor' || coalesce(' · ' || v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '220501',   v_ter, null, v_monto, 0);  -- DB Proveedores (baja el pasivo)
  perform contab_insert_linea(v_entry, '11100510', null,  null, 0, v_monto);  -- CR Banco
  return v_entry;
end;
$$;
