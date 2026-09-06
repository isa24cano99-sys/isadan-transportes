-- ════════════════════════════════════════════════════════════════════════════
-- Reclasificación automática de saldos DÉBITO en 220501 (pago a proveedor) al cierre.
--
-- Un pasivo (220501) con saldo débito = sobrepago a un proveedor = en realidad un
-- anticipo (activo). Se reclasifica a 133005 (anticipo a proveedores) por tercero, para
-- que el balance no muestre un pasivo en negativo. Caso real: F2X/Flypass (prepago de
-- peajes) — se hizo a mano en julio (CG-126) y reapareció en agosto.
--
-- Política B (acumulativa) + salvaguarda de consumo, por tercero, sobre el saldo del libro:
--   · saldo 220501 en DÉBITO  → DB 133005 / CR 220501  (reclasifica el sobrepago al activo;
--        acumula: julio 272.250 + agosto 217.900 = 490.150 en 133005)
--   · saldo 220501 en CRÉDITO Y con prepago en 133005 → DB 220501 / CR 133005 por el menor
--        de ambos (consume el anticipo contra el pasivo que reaparece, antes de acumular más)
-- UN asiento CG por periodo (origen 'reclasif_220501'), anti-duplicado por periodo.
-- Se llama desde postear_cierre_periodo (corre sola en cada cierre). Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function reclasificar_saldos_debito_220501(p_periodo date)
returns jsonb language plpgsql as $$
declare
  v_mes text := to_char(p_periodo,'YYYY-MM');
  v_fecha date := (date_trunc('month',p_periodo) + interval '1 month - 1 day')::date;
  v_entry uuid; v_consec integer; v_dup uuid; v_n integer := 0; v_cnt integer; r record; v_monto numeric;
begin
  -- anti-duplicado: ya hay reclasificación para el periodo
  select id into v_dup from journal_entries
   where origen_tabla='reclasif_220501' and periodo=v_mes and estado='CONTABILIZADO' limit 1;
  if v_dup is not null then return jsonb_build_object('skipped', true, 'asiento', v_dup); end if;

  -- ¿hay algo que reclasificar? (para no crear un asiento vacío)
  with s220 as (
    select l.tercero_id, sum(l.credito - l.debito) as saldo
      from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
     where l.cuenta_puc='220501' and e.estado='CONTABILIZADO' and l.tercero_id is not null
     group by l.tercero_id),
  s133 as (
    select l.tercero_id, sum(l.debito - l.credito) as prepago
      from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
     where l.cuenta_puc='133005' and e.estado='CONTABILIZADO' and l.tercero_id is not null
     group by l.tercero_id)
  select count(*) into v_cnt
    from s220 full outer join s133 on s133.tercero_id=s220.tercero_id
   where coalesce(s220.saldo,0) < -0.5
      or (coalesce(s220.saldo,0) > 0.5 and coalesce(s133.prepago,0) > 0.5);
  if coalesce(v_cnt,0) = 0 then return jsonb_build_object('reclasificados', 0); end if;

  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla)
    values ('CG', v_consec, v_fecha, v_mes,
            'Reclasificación saldos débito 220501 → anticipo a proveedores (133005) · '||v_mes, 'reclasif_220501')
    returning id into v_entry;

  for r in
    with s220 as (
      select l.tercero_id, sum(l.credito - l.debito) as saldo
        from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
       where l.cuenta_puc='220501' and e.estado='CONTABILIZADO' and l.tercero_id is not null
       group by l.tercero_id),
    s133 as (
      select l.tercero_id, sum(l.debito - l.credito) as prepago
        from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
       where l.cuenta_puc='133005' and e.estado='CONTABILIZADO' and l.tercero_id is not null
       group by l.tercero_id)
    select coalesce(s220.tercero_id, s133.tercero_id) as tercero,
           coalesce(s220.saldo,0) as saldo220, coalesce(s133.prepago,0) as prepago133
      from s220 full outer join s133 on s133.tercero_id=s220.tercero_id
  loop
    if r.saldo220 < -0.5 then
      -- saldo DÉBITO en el pasivo → reclasificar el sobrepago al activo (acumula)
      v_monto := -r.saldo220;
      perform contab_insert_linea(v_entry, '133005', r.tercero, null, v_monto, 0);  -- DB anticipo proveedor
      perform contab_insert_linea(v_entry, '220501', r.tercero, null, 0, v_monto);  -- CR limpia el pasivo
      v_n := v_n + 1;
    elsif r.saldo220 > 0.5 and r.prepago133 > 0.5 then
      -- el pasivo reaparece Y hay prepago acumulado → consumir el anticipo (salvaguarda)
      v_monto := least(r.saldo220, r.prepago133);
      perform contab_insert_linea(v_entry, '220501', r.tercero, null, v_monto, 0);  -- DB abona el pasivo
      perform contab_insert_linea(v_entry, '133005', r.tercero, null, 0, v_monto);  -- CR consume el anticipo
      v_n := v_n + 1;
    end if;
  end loop;

  return jsonb_build_object('reclasificados', v_n, 'asiento', v_entry, 'consecutivo', v_consec);
