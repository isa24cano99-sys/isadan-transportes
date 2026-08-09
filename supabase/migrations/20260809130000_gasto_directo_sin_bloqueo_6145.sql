-- ============================================================================
-- Corrección: postear_gasto_bancario_directo ya NO bloquea 6145xx.
--   El criterio real: la legalización es EXCLUSIVAMENTE lo pagado con el anticipo
--   del conductor (13301510). Un gasto 6145xx que salió DIRECTO del banco (sin pasar
--   por anticipo) es, por definición, un gasto bancario directo — dos fuentes de pago
--   mutuamente excluyentes, sin superposición posible sobre la misma bank_transaction.
--   Evidencia: de 26 tx 6145xx bancarias, 0 tienen conductor como tercero; todas son
--   proveedores/estaciones/Consumidor Final (pagos directos de la empresa).
--   Se conservan los demás guards, incluidos nómina/IVA (esos SÍ tienen mecanismo
--   propio y duplicarían). El anti-duplicado (CB por bank_transaction) sigue protegiendo.
--   Aplicar en SQL Editor.
-- ============================================================================
create or replace function postear_gasto_bancario_directo(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text; v_puc text; v_pre boolean; v_cat text;
  v_entry uuid; v_consec integer; v_cb uuid;
  -- cuentas 5/6 con mecanismo propio (no van por gasto directo — duplicarían)
  v_nomina text[] := array['52050610','52052710','52053010','52053310','52053610',
                           '52053910','52056810','52056910','52057010','52057210'];
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description, c.puc_code, bt.periodo_pre_corte, c.name
    into v_ter, v_monto, v_fecha, v_desc, v_puc, v_pre, v_cat
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;

  -- GUARD categoría con cuenta contable
  if coalesce(v_puc,'') = '' then
    raise exception 'El movimiento % no tiene categoría con cuenta contable (puc_code); categorízalo antes de contabilizar', p_bank_transaction_id;
  end if;
  -- GUARD clase 5/6
  if left(v_puc,1) not in ('5','6') then
    raise exception 'La cuenta % no es de gasto/costo (clase 5 o 6); no se contabiliza como gasto directo', v_puc;
  end if;
  -- (Se retiró el bloqueo de 6145xx: un costo operativo pagado directo del banco, sin
  --  anticipo de conductor, es un gasto bancario directo legítimo.)
  -- GUARD mecanismo propio (nómina-devengo / IVA asumido)
  if v_puc = any(v_nomina) then
    raise exception 'La cuenta % es de nómina (va por la nómina mensual, no por gasto directo). Un pago de nómina desde el banco baja el pasivo 250505, no re-expensa el gasto — probablemente esté mal categorizado.', v_puc;
  end if;
  if v_puc = '53152010' then
    raise exception 'El IVA asumido (53152010) se contabiliza al causar el costo DIAN, no por gasto directo.';
  end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  -- GUARD pre-corte / periodo cerrado
  if coalesce(v_pre,false) or periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
  end if;

  -- GUARD anti-duplicado: el movimiento no puede tener ya un asiento CB contabilizado
  select id into v_cb from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then
    raise exception 'El movimiento % ya tiene un asiento contabilizado (%)', p_bank_transaction_id, v_cb;
  end if;

  -- Tercero: el del movimiento; si no hay, Consumidor Final
  if v_ter is null then
    select id into v_ter from terceros where numero_identificacion='222222222222' and merged_into is null limit 1;
    if v_ter is null then raise exception 'No se encontró el tercero CONSUMIDOR FINAL (222222222222)'; end if;
  end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Gasto ' || coalesce(v_cat,'') || coalesce(' · ' || v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, v_puc,      v_ter, null, v_monto, 0);  -- DB Gasto/Costo (clase 5/6)
  perform contab_insert_linea(v_entry, '11100510', null,  null, 0, v_monto);  -- CR Banco
  return v_entry;
end; $$;
