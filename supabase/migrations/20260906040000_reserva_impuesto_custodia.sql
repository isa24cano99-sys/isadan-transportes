-- ============================================================================
-- Reserva para impuestos (custodia socio) — plata propia de la empresa entregada
-- temporalmente a un socio para resguardar el pago de un impuesto futuro (RST).
-- Es un activo deudor (cuenta por cobrar al socio), 1325.
--
--   Pata 1 · registrar reserva (salida del banco):  DB 13251005 (socio) / CR 11100510
--   Pata 2 · cierre contra el impuesto ya causado:  DB 241215 / CR 13251005 (socio)
--
-- La Pata 2 NO causa el impuesto: exige que 241215 ya tenga saldo causado
-- (DB gasto / CR 241215 va por otro lado, con la fórmula 2593 real). Solo cancela
-- el pasivo con la plata reservada, con cierre parcial permitido (monto ≤ tope).
--
-- (a) cuenta 13251005  (b) categoría bancaria  (c) postear_reserva_impuesto_banco
-- (d) postear_cierre_reserva_impuesto.  Aplicar en SQL Editor.
-- ============================================================================

-- (a) Cuenta 1325 — cuenta por cobrar a socios (hoja postable, espeja 23551005 por pagar
--     a socios). NO lleva "Efectivo": la plata está en manos del socio, no bajo control
--     directo de la empresa. Idempotente.
insert into puc_accounts (codigo, nombre, tipo, naturaleza, exige_tercero, exige_centro_costo, active)
  select '13251005', 'Cuentas por cobrar a socios - reserva impuesto', 'ACTIVO', 'DEBITO', true, false, true
  where not exists (select 1 from puc_accounts where codigo = '13251005');
-- Rename para BDs donde la cuenta ya existía con el nombre viejo ("Efectivo reservado…").
update puc_accounts set nombre = 'Cuentas por cobrar a socios - reserva impuesto'
 where codigo = '13251005' and nombre = 'Efectivo reservado para impuestos (custodia socio)';

-- (b) Categoría bancaria para categorizar la salida real en Bancos. Idempotente.
insert into transaction_categories (name, description, puc_code, type, active)
  select 'Reserva para impuestos (custodia socio)',
         'Plata entregada a un socio para resguardar el pago de un impuesto futuro (DB 13251005)',
         '13251005', 'NEGOCIO', true
  where not exists (select 1 from transaction_categories where puc_code = '13251005');

-- ── (c) Pata 1 — registrar la reserva (salida del banco hacia el socio) ──────────
--     DB 13251005 (socio) / CR 11100510 Banco. Comprobante CB. El socio y el monto
--     salen del movimiento bancario categorizado (no se fijan en código).
create or replace function postear_reserva_impuesto_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text; v_puc text; v_pre boolean; v_tipo text;
  v_entry uuid; v_consec integer; v_cb uuid;
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description, c.puc_code, bt.periodo_pre_corte, bt.type
    into v_ter, v_monto, v_fecha, v_desc, v_puc, v_pre, v_tipo
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;

  -- GUARD categoría: debe apuntar a la reserva (13251005)
  if v_puc is distinct from '13251005' then
    raise exception 'El movimiento % no está categorizado como «Reserva para impuestos (custodia socio)» (13251005); su cuenta es %', p_bank_transaction_id, coalesce(v_puc,'—'); end if;
  -- GUARD dirección: la reserva es plata que SALE del banco hacia el socio (EGRESO)
  if v_tipo is distinct from 'EGRESO' then
    raise exception 'El movimiento % no es una salida (EGRESO); la reserva registra plata que sale del banco hacia el socio', p_bank_transaction_id; end if;
  -- GUARD socio: la cuenta exige tercero (el socio); debe venir asignado en Bancos
  if v_ter is null then
    raise exception 'El movimiento % no tiene socio (tercero) asignado; asígnalo en Bancos antes de registrar la reserva', p_bank_transaction_id; end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  -- GUARD pre-corte / periodo cerrado
  if coalesce(v_pre,false) or periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;

  -- GUARD anti-duplicado
  select id into v_cb from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then
    raise exception 'El movimiento % ya tiene un asiento contabilizado (%)', p_bank_transaction_id, v_cb; end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Reserva para impuestos (custodia socio)' || coalesce(' · ' || v_desc, ''),
            v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '13251005', v_ter, null, v_monto, 0);  -- DB reserva (socio)
  perform contab_insert_linea(v_entry, '11100510', null, null, 0, v_monto);   -- CR banco
  return v_entry;
end; $$;

-- ── (d) Pata 2 — cerrar la reserva contra el impuesto ya causado ─────────────────
--     DB 241215 / CR 13251005 (socio). Comprobante CG (sin movimiento bancario).
--     Cierre parcial permitido: monto ≤ min(saldo 241215 causado, reserva del socio).
create or replace function postear_cierre_reserva_impuesto(p_tercero uuid, p_monto numeric, p_fecha date)
returns uuid language plpgsql as $$
declare
  v_saldo_241215 numeric; v_saldo_reserva numeric;
  v_entry uuid; v_consec integer;
begin
  if p_tercero is null then raise exception 'Debe indicar el socio (tercero)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto a cerrar debe ser > 0'; end if;
  if periodo_bloqueado(p_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(p_fecha,'YYYY-MM'); end if;

  -- GUARD saldo causado en 241215 (naturaleza CREDITO): sum(credito - debito) ≥ monto
  select coalesce(sum(l.credito - l.debito),0) into v_saldo_241215
    from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '241215' and e.estado = 'CONTABILIZADO';
  if v_saldo_241215 < p_monto then
    raise exception 'El impuesto causado en 241215 (%) es menor al monto a cerrar (%). Primero causa el RST del bimestre (DB gasto / CR 241215).',
      to_char(v_saldo_241215,'FM999G999G999G990'), to_char(p_monto,'FM999G999G999G990'); end if;

  -- GUARD reserva vigente del socio en 13251005 (naturaleza DEBITO): sum(debito - credito) ≥ monto
  select coalesce(sum(l.debito - l.credito),0) into v_saldo_reserva
    from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '13251005' and l.tercero_id = p_tercero and e.estado = 'CONTABILIZADO';
  if v_saldo_reserva < p_monto then
    raise exception 'La reserva vigente del socio (%) es menor al monto a cerrar (%).',
      to_char(v_saldo_reserva,'FM999G999G999G990'), to_char(p_monto,'FM999G999G999G990'); end if;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion)
    values ('CG', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'),
            'Cierre reserva impuestos contra RST causado (custodia socio)')
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '241215',   null,      null, p_monto, 0);  -- DB pasivo impuesto
  perform contab_insert_linea(v_entry, '13251005', p_tercero, null, 0, p_monto);  -- CR reserva (socio)
  return v_entry;
end; $$;
