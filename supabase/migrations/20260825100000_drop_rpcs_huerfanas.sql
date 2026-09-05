-- ════════════════════════════════════════════════════════════════════════════
-- Limpieza: se dropean 3 RPCs huérfanas de los módulos retirados (commit 20a7af2).
-- Ninguna es llamada por la app ni por la función viva aprobar_legalizacion (el
-- consolidado actual inyecta porcentaje/comisión inline; la emisión la reemplazó
-- /contabilidad/facturacion). El único caller SQL era el aprobar_legalizacion VIEJO
-- (20260807150000), ya superado por create-or-replace. plpgsql es late-binding, así que
-- el drop no rompe definiciones históricas. Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
drop function if exists postear_porcentaje_conductor(uuid, text, numeric, date, uuid);
drop function if exists postear_comision_empresa(text, numeric, date, uuid, uuid);
drop function if exists postear_emision_viaje(uuid);
