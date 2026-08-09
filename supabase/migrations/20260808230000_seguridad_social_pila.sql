-- ════════════════════════════════════════════════════════════════════════════
-- PIEZA 4 · Seguridad social (PILA) — dos mecanismos, patrón real de los contadores.
--   El pasivo de aportes se consolida cada mes de las 4 cuentas individuales hacia una
--   sola cuenta 23709510 (Seguridad social por pagar) a nombre del operador PILA
--   (Aportes en Línea), y luego el banco paga ese pasivo consolidado.
--
--  A) postear_consolidacion_ss_mensual(p_periodo, p_monto_real):
--     DB cada (cuenta, tercero) de 23700510/23700610/23701010/23803010 por su SALDO
--     pendiente (23803010 se parte por fondo real: Colpensiones vs Protección) / CR 23709510
--     por el monto REAL de la planilla; la diferencia de redondeo va a 52959515 (Ajuste al peso).
--  B) postear_pago_ss_banco(p_bank_transaction_id):
--     DB 23709510 · Aportes en Línea / CR 11100510 banco, por el monto del movimiento.
--     Guard: no exceder el saldo pendiente de 23709510. Pre-corte NO aplica (es un pago).
--
-- Junio ya está consolidado en la apertura (CA-1: 23709510 = 1.341.000); su pago usa (B).
-- Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- 52959515 sin naturaleza → es un gasto (DEBITO)
update puc_accounts set naturaleza='DEBITO' where codigo='52959515' and naturaleza is null;

-- ── A) Consolidación mensual: 4 cuentas → 23709510 ──────────────────────────
create or replace function postear_consolidacion_ss_mensual(
  p_periodo    date,
  p_monto_real numeric default null   -- total real de la planilla PILA; null → usa el causado
) returns uuid language plpgsql as $$
declare
  v_operador uuid; v_entry uuid; v_consec integer;
  v_causado numeric := 0; v_real numeric; v_ajuste numeric; r record;
begin
  select id into v_operador from terceros where numero_identificacion='900147238' and merged_into is null limit 1;
  if v_operador is null then raise exception 'No existe el tercero Aportes en Línea (900147238)'; end if;
  if periodo_bloqueado(p_periodo) then
    raise exception 'No se puede consolidar: el periodo % está cerrado o es pre-corte', to_char(p_periodo,'YYYY-MM');
  end if;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CG', v_consec, (date_trunc('month',p_periodo)+interval '1 month' - interval '1 day')::date,
            to_char(p_periodo,'YYYY-MM'),
            'Consolidación seguridad social '||to_char(p_periodo,'YYYY-MM')||' → Aportes en Línea',
            'consolidacion_ss', null)
    returning id into v_entry;

  -- DB cada (cuenta, tercero) por su SALDO pendiente (23803010 agrupado por fondo real)
  for r in
    select l.cuenta_puc, l.tercero_id, sum(l.credito - l.debito) as saldo
      from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
     where e.estado='CONTABILIZADO'
       and l.cuenta_puc in ('23700510','23700610','23701010','23803010')
     group by l.cuenta_puc, l.tercero_id
    having sum(l.credito - l.debito) > 0
  loop
    perform contab_insert_linea(v_entry, r.cuenta_puc, r.tercero_id, null, r.saldo, 0);
    v_causado := v_causado + r.saldo;
  end loop;
  if v_causado <= 0 then
    raise exception 'No hay causación pendiente de consolidar en las cuentas de seguridad social (¿ya se consolidó este mes?)';
  end if;

  v_real   := coalesce(p_monto_real, v_causado);
  v_ajuste := v_real - v_causado;
  if v_ajuste > 0 then
    perform contab_insert_linea(v_entry, '52959515', v_operador, null, v_ajuste, 0);   -- DB ajuste al peso
  elsif v_ajuste < 0 then
    perform contab_insert_linea(v_entry, '52959515', v_operador, null, 0, -v_ajuste);  -- CR ajuste al peso
  end if;
  perform contab_insert_linea(v_entry, '23709510', v_operador, null, 0, v_real);       -- CR seguridad social por pagar

  return v_entry;
end; $$;

-- ── B) Pago bancario del pasivo consolidado 23709510 ────────────────────────
create or replace function postear_pago_ss_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_monto numeric; v_fecha date; v_desc text; v_puc text; v_operador uuid;
  v_saldo numeric; v_entry uuid; v_consec integer; v_dup uuid;
begin
  select bt.amount, bt.date, bt.description, c.puc_code
    into v_monto, v_fecha, v_desc, v_puc
    from bank_transactions bt left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  if v_puc is distinct from '23709510' then
    raise exception 'El movimiento % no está categorizado como pago de seguridad social (puc 23709510)', p_bank_transaction_id;
  end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  select id into v_dup from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_dup is not null then raise exception 'El movimiento % ya tiene pago contabilizado (asiento %)', p_bank_transaction_id, v_dup; end if;

  select id into v_operador from terceros where numero_identificacion='900147238' and merged_into is null limit 1;
  if v_operador is null then raise exception 'No existe el tercero Aportes en Línea (900147238)'; end if;

  -- GUARD: no pagar más de lo que se debe (saldo pendiente de 23709510 con el operador)
  select coalesce(sum(credito - debito),0) into v_saldo
    from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
   where e.estado='CONTABILIZADO' and l.cuenta_puc='23709510' and l.tercero_id = v_operador;
  if v_monto > v_saldo + 1 then
    raise exception 'El pago (%) excede el saldo pendiente de seguridad social (%) — no se puede pagar más de lo que se debe', v_monto, v_saldo;
  end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Pago seguridad social (PILA)' || coalesce(' · ' || v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '23709510', v_operador, null, v_monto, 0);  -- DB baja el pasivo
  perform contab_insert_linea(v_entry, '11100510', null,      null, 0, v_monto);   -- CR banco
  return v_entry;
end; $$;
