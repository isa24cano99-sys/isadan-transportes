-- ════════════════════════════════════════════════════════════════════════════
-- FASE 1 · PASO 3 (cont.) — Motor de posting: eventos 2, 3, 6, 7, 8, 9, 10
--   Reutilizan el helper contab_insert_linea (validación + snapshot + concepto)
--   definido en 20260730180000. Cada función = 1 journal_entry + líneas balanceadas.
--   NO postea nada real (PASO 4 diferido). Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- Tipos de comprobante nuevos (idempotentes): CF Facturación, RC Recibo de Caja.
insert into tipos_comprobante (codigo, nombre) values
  ('CF', 'Facturación'),
  ('RC', 'Recibo de Caja')
on conflict (codigo) do nothing;

-- ── Evento 2: Emisión de factura FEIT — DB 13050501 / CR 13050502, comprobante CF ─
create or replace function postear_emision_factura(
  p_tercero uuid, p_monto numeric, p_fecha date,
  p_origen_id uuid default null, p_documento text default null
) returns uuid language plpgsql as $$
declare v_entry uuid; v_consec integer;
begin
  if p_tercero is null then raise exception 'La emisión de factura requiere tercero (cliente)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser > 0'; end if;
  v_consec := consecutivo_siguiente('CF');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CF', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'), 'Emisión factura FEIT', p_documento, 'invoices', p_origen_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '13050501', p_tercero, null, p_monto, 0);  -- DB Cartera facturada
  perform contab_insert_linea(v_entry, '13050502', p_tercero, null, 0, p_monto);  -- CR CxC por facturar
  return v_entry;
end; $$;

-- ── Evento 3: Recibo de anticipo de cliente — DB 11100510 / CR 28050510, comprobante RC ─
create or replace function postear_recibo_anticipo(
  p_tercero uuid, p_monto numeric, p_fecha date,
  p_origen_id uuid default null, p_documento text default null
) returns uuid language plpgsql as $$
declare v_entry uuid; v_consec integer;
begin
  if p_tercero is null then raise exception 'El recibo de anticipo requiere tercero (cliente)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser > 0'; end if;
  v_consec := consecutivo_siguiente('RC');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('RC', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'), 'Recibo de anticipo de cliente', p_documento, 'client_payments', p_origen_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '11100510', null,      null, p_monto, 0);  -- DB Banco (sin tercero: exige_tercero=false)
  perform contab_insert_linea(v_entry, '28050510', p_tercero, null, 0, p_monto);  -- CR Anticipo clientes
  return v_entry;
end; $$;

-- ── Evento 6: Comisión empresa — DB 61450580 / CR 13301510, comprobante CG ────
--    Tercero por defecto = CONSUMIDOR FINAL (222222222222), con override manual (p_tercero).
create or replace function postear_comision_empresa(
  p_placa text, p_monto numeric, p_fecha date,
  p_tercero uuid default null, p_origen_id uuid default null
) returns uuid language plpgsql as $$
declare v_ter uuid; v_entry uuid; v_consec integer;
begin
  v_ter := p_tercero;
  if v_ter is null then
    select id into v_ter from terceros where numero_identificacion='222222222222' and merged_into is null limit 1;
    if v_ter is null then raise exception 'No se encontró el tercero CONSUMIDOR FINAL (222222222222)'; end if;
  end if;
  if coalesce(p_placa,'') = '' then raise exception 'La comisión requiere placa (centro de costo)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser > 0'; end if;
  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CG', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'), 'Comisión empresa · placa '||p_placa, 'legalizations', p_origen_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '61450580', v_ter, p_placa, p_monto, 0);  -- DB Comisión empresa
  perform contab_insert_linea(v_entry, '13301510', v_ter, p_placa, 0, p_monto);  -- CR Anticipo a trabajadores
  return v_entry;
end; $$;

-- ── Evento 7: Peaje causado — DB 61450575 / CR 23809510, comprobante CG ───────
--    Tercero (F2X) OBLIGATORIO: si no se pasa, FALLA con mensaje claro (no CONSUMIDOR
--    FINAL por defecto). Pendiente de resolver el dato real en toll_transactions.
create or replace function postear_peaje(
  p_placa text, p_monto numeric, p_fecha date,
  p_tercero uuid default null, p_origen_id uuid default null
) returns uuid language plpgsql as $$
declare v_entry uuid; v_consec integer;
begin
  if p_tercero is null then
    raise exception 'El peaje requiere el tercero del proveedor (F2X). Pendiente de resolver en toll_transactions; NO se postea sin tercero real.';
  end if;
  if coalesce(p_placa,'') = '' then raise exception 'El peaje requiere placa (centro de costo)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser > 0'; end if;
  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CG', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'), 'Peaje causado · placa '||p_placa, 'toll_transactions', p_origen_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '61450575', p_tercero, p_placa, p_monto, 0);  -- DB Peaje (placa)
  perform contab_insert_linea(v_entry, '23809510', p_tercero, null,    0, p_monto);  -- CR Acreedor Flypass
  return v_entry;
