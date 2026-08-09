-- TEST con ROLLBACK — sección "Pagar neto" de nómina (250505) + detección de candidato.
-- Requiere migración 20260808240000 + categoría "Pago nómina conductor" (250505).
-- Simula el flujo de la pantalla: inserta un movimiento bancario del conductor categorizado
-- 250505 (post-corte), verifica que la query de candidatos lo detecta, lo paga parcial, y
-- confirma que el saldo baja. RAISE → rollback.
do $$
declare
  v_acct uuid; v_daniel uuid; v_cat uuid; v_bt1 uuid; v_bt2 uuid;
  v_cand int; v_s0 numeric; v_s1 numeric; v_s2 numeric;
begin
  select id into v_acct from bank_accounts limit 1;
  select tercero_id into v_daniel from drivers where full_name ilike '%daniel%' and tercero_id is not null limit 1;
  select id into v_cat from transaction_categories where puc_code='250505' and active limit 1;

  select coalesce(sum(credito-debito),0) into v_s0 from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
    where e.estado='CONTABILIZADO' and l.cuenta_puc='250505' and l.tercero_id=v_daniel;

  -- pago parcial 1 (459.928)
  insert into bank_transactions(account_id,type,amount,date,category_id,tercero_id,description,periodo_pre_corte)
    values(v_acct,'EGRESO',459928,date '2026-07-31',v_cat,v_daniel,'Pago nomina Daniel julio (parcial 1)',false) returning id into v_bt1;

  -- ¿la query de candidatos de la pantalla lo detecta? (cat 250505, post-corte, sin CB, del conductor)
  select count(*) into v_cand from bank_transactions bt
    where bt.category_id=v_cat and bt.tercero_id=v_daniel and bt.date>=date '2026-07-01'
      and not exists (select 1 from journal_entries e where e.origen_tabla='bank_transactions' and e.origen_id=bt.id and e.tipo_comprobante='CB' and e.estado='CONTABILIZADO');

  perform postear_pago_pasivo_banco(v_bt1);
  select coalesce(sum(credito-debito),0) into v_s1 from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
    where e.estado='CONTABILIZADO' and l.cuenta_puc='250505' and l.tercero_id=v_daniel;

  -- pago parcial 2 (1.400.000) → saldo a 0
  insert into bank_transactions(account_id,type,amount,date,category_id,tercero_id,description,periodo_pre_corte)
    values(v_acct,'EGRESO',1400000,date '2026-07-31',v_cat,v_daniel,'Pago nomina Daniel julio (parcial 2)',false) returning id into v_bt2;
  perform postear_pago_pasivo_banco(v_bt2);
  set constraints all immediate;
  select coalesce(sum(credito-debito),0) into v_s2 from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id
    where e.estado='CONTABILIZADO' and l.cuenta_puc='250505' and l.tercero_id=v_daniel;

  raise exception E'PAGAR NETO Daniel (rollback):\n  candidato detectado por la pantalla (antes de postear) = % (debe 1)\n  saldo 250505: inicial % → tras parcial 459.928 = % (debe 1.400.000) → tras 1.400.000 = % (debe 0)',
    v_cand, to_char(v_s0,'FM999G999G990'), to_char(v_s1,'FM999G999G990'), to_char(v_s2,'FM999G999G990');
end $$;
