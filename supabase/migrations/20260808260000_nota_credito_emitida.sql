-- ════════════════════════════════════════════════════════════════════════════
-- Nota crédito EMITIDA (a clientes) — reversa parte/todo el ingreso de una FE ya reconocida.
--   El import unificado ya guarda las NC (grupo EMITIDO / RECIBIDO). Una NC emitida se enlaza
--   MANUALMENTE a su factura original (fe_relacionada_id) — el usuario elige viendo la evidencia,
--   no se adivina por NIT+monto+fecha (evitar reversar el viaje equivocado).
--   Evento aparte de Facturación (la NC casi siempre llega en un mes distinto).
--   DB 41450510 (reduce ingreso) / CR 13050501 (reduce cartera), tercero=cliente, doc=folio NC.
-- Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- Enlace manual NC → FE original (ambas filas de dian_invoices_import)
alter table dian_invoices_import add column if not exists fe_relacionada_id uuid references dian_invoices_import(id);

-- Comprobante NC (Nota Crédito)
insert into tipos_comprobante (codigo, nombre) values ('NC', 'Nota Crédito') on conflict (codigo) do nothing;

create or replace function postear_nota_credito_emitida(p_import_id uuid)
returns uuid language plpgsql as $$
declare
  v_ter uuid; v_total numeric; v_folio text; v_prefix text; v_fecha date; v_tipo text; v_grupo text; v_fe uuid;
  v_fe_total numeric; v_entry uuid; v_consec integer; v_x uuid;
begin
  select tercero_id, total, folio, prefix, issue_date, document_type, grupo, fe_relacionada_id
    into v_ter, v_total, v_folio, v_prefix, v_fecha, v_tipo, v_grupo, v_fe
    from dian_invoices_import where id = p_import_id;
  if not found then raise exception 'La nota crédito % no existe', p_import_id; end if;
  if v_tipo is distinct from 'Nota de crédito electrónica' then
    raise exception 'El documento % no es una nota crédito (tipo=%)', p_import_id, coalesce(v_tipo,'—'); end if;
  if v_grupo is distinct from 'EMITIDO' then
    raise exception 'La nota crédito % no es emitida por ISADAN (grupo=%)', p_import_id, coalesce(v_grupo,'—'); end if;
  if v_ter is null then raise exception 'La nota crédito % no tiene cliente (tercero)', p_import_id; end if;
  if coalesce(v_total,0) <= 0 then raise exception 'La nota crédito % no tiene monto > 0', p_import_id; end if;
  if v_fe is null then
    raise exception 'La nota crédito % no está enlazada a su factura original — enlázala primero (manual) en Facturación', p_import_id; end if;

  if periodo_bloqueado(v_fecha) then
    raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_fecha,'YYYY-MM'); end if;

  -- anti-duplicado: esta NC no se contabiliza dos veces
  select id into v_x from journal_entries
   where origen_tabla='dian_invoices_import' and origen_id=p_import_id and tipo_comprobante='NC' and estado='CONTABILIZADO' limit 1;
  if v_x is not null then raise exception 'La nota crédito % ya está contabilizada (asiento %)', p_import_id, v_x; end if;

  -- la FE original debe estar reconocida como ingreso (asiento de Facturación) antes de reversarla
  select id into v_x from journal_entries
   where origen_tabla='dian_invoices_import' and origen_id=v_fe and estado='CONTABILIZADO' limit 1;
  if v_x is null then
    raise exception 'La factura original de esta NC aún no está reconocida como ingreso (Facturación) — no se puede reversar lo que no se ha causado'; end if;

  -- no reversar más que el total de la factura original
  select total into v_fe_total from dian_invoices_import where id = v_fe;
  if v_total > coalesce(v_fe_total,0) + 1 then
    raise exception 'La NC (%) excede el total de la factura original (%) — verifica el enlace', v_total, v_fe_total; end if;

  v_consec := consecutivo_siguiente('NC');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('NC', v_consec, v_fecha, to_char(v_fecha,'YYYY-MM'),
            'Nota crédito emitida '||coalesce(v_prefix,'')||coalesce(v_folio,''),
            coalesce(v_prefix,'')||coalesce(v_folio,''), 'dian_invoices_import', p_import_id)
    returning id into v_entry;
  perform contab_insert_linea(v_entry, '41450510', v_ter, null, v_total, 0);  -- DB reduce ingreso
  perform contab_insert_linea(v_entry, '13050501', v_ter, null, 0, v_total);  -- CR reduce cartera facturada
  return v_entry;
end; $$;
