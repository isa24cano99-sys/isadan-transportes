-- ============================================================================
-- FASE 4 · PASO 1 (pieza 1) — Cierre de periodo: bloqueo centralizado.
--   Reemplaza el literal 2026-07-01 (copiado en 8 funciones) por la tabla
--   periodos_contables consultada vía periodo_bloqueado(). Agrega el guard a las
--   3 que no lo tenían (causación, emisión, cruce). CAMBIO DE COMPORTAMIENTO:
--   de fecha fija a consulta dinámica (un periodo CERRADO bloquea; se reabre si hace falta).
--   Aplicar en SQL Editor.
-- ============================================================================
create table if not exists periodos_contables (
  periodo      text primary key,
  estado       text not null default 'ABIERTO' check (estado in ('ABIERTO','CERRADO')),
  fecha_cierre timestamptz,
  cerrado_por  text,
  created_at   timestamptz default now()
);
alter table periodos_contables disable row level security;
grant all on periodos_contables to service_role;
insert into periodos_contables (periodo, estado) values ('2026-07','ABIERTO') on conflict (periodo) do nothing;

-- Bloqueado = pre-corte de apertura (<= 2026-06, piso fijo) o periodo marcado CERRADO.
-- Ausencia de fila = ABIERTO (periodos futuros postean sin fila hasta que se cierren).
create or replace function periodo_bloqueado(p_fecha date) returns boolean language sql stable as $$
  select to_char(p_fecha,'YYYY-MM') < '2026-07'
      or exists (select 1 from periodos_contables where periodo = to_char(p_fecha,'YYYY-MM') and estado = 'CERRADO');
$$;

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
  if coalesce(v_pre_corte, false) or periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
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

