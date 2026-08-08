-- ════════════════════════════════════════════════════════════════════════════
-- PIEZA 2 — Consolidación: UN asiento CG por legalización (estilo Dataico).
--
--   aprobar_legalizacion crea UN journal_entry con todas las líneas de DÉBITO (una por
--   concepto, cada una con su cuenta+tercero+placa correctos) y UNA sola línea de CRÉDITO
--   consolidada a 13301510·conductor·placa por el total. El dinero salió del anticipo del
--   conductor, así que el crédito SIEMPRE es al conductor — con o sin FE.
--
--   Ruteo del DÉBITO por tipo:
--     porcentaje        → 61450550 · conductor
--     comision_empresa  → 61450580 · Consumidor Final
--     operativo sin FE  → cuenta · Consumidor Final
--     operativo con FE  → cuenta · PROVEEDOR de la FE (+ 53152010 IVA si aplica),
--                         split de IVA PROPORCIONAL al monto de la línea (iva/total de la FE)
--   postear_costo_dian NO se llama desde aquí (se inline-a) — solo se usa desde la
--   conciliación de costos DIAN general, donde el crédito sí es 220501 (pago directo al
--   proveedor, sin anticipo de conductor de por medio).
--
--   Cross-guard bidireccional (evita doble conteo entre los dos caminos):
--     · aprobar_legalizacion SALTA una línea con FE ya causada por conciliación
--       (origen=dian_invoices_import).
--     · postear_costo_dian RECHAZA una FE ya contabilizada dentro de una legalización
--       (enlazada a una línea cuya legalización ya tiene su CG consolidado).
--   Anti-dup: si la legalización ya tiene su CG (origen=legalizations) → no re-postea.
--   El saldo de 13301510 por conductor queda corriendo (se liquida en el pago de nómina).
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function aprobar_legalizacion(p_leg_id uuid)
returns jsonb language plpgsql as $$
declare
  v_leg record; v_cf uuid; v_rec record; v_cuenta text; v_placa text;
  v_entry uuid; v_consec integer; v_total numeric := 0; v_postable numeric;
  v_prov uuid; v_fe_total numeric; v_fe_iva numeric; v_iva_line numeric; v_base_line numeric;
  v_posted integer := 0; v_skipped integer := 0; v_ex uuid;
