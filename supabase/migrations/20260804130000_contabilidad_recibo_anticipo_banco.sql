-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 · Evento 3 (recibo de anticipo de cliente) — versión BANK-BASED con guards.
--   postear_recibo_anticipo (v2) es genérica, sin guard, y usa origen_tabla='client_payments'.
--   Esta versión, gemela de las otras: toma el movimiento bancario directamente y verifica:
--     · el movimiento existe y tiene tercero,
--     · el tercero es cliente (es_cliente=true),
--     · el movimiento está categorizado como "Anticipo de cliente" (puc 28050510) —
--       respeta la clasificación que ya hizo quien categorizó el movimiento en bancos,
--     · monto > 0,
--     · GUARD anti-duplicado: no existe ya un RC contabilizado para ese movimiento.
--   DB 11100510 Banco / CR 28050510 Anticipo clientes. origen_tabla='bank_transactions'.
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_recibo_anticipo_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text;
  v_es_cliente boolean; v_es_anticipo boolean; v_pre_corte boolean;
  v_entry uuid; v_consec integer; v_rc uuid;
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description,
         t.es_cliente,
         (c.puc_code = '28050510'),
         bt.periodo_pre_corte
    into v_ter, v_monto, v_fecha, v_desc, v_es_cliente, v_es_anticipo, v_pre_corte
    from bank_transactions bt
    left join terceros t                on t.id = bt.tercero_id
    left join transaction_categories c  on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  if v_ter is null then raise exception 'El movimiento % no tiene tercero', p_bank_transaction_id; end if;
  -- GUARD pre-corte: los anticipos <= 30-jun ya están en el asiento de apertura (28050510);
  -- registrarlos de nuevo duplicaría. Defensa en profundidad más allá del filtro de pantalla.
  if coalesce(v_pre_corte, false) or v_fecha < date '2026-07-01' then
    raise exception 'El movimiento % es pre-corte (<= 30-jun): su anticipo ya está en el asiento de apertura, no se registra de nuevo', p_bank_transaction_id;
  end if;
  if not coalesce(v_es_cliente, false) then
    raise exception 'El tercero del movimiento % no es cliente; un anticipo de cliente requiere es_cliente=true', p_bank_transaction_id;
  end if;
  if not coalesce(v_es_anticipo, false) then
    raise exception 'El movimiento % no está categorizado como "Anticipo de cliente" (puc 28050510)', p_bank_transaction_id;
  end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  -- GUARD anti-duplicado: una misma transacción no se contabiliza dos veces como anticipo
  select id into v_rc from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='RC' and estado='CONTABILIZADO' limit 1;
  if v_rc is not null then
    raise exception 'El movimiento % ya tiene recibo de anticipo contabilizado (asiento %)', p_bank_transaction_id, v_rc;
  end if;

  v_consec := consecutivo_siguiente('RC');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('RC', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Recibo de anticipo de cliente'||coalesce(' · '||v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '11100510', null,  null, v_monto, 0);  -- DB Banco (sin tercero: exige_tercero=false)
  perform contab_insert_linea(v_entry, '28050510', v_ter, null, 0, v_monto);  -- CR Anticipo clientes
  return v_entry;
end;
$$;
