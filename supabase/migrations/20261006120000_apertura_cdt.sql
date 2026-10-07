-- ============================================================================
-- Apertura de CDT (inversión a término) — plata que sale del banco hacia un CDT.
-- Activo clase 12 (inversiones). PUC Decreto 2650: 12 Inversiones → 1225 Certificados
-- → 122505 Certificados de depósito a término. Código 12250505.
--
--   Apertura (desde un movimiento bancario EGRESO categorizado):
--     DB 12250505 CDT (Bancolombia) / CR 11100510 Banco.  Comprobante CB.
--
-- El tercero del CDT es SIEMPRE Bancolombia (NIT 890903938), aunque el movimiento
-- bancario no lo tenga asignado. Vencimiento parametrizado (se guarda en la descripción
-- del asiento). Los intereses se pagan al final del plazo (NO se causan aquí).
--
-- Clasificación: ACTIVO CORRIENTE (vencen < 12 meses).
-- NO construye vencimiento ni causación de intereses (ver memoria cdt-inversion-apertura).
-- (a) cuenta 12250505  (b) categoría bancaria  (c) postear_apertura_cdt.  Aplicar en SQL Editor.
-- ============================================================================

-- (a) Cuenta 12250505 — Certificados de depósito a término (CDT). Idempotente.
insert into puc_accounts (codigo, nombre, tipo, naturaleza, exige_tercero, exige_centro_costo, active)
  select '12250505', 'Certificados de depósito a término (CDT)', 'ACTIVO', 'DEBITO', true, false, true
  where not exists (select 1 from puc_accounts where codigo = '12250505');

-- (b) Categoría bancaria para categorizar la apertura en Bancos. Idempotente.
insert into transaction_categories (name, description, puc_code, type, active)
  select 'Inversión en CDT',
         'Apertura de CDT: plata que sale del banco hacia una inversión a término (DB 12250505)',
         '12250505', 'NEGOCIO', true
  where not exists (select 1 from transaction_categories where puc_code = '12250505');

-- ── (c) postear_apertura_cdt — DB 12250505 (Bancolombia) / CR 11100510 ──────────
--     El monto, la fecha y el movimiento salen del bank_transaction; el vencimiento
--     llega como parámetro y entra en la descripción para distinguir cada CDT.
create or replace function postear_apertura_cdt(p_bank_transaction_id uuid, p_vencimiento date)
returns uuid language plpgsql as $$
declare
  v_monto numeric; v_fecha date; v_desc text; v_puc text; v_pre boolean; v_tipo text;
  v_banco uuid; v_entry uuid; v_consec integer; v_cb uuid;
begin
  select bt.amount, bt.date, bt.description, c.puc_code, bt.periodo_pre_corte, bt.type
    into v_monto, v_fecha, v_desc, v_puc, v_pre, v_tipo
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;

  -- GUARD categoría: debe apuntar a «Inversión en CDT» (12250505)
  if v_puc is distinct from '12250505' then
    raise exception 'El movimiento % no está categorizado como «Inversión en CDT» (12250505); su cuenta es %', p_bank_transaction_id, coalesce(v_puc,'—'); end if;
  -- GUARD dirección: la apertura es plata que SALE del banco al CDT (EGRESO)
  if v_tipo is distinct from 'EGRESO' then
    raise exception 'El movimiento % no es una salida (EGRESO); la apertura de CDT mueve plata del banco al CDT', p_bank_transaction_id; end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;
  -- GUARD vencimiento: obligatorio y posterior a la apertura
  if p_vencimiento is null then raise exception 'Debe indicar la fecha de vencimiento del CDT'; end if;
  if p_vencimiento <= v_fecha then
    raise exception 'El vencimiento (%) debe ser posterior a la fecha de apertura (%)', p_vencimiento, v_fecha; end if;
  -- GUARD pre-corte / periodo cerrado
  if coalesce(v_pre,false) or periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;
  -- GUARD anti-duplicado
  select id into v_cb from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then
    raise exception 'El movimiento % ya tiene un asiento contabilizado (%)', p_bank_transaction_id, v_cb; end if;

  -- Tercero del CDT: SIEMPRE Bancolombia (NIT 890903938), aunque el movimiento no lo tenga
  select id into v_banco from terceros where numero_identificacion = '890903938' and merged_into is null limit 1;
  if v_banco is null then raise exception 'No se encontró el tercero Bancolombia (NIT 890903938)'; end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Apertura CDT ' || lower(to_char(v_fecha,'DD-Mon-YYYY')) || ' (vence ' || lower(to_char(p_vencimiento,'DD-Mon-YYYY')) || ')',
            v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '12250505', v_banco, null, v_monto, 0);  -- DB CDT (Bancolombia)
  perform contab_insert_linea(v_entry, '11100510', null,    null, 0, v_monto);  -- CR banco
  return v_entry;
end; $$;
