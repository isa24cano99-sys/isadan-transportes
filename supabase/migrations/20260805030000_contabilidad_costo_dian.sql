-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 · Conciliación de costos de otros emisores DIAN.
--   Contabiliza el costo de una factura de proveedor (dian_invoices_import) contra
--   la cuenta de costo elegida. Dos tratamientos según el crédito:
--     · Causación (c):    DB 6145xx (proveedor) / CR 220501 Proveedores (proveedor).
--     · Pago directo (a): DB 6145xx (proveedor) / CR 11100510 Banco.
--   Comprobante CG. La cuenta de costo (6145xx) la elige/hereda el usuario por tercero.
--
--   Config previa: las cuentas de costo del selector dejan de exigir centro de costo
--   (una factura de proveedor no trae placa; nada las postea hoy con placa requerida —
--   solo porcentaje 61450550 y comisión 61450580, que no se tocan). Mismo criterio que
--   61450575 (peaje).
--   Guards: cuenta de costo clase 5/6, crédito válido (220501|11100510), monto>0,
--   pre-corte (issue_date >= 2026-07-01), anti-duplicado por (import, CG).
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
update puc_accounts set exige_centro_costo = false
 where codigo in ('61450510','61450515','61450520','61450525','61450530','61450535','61450585');

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
  if v_fecha < date '2026-07-01' then
    raise exception 'Factura pre-corte (%): el costo ya está en la apertura; no se causa de nuevo', v_fecha;
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