begin
  select l.id, l.status, l.date, l.driver_id, d.tercero_id as conductor, v.plate as placa
    into v_leg from legalizations l
    left join drivers d  on d.id = l.driver_id
    left join vehicles v on v.id = l.vehicle_id
   where l.id = p_leg_id;
  if not found then raise exception 'Legalización % no existe', p_leg_id; end if;
  if v_leg.conductor is null then raise exception 'La legalización no tiene conductor con tercero_id'; end if;
  select id into v_cf from terceros where numero_identificacion='222222222222' limit 1;
  if v_cf is null then raise exception 'No existe el tercero CONSUMIDOR FINAL (222222222222)'; end if;
  v_placa := v_leg.placa;

  -- anti-dup: si la legalización ya tiene su asiento → aprobar sin re-postear
  select id into v_ex from journal_entries
   where origen_tabla='legalizations' and origen_id=p_leg_id and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
  if v_ex is not null then
    update legalizations set status='APROBADA' where id=p_leg_id;
    return jsonb_build_object('posted',0,'skipped',1,'asiento',v_ex);
  end if;

  if periodo_bloqueado(v_leg.date) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_leg.date,'YYYY-MM');
  end if;

  -- total POSTABLE (excluye líneas con FE ya causada por conciliación) — para no crear asiento vacío
  select coalesce(sum(le.amount),0) into v_postable
    from legalization_expenses le
   where le.legalization_id=p_leg_id and coalesce(le.amount,0)>0
     and not (le.matched_invoice_id is not null and exists (
       select 1 from journal_entries e where e.origen_tabla='dian_invoices_import'
        and e.origen_id=le.matched_invoice_id and e.tipo_comprobante='CG' and e.estado='CONTABILIZADO'));
  if v_postable <= 0 then
    update legalizations set status='APROBADA' where id=p_leg_id;
    return jsonb_build_object('posted',0,'skipped',0);
  end if;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CG', v_consec, v_leg.date, to_char(v_leg.date,'YYYY-MM'),
            'Legalización · placa '||coalesce(v_placa,'—')||' (consolidado)', 'legalizations', p_leg_id)
    returning id into v_entry;

  for v_rec in
    select le.id as line_id, le.expense_type, le.amount, le.matched_invoice_id
      from legalization_expenses le where le.legalization_id=p_leg_id and coalesce(le.amount,0)>0
  loop
    if v_rec.expense_type='porcentaje' then
      perform contab_insert_linea(v_entry, '61450550', v_leg.conductor, v_placa, v_rec.amount, 0);
      v_total := v_total + v_rec.amount; v_posted := v_posted+1;
    elsif v_rec.expense_type='comision_empresa' then
      perform contab_insert_linea(v_entry, '61450580', v_cf, v_placa, v_rec.amount, 0);
      v_total := v_total + v_rec.amount; v_posted := v_posted+1;
    else
      v_cuenta := case v_rec.expense_type
        when 'acpm_contado' then '61450510' when 'cargue' then '61450515' when 'descargue' then '61450535'
        when 'peajes' then '61450575' when 'lavada' then '61450555' when 'parqueos' then '61450545'
        when 'engrase' then '61450540' when 'llantas' then '61450590' when 'carrozada' then '61450570'
        when 'cambio_aceite' then '61450530' when 'varada' then '61450525' else v_rec.expense_type end;
      if not exists (select 1 from puc_accounts where codigo=v_cuenta and left(codigo,1) in ('5','6')) then
        raise exception 'Tipo de gasto "%" sin cuenta de costo válida (%)', v_rec.expense_type, v_cuenta;
      end if;
      if v_rec.matched_invoice_id is not null then
        -- cross-guard: FE ya causada por conciliación → saltar (no doblar)
        select id into v_ex from journal_entries where origen_tabla='dian_invoices_import'
          and origen_id=v_rec.matched_invoice_id and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
        if v_ex is not null then v_skipped := v_skipped+1; continue; end if;
        select tercero_id, total, coalesce(iva,0) into v_prov, v_fe_total, v_fe_iva
          from dian_invoices_import where id=v_rec.matched_invoice_id;
        v_iva_line  := case when coalesce(v_fe_total,0)>0 then round(v_rec.amount * v_fe_iva / v_fe_total) else 0 end;
        v_base_line := v_rec.amount - v_iva_line;
        perform contab_insert_linea(v_entry, v_cuenta, v_prov, v_placa, v_base_line, 0);        -- DB base · proveedor
        if v_iva_line > 0 then perform contab_insert_linea(v_entry, '53152010', v_prov, v_placa, v_iva_line, 0); end if;
        v_total := v_total + v_rec.amount; v_posted := v_posted+1;
      else
        perform contab_insert_linea(v_entry, v_cuenta, v_cf, v_placa, v_rec.amount, 0);           -- DB · Consumidor Final
        v_total := v_total + v_rec.amount; v_posted := v_posted+1;
      end if;
    end if;
  end loop;

  perform contab_insert_linea(v_entry, '13301510', v_leg.conductor, v_placa, 0, v_total);         -- CR único · conductor
  update legalizations set status='APROBADA' where id=p_leg_id;
  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'total', v_total, 'asiento', v_entry);
end; $$;

-- ── postear_costo_dian: cross-guard reorientado. Igual que la versión vigente (placa+IVA),
--    pero el guard ahora detecta la FE ya contabilizada DENTRO de una legalización (asiento
--    consolidado origen=legalizations), no el viejo origen=legalization_expenses. ──────────
create or replace function postear_costo_dian(
  p_import_id uuid, p_cuenta_puc text, p_credito_puc text
) returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_iva numeric; v_base numeric;
  v_fecha date; v_name text; v_folio text;
  v_entry uuid; v_consec integer; v_dup uuid; v_placa text; v_leg_dup uuid;
