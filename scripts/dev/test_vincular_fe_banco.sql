-- TEST con ROLLBACK — vincular FE↔banco (pago directo). Replica el núcleo de
-- vincularFeBancoAction (que llaman los DOS puntos de entrada): postear_costo_dian con
-- crédito 11100510 (banco) + enlazar matched_invoice_id en el egreso. Caso real:
-- Reciservicios FE 6946 ($177.667, 07-08), que está ROJA "sin asignar" en la vista.
-- RAISE revierte todo (asiento + link).
do $$
declare
  v_fe uuid := 'ca20c7c6-8f38-4b6a-a812-5ec0e6617f1e';   -- Reciservicios FE 6946 · 177.667 · cuenta sug. 61450535
  v_eg uuid := 'ca2d160b-d0e4-4bb3-8a5c-abfcc62e28da';   -- un egreso cualquiera (el link es una referencia)
  v_entry uuid; v_res text; v_link uuid;
begin
  v_entry := postear_costo_dian(v_fe, '61450535', '11100510');   -- postear (pago directo, CR banco)
  update bank_transactions set matched_invoice_id = v_fe where id = v_eg;   -- enlazar

  select 'CG-'||e.consecutivo||'  '||coalesce(e.documento_soporte,'')||E'\n  '||
         string_agg(l.cuenta_puc||' t='||coalesce(l.tercero_nombre_snapshot,'—')||' D='||l.debito||' C='||l.credito,
                    E'\n  ' order by l.credito, l.debito desc)
    into v_res from journal_entries e join journal_entry_lines l on l.journal_entry_id=e.id
   where e.id=v_entry group by e.id, e.consecutivo, e.documento_soporte;
  select matched_invoice_id into v_link from bank_transactions where id=v_eg;

  raise exception E'TEST vincular FE↔banco (Reciservicios 177.667) →\n  %\n  egreso.matched_invoice_id = %  (= FE %? %)',
    v_res, v_link, v_fe, (v_link = v_fe);
end $$;
