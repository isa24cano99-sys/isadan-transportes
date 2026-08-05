-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 · Nómina — corrección del NIT por defecto del fondo de pensión.
--   Protección tenía NIT 800300739 (incorrecto). Verificado contra el documento
--   oficial de PILA: el NIT real de PROTECCIÓN es 800229739. Se corrigió el tercero
--   (data) y aquí se actualiza el default del fondo en postear_nomina_mensual.
--   Recrea la función idéntica a 20260804170000 salvo el NIT (800300739 → 800229739).
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_nomina_mensual(
  p_conductor           uuid,           -- tercero_id del conductor
  p_periodo             date,           -- fecha del asiento (fin de mes)
  p_sueldo              numeric default 0,
  p_auxilio             numeric default 0,
  p_cesantias           numeric default 0,
  p_intereses_cesantias numeric default 0,
  p_prima               numeric default 0,
  p_vacaciones          numeric default 0,
  p_aporte_eps          numeric default 0,
  p_aporte_arp          numeric default 0,
  p_aporte_pension      numeric default 0,
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
begin
  if p_conductor is null then raise exception 'La nómina requiere el tercero del conductor'; end if;
  if coalesce(p_sueldo,0)+coalesce(p_auxilio,0)+coalesce(p_cesantias,0)+coalesce(p_intereses_cesantias,0)
     +coalesce(p_prima,0)+coalesce(p_vacaciones,0)+coalesce(p_aporte_eps,0)+coalesce(p_aporte_arp,0)
     +coalesce(p_aporte_pension,0)+coalesce(p_aporte_caja,0) <= 0 then
    raise exception 'Nómina sin conceptos (todos los montos en 0)';
  end if;

  -- GUARD pre-corte: nada anterior al corte de apertura (provisiones ya en CA-1, gasto en 3610)
  if p_periodo < date '2026-07-01' then
    raise exception 'Nómina pre-corte (%): las provisiones ya están en la apertura CA-1; no se contabiliza.', p_periodo;
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

  -- Resolver entidades de aportes (default a las fijas; override por parámetro)
  v_eps   := coalesce(p_tercero_eps,   (select id from terceros where numero_identificacion='800088702' and merged_into is null limit 1));
  v_arp   := coalesce(p_tercero_arp,   (select id from terceros where numero_identificacion='890903790' and merged_into is null limit 1));
  v_caja  := coalesce(p_tercero_caja,  (select id from terceros where numero_identificacion='890900841' and merged_into is null limit 1));
  v_fondo := coalesce(p_tercero_fondo, (select id from terceros where numero_identificacion='800229739' and merged_into is null limit 1));
  if p_aporte_eps     > 0 and v_eps   is null then raise exception 'No se encontró la EPS por defecto (EPS SURA 800088702)'; end if;
  if p_aporte_arp     > 0 and v_arp   is null then raise exception 'No se encontró la ARL por defecto (ARL SURA 890903790)'; end if;
  if p_aporte_caja    > 0 and v_caja  is null then raise exception 'No se encontró la Caja por defecto (COMFAMA 890900841)'; end if;
  if p_aporte_pension > 0 and v_fondo is null then raise exception 'No se encontró el Fondo por defecto (PROTECCION 800229739)'; end if;

  v_consec := consecutivo_siguiente('CN');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
    values ('CN', v_consec, p_periodo, to_char(p_periodo,'YYYY-MM'), 'Nómina mensual conductor', 'legalizations', p_origen_id)
    returning id into v_entry;

  -- Devengo (tercero = conductor en ambos lados)
  if p_sueldo > 0 then
    perform contab_insert_linea(v_entry,'52050610',p_conductor,null,p_sueldo,0);
    perform contab_insert_linea(v_entry,'250505',  p_conductor,null,0,p_sueldo);
  end if;
  if p_auxilio > 0 then
    perform contab_insert_linea(v_entry,'52052710',p_conductor,null,p_auxilio,0);
    perform contab_insert_linea(v_entry,'250505',  p_conductor,null,0,p_auxilio);
  end if;
  if p_cesantias > 0 then
    perform contab_insert_linea(v_entry,'52053010',p_conductor,null,p_cesantias,0);
    perform contab_insert_linea(v_entry,'251015',  p_conductor,null,0,p_cesantias);
  end if;
  if p_intereses_cesantias > 0 then
    perform contab_insert_linea(v_entry,'52053310',p_conductor,null,p_intereses_cesantias,0);
    perform contab_insert_linea(v_entry,'251510',  p_conductor,null,0,p_intereses_cesantias);
  end if;
  if p_prima > 0 then
    perform contab_insert_linea(v_entry,'52053610',p_conductor,null,p_prima,0);
    perform contab_insert_linea(v_entry,'252010',  p_conductor,null,0,p_prima);
  end if;
  if p_vacaciones > 0 then
    perform contab_insert_linea(v_entry,'52053910',p_conductor,null,p_vacaciones,0);
    perform contab_insert_linea(v_entry,'252510',  p_conductor,null,0,p_vacaciones);
  end if;

  -- Aportes patronales (DB gasto tercero=conductor / CR por pagar tercero=entidad)
  if p_aporte_eps > 0 then
    perform contab_insert_linea(v_entry,'52056910',p_conductor,null,p_aporte_eps,0);
    perform contab_insert_linea(v_entry,'23700510',v_eps,      null,0,p_aporte_eps);
  end if;
  if p_aporte_arp > 0 then
    perform contab_insert_linea(v_entry,'52056810',p_conductor,null,p_aporte_arp,0);
    perform contab_insert_linea(v_entry,'23700610',v_arp,      null,0,p_aporte_arp);
  end if;
  if p_aporte_pension > 0 then
    perform contab_insert_linea(v_entry,'52057010',p_conductor,null,p_aporte_pension,0);
    perform contab_insert_linea(v_entry,'23803010',v_fondo,    null,0,p_aporte_pension);
  end if;
  if p_aporte_caja > 0 then
    perform contab_insert_linea(v_entry,'52057210',p_conductor,null,p_aporte_caja,0);
    perform contab_insert_linea(v_entry,'23701010',v_caja,     null,0,p_aporte_caja);
  end if;

  return v_entry;
end; $$;