begin
  select tercero_id, total, coalesce(iva,0), issue_date, name_issuer, folio
    into v_ter, v_monto, v_iva, v_fecha, v_name, v_folio
    from dian_invoices_import where id = p_import_id;
  if not found then raise exception 'La factura DIAN % no existe', p_import_id; end if;
  if v_ter is null then raise exception 'La factura % no tiene tercero (proveedor)', p_import_id; end if;
  if coalesce(p_cuenta_puc,'') = '' then raise exception 'Falta la cuenta de costo'; end if;
  if left(p_cuenta_puc,1) not in ('5','6') then raise exception 'La cuenta % no es de costo/gasto (clase 5 o 6)', p_cuenta_puc; end if;
  if p_credito_puc not in ('220501','11100510') then raise exception 'Crédito inválido % (220501 o 11100510)', p_credito_puc; end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'La factura % no tiene monto > 0', p_import_id; end if;
  if v_iva < 0 or v_iva >= v_monto then raise exception 'IVA inválido (% de %)', v_iva, v_monto; end if;
  if periodo_bloqueado(v_fecha) then raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;

  select id into v_dup from journal_entries
   where origen_tabla='dian_invoices_import' and origen_id=p_import_id and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
  if v_dup is not null then raise exception 'La factura % ya tiene costo contabilizado (asiento %)', p_import_id, v_dup; end if;

  -- cross-guard: ¿la FE ya se contabilizó dentro de una legalización (asiento consolidado)?
  select le.legalization_id into v_leg_dup
    from legalization_expenses le
    join journal_entries e on e.origen_tabla='legalizations' and e.origen_id=le.legalization_id
                          and e.tipo_comprobante='CG' and e.estado='CONTABILIZADO'
   where le.matched_invoice_id = p_import_id limit 1;
  if v_leg_dup is not null then
    raise exception 'Esta FE ya se contabilizó dentro de la legalización % — no se puede causar de nuevo por conciliación', v_leg_dup;
  end if;

  select v.plate into v_placa from legalization_expenses le
    join legalizations l on l.id = le.legalization_id
    join vehicles v on v.id = l.vehicle_id
   where le.matched_invoice_id = p_import_id order by le.created_at limit 1;

  v_base := v_monto - v_iva;
  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CG', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Costo ' || coalesce(v_name,'') || ' · FE ' || coalesce(v_folio,''), v_folio, 'dian_invoices_import', p_import_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, p_cuenta_puc, v_ter, v_placa, v_base, 0);
  if v_iva > 0 then perform contab_insert_linea(v_entry, '53152010', v_ter, v_placa, v_iva, 0); end if;
  perform contab_insert_linea(v_entry, p_credito_puc, case when p_credito_puc='11100510' then null else v_ter end, null, 0, v_monto);
  return v_entry;
end; $$;

-- ── Batch consolidado: postear_gastos_legalizacion_sin_fe agrupa por legalización (UN CG
--    por leg con las líneas sin-FE + CR 13301510). Anti-dup por leg: salta si ya tiene un CG
--    con una línea de costo sin-FE (Consumidor Final) de esas cuentas. ──────────────────────
create or replace function postear_gastos_legalizacion_sin_fe(p_periodo date)
returns integer language plpgsql as $$
declare
  v_cf uuid; v_leg record; v_rec record; v_cuenta text; v_entry uuid; v_consec integer;
  v_total numeric; v_n integer := 0;
begin
  select id into v_cf from terceros where numero_identificacion='222222222222' limit 1;
  if v_cf is null then raise exception 'No existe el tercero CONSUMIDOR FINAL (222222222222)'; end if;

  for v_leg in
    select distinct l.id as leg_id, l.date as leg_date, d.tercero_id as conductor, v.plate as placa
      from legalization_expenses le
      join legalizations l on l.id = le.legalization_id
      left join drivers d  on d.id = l.driver_id
      left join vehicles v on v.id = l.vehicle_id
     where le.expense_type in ('acpm_contado','cargue','descargue')
       and le.matched_invoice_id is null
       and l.status='APROBADA'
       and to_char(coalesce(le.date, l.date),'YYYY-MM') = to_char(p_periodo,'YYYY-MM')
       and coalesce(le.amount,0) > 0
  loop
    if v_leg.conductor is null then continue; end if;
    if periodo_bloqueado(v_leg.leg_date) then continue; end if;
    -- anti-dup: ¿ya tiene un CG con costo sin-FE (Consumidor Final) de esas cuentas?
    if exists (select 1 from journal_entries e join journal_entry_lines l on l.journal_entry_id=e.id
                where e.origen_tabla='legalizations' and e.origen_id=v_leg.leg_id
                  and e.tipo_comprobante='CG' and e.estado='CONTABILIZADO'
                  and l.cuenta_puc in ('61450510','61450515','61450535') and l.tercero_id=v_cf) then
      continue;
    end if;

    v_consec := consecutivo_siguiente('CG'); v_total := 0;
    insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
      values ('CG', v_consec, v_leg.leg_date, to_char(v_leg.leg_date,'YYYY-MM'),
              'Gastos sin FE (consolidado) · placa '||coalesce(v_leg.placa,'—'), 'legalizations', v_leg.leg_id)
      returning id into v_entry;
    for v_rec in
      select le.expense_type, le.amount from legalization_expenses le
       where le.legalization_id=v_leg.leg_id and le.matched_invoice_id is null
         and le.expense_type in ('acpm_contado','cargue','descargue') and coalesce(le.amount,0)>0
    loop
      v_cuenta := case v_rec.expense_type when 'acpm_contado' then '61450510' when 'cargue' then '61450515' when 'descargue' then '61450535' end;
      perform contab_insert_linea(v_entry, v_cuenta, v_cf, v_leg.placa, v_rec.amount, 0);
      v_total := v_total + v_rec.amount;
    end loop;
    perform contab_insert_linea(v_entry, '13301510', v_leg.conductor, v_leg.placa, 0, v_total);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
