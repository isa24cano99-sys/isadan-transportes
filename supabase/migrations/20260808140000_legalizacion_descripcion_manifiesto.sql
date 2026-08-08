-- ════════════════════════════════════════════════════════════════════════════
-- Legalización: descripción tipo Dataico + manifiesto en documento_soporte.
--   descripcion       = 'Legalización 03 de julio · Manifiesto MAN31911 · placa TSV130'
--   documento_soporte = 'MAN31911'  (trips.manifest_number; fallback trip_number si NULL)
-- Un helper único (legalizacion_doc_ref) arma ambos, para que aprobar_legalizacion y el
-- backfill de los 13 asientos ya existentes no se desincronicen. Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Helper: descripción + documento_soporte de una legalización ──────────────────────────
create or replace function legalizacion_doc_ref(p_leg_id uuid, out descripcion text, out documento text)
language plpgsql as $$
declare v_date date; v_placa text; v_man text; v_tn text; v_mes text;
begin
  select l.date, v.plate, tr.manifest_number, tr.trip_number
    into v_date, v_placa, v_man, v_tn
    from legalizations l
    left join vehicles v on v.id = l.vehicle_id
    left join trips tr   on tr.id = l.trip_id
   where l.id = p_leg_id;
  documento := coalesce(nullif(trim(v_man), ''), v_tn, '—');   -- manifiesto limpio; fallback trip_number
  v_mes := (array['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from v_date)::int];
  descripcion := 'Legalización ' || to_char(v_date,'DD') || ' de ' || v_mes
                 || ' · Manifiesto ' || documento || ' · placa ' || coalesce(v_placa,'—');
end; $$;

-- ── aprobar_legalizacion: usa el helper para descripcion + documento_soporte ──────────────
--    (idéntica a 20260808130000; solo cambia el encabezado del asiento).
create or replace function aprobar_legalizacion(p_leg_id uuid)
returns jsonb language plpgsql as $$
declare
  v_leg record; v_cf uuid; v_rec record; v_cuenta text; v_placa text;
  v_entry uuid; v_consec integer; v_total numeric := 0; v_postable numeric;
  v_prov uuid; v_fe_total numeric; v_fe_iva numeric; v_iva_line numeric; v_base_line numeric;
  v_posted integer := 0; v_skipped integer := 0; v_ex uuid;
  v_cuenta_nombre text; v_clase text; v_desc text; v_ref text;
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

  select id into v_ex from journal_entries
   where origen_tabla='legalizations' and origen_id=p_leg_id and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
  if v_ex is not null then
    update legalizations set status='APROBADA' where id=p_leg_id;
    return jsonb_build_object('posted',0,'skipped',1,'asiento',v_ex);
  end if;

  if periodo_bloqueado(v_leg.date) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_leg.date,'YYYY-MM');
  end if;

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

  select descripcion, documento into v_desc, v_ref from legalizacion_doc_ref(p_leg_id);
  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CG', v_consec, v_leg.date, to_char(v_leg.date,'YYYY-MM'), v_desc, v_ref, 'legalizations', p_leg_id)
    returning id into v_entry;

  for v_rec in
    select le.id as line_id, le.expense_type, le.amount, le.matched_invoice_id, le.description
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
      select nombre into v_cuenta_nombre from puc_accounts where codigo = v_cuenta;
      if v_cuenta_nombre is null then
        raise exception 'No se puede aprobar: la línea "%" usa la cuenta "%", que no existe en el catálogo PUC. Elige una categoría de costo de viaje (6145xx) antes de aprobar.',
          coalesce(nullif(v_rec.description,''), v_rec.expense_type), v_cuenta;
      elsif left(v_cuenta,1) not in ('5','6') then
        v_clase := case left(v_cuenta,1) when '1' then 'activo' when '2' then 'pasivo' when '3' then 'patrimonio' when '4' then 'ingreso' else 'clase '||left(v_cuenta,1) end;
        raise exception 'No se puede aprobar: la línea "%" está mapeada a la cuenta % ("%"), que es de % — no de costo/gasto (clase 5 o 6). Cámbiala a una categoría de costo de viaje (6145xx) antes de aprobar.',
          coalesce(nullif(v_rec.description,''), v_cuenta_nombre), v_cuenta, v_cuenta_nombre, v_clase;
      end if;
      if v_rec.matched_invoice_id is not null then
        select id into v_ex from journal_entries where origen_tabla='dian_invoices_import'
          and origen_id=v_rec.matched_invoice_id and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
        if v_ex is not null then v_skipped := v_skipped+1; continue; end if;
        select tercero_id, total, coalesce(iva,0) into v_prov, v_fe_total, v_fe_iva
          from dian_invoices_import where id=v_rec.matched_invoice_id;
        v_iva_line  := case when coalesce(v_fe_total,0)>0 then round(v_rec.amount * v_fe_iva / v_fe_total) else 0 end;
        v_base_line := v_rec.amount - v_iva_line;
        perform contab_insert_linea(v_entry, v_cuenta, v_prov, v_placa, v_base_line, 0);
        if v_iva_line > 0 then perform contab_insert_linea(v_entry, '53152010', v_prov, v_placa, v_iva_line, 0); end if;
        v_total := v_total + v_rec.amount; v_posted := v_posted+1;
      else
        perform contab_insert_linea(v_entry, v_cuenta, v_cf, v_placa, v_rec.amount, 0);
        v_total := v_total + v_rec.amount; v_posted := v_posted+1;
      end if;
    end if;
  end loop;

  perform contab_insert_linea(v_entry, '13301510', v_leg.conductor, v_placa, 0, v_total);
  update legalizations set status='APROBADA' where id=p_leg_id;
  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'total', v_total, 'asiento', v_entry);
end; $$;
