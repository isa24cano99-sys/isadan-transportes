-- ════════════════════════════════════════════════════════════════════════════
-- ACPM · enlace manual FE de combustible ↔ línea de legalización + consumo en posting
--
--   El usuario enlaza a mano, en la línea de ACPM de la legalización, la FE de
--   combustible que le entrega el conductor (dropdown de FE del mes, selección 100%
--   manual, sin algoritmo de match). El enlace se guarda en
--   legalization_expenses.matched_invoice_id.
--
--   CONSUMO: postear_costo_dian, al contabilizar una FE que está enlazada desde una
--   línea de legalización, pasa el centro_costo (placa del vehículo de esa legalización)
--   a la línea de costo. Antes iba null porque la FE sola no trae placa; con el enlace
--   manual sí. 61450510 tiene exige_centro_costo=false, así que la placa es opcional:
--   si hay enlace se pone, si no, queda null como hasta ahora (sin romper nada).
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Enlace (mismo patrón que dian_invoices_import.matched_toll_id)
alter table legalization_expenses
  add column if not exists matched_invoice_id uuid references dian_invoices_import(id);

-- Clasifica "Estación de Servicios Estrella del Norte" (NIT 900323290) como combustible
-- para que su FE entre al universo del dropdown. Idempotente (ya aplicado vía PostgREST).
update terceros set cuenta_puc_sugerida = '61450510'
 where numero_identificacion = '900323290' and coalesce(cuenta_puc_sugerida,'') = '';

-- 2) postear_costo_dian: + centro_costo (placa) desde el enlace manual, si existe.
--    Basado en la versión vigente (con periodo_bloqueado); solo cambia la línea DB.
create or replace function postear_costo_dian(
  p_import_id   uuid,
  p_cuenta_puc  text,
  p_credito_puc text
) returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_name text; v_folio text;
  v_entry uuid; v_consec integer; v_dup uuid; v_placa text;
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

  -- GUARD pre-corte/cierre: costo pre-corte ya está en el resultado acumulado (3610)
  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
  end if;

  -- GUARD anti-duplicado por factura
  select id into v_dup from journal_entries
   where origen_tabla='dian_invoices_import' and origen_id=p_import_id and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
  if v_dup is not null then
    raise exception 'La factura % ya tiene costo contabilizado (asiento %)', p_import_id, v_dup;
  end if;

  -- Centro de costo (placa) desde el enlace manual FE↔legalización, si existe.
  select v.plate into v_placa
    from legalization_expenses le
    join legalizations l on l.id = le.legalization_id
    join vehicles v      on v.id = l.vehicle_id
   where le.matched_invoice_id = p_import_id
   order by le.created_at
   limit 1;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CG', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Costo ' || coalesce(v_name,'') || ' · FE ' || coalesce(v_folio,''), v_folio, 'dian_invoices_import', p_import_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, p_cuenta_puc, v_ter, v_placa, v_monto, 0);  -- DB Costo (tercero=proveedor, centro_costo=placa si hay enlace)
  perform contab_insert_linea(v_entry, p_credito_puc,
            case when p_credito_puc = '11100510' then null else v_ter end, null, 0, v_monto);  -- CR Banco (sin tercero) o Proveedor
  return v_entry;
end; $$;
