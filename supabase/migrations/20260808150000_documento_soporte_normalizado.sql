-- ════════════════════════════════════════════════════════════════════════════
-- #1 documento_soporte normalizado — referencia CORTA y consistente para el libro auxiliar.
-- Solo cambia el valor de documento_soporte de 5 funciones (descripcion queda igual: el texto
-- largo/descriptivo vive en su propia columna del export).
--   causacion_viaje (CI)      → manifiesto (trips.manifest_number; fallback trip_number)
--   peaje_mensual   (CG)      → 'F2X 2026-07' (periodo; no hay folio limpio por mes)
--   pago_proveedor  (CB)      → 'Pago 220501 · 2026-07' (a qué mes de causación corresponde)
--   anticipo_conductor (CB)   → manifiesto del viaje si el mov. liga a un viaje (reference_type=TRIP),
--                               si no 'Anticipo · <conductor>'
--   recibo_anticipo_cliente (RC) → manifiesto del viaje si liga, si no 'Anticipo · <cliente>'
-- nomina_mensual (CN) se difiere a PIEZA 3 (0 asientos hoy; se toca nómina allá). Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── CI causación viaje: documento_soporte = manifiesto ────────────────────────────────────
create or replace function postear_causacion_viaje(p_trip_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_flete numeric; v_fecha date; v_num text; v_man text; v_ref text;
  v_entry uuid; v_consec integer; v_existe uuid;
begin
  select tercero_id, freight_value, load_date, trip_number, manifest_number
    into v_ter, v_flete, v_fecha, v_num, v_man
    from trips where id = p_trip_id;
  if not found then raise exception 'Viaje % no existe', p_trip_id; end if;
  if v_ter is null then raise exception 'El viaje % no tiene tercero (cliente); no se puede causar', p_trip_id; end if;
  if coalesce(v_flete,0) <= 0 then raise exception 'El viaje % no tiene valor de flete > 0', p_trip_id; end if;
  if periodo_bloqueado(v_fecha) then raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;
  select id into v_existe from journal_entries
   where origen_tabla='trips' and origen_id=p_trip_id and tipo_comprobante='CI' and estado='CONTABILIZADO' limit 1;
  if v_existe is not null then raise exception 'El viaje % ya tiene causación contabilizada (asiento %)', p_trip_id, v_existe; end if;

  v_ref := coalesce(nullif(trim(v_man),''), v_num);
  v_consec := consecutivo_siguiente('CI');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
  values ('CI', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
          'Causación ingreso viaje '||coalesce(v_num, p_trip_id::text), v_ref, 'trips', p_trip_id)
  returning id into v_entry;
  perform contab_insert_linea(v_entry, '13050502', v_ter, null, v_flete, 0);
  perform contab_insert_linea(v_entry, '41450510', v_ter, null, 0, v_flete);
  return v_entry;
end; $$;

-- ── CG peaje mensual: documento_soporte = 'F2X <periodo>' ──────────────────────────────────
create or replace function postear_peaje_mensual(p_periodo date)
returns uuid language plpgsql as $$
declare
  v_f2x uuid; v_fac numeric; v_nc numeric; v_neto numeric; v_mes text;
  v_entry uuid; v_consec integer; v_dup uuid; v_fecha date;
begin
  v_mes := to_char(p_periodo, 'YYYY-MM');
  select id into v_f2x from terceros where numero_identificacion = '900219834' and merged_into is null limit 1;
  if v_f2x is null then raise exception 'No se encontró el tercero F2X (900219834)'; end if;
  select coalesce(sum(case when document_type = 'Factura electrónica' then total else 0 end), 0),
         coalesce(sum(case when document_type = 'Nota de crédito electrónica' then total else 0 end), 0)
    into v_fac, v_nc from dian_invoices_import
   where nit_issuer = '900219834' and to_char(issue_date, 'YYYY-MM') = v_mes;
  v_neto := v_fac - v_nc;
  if coalesce(v_neto, 0) <= 0 then raise exception 'No hay peaje neto de F2X para % (facturas %, NC %)', v_mes, v_fac, v_nc; end if;
  if periodo_bloqueado(p_periodo) then raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(p_periodo,'YYYY-MM'); end if;
  select e.id into v_dup from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
   where e.tipo_comprobante = 'CG' and e.estado = 'CONTABILIZADO' and e.periodo = v_mes
     and l.cuenta_puc = '61450575' and l.tercero_id = v_f2x limit 1;
  if v_dup is not null then raise exception 'Ya existe peaje F2X contabilizado para % (asiento %)', v_mes, v_dup; end if;

  v_fecha := (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date;
  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla)
    values ('CG', v_consec, v_fecha, v_mes,
            'Causación peaje F2X · ' || v_mes || ' (neto FE−NC = ' || to_char(v_neto, 'FM999G999G999') || ')',
            'F2X ' || v_mes, 'dian_invoices_import')
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '61450575', v_f2x, null, v_neto, 0);
  perform contab_insert_linea(v_entry, '220501',   v_f2x, null, 0, v_neto);
  return v_entry;