end; $$;

-- ── Evento 9: Causación SIMPLE — DB gasto / CR 241215, comprobante CG ──────────
--    DIFERIDO: la cuenta de gasto SIMPLE (54xxxx) no existe (Fase 4). FALLA claro,
--    no postea con cuenta inventada. Cuando exista la cuenta, se pasa por p_cuenta_gasto.
create or replace function postear_causacion_simple(
  p_monto numeric, p_fecha date, p_cuenta_gasto text default '54050510', p_origen_id uuid default null
) returns uuid language plpgsql as $$
declare v_entry uuid; v_consec integer;
begin
  if not exists (select 1 from puc_accounts where codigo = p_cuenta_gasto) then
    raise exception 'Causación SIMPLE diferida (Fase 4): no existe la cuenta de gasto % — no se postea con cuenta inventada', p_cuenta_gasto;
  end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser > 0'; end if;
  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CG', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'), 'Causación impuesto SIMPLE', 'impuesto', p_origen_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, p_cuenta_gasto, null, null, p_monto, 0);  -- DB gasto SIMPLE
  perform contab_insert_linea(v_entry, '241215',       null, null, 0, p_monto);  -- CR SIMPLE por pagar
  return v_entry;
end; $$;

-- ── Evento 10: Apertura de capital — CR 310505, comprobante CA ────────────────
--    DIFERIDO a PASO 4: falta la cuenta 310505 (bloqueada por puc_accounts_tipo_check)
--    y definir la contrapartida de suscripción del débito. Implementada pero NO ejecutable.
create or replace function postear_apertura_capital(
  p_monto numeric, p_fecha date, p_cuenta_contrapartida text default null
) returns uuid language plpgsql as $$
begin
  raise exception 'Apertura de capital diferida a PASO 4: falta la cuenta de capital (310505, bloqueada por puc_accounts_tipo_check) y definir la contrapartida de suscripción. No se postea incompleto.';
end; $$;

-- ── Evento 8: Nómina mensual (colilla completa) — comprobante CN ─────────────
--    Devengo (DB 52xxx / CR 250505·251015·251510·252010·252510, tercero = conductor)
--    + aportes patronales (DB 52056x/57x conductor / CR 237xx·238xx entidad real).
--    SE QUEDA en grupo 5 (no se reclasifica). Solo se insertan las líneas de los
--    conceptos con monto > 0. Los 4 terceros de aportes tienen default a las
--    entidades fijas (EPS SURA / ARL SURA / COMFAMA / PROTECCION), override-ables.
--    Criterio: los tres conductores se tratan igual con ese default (caja/fondo no
--    se llevan por empleado; eps/arl son texto libre y uno está vacío).
create or replace function postear_nomina_mensual(
  p_conductor           uuid,           -- tercero_id del conductor
  p_periodo             date,           -- fecha del asiento (fin de mes)
  p_sueldo              numeric default 0,
  p_auxilio             numeric default 0,
  p_cesantias           numeric default 0,
  p_intereses_cesantias numeric default 0,
  p_prima               numeric default 0,
  p_vacaciones          numeric default 0,
  p_aporte_eps          numeric default 0,
  p_aporte_arp          numeric default 0,
  p_aporte_pension      numeric default 0,
  p_aporte_caja         numeric default 0,
  p_tercero_eps         uuid default null,
  p_tercero_arp         uuid default null,
  p_tercero_caja        uuid default null,
  p_tercero_fondo       uuid default null,
  p_origen_id           uuid default null
) returns uuid language plpgsql as $$
declare
  v_entry uuid; v_consec integer;
  v_eps uuid; v_arp uuid; v_caja uuid; v_fondo uuid;
