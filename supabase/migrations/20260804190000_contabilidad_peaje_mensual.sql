-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 · Evento 7 (Peajes) — causación mensual F2X, desde la FE (DIAN).
--   La FE de F2X es la fuente autorizada del costo. Se causa el NETO del mes
--   (facturas − notas crédito de dian_invoices_import, Recibido, nit_issuer=F2X):
--     DB 61450575 Peajes / CR 220501 Proveedores nacionales, tercero = F2X.
--   Sin centro de costo: la FE no trae placa y toll_transactions no tiene llave
--   confiable (ni monto ni conteo cuadran). Por eso 61450575 deja de exigir CC.
--   El PAGO (banco Flypass → DB 220501 / CR banco) es pieza aparte (siguiente).
--
--   Guards: neto>0, pre-corte (< 2026-07-01), anti-duplicado por (F2X, mes).
--   Config previa idempotente: 61450575 exige_centro_costo=false (solo esta cuenta
--   del grupo 61450xxx; el resto sigue exigiendo centro de costo).
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
update puc_accounts set exige_centro_costo = false where codigo = '61450575';

create or replace function postear_peaje_mensual(p_periodo date)
returns uuid language plpgsql as $$
declare
  v_f2x   uuid;
  v_fac   numeric;
  v_nc    numeric;
  v_neto  numeric;
  v_mes   text;
  v_entry uuid;
  v_consec integer;
  v_dup   uuid;
  v_fecha date;
begin
  v_mes := to_char(p_periodo, 'YYYY-MM');

  select id into v_f2x from terceros where numero_identificacion = '900219834' and merged_into is null limit 1;
  if v_f2x is null then raise exception 'No se encontró el tercero F2X (900219834)'; end if;

  -- Neto del mes desde la FE importada (Recibido, F2X): facturas − notas crédito
  select coalesce(sum(case when document_type = 'Factura electrónica' then total else 0 end), 0),
         coalesce(sum(case when document_type = 'Nota de crédito electrónica' then total else 0 end), 0)
    into v_fac, v_nc
    from dian_invoices_import
   where nit_issuer = '900219834'
     and to_char(issue_date, 'YYYY-MM') = v_mes;

  v_neto := v_fac - v_nc;
  if coalesce(v_neto, 0) <= 0 then
    raise exception 'No hay peaje neto de F2X para % (facturas %, NC %)', v_mes, v_fac, v_nc;
  end if;

  -- GUARD pre-corte: el costo pre-corte ya está en el resultado acumulado (3610)
  if p_periodo < date '2026-07-01' then
    raise exception 'Peaje pre-corte (%): el costo ya está en la apertura; no se causa de nuevo', v_mes;
  end if;

  -- GUARD anti-duplicado por (F2X, mes): una causación de peaje F2X por período
  select e.id into v_dup
    from journal_entries e
    join journal_entry_lines l on l.journal_entry_id = e.id
   where e.tipo_comprobante = 'CG' and e.estado = 'CONTABILIZADO' and e.periodo = v_mes
     and l.cuenta_puc = '61450575' and l.tercero_id = v_f2x
   limit 1;
  if v_dup is not null then
    raise exception 'Ya existe peaje F2X contabilizado para % (asiento %)', v_mes, v_dup;
  end if;

  v_fecha := (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date;  -- fin de mes
  v_consec := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla)
    values ('CG', v_consec, v_fecha, v_mes,
            'Causación peaje F2X · ' || v_mes || ' (neto FE−NC = ' || to_char(v_neto, 'FM999G999G999') || ')',
            'dian_invoices_import')
    returning id into v_entry;

  perform contab_insert_linea(v_entry, '61450575', v_f2x, null, v_neto, 0);  -- DB Peajes
  perform contab_insert_linea(v_entry, '220501',   v_f2x, null, 0, v_neto);  -- CR Proveedores nacionales (F2X)
  return v_entry;
end;
$$;
