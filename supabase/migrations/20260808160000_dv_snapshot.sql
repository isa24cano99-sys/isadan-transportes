-- ════════════════════════════════════════════════════════════════════════════
-- #3 DV — dígito de verificación en la línea (columna "DV" del libro auxiliar).
--   · Nueva columna journal_entry_lines.tercero_dv_snapshot (convención de tercero_nit_snapshot).
--   · contab_insert_linea la congela desde terceros.digito_verificacion; fallback calcular_dv
--     para NIT (doc 31) que llegue sin DV guardado (red de seguridad; hoy 0 casos — todas las
--     jurídicas ya tienen DV). Naturales (cédula) → NULL legítimo.
-- Aplicar en SQL Editor. (La corrección de COLPENSIONES 1→7 y el backfill de líneas existentes
-- van aparte, como DML con rollback de prueba.)
-- ════════════════════════════════════════════════════════════════════════════
alter table journal_entry_lines add column if not exists tercero_dv_snapshot smallint;

create or replace function contab_insert_linea(
  p_entry uuid, p_cuenta text, p_tercero uuid, p_centro_costo text, p_debito numeric, p_credito numeric
) returns void language plpgsql as $$
declare
  v_exige_t boolean; v_exige_cc boolean; v_concepto text;
  v_nit text; v_nombre text; v_dv smallint; v_tipo_doc text;
begin
  select exige_tercero, exige_centro_costo, concepto_exogena
    into v_exige_t, v_exige_cc, v_concepto
    from puc_accounts where codigo = p_cuenta;
  if not found then raise exception 'Cuenta PUC % no existe en puc_accounts', p_cuenta; end if;
  if v_exige_t and p_tercero is null then raise exception 'La cuenta % exige tercero y no se proporcionó', p_cuenta; end if;
  if v_exige_cc and coalesce(p_centro_costo,'') = '' then raise exception 'La cuenta % exige centro de costo y no se proporcionó', p_cuenta; end if;

  if p_tercero is not null then
    select t.numero_identificacion,
           case when t.tipo_persona = 'NATURAL'
                then nullif(trim(concat_ws(' ', t.primer_nombre, t.otros_nombres, t.primer_apellido, t.segundo_apellido)), '')
                else t.razon_social end,
           t.digito_verificacion, t.tipo_documento
      into v_nit, v_nombre, v_dv, v_tipo_doc
      from terceros t where t.id = p_tercero;
    -- red de seguridad: NIT (doc 31) sin DV guardado → calcular (módulo 11). Naturales quedan NULL.
    if v_dv is null and v_tipo_doc = '31' then v_dv := calcular_dv(v_nit); end if;
  end if;

  insert into journal_entry_lines
    (journal_entry_id, cuenta_puc, tercero_id, centro_costo, debito, credito,
     tercero_nit_snapshot, tercero_nombre_snapshot, tercero_dv_snapshot, concepto_exogena)
  values
    (p_entry, p_cuenta, p_tercero, p_centro_costo, coalesce(p_debito,0), coalesce(p_credito,0),
     v_nit, v_nombre, v_dv, v_concepto);
end;
$$;