begin
  if p_conductor is null then raise exception 'La nómina requiere el tercero del conductor'; end if;
  if coalesce(p_sueldo,0)+coalesce(p_auxilio,0)+coalesce(p_cesantias,0)+coalesce(p_intereses_cesantias,0)
     +coalesce(p_prima,0)+coalesce(p_vacaciones,0)+coalesce(p_aporte_eps,0)+coalesce(p_aporte_arp,0)
     +coalesce(p_aporte_pension,0)+coalesce(p_aporte_caja,0) <= 0 then
    raise exception 'Nómina sin conceptos (todos los montos en 0)';
  end if;

  -- Resolver entidades de aportes (default a las fijas; override por parámetro)
  v_eps   := coalesce(p_tercero_eps,   (select id from terceros where numero_identificacion='800088702' and merged_into is null limit 1));
  v_arp   := coalesce(p_tercero_arp,   (select id from terceros where numero_identificacion='890903790' and merged_into is null limit 1));
  v_caja  := coalesce(p_tercero_caja,  (select id from terceros where numero_identificacion='890900841' and merged_into is null limit 1));
  v_fondo := coalesce(p_tercero_fondo, (select id from terceros where numero_identificacion='800300739' and merged_into is null limit 1));
  if p_aporte_eps     > 0 and v_eps   is null then raise exception 'No se encontró la EPS por defecto (EPS SURA 800088702)'; end if;
  if p_aporte_arp     > 0 and v_arp   is null then raise exception 'No se encontró la ARL por defecto (ARL SURA 890903790)'; end if;
  if p_aporte_caja    > 0 and v_caja  is null then raise exception 'No se encontró la Caja por defecto (COMFAMA 890900841)'; end if;
  if p_aporte_pension > 0 and v_fondo is null then raise exception 'No se encontró el Fondo por defecto (PROTECCION 800300739)'; end if;

  v_consec := consecutivo_siguiente('CN');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CN', v_consec, p_periodo, to_char(p_periodo,'YYYY-MM'), 'Nómina mensual conductor', 'legalizations', p_origen_id)
    returning id into v_entry;

  -- Devengo (tercero = conductor en ambos lados)
  if p_sueldo > 0 then
    perform contab_insert_linea(v_entry,'52050610',p_conductor,null,p_sueldo,0);
    perform contab_insert_linea(v_entry,'250505',  p_conductor,null,0,p_sueldo);
  end if;
  if p_auxilio > 0 then
    perform contab_insert_linea(v_entry,'52052710',p_conductor,null,p_auxilio,0);
    perform contab_insert_linea(v_entry,'250505',  p_conductor,null,0,p_auxilio);
  end if;
  if p_cesantias > 0 then
    perform contab_insert_linea(v_entry,'52053010',p_conductor,null,p_cesantias,0);
    perform contab_insert_linea(v_entry,'251015',  p_conductor,null,0,p_cesantias);
  end if;
  if p_intereses_cesantias > 0 then
    perform contab_insert_linea(v_entry,'52053310',p_conductor,null,p_intereses_cesantias,0);
    perform contab_insert_linea(v_entry,'251510',  p_conductor,null,0,p_intereses_cesantias);
  end if;
  if p_prima > 0 then
    perform contab_insert_linea(v_entry,'52053610',p_conductor,null,p_prima,0);
    perform contab_insert_linea(v_entry,'252010',  p_conductor,null,0,p_prima);
  end if;
  if p_vacaciones > 0 then
    perform contab_insert_linea(v_entry,'52053910',p_conductor,null,p_vacaciones,0);
    perform contab_insert_linea(v_entry,'252510',  p_conductor,null,0,p_vacaciones);
  end if;

  -- Aportes patronales (DB gasto tercero=conductor / CR por pagar tercero=entidad)
  if p_aporte_eps > 0 then
    perform contab_insert_linea(v_entry,'52056910',p_conductor,null,p_aporte_eps,0);
    perform contab_insert_linea(v_entry,'23700510',v_eps,      null,0,p_aporte_eps);
  end if;
  if p_aporte_arp > 0 then
    perform contab_insert_linea(v_entry,'52056810',p_conductor,null,p_aporte_arp,0);
    perform contab_insert_linea(v_entry,'23700610',v_arp,      null,0,p_aporte_arp);
  end if;
  if p_aporte_pension > 0 then
    perform contab_insert_linea(v_entry,'52057010',p_conductor,null,p_aporte_pension,0);
    perform contab_insert_linea(v_entry,'23803010',v_fondo,    null,0,p_aporte_pension);
  end if;
  if p_aporte_caja > 0 then
    perform contab_insert_linea(v_entry,'52057210',p_conductor,null,p_aporte_caja,0);
    perform contab_insert_linea(v_entry,'23701010',v_caja,     null,0,p_aporte_caja);
  end if;

  return v_entry;
end; $$;
