-- ============================================================================
-- Ingreso financiero recibido en el banco (intereses bancarios, ajuste al peso, etc.):
-- un ingreso clase 4 que entra a la cuenta bancaria. DB 11100510 Banco / CR [cuenta
-- clase 4 de la categoría]. Espejo del gasto directo, pero para ingresos.
--   Guards: categoría con cuenta clase 4, NO 41450510 (ingreso por flete → va por
--   facturación con su FEIT), la transacción debe ser INGRESO, monto>0, pre-corte,
--   anti-duplicado. Comprobante CB (originado en banco). Sin tercero (tesorería + ingreso).
-- Aplicar en SQL Editor.
-- ============================================================================
create or replace function postear_ingreso_financiero_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_monto numeric; v_fecha date; v_desc text; v_puc text; v_tipo text; v_pre boolean; v_cat text;
  v_tercero uuid; v_cf uuid;
  v_entry uuid; v_consec integer; v_cb uuid;
begin
  select bt.amount, bt.date, bt.description, c.puc_code, bt.type, bt.periodo_pre_corte, c.name, bt.tercero_id
    into v_monto, v_fecha, v_desc, v_puc, v_tipo, v_pre, v_cat, v_tercero
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  -- Consumidor Final de respaldo (la cuenta de ingreso exige tercero; los intereses traen el banco)
  select id into v_cf from terceros where numero_identificacion = '222222222222' limit 1;

  if coalesce(v_puc,'') = '' then
    raise exception 'El movimiento % no tiene categoría con cuenta contable (puc_code); categorízalo antes de contabilizar', p_bank_transaction_id; end if;
  -- GUARD clase 4 (ingreso)
  if left(v_puc,1) <> '4' then
    raise exception 'La cuenta % no es de ingreso (clase 4); este mecanismo es solo para ingresos financieros', v_puc; end if;
  -- GUARD flete: el ingreso por transporte (41450510) se reconoce por la FEIT (facturación), no aquí
  if v_puc = '41450510' then
    raise exception 'El ingreso por flete (41450510) se reconoce con la factura FEIT (pantalla Facturación), no como ingreso financiero directo'; end if;
  -- GUARD dirección: un ingreso entra al banco (INGRESO), no sale
  if v_tipo is distinct from 'INGRESO' then
    raise exception 'El movimiento % no es un INGRESO (es %); un ingreso financiero debe entrar al banco', p_bank_transaction_id, coalesce(v_tipo,'—'); end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  if coalesce(v_pre,false) or periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;

  select id into v_cb from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then
    raise exception 'El movimiento % ya tiene un asiento contabilizado (%)', p_bank_transaction_id, v_cb; end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Ingreso ' || coalesce(v_cat,'') || coalesce(' · ' || v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '11100510', null, null, v_monto, 0);  -- DB Banco
  -- CR Ingreso (clase 4): la cuenta exige tercero → tercero del movimiento (el banco), o Consumidor Final
  perform contab_insert_linea(v_entry, v_puc, coalesce(v_tercero, v_cf), null, 0, v_monto);
  return v_entry;
end; $$;
