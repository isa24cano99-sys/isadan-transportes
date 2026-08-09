-- ============================================================================
-- Mensaje de rechazo específico en el gasto directo: distinguir la causa exacta
-- (asiento directo / consolidado / FE vinculada) en vez de un genérico "ya está
-- contabilizado". motivo_gasto_ya_contabilizado(bt) devuelve el motivo (o null).
-- postear_gasto_bancario_directo y postear_gastos_consolidados lo usan.
-- Aplicar en SQL Editor.
-- ============================================================================
create or replace function motivo_gasto_ya_contabilizado(p_bt uuid) returns text language sql stable as $$
  select case
    when exists(select 1 from journal_entries e
                 where e.origen_tabla = 'bank_transactions' and e.origen_id = p_bt
                   and e.estado = 'CONTABILIZADO')
      then 'ya tiene un asiento contabilizado directo desde el banco'
    when exists(select 1 from gasto_consolidado_items i
                  join journal_entries e on e.id = i.journal_entry_id
                 where i.bank_transaction_id = p_bt and e.estado = 'CONTABILIZADO')
      then 'ya está dentro de un asiento consolidado'
    when exists(select 1 from bank_transactions bt
                 where bt.id = p_bt and bt.matched_invoice_id is not null)
      then 'pertenece a una factura DIAN vinculada (su costo se contabiliza por el lado de la factura, no por gasto directo)'
    else null
  end;
$$;

-- Se mantiene el booleano (por compatibilidad) como envoltorio del motivo.
create or replace function bt_gasto_contabilizado(p_bt uuid) returns boolean language sql stable as $$
  select motivo_gasto_ya_contabilizado(p_bt) is not null;
$$;

