-- ════════════════════════════════════════════════════════════════════════════
-- CORRECCIÓN nómina — replicar el mecanismo real empleado/patronal (mayo/junio/PILA).
--
-- Antes (incorrecto): 250505 acreditaba sueldo+auxilio COMPLETO (bruto, sin retenciones);
-- EPS y pensión se posteaban como aportes 100% patronales con gasto (52056910 / 52057010),
-- inflando el costo de nómina con un gasto patronal de salud que NO existe (exoneración).
--
-- Ahora (real), reglas FIJAS (no parámetros):
--   • EPS patronal = SIEMPRE $0 (exoneración SIMPLE, art. 25 Ley 1607, los 3 conductores).
--     → se elimina por completo la línea de gasto 52056910.
--   • Pensión = 4% empleado + 12% patronal, derivados del campo Sueldo (IBC real, sin auxilio).
--   • 250505 = NETO = (sueldo+auxilio) − 4% EPS empleado − 4% pensión empleado.
--   • 23700510 (EPS)     = solo 4% empleado (retención, sin gasto patronal).
--   • 23803010 (Pensión) = 4% empleado + 12% patronal juntos.
--   • 52057010 (gasto)   = SOLO el 12% patronal (no el total).
--   • ARL (23700610/52056810) y Caja (23701010/52057210): 100% patronal, sin cambios.
--
-- Se eliminan de la firma p_aporte_eps y p_aporte_pension (ya no se digitan: derivados).
-- Aplicar en SQL Editor. (Recuerda: PostgREST recarga el schema cache tras el DDL.)
-- ════════════════════════════════════════════════════════════════════════════

-- Drop del signature viejo (17 args) — necesario porque quitamos 2 parámetros: sin esto
-- create-or-replace crearía una SOBRECARGA en vez de reemplazar, y PostgREST quedaría ambiguo.
drop function if exists postear_nomina_mensual(
  uuid, date, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, uuid, uuid, uuid, uuid, uuid);

create or replace function postear_nomina_mensual(
  p_conductor           uuid,           -- tercero_id del conductor
  p_periodo             date,           -- fecha del asiento (fin de mes)
  p_sueldo              numeric default 0,   -- = IBC (base de cotización, sin auxilio)
  p_auxilio             numeric default 0,
  p_cesantias           numeric default 0,
  p_intereses_cesantias numeric default 0,
  p_prima               numeric default 0,
  p_vacaciones          numeric default 0,
  p_aporte_arp          numeric default 0,   -- ARL 100% patronal (tal cual PILA)
  p_aporte_caja         numeric default 0,   -- Caja 100% patronal (tal cual PILA)
  p_tercero_eps         uuid default null,
  p_tercero_arp         uuid default null,
  p_tercero_caja        uuid default null,
  p_tercero_fondo       uuid default null,
  p_origen_id           uuid default null
) returns uuid language plpgsql as $$
declare
  v_entry uuid; v_consec integer;
  v_eps uuid; v_arp uuid; v_caja uuid; v_fondo uuid;
  v_dup uuid;
  v_eps_empleado     numeric;   -- 4% empleado sobre el IBC (sueldo) — retención
  v_pension_empleado numeric;   -- 4% empleado sobre el IBC — retención
  v_pension_patronal numeric;   -- 12% patronal sobre el IBC — gasto
  v_neto             numeric;   -- (sueldo+auxilio) − retenciones del empleado
