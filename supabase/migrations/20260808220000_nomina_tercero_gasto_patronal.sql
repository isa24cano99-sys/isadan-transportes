-- ════════════════════════════════════════════════════════════════════════════
-- FIX nómina — las 3 líneas de GASTO patronal deben llevar el tercero de la ENTIDAD,
-- no el del conductor (inconsistente con su línea de crédito hermana). Confirmado contra
-- los comprobantes reales (abr/may/jun): 52057010→fondo, 52056810→ARL, 52057210→caja.
--   El conductor sigue correcto en sueldo/auxilio/cesantías/intereses/prima/vacaciones.
--
-- Además: el guard anti-duplicado ahora IGNORA un CN ya reversado (con un CX anula_a),
-- para permitir re-postear el mes tras corregir por reversión (los CN son inmutables).
--
-- Idéntica a 20260808200000 salvo esos dos cambios (misma firma → create or replace, sin drop).
-- Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_nomina_mensual(
  p_conductor           uuid,
  p_periodo             date,
  p_sueldo              numeric default 0,
  p_auxilio             numeric default 0,
  p_cesantias           numeric default 0,
  p_intereses_cesantias numeric default 0,
  p_prima               numeric default 0,
  p_vacaciones          numeric default 0,
  p_aporte_arp          numeric default 0,
  p_aporte_caja         numeric default 0,
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
  v_eps_empleado     numeric;
  v_pension_empleado numeric;
  v_pension_patronal numeric;
  v_neto             numeric;
begin
  if p_conductor is null then raise exception 'La nómina requiere el tercero del conductor'; end if;
  if coalesce(p_sueldo,0)+coalesce(p_auxilio,0)+coalesce(p_cesantias,0)+coalesce(p_intereses_cesantias,0)
     +coalesce(p_prima,0)+coalesce(p_vacaciones,0)+coalesce(p_aporte_arp,0)+coalesce(p_aporte_caja,0) <= 0 then
    raise exception 'Nómina sin conceptos (todos los montos en 0)';
  end if;

  if periodo_bloqueado(p_periodo) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(p_periodo,'YYYY-MM');
  end if;

  -- GUARD anti-duplicado por (conductor, mes) — pero IGNORA un CN ya reversado (con CX anula_a):
  -- tras corregir por reversión, el mes debe poder re-postearse.
  select e.id into v_dup
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
   where e.tipo_comprobante = 'CN' and e.estado = 'CONTABILIZADO'
     and e.periodo = to_char(p_periodo,'YYYY-MM')
     and l.tercero_id = p_conductor
     and l.cuenta_puc like '5205%'
     and not exists (select 1 from journal_entries r
                      where r.anula_a = e.id and r.estado = 'CONTABILIZADO')
   limit 1;
  if v_dup is not null then
    raise exception 'El conductor % ya tiene nómina contabilizada para % (asiento %)', p_conductor, to_char(p_periodo,'YYYY-MM'), v_dup;
  end if;

  v_eps_empleado     := round(coalesce(p_sueldo,0) * 0.04);
  v_pension_empleado := round(coalesce(p_sueldo,0) * 0.04);
  v_pension_patronal := round(coalesce(p_sueldo,0) * 0.12);
  v_neto := coalesce(p_sueldo,0) + coalesce(p_auxilio,0) - v_eps_empleado - v_pension_empleado;

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

  -- Devengo salarial (tercero = conductor): gasto completo, retenciones, neto a 250505
  if p_sueldo  > 0 then perform contab_insert_linea(v_entry,'52050610',p_conductor,null,p_sueldo,0);  end if;
  if p_auxilio > 0 then perform contab_insert_linea(v_entry,'52052710',p_conductor,null,p_auxilio,0); end if;
  if v_eps_empleado > 0 then
    perform contab_insert_linea(v_entry,'23700510',v_eps,null,0,v_eps_empleado);
  end if;
  if (v_pension_empleado + v_pension_patronal) > 0 then
    perform contab_insert_linea(v_entry,'23803010',v_fondo,null,0,v_pension_empleado + v_pension_patronal);
    if v_pension_patronal > 0 then
      -- FIX: gasto pensión patronal → tercero = FONDO (no el conductor)
      perform contab_insert_linea(v_entry,'52057010',v_fondo,null,v_pension_patronal,0);
    end if;
  end if;
  if v_neto > 0 then
    perform contab_insert_linea(v_entry,'250505',p_conductor,null,0,v_neto);
  end if;

  -- Provisiones prestacionales (tercero = conductor)
  if p_cesantias           > 0 then perform contab_insert_linea(v_entry,'52053010',p_conductor,null,p_cesantias,0);           perform contab_insert_linea(v_entry,'251015',p_conductor,null,0,p_cesantias);           end if;
  if p_intereses_cesantias > 0 then perform contab_insert_linea(v_entry,'52053310',p_conductor,null,p_intereses_cesantias,0); perform contab_insert_linea(v_entry,'251510',p_conductor,null,0,p_intereses_cesantias); end if;
  if p_prima               > 0 then perform contab_insert_linea(v_entry,'52053610',p_conductor,null,p_prima,0);               perform contab_insert_linea(v_entry,'252010',p_conductor,null,0,p_prima);               end if;
  if p_vacaciones          > 0 then perform contab_insert_linea(v_entry,'52053910',p_conductor,null,p_vacaciones,0);          perform contab_insert_linea(v_entry,'252510',p_conductor,null,0,p_vacaciones);          end if;

  -- Aportes 100% patronales — FIX: gasto (débito) con tercero = ENTIDAD, no el conductor
  if p_aporte_arp  > 0 then
    perform contab_insert_linea(v_entry,'52056810',v_arp, null,p_aporte_arp,0);   -- gasto ARL → ARL
    perform contab_insert_linea(v_entry,'23700610',v_arp, null,0,p_aporte_arp);
  end if;
  if p_aporte_caja > 0 then
    perform contab_insert_linea(v_entry,'52057210',v_caja,null,p_aporte_caja,0);  -- gasto caja → caja
    perform contab_insert_linea(v_entry,'23701010',v_caja,null,0,p_aporte_caja);
  end if;

  return v_entry;
end; $$;
