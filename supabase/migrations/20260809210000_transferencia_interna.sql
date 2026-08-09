-- ============================================================================
-- Transferencia interna banco ↔ caja: un movimiento de la propia plata de la empresa
-- entre dos cuentas de tesorería propias (no gasto, no ingreso). La dirección la marca
-- el tipo de la transacción:
--   · EGRESO  (banco→caja): DB 110505 Caja / CR 11100510 Banco
--   · INGRESO (caja→banco): DB 11100510 Banco / CR 110505 Caja
-- 110505 pasa a exige_tercero=false (cuenta de tesorería propia, como 11100510) → ambas
-- líneas sin tercero (movimiento interno puro, no hay tercero real).
-- Guards: categoría apunta a 110505, monto>0, pre-corte, anti-duplicado. Comprobante CB.
-- Aplicar en SQL Editor.
-- ============================================================================
update puc_accounts set exige_tercero = false where codigo = '110505';

create or replace function postear_transferencia_interna(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_monto numeric; v_fecha date; v_desc text; v_puc text; v_tipo text; v_pre boolean;
  v_entry uuid; v_consec integer; v_cb uuid; v_debe_caja boolean;
begin
  select bt.amount, bt.date, bt.description, c.puc_code, bt.type, bt.periodo_pre_corte
    into v_monto, v_fecha, v_desc, v_puc, v_tipo, v_pre
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;

  -- GUARD categoría: debe apuntar a Caja general (110505)
  if v_puc is distinct from '110505' then
    raise exception 'El movimiento % no está categorizado como transferencia a Caja general (110505); su cuenta es %', p_bank_transaction_id, coalesce(v_puc,'—'); end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  -- GUARD pre-corte / periodo cerrado
  if coalesce(v_pre,false) or periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;

  -- GUARD anti-duplicado: el movimiento no puede tener ya un asiento CB contabilizado
  select id into v_cb from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then
    raise exception 'El movimiento % ya tiene un asiento contabilizado (%)', p_bank_transaction_id, v_cb; end if;

  -- dirección por tipo: EGRESO = sale del banco hacia caja (DB caja); INGRESO = entra al banco desde caja (DB banco)
  v_debe_caja := (v_tipo = 'EGRESO');

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Transferencia interna ' || case when v_debe_caja then 'banco → caja' else 'caja → banco' end
              || coalesce(' · ' || v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  if v_debe_caja then
    perform contab_insert_linea(v_entry, '110505',   null, null, v_monto, 0);  -- DB Caja
    perform contab_insert_linea(v_entry, '11100510', null, null, 0, v_monto);  -- CR Banco
  else
    perform contab_insert_linea(v_entry, '11100510', null, null, v_monto, 0);  -- DB Banco
    perform contab_insert_linea(v_entry, '110505',   null, null, 0, v_monto);  -- CR Caja
  end if;
  return v_entry;
end; $$;
