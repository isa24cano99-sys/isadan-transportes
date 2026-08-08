-- ════════════════════════════════════════════════════════════════════════════
-- Evento de respaldo: gasto de legalización SIN factura enlazada (ACPM/cargue/descargue).
--
--   Cuando una línea de ACPM/cargue/descargue de una legalización APROBADA no tiene FE
--   enlazada (matched_invoice_id NULL), igual hay un costo real que contabilizar. Se postea:
--     DB 61450510/61450515/61450535 (según tipo)  tercero = CONSUMIDOR FINAL  cc = placa (si hay)
--     CR 13301510 Anticipo a trabajadores          tercero = CONDUCTOR         cc = placa (si hay)
--   Comprobante CG. Mismo lado crédito que el porcentaje conductor (sale del anticipo del conductor).
--
--   MEJORA sobre el histórico de Dataico: Dataico usaba "VEHICULO placa nombre" como tercero
--   — ni un proveedor real ni un genérico válido para la DIAN. Aquí el tercero es CONSUMIDOR
--   FINAL (NIT 222222222222), el genérico VÁLIDO de "cuantías menores" de la DIAN para un
--   receptor no identificado. NO replicamos el patrón viejo: lo corregimos.
--
--   GUARD BIDIRECCIONAL contra doble conteo (no depende de disciplina del usuario):
--     (1) este evento EXCLUYE toda línea con matched_invoice_id (ya tiene FE) y toda línea
--         que ya tenga un CG contabilizado por su propio origen (anti-dup).
--     (2) postear_costo_dian RECHAZA postear una FE si alguna línea de legalización enlazada
--         a ella ya se contabilizó por este evento sin-FE — así, si se postea sin-FE y luego
--         alguien enlaza una FE, el otro lado avisa en vez de duplicar en silencio.
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function postear_gastos_legalizacion_sin_fe(p_periodo date)
returns integer language plpgsql as $$
declare
  v_cf uuid; v_rec record; v_entry uuid; v_consec integer; v_cuenta text; v_n integer := 0;
begin
  select id into v_cf from terceros where numero_identificacion = '222222222222' limit 1;
  if v_cf is null then raise exception 'No existe el tercero CONSUMIDOR FINAL (222222222222)'; end if;

  for v_rec in
    select le.id as line_id, le.expense_type, le.amount,
           coalesce(le.date, l.date) as fecha,
           d.tercero_id as conductor, v.plate as placa
      from legalization_expenses le
      join legalizations l on l.id = le.legalization_id
      left join drivers d  on d.id = l.driver_id
      left join vehicles v on v.id = l.vehicle_id
     where le.expense_type in ('acpm_contado','cargue','descargue')
       and le.matched_invoice_id is null                                   -- (1) sin FE enlazada
       and l.status = 'APROBADA'
       and to_char(coalesce(le.date, l.date),'YYYY-MM') = to_char(p_periodo,'YYYY-MM')
       and coalesce(le.amount,0) > 0
       and not exists (                                                    -- (1) anti-dup por origen
         select 1 from journal_entries e
          where e.origen_tabla = 'legalization_expenses' and e.origen_id = le.id
            and e.tipo_comprobante = 'CG' and e.estado = 'CONTABILIZADO')
  loop
    if periodo_bloqueado(v_rec.fecha) then continue; end if;               -- pre-corte/cerrado → saltar
    if v_rec.conductor is null then
      raise exception 'La legalización de la línea % no tiene conductor con tercero_id', v_rec.line_id;
    end if;
    v_cuenta := case v_rec.expense_type
                  when 'acpm_contado' then '61450510'
                  when 'cargue'       then '61450515'
                  when 'descargue'    then '61450535' end;

    v_consec := consecutivo_siguiente('CG');
    insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
      values ('CG', v_consec, v_rec.fecha, to_char(v_rec.fecha,'YYYY-MM'),
              v_rec.expense_type || ' sin FE · placa ' || coalesce(v_rec.placa,'—') || ' (Consumidor Final)',
              'legalization_expenses', v_rec.line_id)
      returning id into v_entry;

    perform contab_insert_linea(v_entry, v_cuenta, v_cf, v_rec.placa, v_rec.amount, 0);            -- DB costo · Consumidor Final · placa
    perform contab_insert_linea(v_entry, '13301510', v_rec.conductor, v_rec.placa, 0, v_rec.amount); -- CR anticipo trabajador · conductor · placa
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;

-- ── postear_costo_dian: + guard cruzado (2). Igual que la versión vigente (placa + IVA),
--    solo agrega el rechazo si la línea enlazada ya se contabilizó sin-FE. ────────────────
create or replace function postear_costo_dian(
  p_import_id   uuid,
  p_cuenta_puc  text,
  p_credito_puc text
) returns uuid language plpgsql as $$
declare
  v_ter uuid; v_monto numeric; v_iva numeric; v_base numeric;
  v_fecha date; v_name text; v_folio text;
  v_entry uuid; v_consec integer; v_dup uuid; v_placa text; v_line_dup uuid;
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

  -- GUARD anti-duplicado por factura (mismo camino)
  select id into v_dup from journal_entries
   where origen_tabla='dian_invoices_import' and origen_id=p_import_id and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
  if v_dup is not null then
    raise exception 'La factura % ya tiene costo contabilizado (asiento %)', p_import_id, v_dup;
  end if;

  -- GUARD cruzado (2): si una línea de legalización enlazada a esta FE ya se contabilizó SIN
  -- factura (evento sin-FE), rechazar — postearla ahora duplicaría el costo del otro lado.
  select le.id into v_line_dup
    from legalization_expenses le
    join journal_entries e on e.origen_tabla='legalization_expenses' and e.origen_id=le.id
                          and e.tipo_comprobante='CG' and e.estado='CONTABILIZADO'
   where le.matched_invoice_id = p_import_id
   limit 1;
  if v_line_dup is not null then
    raise exception 'Esta línea de legalización ya se contabilizó sin factura (asiento sin-FE) — revísala antes de reasignar una FE';
  end if;

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

  perform contab_insert_linea(v_entry, p_cuenta_puc, v_ter, v_placa, v_base, 0);
  if v_iva > 0 then
    perform contab_insert_linea(v_entry, '53152010', v_ter, v_placa, v_iva, 0);
  end if;
  perform contab_insert_linea(v_entry, p_credito_puc,
            case when p_credito_puc = '11100510' then null else v_ter end, null, 0, v_monto);
  return v_entry;
end; $$;