create or replace function postear_porcentaje_conductor(
  p_driver_id uuid,
  p_placa     text,
  p_monto     numeric,
  p_fecha     date,
  p_origen_id uuid default null
) returns uuid language plpgsql as $$
declare v_ter uuid; v_entry uuid; v_consec integer; v_dup uuid;
begin
  select tercero_id into v_ter from drivers where id = p_driver_id;
  if not found then raise exception 'Conductor % no existe', p_driver_id; end if;
  if v_ter is null then raise exception 'El conductor % no tiene tercero_id enlazado', p_driver_id; end if;
  if coalesce(p_placa,'') = '' then raise exception 'El porcentaje requiere placa (centro de costo)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser > 0'; end if;

  -- GUARD pre-corte: nada anterior al corte de apertura (ya está en CA-1 / 3610)
  if periodo_bloqueado(p_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(p_fecha,'YYYY-MM');
  end if;

  -- GUARD anti-duplicado POR CUENTA: no repetir el CG de porcentaje (61450550) de esta legalización
  if p_origen_id is not null then
    select e.id into v_dup
      from journal_entries e
      join journal_entry_lines l on l.journal_entry_id = e.id
     where e.origen_tabla = 'legalizations' and e.origen_id = p_origen_id
       and e.tipo_comprobante = 'CG' and e.estado = 'CONTABILIZADO'
       and l.cuenta_puc = '61450550'
     limit 1;
    if v_dup is not null then
      raise exception 'La legalización % ya tiene porcentaje conductor contabilizado (asiento %)', p_origen_id, v_dup;
    end if;
  end if;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries
    (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
  values
    ('CG', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'),
     'Porcentaje conductor · placa '||p_placa, 'legalizations', p_origen_id)
  returning id into v_entry;

  perform contab_insert_linea(v_entry, '61450550', v_ter, p_placa, p_monto, 0);  -- DB Porcentaje
  perform contab_insert_linea(v_entry, '13301510', v_ter, p_placa, 0, p_monto);  -- CR Anticipo a trabajadores
  return v_entry;
end;
$$;

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
  v_dup uuid;
begin
  if p_conductor is null then raise exception 'La nómina requiere el tercero del conductor'; end if;
  if coalesce(p_sueldo,0)+coalesce(p_auxilio,0)+coalesce(p_cesantias,0)+coalesce(p_intereses_cesantias,0)
     +coalesce(p_prima,0)+coalesce(p_vacaciones,0)+coalesce(p_aporte_eps,0)+coalesce(p_aporte_arp,0)
     +coalesce(p_aporte_pension,0)+coalesce(p_aporte_caja,0) <= 0 then
    raise exception 'Nómina sin conceptos (todos los montos en 0)';
  end if;

  -- GUARD pre-corte: nada anterior al corte de apertura (provisiones ya en CA-1, gasto en 3610)
  if periodo_bloqueado(p_periodo) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(p_periodo,'YYYY-MM');
  end if;

  -- GUARD anti-duplicado por (conductor, mes): una nómina por conductor por periodo
  select e.id into v_dup
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
   where e.tipo_comprobante = 'CN' and e.estado = 'CONTABILIZADO'
     and e.periodo = to_char(p_periodo,'YYYY-MM')
     and l.tercero_id = p_conductor
     and l.cuenta_puc like '5205%'
   limit 1;
  if v_dup is not null then
    raise exception 'El conductor % ya tiene nómina contabilizada para % (asiento %)', p_conductor, to_char(p_periodo,'YYYY-MM'), v_dup;
  end if;

  -- Resolver entidades de aportes (default a las fijas; override por parámetro)
  v_eps   := coalesce(p_tercero_eps,   (select id from terceros where numero_identificacion='800088702' and merged_into is null limit 1));
  v_arp   := coalesce(p_tercero_arp,   (select id from terceros where numero_identificacion='890903790' and merged_into is null limit 1));
  v_caja  := coalesce(p_tercero_caja,  (select id from terceros where numero_identificacion='890900841' and merged_into is null limit 1));
  v_fondo := coalesce(p_tercero_fondo, (select id from terceros where numero_identificacion='800229739' and merged_into is null limit 1));
  if p_aporte_eps     > 0 and v_eps   is null then raise exception 'No se encontró la EPS por defecto (EPS SURA 800088702)'; end if;
  if p_aporte_arp     > 0 and v_arp   is null then raise exception 'No se encontró la ARL por defecto (ARL SURA 890903790)'; end if;
  if p_aporte_caja    > 0 and v_caja  is null then raise exception 'No se encontró la Caja por defecto (COMFAMA 890900841)'; end if;
  if p_aporte_pension > 0 and v_fondo is null then raise exception 'No se encontró el Fondo por defecto (PROTECCION 800229739)'; end if;

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

create or replace function postear_anticipo_conductor_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text;
  v_es_conductor boolean; v_es_anticipo boolean; v_pre_corte boolean;
  v_entry uuid; v_consec integer; v_cb uuid;
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description,
         exists(select 1 from drivers d where d.tercero_id = bt.tercero_id),
         (c.puc_code = '13301510'),
         bt.periodo_pre_corte
    into v_ter, v_monto, v_fecha, v_desc, v_es_conductor, v_es_anticipo, v_pre_corte
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  if v_ter is null then raise exception 'El movimiento % no tiene tercero', p_bank_transaction_id; end if;

  -- GUARD pre-corte: los anticipos <= 30-jun ya están en el asiento de apertura (13301510);
  -- registrarlos de nuevo duplicaría el saldo por conductor.
  if coalesce(v_pre_corte, false) or periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
  end if;

  -- GUARD es-conductor: el tercero debe ser un conductor (existe en drivers). Atrapa el
  -- caso de un anticipo mal atribuido a un cliente antes de contabilizarlo.
  if not coalesce(v_es_conductor, false) then
    raise exception 'El tercero del movimiento % no es un conductor (no existe en drivers); un anticipo a conductor requiere un conductor', p_bank_transaction_id;
  end if;

  if not coalesce(v_es_anticipo, false) then
    raise exception 'El movimiento % no está categorizado como "Anticipo conductor" (puc 13301510)', p_bank_transaction_id;
  end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  -- GUARD anti-duplicado: una misma transacción no se contabiliza dos veces
  select id into v_cb from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then
    raise exception 'El movimiento % ya tiene entrega de anticipo contabilizada (asiento %)', p_bank_transaction_id, v_cb;
  end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Entrega de anticipo a conductor'||coalesce(' · '||v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '13301510', v_ter, null, v_monto, 0);  -- DB Anticipo a trabajadores (conductor)
  perform contab_insert_linea(v_entry, '11100510', null,  null, 0, v_monto);  -- CR Banco (exige_tercero=false)
  return v_entry;
end;
$$;

create or replace function postear_peaje_mensual(p_periodo date)
returns uuid language plpgsql as $$
declare
  v_f2x   uuid;
  v_fac   numeric;
  v_nc    numeric;
  v_neto  numeric;
  v_mes   text;
  v_entry uuid;
  v_consec integer;
  v_dup   uuid;
  v_fecha date;
begin
  v_mes := to_char(p_periodo, 'YYYY-MM');

  select id into v_f2x from terceros where numero_identificacion = '900219834' and merged_into is null limit 1;
  if v_f2x is null then raise exception 'No se encontró el tercero F2X (900219834)'; end if;

  -- Neto del mes desde la FE importada (Recibido, F2X): facturas − notas crédito
  select coalesce(sum(case when document_type = 'Factura electrónica' then total else 0 end), 0),
         coalesce(sum(case when document_type = 'Nota de crédito electrónica' then total else 0 end), 0)
    into v_fac, v_nc
    from dian_invoices_import
   where nit_issuer = '900219834'
     and to_char(issue_date, 'YYYY-MM') = v_mes;

  v_neto := v_fac - v_nc;
  if coalesce(v_neto, 0) <= 0 then
    raise exception 'No hay peaje neto de F2X para % (facturas %, NC %)', v_mes, v_fac, v_nc;
  end if;

  -- GUARD pre-corte: el costo pre-corte ya está en el resultado acumulado (3610)
  if periodo_bloqueado(p_periodo) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(p_periodo,'YYYY-MM');
  end if;

  -- GUARD anti-duplicado por (F2X, mes): una causación de peaje F2X por período
  select e.id into v_dup
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
   where e.tipo_comprobante = 'CG' and e.estado = 'CONTABILIZADO' and e.periodo = v_mes
     and l.cuenta_puc = '61450575' and l.tercero_id = v_f2x
   limit 1;
  if v_dup is not null then
    raise exception 'Ya existe peaje F2X contabilizado para % (asiento %)', v_mes, v_dup;
  end if;

  v_fecha := (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date;  -- fin de mes
  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla)
    values ('CG', v_consec, v_fecha, v_mes,
            'Causación peaje F2X · ' || v_mes || ' (neto FE−NC = ' || to_char(v_neto, 'FM999G999G999') || ')',
            'dian_invoices_import')
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '61450575', v_f2x, null, v_neto, 0);  -- DB Peajes
  perform contab_insert_linea(v_entry, '220501',   v_f2x, null, 0, v_neto);  -- CR Proveedores nacionales (F2X)
  return v_entry;
end;
$$;

create or replace function postear_pago_proveedor_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text; v_puc text; v_pre boolean;
  v_entry uuid; v_consec integer; v_cb uuid;
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description, c.puc_code, bt.periodo_pre_corte
    into v_ter, v_monto, v_fecha, v_desc, v_puc, v_pre
    from bank_transactions bt
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  if v_ter is null then raise exception 'El movimiento % no tiene tercero (proveedor)', p_bank_transaction_id; end if;

  -- GUARD pre-corte: un pago pre-corte ya está reflejado en el saldo de apertura del pasivo
  if coalesce(v_pre, false) or periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
  end if;

  -- GUARD categoría: debe apuntar a 220501 (pago de proveedor)
  if v_puc is distinct from '220501' then
    raise exception 'El movimiento % no está categorizado como pago a proveedor (puc 220501)', p_bank_transaction_id;
  end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;

  -- GUARD anti-duplicado: una misma transacción no se contabiliza dos veces
  select id into v_cb from journal_entries
   where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then
    raise exception 'El movimiento % ya tiene pago contabilizado (asiento %)', p_bank_transaction_id, v_cb;
  end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Pago a proveedor' || coalesce(' · ' || v_desc, ''), v_desc, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '220501',   v_ter, null, v_monto, 0);  -- DB Proveedores (baja el pasivo)
  perform contab_insert_linea(v_entry, '11100510', null,  null, 0, v_monto);  -- CR Banco
  return v_entry;
end;
$$;

create or replace function postear_comision_empresa(
  p_placa text, p_monto numeric, p_fecha date,
  p_tercero uuid default null, p_origen_id uuid default null
) returns uuid language plpgsql as $$
declare v_ter uuid; v_conductor uuid; v_entry uuid; v_consec integer; v_dup uuid;
begin
  -- Tercero del DB (comisión): CONSUMIDOR FINAL por defecto (a quién se pagó, no el conductor)
  v_ter := p_tercero;
  if v_ter is null then
    select id into v_ter from terceros where numero_identificacion='222222222222' and merged_into is null limit 1;
    if v_ter is null then raise exception 'No se encontró el tercero CONSUMIDOR FINAL (222222222222)'; end if;
  end if;
  if coalesce(p_placa,'') = '' then raise exception 'La comisión requiere placa (centro de costo)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser > 0'; end if;

  -- Conductor de la legalización: el CR a 13301510 va a su nombre (consistente con evento 5)
  if p_origen_id is null then
    raise exception 'La comisión requiere la legalización de origen (p_origen_id) para resolver el conductor';
  end if;
  select d.tercero_id into v_conductor
    from legalizations lg
    join drivers d on d.id = lg.driver_id
   where lg.id = p_origen_id;
  if v_conductor is null then
    raise exception 'No se encontró el conductor (drivers.tercero_id) de la legalización %', p_origen_id;
  end if;

  -- GUARD pre-corte: nada anterior al corte (el costo ya está en el resultado acumulado 3610)
  if periodo_bloqueado(p_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(p_fecha,'YYYY-MM');
  end if;

  -- GUARD anti-duplicado POR CUENTA: no repetir el CG de comisión (61450580) de esta legalización
  select e.id into v_dup
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
   where e.origen_tabla = 'legalizations' and e.origen_id = p_origen_id
     and e.tipo_comprobante = 'CG' and e.estado = 'CONTABILIZADO'
     and l.cuenta_puc = '61450580'
   limit 1;
  if v_dup is not null then
    raise exception 'La legalización % ya tiene comisión empresa contabilizada (asiento %)', p_origen_id, v_dup;
  end if;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CG', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'), 'Comisión empresa · placa '||p_placa, 'legalizations', p_origen_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '61450580', v_ter,       p_placa, p_monto, 0);  -- DB Comisión empresa (Consumidor Final)
  perform contab_insert_linea(v_entry, '13301510', v_conductor, p_placa, 0, p_monto);  -- CR Anticipo a trabajadores (conductor)
  return v_entry;
