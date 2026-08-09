-- TEST con ROLLBACK — generalización del pago de pasivo desde banco (proveedor + nómina).
-- Requiere la migración 20260808240000 aplicada + la categoría "Pago nómina conductor" (250505).
-- Cada bloque inserta bank_transactions sintéticas y hace RAISE → rollback (no deja nada).
-- Correr por separado (el RAISE del primero aborta el batch).

-- ── CASOS 1+2 · NÓMINA parciales de Daniel (debe 1.859.928 en 250505) ─────────
do $$
declare
  v_acct uuid; v_daniel uuid; v_cat uuid; v_bt1 uuid; v_bt2 uuid;
  v_s0 numeric; v_s1 numeric; v_s2 numeric;
begin
  select id into v_acct from bank_accounts limit 1;
  select tercero_id into v_daniel from drivers where full_name ilike '%daniel%' and tercero_id is not null limit 1;
  select id into v_cat from transaction_categories where puc_code='250505' and active limit 1;

  select coalesce(sum(credito-debito),0) into v_s0 from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
    where e.estado='CONTABILIZADO' and l.cuenta_puc='250505' and l.tercero_id=v_daniel;

  insert into bank_transactions(account_id,type,amount,date,category_id,tercero_id,description,periodo_pre_corte)
    values(v_acct,'EGRESO',459928,date '2026-07-31',v_cat,v_daniel,'Pago nomina Daniel parcial 1',false) returning id into v_bt1;
  perform postear_pago_pasivo_banco(v_bt1);
  select coalesce(sum(credito-debito),0) into v_s1 from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
    where e.estado='CONTABILIZADO' and l.cuenta_puc='250505' and l.tercero_id=v_daniel;

  insert into bank_transactions(account_id,type,amount,date,category_id,tercero_id,description,periodo_pre_corte)
    values(v_acct,'EGRESO',1400000,date '2026-07-31',v_cat,v_daniel,'Pago nomina Daniel parcial 2',false) returning id into v_bt2;
  perform postear_pago_pasivo_banco(v_bt2);
  set constraints all immediate;   -- valida el cuadre de AMBOS asientos, ya completos
  select coalesce(sum(credito-debito),0) into v_s2 from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
    where e.estado='CONTABILIZADO' and l.cuenta_puc='250505' and l.tercero_id=v_daniel;

  raise exception E'NOMINA parciales (rollback) — Daniel 250505:\n  saldo inicial = %\n  tras pago 1 (459.928)   = %  (debe 1.400.000)\n  tras pago 2 (1.400.000) = %  (debe 0)',
    to_char(v_s0,'FM999G999G990'), to_char(v_s1,'FM999G999G990'), to_char(v_s2,'FM999G999G990');
end $$;

-- ── CASO 3 · WRAPPER proveedor — debe postear a 220501 igual que siempre (0 regresión) ──
do $$
declare v_acct uuid; v_castro uuid; v_cat uuid; v_bt uuid; v_entry uuid; v_res text;
begin
  select id into v_acct from bank_accounts limit 1;
  v_castro := '9a319656-9248-47db-9c59-5ab5388585fd';   -- Castro Rodríguez Camilo Andrés (proveedor)
  select id into v_cat from transaction_categories where puc_code='220501' and active limit 1;

  insert into bank_transactions(account_id,type,amount,date,category_id,tercero_id,description,periodo_pre_corte)
    values(v_acct,'EGRESO',500000,date '2026-07-31',v_cat,v_castro,'Pago proveedor test wrapper',false) returning id into v_bt;
  v_entry := postear_pago_proveedor_banco(v_bt);   -- el WRAPPER (nombre que llama la app)
  set constraints all immediate;
  select string_agg(l.cuenta_puc||' '||(case when l.debito>0 then 'DB' else 'CR' end)||' '||to_char(l.debito+l.credito,'FM999G999G990')||' · '||coalesce(l.tercero_nombre_snapshot,'banco'), E'\n    ' order by l.debito desc)
    into v_res from journal_entry_lines l where l.journal_entry_id=v_entry;
  raise exception E'WRAPPER proveedor (rollback) — debe ser DB 220501·Castro / CR banco, glosa "Pago a proveedor":\n    %', v_res;
end $$;
