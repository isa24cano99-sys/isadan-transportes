-- ════════════════════════════════════════════════════════════════════════════
-- LIMPIEZA (Opción B) — borrar los asientos fragmentados del sistema viejo de las 13
-- legalizaciones + los 9 asientos de FE causados standalone (CR 220501, ninguno pagado),
-- y regenerar cada legalización con aprobar_legalizacion consolidado (FE inline · CR 13301510).
--
-- Excepción sancionada a la inmutabilidad: el usuario autorizó BORRAR (no reversar) porque
-- el sistema aún está en construcción / sin aprobación formal. Se desactivan puntualmente los
-- triggers trg_bloquea_edicion_* solo para el borrado y se reactivan enseguida.
--
-- ATÓMICO: si algún leg no cuadra contra total_expenses, o el libro diario global no cuadra
-- débito=crédito, hace RAISE y revierte TODO. Correr en SQL Editor. Después, correr los dos
-- SELECT de verificación (abajo) para ver las 13 con su nuevo consecutivo.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_trips text[] := array['VJ-0045','VJ-0046','VJ-0047','VJ-0048','VJ-0049','VJ-0052',
                          'VJ-0053','VJ-0054','VJ-0085','VJ-0086','VJ-0088','VJ-0089','VJ-0090'];
  v_tn text; v_leg uuid; v_legtot numeric; v_ids uuid[];
  v_ret jsonb; v_tot numeric; v_bad text := ''; v_db numeric; v_cr numeric; v_borr int := 0; v_regen int := 0;
begin
  -- 1) DESACTIVAR inmutabilidad
  alter table journal_entry_lines disable trigger trg_bloquea_edicion_lines;
  alter table journal_entries     disable trigger trg_bloquea_edicion_entries;

  -- 2) BORRAR fragmentos de las 13 (origen legalizations + legalization_expenses + FE conciliación)
  foreach v_tn in array v_trips loop
    select l.id into v_leg from legalizations l join trips t on t.id=l.trip_id where t.trip_number=v_tn;
    select array_agg(e.id) into v_ids from journal_entries e
     where e.tipo_comprobante='CG' and e.estado='CONTABILIZADO' and (
       (e.origen_tabla='legalizations'            and e.origen_id=v_leg)
       or (e.origen_tabla='legalization_expenses' and e.origen_id in (select id from legalization_expenses where legalization_id=v_leg))
       or (e.origen_tabla='dian_invoices_import'  and e.origen_id in (select matched_invoice_id from legalization_expenses where legalization_id=v_leg and matched_invoice_id is not null)));
    if v_ids is not null then
      delete from journal_entry_lines where journal_entry_id = any(v_ids);
      delete from journal_entries     where id = any(v_ids);
      v_borr := v_borr + array_length(v_ids,1);
    end if;
  end loop;

  -- 3) REACTIVAR inmutabilidad
  alter table journal_entries     enable trigger trg_bloquea_edicion_entries;
  alter table journal_entry_lines enable trigger trg_bloquea_edicion_lines;

  -- 4) REGENERAR + 5) verificar cada leg contra total_expenses
  foreach v_tn in array v_trips loop
    select l.id, l.total_expenses into v_leg, v_legtot from legalizations l join trips t on t.id=l.trip_id where t.trip_number=v_tn;
    v_ret := aprobar_legalizacion(v_leg); v_regen := v_regen + 1;
    select sum(l.debito) into v_tot from journal_entries e join journal_entry_lines l on l.journal_entry_id=e.id
      where e.origen_tabla='legalizations' and e.origen_id=v_leg and e.estado='CONTABILIZADO';
    if v_tot is distinct from v_legtot then
      v_bad := v_bad || v_tn||' (Σ='||coalesce(v_tot,0)||' vs total='||v_legtot||'); ';
    end if;
  end loop;
  if v_bad <> '' then raise exception 'MISMATCH por-leg — se revierte todo: %', v_bad; end if;

  -- 6) cuadre global del libro diario
  select sum(debito), sum(credito) into v_db, v_cr from journal_entry_lines;
  if v_db is distinct from v_cr then raise exception 'LIBRO DIARIO DESCUADRADO — se revierte todo: DB=% CR=%', v_db, v_cr; end if;

  raise notice 'OK · borrados=% · regenerados=% · cuadre global DB=CR=%', v_borr, v_regen, v_db;
end $$;

-- ── Verificación 1: las 13 con su nuevo consecutivo y total vs total_expenses ──────────────
select t.trip_number, 'CG-'||e.consecutivo as asiento, e.fecha,
       sum(l.debito) as total_asiento, lg.total_expenses,
       case when sum(l.debito)=lg.total_expenses then 'OK' else 'DIFF' end as chk
  from journal_entries e
  join journal_entry_lines l on l.journal_entry_id=e.id
  join legalizations lg on lg.id=e.origen_id
  join trips t on t.id=lg.trip_id
 where e.origen_tabla='legalizations' and e.estado='CONTABILIZADO'
   and t.trip_number in ('VJ-0045','VJ-0046','VJ-0047','VJ-0048','VJ-0049','VJ-0052',
                         'VJ-0053','VJ-0054','VJ-0085','VJ-0086','VJ-0088','VJ-0089','VJ-0090')
 group by t.trip_number, e.consecutivo, e.fecha, lg.total_expenses
 order by t.trip_number;

-- ── Verificación 2: cuadre global del libro diario ────────────────────────────────────────
select sum(debito) as total_debito, sum(credito) as total_credito,
       case when sum(debito)=sum(credito) then 'CUADRA ✓' else 'DESCUADRA ✗' end as libro_diario
  from journal_entry_lines;
