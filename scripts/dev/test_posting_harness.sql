-- ════════════════════════════════════════════════════════════════════════════
-- HARNESS DE PRUEBA DEL MOTOR DE POSTING — REFERENCIA DE DESARROLLO
--
-- NO es una migración. Es el andamiaje temporal que usamos para validar las
-- funciones de posting de FASE 1 · PASO 3 sin ensuciar el libro: cada test postea,
-- fuerza el trigger de cuadre DEFERRABLE con SET CONSTRAINTS ALL IMMEDIATE, recoge
-- métricas, y hace RAISE para ROLLBACK total (no persiste ningún asiento).
--
-- Se conserva aquí para re-usar en FASE 2 (nuevos eventos de posting). Para usarlo:
-- pégalo en el SQL Editor, corre `select test_postear('<evento>');` o
-- `select test_nomina_detalle();` (siempre devuelve un RAISE con el resultado), y
-- al terminar bótalo con:
--   drop function test_postear(text);
--   drop function test_nomina_detalle();
--
-- Requiere las funciones reales de posting ya aplicadas (migraciones
-- 20260730180000 y 20260730190000).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function test_postear(p_evento text)
returns void language plpgsql as $$
declare
  v_entry uuid; v_deb numeric; v_cre numeric; v_lines int; v_ft int; v_fc int; v_id uuid; v_f2x uuid;
begin
  if p_evento = 'causacion_viaje' then
    select id into v_id from trips where tercero_id is not null and coalesce(freight_value,0) > 0 limit 1;
    v_entry := postear_causacion_viaje(v_id);
  elsif p_evento = 'cruce_cartera' then
    select id into v_id from terceros where es_cliente and merged_into is null limit 1;
    v_entry := postear_cruce_cartera(v_id, 100000, date '2026-07-15', null, 'TEST');
  elsif p_evento = 'porcentaje' then
    select id into v_id from drivers where tercero_id is not null limit 1;
    v_entry := postear_porcentaje_conductor(v_id, 'TST123', 50000, date '2026-07-15', null);
  elsif p_evento = 'emision_factura' then
    select id into v_id from terceros where es_cliente and merged_into is null limit 1;
    v_entry := postear_emision_factura(v_id, 100000, date '2026-07-15', null, 'FEIT-TEST');
  elsif p_evento = 'recibo_anticipo' then
    select id into v_id from terceros where es_cliente and merged_into is null limit 1;
    v_entry := postear_recibo_anticipo(v_id, 200000, date '2026-07-15', null, 'RC-TEST');
  elsif p_evento = 'comision' then
    v_entry := postear_comision_empresa('TST123', 30000, date '2026-07-15', null, null);  -- CONSUMIDOR FINAL por defecto
  elsif p_evento = 'peaje_ok' then
    select id into v_f2x from terceros where numero_identificacion='900219834' and merged_into is null limit 1;
    v_entry := postear_peaje('TST123', 15000, date '2026-07-15', v_f2x, null);
  elsif p_evento = 'peaje_falla' then
    v_entry := postear_peaje('TST123', 15000, date '2026-07-15', null, null);       -- debe RAISE
  elsif p_evento = 'simple' then
    v_entry := postear_causacion_simple(50000, date '2026-07-15');                   -- debe RAISE
  elsif p_evento = 'apertura' then
    v_entry := postear_apertura_capital(10000000, date '2026-06-30');                -- debe RAISE
  elsif p_evento = 'nomina' then
    select tercero_id into v_id from drivers where tercero_id is not null limit 1;
    v_entry := postear_nomina_mensual(
      v_id, date '2026-07-31',
      1300000, 162000, 108333, 13000, 108333, 54167,   -- sueldo, aux, cesantías, int, prima, vac
      110500, 6786, 156000, 52000);                     -- aportes eps, arp, pensión, caja (defaults a las 4 entidades)
  else
    raise exception 'TEST_ERR: evento desconocido %', p_evento;
  end if;

  set constraints all immediate;  -- (c) fuerza el trigger de cuadre; revienta si descuadra
  select coalesce(sum(l.debito),0), coalesce(sum(l.credito),0), count(*),
         count(*) filter (where p.exige_tercero      and l.tercero_id is null),
         count(*) filter (where p.exige_centro_costo and coalesce(l.centro_costo,'') = '')
    into v_deb, v_cre, v_lines, v_ft, v_fc
    from journal_entry_lines l join puc_accounts p on p.codigo = l.cuenta_puc
   where l.journal_entry_id = v_entry;
  raise exception 'TEST_OK evento=% lines=% debito=% credito=% cuadra=% falta_tercero=% falta_cc=%',
    p_evento, v_lines, v_deb, v_cre, (v_deb = v_cre), v_ft, v_fc;
end; $$;

-- Detalle de nómina: conteo exacto de líneas, cuadre del asiento COMPLETO (SET
-- CONSTRAINTS fuerza el diferido sobre todo el asiento, no pares sueltos), y que cada
-- línea de aporte apunte a SU entidad (no mezcladas/repetidas). Rollback.
create or replace function test_nomina_detalle()
returns void language plpgsql as $$
declare
  v_id uuid; v_entry uuid; v_lines int; v_deb numeric; v_cre numeric;
  v_eps text; v_arp text; v_fondo text; v_caja text;
begin
  select tercero_id into v_id from drivers where tercero_id is not null limit 1;
  v_entry := postear_nomina_mensual(
    v_id, date '2026-07-31',
    1300000, 162000, 108333, 13000, 108333, 54167,
    110500, 6786, 156000, 52000);

  set constraints all immediate;  -- valida la suma del ASIENTO COMPLETO (no pares aislados)

  select count(*), coalesce(sum(debito),0), coalesce(sum(credito),0)
    into v_lines, v_deb, v_cre from journal_entry_lines where journal_entry_id = v_entry;
  select tercero_nit_snapshot into v_eps   from journal_entry_lines where journal_entry_id=v_entry and cuenta_puc='23700510';
  select tercero_nit_snapshot into v_arp   from journal_entry_lines where journal_entry_id=v_entry and cuenta_puc='23700610';
  select tercero_nit_snapshot into v_fondo from journal_entry_lines where journal_entry_id=v_entry and cuenta_puc='23803010';
  select tercero_nit_snapshot into v_caja  from journal_entry_lines where journal_entry_id=v_entry and cuenta_puc='23701010';

  raise exception 'NOMINA_DET lines=% debito=% credito=% cuadra=% | EPS(23700510)=% ARP(23700610)=% FONDO(23803010)=% CAJA(23701010)=%',
    v_lines, v_deb, v_cre, (v_deb = v_cre), v_eps, v_arp, v_fondo, v_caja;
end; $$;