end; $$;

-- ── CB pago proveedor: documento_soporte = 'Pago 220501 · <periodo>' ───────────────────────
create or replace function postear_pago_proveedor_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text; v_puc text; v_pre boolean;
  v_entry uuid; v_consec integer; v_cb uuid;
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description, c.puc_code, bt.periodo_pre_corte
    into v_ter, v_monto, v_fecha, v_desc, v_puc, v_pre
    from bank_transactions bt left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  if v_ter is null then raise exception 'El movimiento % no tiene tercero (proveedor)', p_bank_transaction_id; end if;
  if coalesce(v_pre, false) or periodo_bloqueado(v_fecha) then raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;
  if v_puc is distinct from '220501' then raise exception 'El movimiento % no está categorizado como pago a proveedor (puc 220501)', p_bank_transaction_id; end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;
  select id into v_cb from journal_entries where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then raise exception 'El movimiento % ya tiene pago contabilizado (asiento %)', p_bank_transaction_id, v_cb; end if;

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Pago a proveedor' || coalesce(' · ' || v_desc, ''), 'Pago 220501 · ' || to_char(v_fecha,'YYYY-MM'), 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '220501',   v_ter, null, v_monto, 0);
  perform contab_insert_linea(v_entry, '11100510', null,  null, 0, v_monto);
  return v_entry;
end; $$;

-- ── CB anticipo conductor: manifiesto si liga a viaje, si no 'Anticipo · <conductor>' ──────
create or replace function postear_anticipo_conductor_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text;
  v_es_conductor boolean; v_es_anticipo boolean; v_pre_corte boolean;
  v_reftype text; v_refid uuid; v_ref text;
  v_entry uuid; v_consec integer; v_cb uuid;
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description,
         exists(select 1 from drivers d where d.tercero_id = bt.tercero_id),
         (c.puc_code = '13301510'), bt.periodo_pre_corte, bt.reference_type, bt.reference_id
    into v_ter, v_monto, v_fecha, v_desc, v_es_conductor, v_es_anticipo, v_pre_corte, v_reftype, v_refid
    from bank_transactions bt left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  if v_ter is null then raise exception 'El movimiento % no tiene tercero', p_bank_transaction_id; end if;
  if coalesce(v_pre_corte, false) or periodo_bloqueado(v_fecha) then raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;
  if not coalesce(v_es_conductor, false) then raise exception 'El tercero del movimiento % no es un conductor (no existe en drivers); un anticipo a conductor requiere un conductor', p_bank_transaction_id; end if;
  if not coalesce(v_es_anticipo, false) then raise exception 'El movimiento % no está categorizado como "Anticipo conductor" (puc 13301510)', p_bank_transaction_id; end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;
  select id into v_cb from journal_entries where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='CB' and estado='CONTABILIZADO' limit 1;
  if v_cb is not null then raise exception 'El movimiento % ya tiene entrega de anticipo contabilizada (asiento %)', p_bank_transaction_id, v_cb; end if;

  if v_reftype = 'TRIP' and v_refid is not null then
    select coalesce(nullif(trim(manifest_number),''), trip_number) into v_ref from trips where id = v_refid;
  end if;
  v_ref := coalesce(v_ref, 'Anticipo · ' || coalesce((select full_name from drivers where tercero_id = v_ter limit 1), '—'));

  v_consec := consecutivo_siguiente('CB');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CB', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Entrega de anticipo a conductor'||coalesce(' · '||v_desc, ''), v_ref, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '13301510', v_ter, null, v_monto, 0);
  perform contab_insert_linea(v_entry, '11100510', null,  null, 0, v_monto);
  return v_entry;
