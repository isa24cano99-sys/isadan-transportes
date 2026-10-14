-- ════════════════════════════════════════════════════════════════════════════
-- Pago del impuesto régimen simple (DIAN) — UN solo asiento CG que salda el pasivo
-- causado (241215) con las fuentes reales de plata, y reconoce la mora como gasto.
--
--   DB 241215  Anticipo régimen simple por pagar  = total − mora   (abono al pasivo)
--   DB 53959510 Intereses por mora (DIAN)          = mora           (si > 0)
--   CR 13251005 Cuenta por cobrar a socios         = reserva        (si > 0, socio)
--   CR 110505  Caja general                        = caja           (si > 0)
--   CR 11100510 Banco                              = banco          (si > 0, enlaza EGRESO)
--
-- Balance: DB (total−mora)+mora = total  =  CR reserva+caja+banco.
--
-- Guards (todos en la función, no en la UI):
--   · total > 0, montos ≥ 0, mora < total
--   · reserva + caja + banco = total  (las fuentes cuadran el pago)
--   · abono al pasivo (total−mora) ≤ saldo 241215 A LA FECHA (asientos fecha ≤ pago)
--   · reserva usada ≤ reserva del socio A LA FECHA (asientos fecha ≤ pago)
--   · si banco > 0: exige enlazar el movimiento bancario + anti-duplicado
--   · periodo no cerrado / no pre-corte
--
-- 241215 y 110505/11100510 NO exigen tercero (como el cierre de reserva). La mora
-- (53959510) y la reserva (13251005) SÍ: DIAN y el socio respectivamente.
-- NO aplica ningún caso real: se invoca desde la pantalla /impuesto. Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_pago_impuesto_simple(
  p_fecha               date,
  p_total               numeric,
  p_mora                numeric default 0,
  p_reserva             numeric default 0,
  p_caja                numeric default 0,
  p_banco               numeric default 0,
  p_bank_transaction_id uuid    default null,
  p_tercero_socio       uuid    default null,
  p_recibo              text    default null
) returns uuid language plpgsql as $$
declare
  v_dian         uuid;
  v_db241        numeric;
  v_saldo241     numeric;
  v_reserva_disp numeric;
  v_entry        uuid;
  v_consec       integer;
  v_dup          uuid;
begin
  -- normalizar nulos
  p_mora    := coalesce(p_mora, 0);
  p_reserva := coalesce(p_reserva, 0);
  p_caja    := coalesce(p_caja, 0);
  p_banco   := coalesce(p_banco, 0);

  if coalesce(p_total, 0) <= 0 then
    raise exception 'El total pagado debe ser mayor que 0'; end if;
  if p_mora < 0 or p_reserva < 0 or p_caja < 0 or p_banco < 0 then
    raise exception 'Los montos no pueden ser negativos'; end if;

  -- las fuentes deben sumar exactamente el total
  if round(p_reserva + p_caja + p_banco, 2) <> round(p_total, 2) then
    raise exception 'Las fuentes no cuadran: reserva % + caja % + banco % = % ≠ total %',
      to_char(p_reserva,'FM999G999G990'), to_char(p_caja,'FM999G999G990'),
      to_char(p_banco,'FM999G999G990'),
      to_char(p_reserva + p_caja + p_banco,'FM999G999G990'), to_char(p_total,'FM999G999G990');
  end if;

  -- abono al pasivo = total − mora
  v_db241 := p_total - p_mora;
  if v_db241 <= 0 then
    raise exception 'La mora (%) no puede ser igual o mayor al total (%)',
      to_char(p_mora,'FM999G999G990'), to_char(p_total,'FM999G999G990'); end if;

  -- periodo
  if periodo_bloqueado(p_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte',
      to_char(p_fecha,'YYYY-MM'); end if;

  -- GUARD saldo del pasivo 241215 A LA FECHA (naturaleza CREDITO: CR−DB, fecha ≤ pago)
  select coalesce(sum(l.credito - l.debito), 0) into v_saldo241
    from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '241215' and e.estado = 'CONTABILIZADO' and e.fecha <= p_fecha;
  if v_db241 > v_saldo241 then
    raise exception 'El abono al impuesto (%) supera el saldo de 241215 a la fecha % (%).',
      to_char(v_db241,'FM999G999G990'), to_char(p_fecha,'YYYY-MM-DD'),
      to_char(v_saldo241,'FM999G999G990'); end if;

  -- GUARD reserva del socio A LA FECHA (naturaleza DEBITO: DB−CR, fecha ≤ pago)
  if p_reserva > 0 then
    if p_tercero_socio is null then
      raise exception 'Para usar la reserva debe indicar el socio'; end if;
    select coalesce(sum(l.debito - l.credito), 0) into v_reserva_disp
      from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
     where l.cuenta_puc = '13251005' and l.tercero_id = p_tercero_socio
       and e.estado = 'CONTABILIZADO' and e.fecha <= p_fecha;
    if p_reserva > v_reserva_disp then
      raise exception 'La reserva usada (%) supera lo reservado del socio a la fecha % (%).',
        to_char(p_reserva,'FM999G999G990'), to_char(p_fecha,'YYYY-MM-DD'),
        to_char(v_reserva_disp,'FM999G999G990'); end if;
  end if;

  -- la mora exige tercero (53959510) → DIAN
  if p_mora > 0 then
    select id into v_dian from terceros
     where numero_identificacion = '800197268' and merged_into is null limit 1;
    if v_dian is null then
      raise exception 'No se encontró el tercero DIAN (NIT 800197268) para la mora'; end if;
  end if;

  -- GUARD banco: enlace obligatorio + anti-duplicado
  if p_banco > 0 then
    if p_bank_transaction_id is null then
      raise exception 'Si se paga con banco, debe enlazar el movimiento bancario (EGRESO)'; end if;
    select id into v_dup from journal_entries
     where origen_tabla = 'bank_transactions' and origen_id = p_bank_transaction_id
       and estado = 'CONTABILIZADO' limit 1;
    if v_dup is not null then
      raise exception 'El movimiento bancario % ya tiene un asiento contabilizado (%)',
        p_bank_transaction_id, v_dup; end if;
  end if;

  -- asiento CG (origen = movimiento bancario solo si hay parte con banco)
  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion,
                               documento_soporte, origen_tabla, origen_id)
    values ('CG', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'),
            'Pago impuesto régimen simple (DIAN)',
            p_recibo,
            case when p_banco > 0 then 'bank_transactions' end,
            case when p_banco > 0 then p_bank_transaction_id end)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '241215', null, null, v_db241, 0);            -- DB pasivo
  if p_mora > 0 then
    perform contab_insert_linea(v_entry, '53959510', v_dian, null, p_mora, 0);       -- DB mora (DIAN)
  end if;
  if p_reserva > 0 then
    perform contab_insert_linea(v_entry, '13251005', p_tercero_socio, null, 0, p_reserva); -- CR reserva (socio)
  end if;
  if p_caja > 0 then
    perform contab_insert_linea(v_entry, '110505', null, null, 0, p_caja);           -- CR caja
  end if;
  if p_banco > 0 then
    perform contab_insert_linea(v_entry, '11100510', null, null, 0, p_banco);        -- CR banco
  end if;

  return v_entry;
end; $$;
