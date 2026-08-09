-- ════════════════════════════════════════════════════════════════════════════
-- Generalización del pago de pasivo desde banco — una sola implementación real para
-- proveedor (220501) y nómina (250505), en vez de funciones casi idénticas.
--
--   postear_pago_pasivo_banco(bank_transaction_id): DB <puc_code de la categoría> ·
--   tercero-del-movimiento / CR 11100510 banco, por el monto del movimiento. La cuenta
--   la determina la CATEGORÍA del movimiento (whitelist 220501 proveedor / 250505 nómina).
--   Guards: tercero presente, pre-corte, monto>0, anti-duplicado por origen. SIN guard de
--   saldo: parciales y excesos son válidos (un saldo negativo en 250505 = se le debe al
--   conductor, información válida, no un estado a bloquear).
--
--   postear_pago_proveedor_banco pasa a ser un WRAPPER delgado → 0 regresión en la app,
--   que lo sigue llamando por su nombre. SS (23709510) conserva su función aparte.
-- Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_pago_pasivo_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text; v_puc text; v_pre boolean;
  v_entry uuid; v_consec integer; v_cb uuid; v_glosa text;
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description, c.puc_code, bt.periodo_pre_corte
    into v_ter, v_monto, v_fecha, v_desc, v_puc, v_pre
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  if v_ter is null then raise exception 'El movimiento % no tiene tercero', p_bank_transaction_id; end if;

  -- GUARD categoría: la cuenta la fija la categoría; solo pasivos pagables por banco con el tercero del movimiento
  if v_puc is null or v_puc not in ('220501','250505') then
    raise exception 'El movimiento % no está categorizado como pago de pasivo válido (220501 proveedor / 250505 nómina); puc=%', p_bank_transaction_id, coalesce(v_puc,'—');
  end if;

  -- GUARD pre-corte: un pago pre-corte ya está reflejado en el saldo de apertura del pasivo
  if coalesce(v_pre, false) or v_fecha < date '2026-07-01' then
    raise exception 'El movimiento % es pre-corte (<= 30-jun): el pasivo ya está en la apertura, no se registra de nuevo', p_bank_transaction_id;
  end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  -- GUARD anti-duplicado: una misma transacción no se contabiliza dos veces
  select id into v_cb from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then
    raise exception 'El movimiento % ya tiene pago contabilizado (asiento %)', p_bank_transaction_id, v_cb;
  end if;

  v_glosa := case v_puc when '220501' then 'Pago a proveedor' when '250505' then 'Pago nómina' else 'Pago pasivo' end;
  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            v_glosa || coalesce(' · ' || v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, v_puc,       v_ter, null, v_monto, 0);  -- DB pasivo (baja) · tercero del movimiento
  perform contab_insert_linea(v_entry, '11100510',  null,  null, 0, v_monto);  -- CR Banco
  return v_entry;
end;
$$;

-- Wrapper: conserva el nombre que la app ya llama; se comporta idéntico para proveedor (220501).
create or replace function postear_pago_proveedor_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
begin
  return postear_pago_pasivo_banco(p_bank_transaction_id);
end;
$$;