end; $$;

-- ── postear_cierre_periodo: corre la reclasificación ANTES del barrido de clase 4-7 ─────────
create or replace function postear_cierre_periodo(p_periodo date)
returns uuid language plpgsql as $$
declare
  v_mes   text := to_char(p_periodo, 'YYYY-MM');
  v_fecha date := (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date;
  v_entry uuid; v_consec integer; v_dup uuid;
  v_neto  numeric := 0;
  r record;
begin
  select id into v_dup from journal_entries
   where tipo_comprobante='CC' and periodo=v_mes and estado='CONTABILIZADO' limit 1;
  if v_dup is not null then
    raise exception 'El periodo % ya tiene cierre contabilizado (asiento %)', v_mes, v_dup;
  end if;
  if exists (select 1 from periodos_contables where periodo=v_mes and estado='CERRADO') then
    raise exception 'El periodo % ya está CERRADO', v_mes;
  end if;

  -- Reclasificación de saldos débito en 220501 (corre con el periodo aún abierto)
  perform reclasificar_saldos_debito_220501(p_periodo);

  if not exists (
    select 1 from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
     where e.estado='CONTABILIZADO' and e.periodo=v_mes and left(l.cuenta_puc,1) in ('4','5','6','7')
  ) then
    raise exception 'El periodo % no tiene movimiento de clase 4-7 para cerrar', v_mes;
  end if;

  v_consec := consecutivo_siguiente('CC');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla)
    values ('CC', v_consec, v_fecha, v_mes, 'Cierre del periodo '||v_mes||' — resultado a 3610', 'periodos_contables')
    returning id into v_entry;

  for r in
    select l.cuenta_puc, l.tercero_id, l.centro_costo, left(l.cuenta_puc,1) as clase,
           sum(l.debito) as d, sum(l.credito) as c
      from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
     where e.estado='CONTABILIZADO' and e.periodo=v_mes and left(l.cuenta_puc,1) in ('4','5','6','7')
     group by l.cuenta_puc, l.tercero_id, l.centro_costo
  loop
    if r.clase = '4' then
      if (r.c - r.d) <> 0 then
        perform contab_insert_linea(v_entry, r.cuenta_puc, r.tercero_id, r.centro_costo, r.c - r.d, 0);
        v_neto := v_neto + (r.c - r.d);
      end if;
    else
      if (r.d - r.c) <> 0 then
        perform contab_insert_linea(v_entry, r.cuenta_puc, r.tercero_id, r.centro_costo, 0, r.d - r.c);
        v_neto := v_neto - (r.d - r.c);
      end if;
    end if;
  end loop;

  if v_neto > 0 then
    perform contab_insert_linea(v_entry, '3610', null, null, 0, v_neto);
  elsif v_neto < 0 then
    perform contab_insert_linea(v_entry, '3610', null, null, -v_neto, 0);
  end if;

  insert into periodos_contables (periodo, estado, fecha_cierre)
    values (v_mes, 'CERRADO', now())
    on conflict (periodo) do update set estado='CERRADO', fecha_cierre=now();

  return v_entry;
end; $$;