begin
  if p_conductor is null then raise exception 'La nómina requiere el tercero del conductor'; end if;
  if coalesce(p_sueldo,0)+coalesce(p_auxilio,0)+coalesce(p_cesantias,0)+coalesce(p_intereses_cesantias,0)
     +coalesce(p_prima,0)+coalesce(p_vacaciones,0)+coalesce(p_aporte_arp,0)+coalesce(p_aporte_caja,0) <= 0 then
    raise exception 'Nómina sin conceptos (todos los montos en 0)';
  end if;

  -- GUARD pre-corte: nada anterior al corte de apertura (provisiones ya en CA-1, gasto en 3610)
  if periodo_bloqueado(p_periodo) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(p_periodo,'YYYY-MM');
  end if;

  -- GUARD anti-duplicado por (conductor, mes): una nómina por conductor por periodo
  select e.id into v_dup
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
   where e.tipo_comprobante = 'CN' and e.estado = 'CONTABILIZADO'
     and e.periodo = to_char(p_periodo,'YYYY-MM')
     and l.tercero_id = p_conductor
     and l.cuenta_puc like '5205%'
   limit 1;
  if v_dup is not null then
    raise exception 'El conductor % ya tiene nómina contabilizada para % (asiento %)', p_conductor, to_char(p_periodo,'YYYY-MM'), v_dup;
  end if;

  -- Retenciones del empleado y patronal de pensión — REGLAS FIJAS derivadas del IBC (sueldo).
  v_eps_empleado     := round(coalesce(p_sueldo,0) * 0.04);
  v_pension_empleado := round(coalesce(p_sueldo,0) * 0.04);
  v_pension_patronal := round(coalesce(p_sueldo,0) * 0.12);
  v_neto := coalesce(p_sueldo,0) + coalesce(p_auxilio,0) - v_eps_empleado - v_pension_empleado;

  -- Resolver entidades (default a las fijas; override por parámetro). EPS patronal es $0 pero la
  -- retención del empleado (23700510) igual se acredita a la EPS → v_eps sigue siendo necesario.
  v_eps   := coalesce(p_tercero_eps,   (select id from terceros where numero_identificacion='800088702' and merged_into is null limit 1));
  v_arp   := coalesce(p_tercero_arp,   (select id from terceros where numero_identificacion='890903790' and merged_into is null limit 1));
  v_caja  := coalesce(p_tercero_caja,  (select id from terceros where numero_identificacion='890900841' and merged_into is null limit 1));
  v_fondo := coalesce(p_tercero_fondo, (select id from terceros where numero_identificacion='800229739' and merged_into is null limit 1));
  if v_eps_empleado     > 0 and v_eps   is null then raise exception 'No se encontró la EPS por defecto (EPS SURA 800088702)'; end if;
  if p_aporte_arp       > 0 and v_arp   is null then raise exception 'No se encontró la ARL por defecto (ARL SURA 890903790)'; end if;
  if p_aporte_caja      > 0 and v_caja  is null then raise exception 'No se encontró la Caja por defecto (COMFAMA 890900841)'; end if;
  if (v_pension_empleado + v_pension_patronal) > 0 and v_fondo is null then raise exception 'No se encontró el Fondo por defecto (PROTECCION 800229739)'; end if;

  v_consec := consecutivo_siguiente('CN');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CN', v_consec, p_periodo, to_char(p_periodo,'YYYY-MM'), 'Nómina mensual conductor', 'legalizations', p_origen_id)
    returning id into v_entry;

  -- ── Devengo salarial: gasto completo (DB), retenciones del empleado (CR), neto a 250505 ──
  if p_sueldo  > 0 then perform contab_insert_linea(v_entry,'52050610',p_conductor,null,p_sueldo,0);  end if;  -- DB gasto sueldo
  if p_auxilio > 0 then perform contab_insert_linea(v_entry,'52052710',p_conductor,null,p_auxilio,0); end if;  -- DB gasto auxilio
  if v_eps_empleado > 0 then
    perform contab_insert_linea(v_entry,'23700510',v_eps,null,0,v_eps_empleado);            -- CR EPS = 4% empleado (retención, sin gasto patronal)
  end if;
  if (v_pension_empleado + v_pension_patronal) > 0 then
    perform contab_insert_linea(v_entry,'23803010',v_fondo,null,0,v_pension_empleado + v_pension_patronal);  -- CR Pensión = 4% empleado + 12% patronal
    if v_pension_patronal > 0 then
      perform contab_insert_linea(v_entry,'52057010',p_conductor,null,v_pension_patronal,0); -- DB gasto SOLO el 12% patronal
    end if;
  end if;
  if v_neto > 0 then
    perform contab_insert_linea(v_entry,'250505',p_conductor,null,0,v_neto);                 -- CR Salarios por pagar = NETO
  end if;

  -- ── Provisiones prestacionales (gasto / por pagar, tercero = conductor) ──
  if p_cesantias           > 0 then perform contab_insert_linea(v_entry,'52053010',p_conductor,null,p_cesantias,0);           perform contab_insert_linea(v_entry,'251015',p_conductor,null,0,p_cesantias);           end if;
  if p_intereses_cesantias > 0 then perform contab_insert_linea(v_entry,'52053310',p_conductor,null,p_intereses_cesantias,0); perform contab_insert_linea(v_entry,'251510',p_conductor,null,0,p_intereses_cesantias); end if;
  if p_prima               > 0 then perform contab_insert_linea(v_entry,'52053610',p_conductor,null,p_prima,0);               perform contab_insert_linea(v_entry,'252010',p_conductor,null,0,p_prima);               end if;
  if p_vacaciones          > 0 then perform contab_insert_linea(v_entry,'52053910',p_conductor,null,p_vacaciones,0);          perform contab_insert_linea(v_entry,'252510',p_conductor,null,0,p_vacaciones);          end if;

  -- ── Aportes 100% patronales (sin cambios): ARL y Caja ──
  if p_aporte_arp  > 0 then
    perform contab_insert_linea(v_entry,'52056810',p_conductor,null,p_aporte_arp,0);
    perform contab_insert_linea(v_entry,'23700610',v_arp,      null,0,p_aporte_arp);
  end if;
  if p_aporte_caja > 0 then
    perform contab_insert_linea(v_entry,'52057210',p_conductor,null,p_aporte_caja,0);
    perform contab_insert_linea(v_entry,'23701010',v_caja,     null,0,p_aporte_caja);
  end if;

  return v_entry;
end; $$;
