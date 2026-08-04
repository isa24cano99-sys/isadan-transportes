-- ════════════════════════════════════════════════════════════════════════════
-- FASE 1 · PASO 3 (arranque) — Motor de posting: 3 primeros eventos
--   Patrones cubiertos: tercero simple (causación viaje), mismo tercero en dos
--   cuentas (cruce cartera), centro de costo (porcentaje conductor).
--   Cada función crea 1 journal_entry + sus líneas balanceadas, de forma atómica
--   (una sola transacción; el trigger DEFERRABLE valida el cuadre al commit).
--
-- NO ejecuta nada contra las tablas operativas: solo define funciones. El posteo
-- real (PASO 4) queda diferido. Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tipo de comprobante CX (Cruce) ───────────────────────────────────────────
-- Separado de CA (Ajuste/Apertura): el cruce de cartera es rutinario y de alto
-- volumen; CA queda limpio para ajustes excepcionales y la apertura única.
insert into tipos_comprobante (codigo, nombre) values ('CX', 'Cruce')
on conflict (codigo) do nothing;

-- ── Helper: inserta una línea validando exige_tercero / exige_centro_costo,
--    congelando el snapshot de tercero (NIT+nombre) y el concepto de exógena. ─
create or replace function contab_insert_linea(
  p_entry        uuid,
  p_cuenta       text,
  p_tercero      uuid,
  p_centro_costo text,
  p_debito       numeric,
  p_credito      numeric
) returns void language plpgsql as $$
declare
  v_exige_t  boolean;
  v_exige_cc boolean;
  v_concepto text;
  v_nit      text;
  v_nombre   text;
begin
  select exige_tercero, exige_centro_costo, concepto_exogena
    into v_exige_t, v_exige_cc, v_concepto
    from puc_accounts where codigo = p_cuenta;
  if not found then
    raise exception 'Cuenta PUC % no existe en puc_accounts', p_cuenta;
  end if;
  if v_exige_t and p_tercero is null then
    raise exception 'La cuenta % exige tercero y no se proporcionó', p_cuenta;
  end if;
  if v_exige_cc and coalesce(p_centro_costo,'') = '' then
    raise exception 'La cuenta % exige centro de costo y no se proporcionó', p_cuenta;
  end if;

  if p_tercero is not null then
    select t.numero_identificacion,
           case when t.tipo_persona = 'NATURAL'
                then nullif(trim(concat_ws(' ', t.primer_nombre, t.otros_nombres, t.primer_apellido, t.segundo_apellido)), '')
                else t.razon_social end
      into v_nit, v_nombre
      from terceros t where t.id = p_tercero;
  end if;

  insert into journal_entry_lines
    (journal_entry_id, cuenta_puc, tercero_id, centro_costo, debito, credito,
     tercero_nit_snapshot, tercero_nombre_snapshot, concepto_exogena)
  values
    (p_entry, p_cuenta, p_tercero, p_centro_costo, coalesce(p_debito,0), coalesce(p_credito,0),
     v_nit, v_nombre, v_concepto);
end;
$$;

-- ── Evento 1: Causación de viaje (individual) ────────────────────────────────
--    DB 13050502 CxC por facturar / CR 41450510 Ingresos. Tercero = trips.tercero_id.
--    Comprobante CI (Causación Ingreso).
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

-- ── Evento 4: Cruce de cartera (anticipo aplicado a factura) ─────────────────
--    DB 28050510 Anticipo clientes / CR 13050501 Cartera facturada. Mismo tercero, mismo monto.
--    Comprobante CX (Cruce) — tipo dedicado, separado de CA (ajustes/apertura).
create or replace function postear_cruce_cartera(
  p_tercero   uuid,
  p_monto     numeric,
  p_fecha     date,
  p_origen_id uuid  default null,
  p_documento text  default null
) returns uuid language plpgsql as $$
declare v_entry uuid; v_consec integer;
begin
  if p_tercero is null then raise exception 'El cruce de cartera requiere tercero (cliente)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto del cruce debe ser > 0'; end if;

  v_consec := consecutivo_siguiente('CX');
  insert into journal_entries
    (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
  values
    ('CX', v_consec, p_fecha, to_char(p_fecha,'YYYY-MM'),
     'Cruce de anticipo aplicado a cartera', p_documento, 'accounts_receivable_entries', p_origen_id)
  returning id into v_entry;

  perform contab_insert_linea(v_entry, '28050510', p_tercero, null, p_monto, 0);  -- DB Anticipo clientes
  perform contab_insert_linea(v_entry, '13050501', p_tercero, null, 0, p_monto);  -- CR Cartera facturada
  return v_entry;
end;
$$;

-- ── Evento 5: Porcentaje conductor ───────────────────────────────────────────
--    DB 61450550 Porcentaje / CR 13301510 Anticipo a trabajadores.
--    Tercero = drivers.tercero_id; centro_costo = placa. Comprobante CG (Costo/Gasto).
create or replace function postear_porcentaje_conductor(
  p_driver_id uuid,
  p_placa     text,
  p_monto     numeric,
  p_fecha     date,
  p_origen_id uuid default null
) returns uuid language plpgsql as $$
declare v_ter uuid; v_entry uuid; v_consec integer;
begin
  select tercero_id into v_ter from drivers where id = p_driver_id;
  if not found then raise exception 'Conductor % no existe', p_driver_id; end if;
  if v_ter is null then raise exception 'El conductor % no tiene tercero_id enlazado', p_driver_id; end if;
  if coalesce(p_placa,'') = '' then raise exception 'El porcentaje requiere placa (centro de costo)'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser > 0'; end if;

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
