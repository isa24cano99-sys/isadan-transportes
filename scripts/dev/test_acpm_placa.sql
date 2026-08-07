-- TEST con ROLLBACK — enlace FE combustible ↔ línea ACPM pasa la placa al posting.
-- Enlaza la FE Distracom $710.653 (2026-07-05) a la línea de ACPM de VJ-0046 (placa
-- SSZ922), postea con postear_costo_dian, captura las líneas del asiento y RAISE para
-- revertir TODO (el enlace y el asiento). No queda nada en firme: la FE sigue sin postear
-- y la línea sin enlace. Pegar en Supabase SQL Editor; el resultado sale en el error.
do $$
declare
  v_fe    uuid := '89c1d159-594c-4920-a229-d67c31ae3c3f';  -- FE Distracom $710.653 (jul-05)
  v_line  uuid := '47a612eb-8a96-4922-9b1b-d3651c90c78e';  -- línea ACPM de VJ-0046
  v_entry uuid;
  v_res   text;
begin
  update legalization_expenses set matched_invoice_id = v_fe where id = v_line;

  v_entry := postear_costo_dian(v_fe, '61450510', '220501');  -- DB 61450510 / CR 220501

  select string_agg(
           l.cuenta_puc
           || '  tercero=' || coalesce(l.tercero_nombre_snapshot, '—')
           || '  centro_costo=' || coalesce(l.centro_costo, '—')
           || '  D=' || l.debito || '  C=' || l.credito,
           E'\n  ' order by l.debito desc)
    into v_res
    from journal_entry_lines l
   where l.journal_entry_id = v_entry;

  raise exception E'TEST ACPM+placa (revertido):\n  %', v_res;
end $$;
