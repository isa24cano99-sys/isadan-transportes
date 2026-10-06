-- ════════════════════════════════════════════════════════════════════════════
-- Cierre mensual = SOLO bloqueo + reclasificaciones de presentación. NO cancela
-- clases 4-6 contra resultados (3610).
--
-- Corrección de criterio (contador + revisor externo): el cierre de resultados es
-- ANUAL (31-dic), no mensual. El CC mensual que zanjeaba 4-7 a 3610 dejaba el ERI
-- mensual en cero (p.ej. julio mostraba utilidad −0 en vez de 15.670.917) y no permitía
-- obtener el ERI acumulado sumando periodos. Se elimina el asiento CC del cierre mensual.
--
-- La función ahora solo: (a) rechaza si el periodo ya está CERRADO, (b) corre la
-- reclasificación de saldos débito 220501 → 133005 (presentación), (c) marca CERRADO.
-- El cierre anual de clases 4-6 → 3605/3610 vive en una función aparte (postear_cierre_anual),
-- que NO se construye ahora — se ejecutará en diciembre.
--
-- Cambia el tipo de retorno (uuid → jsonb) → requiere DROP + CREATE. Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
drop function if exists postear_cierre_periodo(date);

create or replace function postear_cierre_periodo(p_periodo date)
returns jsonb language plpgsql as $$
declare
  v_mes text := to_char(p_periodo, 'YYYY-MM');
  v_reclasif jsonb;
begin
  if exists (select 1 from periodos_contables where periodo = v_mes and estado = 'CERRADO') then
    raise exception 'El periodo % ya está CERRADO', v_mes;
  end if;

  -- Reclasificación de presentación (saldos débito en 220501 → 133005 anticipo proveedor).
  v_reclasif := reclasificar_saldos_debito_220501(p_periodo);

  -- Bloquear el periodo. NO se zanjean clases 4-6: el cierre de resultados es ANUAL.
  insert into periodos_contables (periodo, estado, fecha_cierre)
    values (v_mes, 'CERRADO', now())
    on conflict (periodo) do update set estado = 'CERRADO', fecha_cierre = now();

  return jsonb_build_object('periodo', v_mes, 'estado', 'CERRADO',
                            'cierre_resultados', 'anual (no mensual)', 'reclasificacion', v_reclasif);
end; $$;