end; $$;

-- ── RC recibo anticipo cliente: manifiesto si liga a viaje, si no 'Anticipo · <cliente>' ───
create or replace function postear_recibo_anticipo_banco(p_bank_transaction_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_fecha date; v_desc text;
  v_es_cliente boolean; v_es_anticipo boolean; v_pre_corte boolean;
  v_reftype text; v_refid uuid; v_ref text; v_nombre text;
  v_entry uuid; v_consec integer; v_rc uuid;
begin
  select bt.tercero_id, bt.amount, bt.date, bt.description,
         t.es_cliente, (c.puc_code = '28050510'), bt.periodo_pre_corte, bt.reference_type, bt.reference_id,
         coalesce(t.razon_social, nullif(trim(concat_ws(' ', t.primer_nombre, t.otros_nombres, t.primer_apellido, t.segundo_apellido)),''))
    into v_ter, v_monto, v_fecha, v_desc, v_es_cliente, v_es_anticipo, v_pre_corte, v_reftype, v_refid, v_nombre
    from bank_transactions bt
    left join terceros t on t.id = bt.tercero_id
    left join transaction_categories c on c.id = bt.category_id
   where bt.id = p_bank_transaction_id;
  if not found then raise exception 'Movimiento bancario % no existe', p_bank_transaction_id; end if;
  if v_ter is null then raise exception 'El movimiento % no tiene tercero', p_bank_transaction_id; end if;
  if coalesce(v_pre_corte, false) or periodo_bloqueado(v_fecha) then raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;
  if not coalesce(v_es_cliente, false) then raise exception 'El tercero del movimiento % no es cliente; un anticipo de cliente requiere es_cliente=true', p_bank_transaction_id; end if;
  if not coalesce(v_es_anticipo, false) then raise exception 'El movimiento % no está categorizado como "Anticipo de cliente" (puc 28050510)', p_bank_transaction_id; end if;
  if coalesce(v_monto,0) <= 0 then raise exception 'El movimiento % no tiene monto > 0', p_bank_transaction_id; end if;
  select id into v_rc from journal_entries where origen_tabla='bank_transactions' and origen_id=p_bank_transaction_id and tipo_comprobante='RC' and estado='CONTABILIZADO' limit 1;
  if v_rc is not null then raise exception 'El movimiento % ya tiene recibo de anticipo contabilizado (asiento %)', p_bank_transaction_id, v_rc; end if;

  if v_reftype = 'TRIP' and v_refid is not null then
    select coalesce(nullif(trim(manifest_number),''), trip_number) into v_ref from trips where id = v_refid;
  end if;
  v_ref := coalesce(v_ref, 'Anticipo · ' || coalesce(v_nombre, '—'));

  v_consec := consecutivo_siguiente('RC');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('RC', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Recibo de anticipo de cliente'||coalesce(' · '||v_desc, ''), v_ref, 'bank_transactions', p_bank_transaction_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '11100510', null,  null, v_monto, 0);
  perform contab_insert_linea(v_entry, '28050510', v_ter, null, 0, v_monto);
  return v_entry;
end; $$;