-- ── Posteo INDIVIDUAL: motivo específico ─────────────────────────────────────
create or replace function postear_gasto_bancario_directo(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text; v_puc text; v_pre boolean; v_cat text;
  v_entry uuid; v_consec integer; v_motivo text;
  v_nomina text[] := array['52050610','52052710','52053010','52053310','52053610',
                           '52053910','52056810','52056910','52057010','52057210'];
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description, c.puc_code, bt.periodo_pre_corte, c.name
    into v_ter, v_monto, v_fecha, v_desc, v_puc, v_pre, v_cat
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;

  if coalesce(v_puc,'') = '' then
    raise exception 'El movimiento % no tiene categoría con cuenta contable (puc_code); categorízalo antes de contabilizar', p_bank_transaction_id; end if;
  if left(v_puc,1) not in ('5','6') then
    raise exception 'La cuenta % no es de gasto/costo (clase 5 o 6); no se contabiliza como gasto directo', v_puc; end if;
  if v_puc = any(v_nomina) then
    raise exception 'La cuenta % es de nómina (va por la nómina mensual, no por gasto directo). Un pago de nómina desde el banco baja el pasivo 250505, no re-expensa el gasto — probablemente esté mal categorizado.', v_puc; end if;
  if v_puc = '53152010' then
    raise exception 'El IVA asumido (53152010) se contabiliza al causar el costo DIAN, no por gasto directo.'; end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  if coalesce(v_pre,false) or periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;

  -- anti-duplicado con motivo específico
  v_motivo := motivo_gasto_ya_contabilizado(p_bank_transaction_id);
  if v_motivo is not null then
    raise exception 'El movimiento % no se puede contabilizar como gasto directo: %', p_bank_transaction_id, v_motivo; end if;

  if v_ter is null then
    select id into v_ter from terceros where numero_identificacion='222222222222' and merged_into is null limit 1;
    if v_ter is null then raise exception 'No se encontró el tercero CONSUMIDOR FINAL (222222222222)'; end if;
  end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Gasto ' || coalesce(v_cat,'') || coalesce(' · ' || v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, v_puc,      v_ter, null, v_monto, 0);
  perform contab_insert_linea(v_entry, '11100510', null,  null, 0, v_monto);
  return v_entry;
end; $$;

-- ── Posteo CONSOLIDADO: motivo específico por transacción ────────────────────
create or replace function postear_gastos_consolidados(
  p_bt_ids      uuid[],
  p_descripcion text,
  p_fecha       date
) returns uuid language plpgsql as $$
declare
  v_entry uuid; v_consec integer; v_total numeric := 0; v_mes text;
  v_bt uuid; v_ter uuid; v_monto numeric; v_fbt date; v_puc text; v_pre boolean; v_cf uuid; v_motivo text;
  v_nomina text[] := array['52050610','52052710','52053010','52053310','52053610',
                           '52053910','52056810','52056910','52057010','52057210'];
begin
  if p_bt_ids is null or array_length(p_bt_ids,1) is null or array_length(p_bt_ids,1) < 2 then
    raise exception 'La consolidación requiere al menos 2 transacciones';
  end if;
  if coalesce(trim(p_descripcion),'') = '' then raise exception 'La consolidación requiere una descripción'; end if;
  if p_fecha is null then raise exception 'La consolidación requiere una fecha'; end if;
  if periodo_bloqueado(p_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(p_fecha,'YYYY-MM'); end if;
  v_mes := to_char(p_fecha,'YYYY-MM');

  select id into v_cf from terceros where numero_identificacion='222222222222' and merged_into is null limit 1;
  if v_cf is null then raise exception 'No se encontró el tercero CONSUMIDOR FINAL (222222222222)'; end if;

  -- 1) validar TODA transacción antes de crear el asiento (todo o nada)
  foreach v_bt in array p_bt_ids loop
    select bt.tercero_id, bt.amount, bt.date, c.puc_code, bt.periodo_pre_corte
      into v_ter, v_monto, v_fbt, v_puc, v_pre
      from bank_transactions bt left join transaction_categories c on c.id = bt.category_id
     where bt.id = v_bt;
    if not found then raise exception 'Movimiento % no existe', v_bt; end if;
    if coalesce(v_puc,'') = '' then raise exception 'El movimiento % no tiene cuenta contable (puc_code)', v_bt; end if;
    if left(v_puc,1) not in ('5','6') then raise exception 'La cuenta % (mov %) no es de gasto/costo (clase 5 o 6)', v_puc, v_bt; end if;
    if v_puc = any(v_nomina) then raise exception 'La cuenta % (mov %) es de nómina; no va por gasto directo', v_puc, v_bt; end if;
    if v_puc = '53152010' then raise exception 'El IVA asumido (mov %) no va por gasto directo', v_bt; end if;
    if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', v_bt; end if;
    if coalesce(v_pre,false) or periodo_bloqueado(v_fbt) then raise exception 'El movimiento % es pre-corte/cerrado', v_bt; end if;
    if to_char(v_fbt,'YYYY-MM') <> v_mes then
      raise exception 'El movimiento % es de otro mes (%); todas deben ser del mismo mes que la fecha del asiento (%)', v_bt, to_char(v_fbt,'YYYY-MM'), v_mes; end if;
    v_motivo := motivo_gasto_ya_contabilizado(v_bt);
    if v_motivo is not null then
      raise exception 'El movimiento % no se puede consolidar: %', v_bt, v_motivo; end if;
  end loop;

  -- 2) crear el asiento (una cabecera con la descripción del usuario)
  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla)
    values ('CB', v_consec, p_fecha, v_mes, p_descripcion, p_descripcion, 'bank_transactions')
    returning id into v_entry;

  -- 3) una línea de débito por transacción (a su cuenta, con su tercero) + puente
  foreach v_bt in array p_bt_ids loop
    select bt.tercero_id, bt.amount, c.puc_code
      into v_ter, v_monto, v_puc
      from bank_transactions bt left join transaction_categories c on c.id = bt.category_id
     where bt.id = v_bt;
    perform contab_insert_linea(v_entry, v_puc, coalesce(v_ter, v_cf), null, v_monto, 0);
    insert into gasto_consolidado_items (journal_entry_id, bank_transaction_id) values (v_entry, v_bt);
    v_total := v_total + v_monto;
  end loop;

  -- 4) una sola línea de crédito al banco por el total
  perform contab_insert_linea(v_entry, '11100510', null, null, 0, v_total);
  return v_entry;
end; $$;
