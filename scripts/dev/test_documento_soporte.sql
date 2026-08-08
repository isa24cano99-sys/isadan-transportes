-- TEST con ROLLBACK — documento_soporte de las 5 funciones de #1.
-- 3 con fixtures reales (causación VJ-0085, pago proveedor F2X, peaje julio) + 2 sintéticos
-- (anticipo conductor / recibo cliente, rama fallback "Anticipo · <nombre>"). RAISE revierte todo.
do $$
declare
  v_trip uuid; v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid; v_e5 uuid;
  d1 text; d2 text; d3 text; d4 text; d5 text;
  v_acc uuid; v_typ transaction_type; v_catC uuid; v_catCl uuid; v_cond uuid; v_cli uuid; v_bt4 uuid; v_bt5 uuid;
begin
  -- 3) PEAJE PRIMERO: necesita ALTER TABLE, que exige 0 eventos de trigger diferido pendientes
  --    (por eso va antes de cualquier inserción de líneas).
  alter table journal_entry_lines disable trigger trg_bloquea_edicion_lines;
  alter table journal_entries     disable trigger trg_bloquea_edicion_entries;
  delete from journal_entry_lines where journal_entry_id in
    (select id from journal_entries where tipo_comprobante='CG' and periodo='2026-07' and descripcion like '%peaje F2X%');
  delete from journal_entries where tipo_comprobante='CG' and periodo='2026-07' and descripcion like '%peaje F2X%';
  alter table journal_entries     enable trigger trg_bloquea_edicion_entries;
  alter table journal_entry_lines enable trigger trg_bloquea_edicion_lines;
  v_e3 := postear_peaje_mensual(date '2026-07-01');
  select documento_soporte into d3 from journal_entries where id=v_e3;

  -- 1) causación viaje VJ-0085
  select id into v_trip from trips where trip_number='VJ-0085';
  v_e1 := postear_causacion_viaje(v_trip);
  select documento_soporte into d1 from journal_entries where id=v_e1;

  -- 2) pago proveedor (F2X elegible)
  v_e2 := postear_pago_proveedor_banco('a8b85a36-73e3-40fd-851a-761361d869d2');
  select documento_soporte into d2 from journal_entries where id=v_e2;

  -- fixtures comunes para sintéticos
  select id into v_acc from bank_accounts limit 1;
  select type into v_typ from bank_transactions limit 1;               -- type válido garantizado
  select id into v_catC  from transaction_categories where puc_code='13301510' limit 1;
  select id into v_catCl from transaction_categories where puc_code='28050510' limit 1;
  select tercero_id into v_cond from drivers where tercero_id is not null limit 1;
  select id into v_cli from terceros where es_cliente=true and merged_into is null limit 1;

  -- 4) anticipo conductor sintético (sin reference_type → rama fallback)
  insert into bank_transactions(account_id,date,type,amount,description,category,category_id,tercero_id,source,periodo_pre_corte)
    values(v_acc, date '2026-07-15', v_typ, 500000, 'TEST anticipo', '13301510', v_catC, v_cond, 'MANUAL', false)
    returning id into v_bt4;
  v_e4 := postear_anticipo_conductor_banco(v_bt4);
  select documento_soporte into d4 from journal_entries where id=v_e4;

  -- 5) recibo anticipo cliente sintético (rama fallback)
  insert into bank_transactions(account_id,date,type,amount,description,category,category_id,tercero_id,source,periodo_pre_corte)
    values(v_acc, date '2026-07-15', v_typ, 800000, 'TEST recibo', '28050510', v_catCl, v_cli, 'MANUAL', false)
    returning id into v_bt5;
  v_e5 := postear_recibo_anticipo_banco(v_bt5);
  select documento_soporte into d5 from journal_entries where id=v_e5;

  raise exception E'TESTS documento_soporte →\n 1 causacion VJ-0085: %\n 2 pago_proveedor: %\n 3 peaje: %\n 4 anticipo_conductor(fallback): %\n 5 recibo_anticipo(fallback): %',
    d1, d2, d3, d4, d5;
end $$;
