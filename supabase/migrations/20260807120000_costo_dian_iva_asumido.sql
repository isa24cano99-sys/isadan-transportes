-- ════════════════════════════════════════════════════════════════════════════
-- postear_costo_dian · IVA asumido (régimen SIMPLE)
--   Cuando la FE trae iva>0, el IVA NO es descontable (ISADAN no es responsable de
--   IVA bajo SIMPLE) → es mayor valor, a la cuenta 53152010 "IVA 19% Asumido", como
--   línea de débito aparte del costo base. La factura queda:
--     DB p_cuenta_puc  (base = total − iva)   tercero=proveedor, centro_costo=placa
--     DB 53152010      (iva)                  mismo tercero, misma placa
--     CR p_credito_puc (total)                proveedor (220501) o banco (11100510)
--   Cuadra: base + iva = total = crédito.
--   Cuando iva=0 (transporte F2X, combustible, la mayoría) → base=total y la línea de
--   IVA se omite: una sola línea de débito, igual que antes.
--   El IVA lleva el MISMO centro de costo (placa) que el costo — es la misma transacción,
--   partida solo por razón fiscal (base vs IVA); si no, se rompe el "cuánto cuesta la placa".
--   Base sobre la versión vigente (placa desde enlace + periodo_bloqueado). Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- Config de la cuenta de IVA asumido (idempotente; ya aplicado vía PostgREST):
--   naturaleza DEBITO (para balance/mayor); concepto_exogena 1001 (el IVA no descontable
--   va dentro del mismo registro 1001 del proveedor, como "IVA mayor valor del costo").
--   exige_tercero ya true; exige_centro_costo false (la placa es opcional, se pasa igual).
update puc_accounts set naturaleza = 'DEBITO', concepto_exogena = '1001'
 where codigo = '53152010';

-- Reciservicios La Costa (NIT 901164145) clasificada como DESCARGUE (61450535) para que
-- sus FE entren al dropdown de la línea de descargue en legalización. Idempotente.
update terceros set cuenta_puc_sugerida = '61450535'
 where numero_identificacion = '901164145' and coalesce(cuenta_puc_sugerida,'') = '';

create or replace function postear_costo_dian(
  p_import_id   uuid,
  p_cuenta_puc  text,
  p_credito_puc text
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

  -- Centro de costo (placa) desde el enlace manual FE↔legalización, si existe.
  select v.plate into v_placa
    from legalization_expenses le
    join legalizations l on l.id = le.legalization_id
    join vehicles v      on v.id = l.vehicle_id
   where le.matched_invoice_id = p_import_id
   order by le.created_at
   limit 1;

  v_base := v_monto - v_iva;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CG', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Costo ' || coalesce(v_name,'') || ' · FE ' || coalesce(v_folio,''), v_folio, 'dian_invoices_import', p_import_id)
    returning id into v_entry;

  perform contab_insert_linea(v_entry, p_cuenta_puc, v_ter, v_placa, v_base, 0);   -- DB costo base
  if v_iva > 0 then
    perform contab_insert_linea(v_entry, '53152010', v_ter, v_placa, v_iva, 0);    -- DB IVA asumido (mismo tercero + placa)
  end if;
  perform contab_insert_linea(v_entry, p_credito_puc,
            case when p_credito_puc = '11100510' then null else v_ter end, null, 0, v_monto);  -- CR total
  return v_entry;
end; $$;
