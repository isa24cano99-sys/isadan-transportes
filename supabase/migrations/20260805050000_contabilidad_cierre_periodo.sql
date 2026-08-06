-- ════════════════════════════════════════════════════════════════════════════
-- FASE 4 · PASO 1 (pieza 2) — Asiento de cierre del periodo.
--   postear_cierre_periodo(p_periodo): zanjea a cero las cuentas clase 4-7 con
--   movimiento en el periodo y traslada el neto a 3610 Resultados Acumulados.
--     · Ingreso (clase 4, saldo CR): DB la cuenta → cero.
--     · Costo/gasto (5/6/7, saldo DB): CR la cuenta → cero.
--     · Neto (ingresos − costos) → 3610: CR si utilidad, DB si pérdida.
--   Agrupa por (cuenta, tercero, centro_costo) para preservar los requisitos de
--   cada cuenta (41450510/6145xx exigen tercero; 61450550/580 exigen centro de costo).
--   Comprobante CC. Marca el periodo CERRADO en periodos_contables DESPUÉS de postear
--   (el CC se inserta con el periodo aún abierto, para no auto-bloquearse).
--   Anti-duplicado: rechaza si ya hay CC del periodo o el periodo ya está CERRADO.
--   REVERSO: no es automático — reabrir solo desbloquea; anular el CC es pieza aparte
--   y explícita (regla de inmutabilidad).
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_cierre_periodo(p_periodo date)
returns uuid language plpgsql as $$
declare
  v_mes   text := to_char(p_periodo, 'YYYY-MM');
  v_fecha date := (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date;
  v_entry uuid; v_consec integer; v_dup uuid;
  v_neto  numeric := 0;
  r record;
begin
  -- Anti-duplicado
  select id into v_dup from journal_entries
   where tipo_comprobante='CC' and periodo=v_mes and estado='CONTABILIZADO' limit 1;
  if v_dup is not null then
    raise exception 'El periodo % ya tiene cierre contabilizado (asiento %)', v_mes, v_dup;
  end if;
  if exists (select 1 from periodos_contables where periodo=v_mes and estado='CERRADO') then
    raise exception 'El periodo % ya está CERRADO', v_mes;
  end if;

  -- Debe haber movimiento clase 4-7
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

  -- Reversión por (cuenta, tercero, centro_costo)
  for r in
    select l.cuenta_puc, l.tercero_id, l.centro_costo, left(l.cuenta_puc,1) as clase,
           sum(l.debito) as d, sum(l.credito) as c
      from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
     where e.estado='CONTABILIZADO' and e.periodo=v_mes and left(l.cuenta_puc,1) in ('4','5','6','7')
     group by l.cuenta_puc, l.tercero_id, l.centro_costo
  loop
    if r.clase = '4' then
      if (r.c - r.d) <> 0 then
        perform contab_insert_linea(v_entry, r.cuenta_puc, r.tercero_id, r.centro_costo, r.c - r.d, 0);  -- DB ingreso → cero
        v_neto := v_neto + (r.c - r.d);
      end if;
    else
      if (r.d - r.c) <> 0 then
        perform contab_insert_linea(v_entry, r.cuenta_puc, r.tercero_id, r.centro_costo, 0, r.d - r.c);  -- CR costo → cero
        v_neto := v_neto - (r.d - r.c);
      end if;
    end if;
  end loop;

  -- Neto a 3610 (sin tercero): utilidad → CR (reduce la pérdida acumulada); pérdida → DB
  if v_neto > 0 then
    perform contab_insert_linea(v_entry, '3610', null, null, 0, v_neto);
  elsif v_neto < 0 then
    perform contab_insert_linea(v_entry, '3610', null, null, -v_neto, 0);
  end if;

  -- Marcar el periodo CERRADO (después de postear el CC)
  insert into periodos_contables (periodo, estado, fecha_cierre)
    values (v_mes, 'CERRADO', now())
    on conflict (periodo) do update set estado='CERRADO', fecha_cierre=now();

  return v_entry;
end; $$;