end; $$;

create or replace function postear_costo_dian(
  p_import_id   uuid,
  p_cuenta_puc  text,
  p_credito_puc text
) returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_name text; v_folio text;
  v_entry uuid; v_consec integer; v_dup uuid;
begin
  select tercero_id, total, issue_date, name_issuer, folio
    into v_ter, v_monto, v_fecha, v_name, v_folio
    from dian_invoices_import where id = p_import_id;
  if not found then raise exception 'La factura DIAN % no existe', p_import_id; end if;
  if v_ter is null then raise exception 'La factura % no tiene tercero (proveedor)', p_import_id; end if;
  if coalesce(p_cuenta_puc,'') = '' then raise exception 'Falta la cuenta de costo'; end if;
  if left(p_cuenta_puc,1) not in ('5','6') then
    raise exception 'La cuenta % no es de costo/gasto (clase 5 o 6)', p_cuenta_puc;
  end if;
  if p_credito_puc not in ('220501','11100510') then
    raise exception 'Crédito inválido % (debe ser 220501 causación o 11100510 pago directo)', p_credito_puc;
  end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'La factura % no tiene monto > 0', p_import_id; end if;

  -- GUARD pre-corte: costo pre-corte ya está en el resultado acumulado (3610)
  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
  end if;

  -- GUARD anti-duplicado por factura
  select id into v_dup from journal_entries
   where origen_tabla='dian_invoices_import' and origen_id=p_import_id and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
  if v_dup is not null then
    raise exception 'La factura % ya tiene costo contabilizado (asiento %)', p_import_id, v_dup;
  end if;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CG', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Costo ' || coalesce(v_name,'') || ' · FE ' || coalesce(v_folio,''), v_folio, 'dian_invoices_import', p_import_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, p_cuenta_puc, v_ter, null, v_monto, 0);  -- DB Costo (tercero=proveedor)
  perform contab_insert_linea(v_entry, p_credito_puc,
            case when p_credito_puc = '11100510' then null else v_ter end, null, 0, v_monto);  -- CR Banco (sin tercero) o Proveedor
  return v_entry;
