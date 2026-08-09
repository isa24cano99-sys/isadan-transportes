-- TEST con ROLLBACK — Pieza 4 seguridad social (PILA). Requiere migración 20260808230000
-- aplicada + la categoría de aedc6016 ya repuntada a 23709510. Cada bloque hace RAISE → rollback.
-- Correr por separado (el RAISE del primero aborta el batch).

-- ── CASO A · PAGO DE JUNIO ($1.341.000, 6-jul) contra el saldo de apertura en 23709510 ──
do $$
declare v_entry uuid; v_res text; v_ant numeric; v_desp numeric; v_cuatro numeric;
begin
  select coalesce(sum(credito-debito),0) into v_ant   from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id where e.estado='CONTABILIZADO' and l.cuenta_puc='23709510';
  v_entry := postear_pago_ss_banco('aedc6016-64e1-453d-a67b-9e11cf8c0bbe');
  set constraints all immediate;
  select coalesce(sum(credito-debito),0) into v_desp  from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id where e.estado='CONTABILIZADO' and l.cuenta_puc='23709510';
  select coalesce(sum(credito-debito),0) into v_cuatro from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id where e.estado='CONTABILIZADO' and l.cuenta_puc in ('23700510','23700610','23701010','23803010');
  select string_agg(l.cuenta_puc||' '||(case when l.debito>0 then 'DB' else 'CR' end)||' '||to_char(l.debito+l.credito,'FM999G999G990')||' · '||coalesce(l.tercero_nombre_snapshot,'banco'), E'\n    ' order by l.debito desc)
    into v_res from journal_entry_lines l where l.journal_entry_id=v_entry;
  raise exception E'CASO A · PAGO JUNIO (rollback):\n    %\n  saldo 23709510: antes=% -> despues=%  (debe 0)\n  4 cuentas SS (julio) quedan=%  (debe 1.489.138, intactas)',
    v_res, to_char(v_ant,'FM999G999G990'), to_char(v_desp,'FM999G999G990'), to_char(v_cuatro,'FM999G999G990');
end $$;

-- ── CASO B · CONSOLIDACIÓN DE JULIO (monto real planilla = 1.489.800) ──
do $$
declare v_entry uuid; v_res text; v_cuatro numeric; v_2370 numeric;
begin
  v_entry := postear_consolidacion_ss_mensual(date '2026-07-01', 1489800);
  set constraints all immediate;
  select coalesce(sum(credito-debito),0) into v_cuatro from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id where e.estado='CONTABILIZADO' and l.cuenta_puc in ('23700510','23700610','23701010','23803010');
  select coalesce(sum(credito-debito),0) into v_2370  from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id where e.estado='CONTABILIZADO' and l.cuenta_puc='23709510';
  select string_agg(l.cuenta_puc||' '||(case when l.debito>0 then 'DB' else 'CR' end)||' '||to_char(l.debito+l.credito,'FM999G999G990')||' · '||coalesce(l.tercero_nombre_snapshot,'—'), E'\n    ' order by l.credito, l.debito desc)
    into v_res from journal_entry_lines l where l.journal_entry_id=v_entry;
  raise exception E'CASO B · CONSOLIDACION JULIO (rollback):\n    %\n  4 cuentas SS despues=%  (deben 0)\n  saldo 23709510 despues=%  (junio 1.341.000 + julio 1.489.800)',
    v_res, to_char(v_cuatro,'FM999G999G990'), to_char(v_2370,'FM999G999G990');
end $$;
