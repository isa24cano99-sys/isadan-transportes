-- BACKFILL (aplicado en firme) — pobla journal_entry_lines.tercero_dv_snapshot (columna nueva
-- de #3) en las líneas ya existentes, desde terceros.digito_verificacion + fallback calcular_dv
-- para NIT (doc 31) sin DV guardado. Naturales → NULL legítimo. El DV es atributo estable del NIT,
-- así que snapshotear el valor actual es correcto para líneas históricas.
-- Solo columna nueva (no toca montos/cuentas); excepción sancionada de inmutabilidad. Verificado
-- con rollback (215 líneas; jurídicas con DV, naturales sin DV) antes del firme.
-- Nota previa: se corrigió terceros.digito_verificacion de COLPENSIONES (900336004) 1→7 — error
-- de captura detectado por la auditoría (la función módulo 11 da 7, confirmado manual + RPC).
do $$
declare v_n int;
begin
  alter table journal_entry_lines disable trigger trg_bloquea_edicion_lines;
  update journal_entry_lines l
     set tercero_dv_snapshot = coalesce(t.digito_verificacion,
                                        case when t.tipo_documento='31' then calcular_dv(t.numero_identificacion) else null end)
    from terceros t where t.id = l.tercero_id and l.tercero_id is not null;
  get diagnostics v_n = row_count;
  alter table journal_entry_lines enable trigger trg_bloquea_edicion_lines;
  raise notice 'Backfill DV firme: % líneas', v_n;
end $$;

select
  count(*) filter (where tercero_id is not null)                                    as con_tercero,
  count(*) filter (where tercero_id is not null and tercero_dv_snapshot is not null) as con_dv,
  count(*) filter (where tercero_id is not null and tercero_dv_snapshot is null)     as sin_dv_natural
from journal_entry_lines;