end; $$;

create or replace function postear_causacion_viaje(p_trip_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_flete numeric; v_fecha date; v_num text;
  v_entry uuid; v_consec integer; v_existe uuid;
begin
  select tercero_id, freight_value, load_date, trip_number
    into v_ter, v_flete, v_fecha, v_num
    from trips where id = p_trip_id;
  if not found then raise exception 'Viaje % no existe', p_trip_id; end if;
  if v_ter is null then raise exception 'El viaje % no tiene tercero (cliente); no se puede causar', p_trip_id; end if;
  if coalesce(v_flete,0) <= 0 then raise exception 'El viaje % no tiene valor de flete > 0', p_trip_id; end if;

  -- GUARD periodo cerrado/pre-corte (centralizado en periodos_contables)
  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
  end if;


  select id into v_existe from journal_entries
   where origen_tabla='trips' and origen_id=p_trip_id and tipo_comprobante='CI' and estado='CONTABILIZADO'
   limit 1;
  if v_existe is not null then
    raise exception 'El viaje % ya tiene causación contabilizada (asiento %)', p_trip_id, v_existe;
  end if;

  v_consec := consecutivo_siguiente('CI');
  insert into journal_entries
    (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
  values
    ('CI', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
     'Causación ingreso viaje '||coalesce(v_num, p_trip_id::text), 'trips', p_trip_id)
  returning id into v_entry;

  perform contab_insert_linea(v_entry, '13050502', v_ter, null, v_flete, 0);  -- DB CxC por facturar
  perform contab_insert_linea(v_entry, '41450510', v_ter, null, 0, v_flete);  -- CR Ingresos transporte
  return v_entry;
end;
$$;

create or replace function postear_emision_viaje(p_trip_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_flete numeric; v_fecha date; v_num text; v_feit text;
  v_entry uuid; v_consec integer; v_ci uuid; v_cf uuid;
begin
  select t.tercero_id, t.freight_value, coalesce(inv.issue_date, t.load_date), t.trip_number, inv.invoice_number
    into v_ter, v_flete, v_fecha, v_num, v_feit
    from trips t
    left join lateral (
      select i.issue_date, i.invoice_number
        from invoices i
       where i.trip_id = t.id
       order by i.created_at desc
       limit 1
    ) inv on true
   where t.id = p_trip_id;
  if not found then raise exception 'Viaje % no existe', p_trip_id; end if;
  if v_ter is null then raise exception 'El viaje % no tiene tercero (cliente)', p_trip_id; end if;
  if coalesce(v_flete,0) <= 0 then raise exception 'El viaje % no tiene flete > 0', p_trip_id; end if;

  -- GUARD periodo cerrado/pre-corte (centralizado en periodos_contables)
  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
  end if;


  -- GUARD 1: debe existir causación CI contabilizada
  select id into v_ci from journal_entries
   where origen_tabla='trips' and origen_id=p_trip_id and tipo_comprobante='CI' and estado='CONTABILIZADO' limit 1;
  if v_ci is null then
    raise exception 'El viaje % no tiene causación (CI) contabilizada; no se puede emitir sin causar antes.', p_trip_id;
  end if;

  -- GUARD 2: no debe existir ya una emisión CF contabilizada
  select id into v_cf from journal_entries
   where origen_tabla='trips' and origen_id=p_trip_id and tipo_comprobante='CF' and estado='CONTABILIZADO' limit 1;
  if v_cf is not null then
    raise exception 'El viaje % ya tiene emisión de factura contabilizada (asiento %)', p_trip_id, v_cf;
  end if;

  v_consec := consecutivo_siguiente('CF');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CF', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Emisión factura '||coalesce(v_feit,'')||' · viaje '||coalesce(v_num, p_trip_id::text), v_feit, 'trips', p_trip_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '13050501', v_ter, null, v_flete, 0);  -- DB Cartera facturada
  perform contab_insert_linea(v_entry, '13050502', v_ter, null, 0, v_flete);  -- CR CxC por facturar
  return v_entry;
end;
$$;

create or replace function postear_cruce_cartera_v2(p_entry_id uuid)
returns uuid language plpgsql as $$
declare
  v_tercero      uuid;
  v_invoice_num  text;
  v_invoice_amt  numeric;
  v_advance      numeric;
  v_saldo_fact   numeric;   -- pendiente de esta factura
  v_anticipo     numeric;   -- disponible del tercero en 28050510
  v_cartera      numeric;   -- pendiente del tercero en 13050501
  v_monto        numeric;
  v_new_advance  numeric;
  v_new_status   text;
  v_entry        uuid;
  v_consec       integer;
  v_dup          uuid;
  v_fecha_cf     date;
  v_fecha_rc     date;
  v_fecha        date;
begin
  -- 1) traer la AR entry
  select tercero_id, invoice_number, invoice_amount, advance_amount
    into v_tercero, v_invoice_num, v_invoice_amt, v_advance
    from accounts_receivable_entries
   where id = p_entry_id;
  if not found then
    raise exception 'La cartera (AR entry) % no existe', p_entry_id;
  end if;
  if v_tercero is null then
    raise exception 'La AR entry % (%) no tiene tercero_id; no se puede cruzar', p_entry_id, v_invoice_num;
  end if;

  -- 2) guard anti-duplicado: no puede haber ya un CX contabilizado para esta entry
  select id into v_dup
    from journal_entries
   where origen_tabla = 'accounts_receivable_entries'
     and origen_id    = p_entry_id
     and tipo_comprobante = 'CX'
     and estado = 'CONTABILIZADO'
   limit 1;
  if v_dup is not null then
    raise exception 'La factura % ya tiene un cruce (CX) contabilizado (asiento %)', v_invoice_num, v_dup;
  end if;

  -- 3) saldos a nivel tercero (solo asientos CONTABILIZADO)
  select coalesce(sum(l.credito) - sum(l.debito), 0) into v_anticipo
    from journal_entry_lines l
    join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '28050510' and l.tercero_id = v_tercero and e.estado = 'CONTABILIZADO';

  select coalesce(sum(l.debito) - sum(l.credito), 0) into v_cartera
    from journal_entry_lines l
    join journal_entries e on e.id = l.journal_entry_id
   where l.cuenta_puc = '13050501' and l.tercero_id = v_tercero and e.estado = 'CONTABILIZADO';

  v_saldo_fact := coalesce(v_invoice_amt,0) - coalesce(v_advance,0);

  -- 4) monto = MENOR de los tres topes
  v_monto := least(v_anticipo, v_cartera, v_saldo_fact);

  if coalesce(v_monto,0) <= 0 then
    raise exception 'Nada que cruzar para % — anticipo disponible %, cartera pendiente %, saldo factura %',
      v_invoice_num, v_anticipo, v_cartera, v_saldo_fact;
  end if;

  -- 5) fecha del asiento = hecho económico más tardío (CF de la factura vs RC del anticipo).
  --    GREATEST ignora NULLs; si faltan ambos, cae en current_date.
  select max(e.fecha) into v_fecha_cf
    from journal_entries e
   where e.tipo_comprobante = 'CF' and e.estado = 'CONTABILIZADO'
     and e.documento_soporte = v_invoice_num;

  select max(e.fecha) into v_fecha_rc
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
   where e.tipo_comprobante = 'RC' and e.estado = 'CONTABILIZADO'
     and l.cuenta_puc = '28050510' and l.tercero_id = v_tercero;

  v_fecha := coalesce(greatest(v_fecha_cf, v_fecha_rc), current_date);

  -- GUARD periodo cerrado/pre-corte (centralizado en periodos_contables)
  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
  end if;


  -- 5a) asiento CX  DB 28050510 / CR 13050501
  v_consec := consecutivo_siguiente('CX');
  insert into journal_entries
    (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
  values
    ('CX', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
     'Cruce de anticipo aplicado a cartera · factura ' || coalesce(v_invoice_num,''),
     v_invoice_num, 'accounts_receivable_entries', p_entry_id)
  returning id into v_entry;

  perform contab_insert_linea(v_entry, '28050510', v_tercero, null, v_monto, 0);  -- DB Anticipo clientes
  perform contab_insert_linea(v_entry, '13050501', v_tercero, null, 0, v_monto);  -- CR Cartera facturada

  -- 5b) UPDATE atómico de la AR entry (balance es GENERADA, no se toca)
  v_new_advance := coalesce(v_advance,0) + v_monto;
  v_new_status  := case
                     when v_new_advance >= v_invoice_amt then 'PAGADA'
                     when v_new_advance >  0             then 'ABONADA'
                     else 'PENDIENTE'
                   end;
  update accounts_receivable_entries
     set advance_amount = v_new_advance,
         status         = v_new_status,
         paid_date      = case when v_new_advance >= v_invoice_amt then v_fecha else paid_date end
   where id = p_entry_id;

  return v_entry;
end;
$$;
