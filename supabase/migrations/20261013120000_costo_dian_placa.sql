-- ════════════════════════════════════════════════════════════════════════════
-- postear_costo_dian · placa (centro de costo) opcional desde la pantalla
--   Las cuentas de costo que exigen centro de costo (6145 Llantas/Engrase/…) no se
--   podían causar desde conciliación-costos: la placa solo salía del enlace FE↔
--   legalización, y una FE sin ese enlace dejaba v_placa=NULL → contab_insert_linea
--   rechazaba. Ahora la pantalla puede pasar p_placa; si no viene, se conserva el
--   fallback al enlace. La placa se congela en la línea de costo Y en la de IVA
--   asumido (53152010), misma placa (la misma transacción, partida solo por fiscal).
--   No cambia la política exige_centro_costo de ninguna cuenta: si la cuenta la exige
--   y no llega placa (ni de la pantalla ni del enlace), el guard sigue rechazando.
-- Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- Quitar el overload de 3 args para dejar UNA sola función (la nueva con default).
drop function if exists postear_costo_dian(uuid, text, text);

create or replace function postear_costo_dian(
  p_import_id   uuid,
  p_cuenta_puc  text,
  p_credito_puc text,
  p_placa       text default null
) returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_iva numeric; v_base numeric;
  v_fecha date; v_name text; v_folio text;
  v_entry uuid; v_consec integer; v_dup uuid; v_placa text;
begin
  select tercero_id, total, coalesce(iva,0), issue_date, name_issuer, folio
    into v_ter, v_monto, v_iva, v_fecha, v_name, v_folio
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
  if v_iva < 0 or v_iva >= v_monto then
    raise exception 'IVA inválido (% de un total de %)', v_iva, v_monto;
  end if;

  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM');
  end if;

  select id into v_dup from journal_entries
   where origen_tabla='dian_invoices_import' and origen_id=p_import_id and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
  if v_dup is not null then
    raise exception 'La factura % ya tiene costo contabilizado (asiento %)', p_import_id, v_dup;
  end if;

  -- Centro de costo (placa): prioridad a la recibida de la pantalla; si no, la del
  -- enlace manual FE↔legalización, si existe. (El guard de contab_insert_linea rechaza
  -- si la cuenta exige centro de costo y al final v_placa queda vacío.)
  select v.plate into v_placa
    from legalization_expenses le
    join legalizations l on l.id = le.legalization_id
    join vehicles v      on v.id = l.vehicle_id
   where le.matched_invoice_id = p_import_id
   order by le.created_at
   limit 1;
  if coalesce(trim(p_placa),'') <> '' then v_placa := p_placa; end if;

  v_base := v_monto - v_iva;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CG', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Costo ' || coalesce(v_name,'') || ' · FE ' || coalesce(v_folio,''), v_folio, 'dian_invoices_import', p_import_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, p_cuenta_puc, v_ter, v_placa, v_base, 0);   -- DB costo base (placa)
  if v_iva > 0 then
    perform contab_insert_linea(v_entry, '53152010', v_ter, v_placa, v_iva, 0);    -- DB IVA asumido (mismo tercero + placa)
  end if;
  perform contab_insert_linea(v_entry, p_credito_puc,
            case when p_credito_puc = '11100510' then null else v_ter end, null, 0, v_monto);  -- CR total
  return v_entry;
end; $$;
