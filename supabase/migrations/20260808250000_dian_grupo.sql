-- ════════════════════════════════════════════════════════════════════════════
-- dian_invoices_import.grupo — distingue RECIBIDO (costos, receptor ISADAN) de
-- EMITIDO (ventas, emisor ISADAN) en la MISMA tabla. Un solo archivo DIAN por mes trae
-- ambas direcciones; el import unificado clasifica cada fila. Las pantallas filtran por
-- grupo para no confundir direcciones (conciliación-costos → RECIBIDO, facturación → EMITIDO).
-- Backfill: las filas actuales son todas recibidas (0 emitidas hoy) → derivado del NIT.
-- Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
alter table dian_invoices_import add column if not exists grupo text;

update dian_invoices_import
   set grupo = case when nit_issuer = '902030120' then 'EMITIDO' else 'RECIBIDO' end
 where grupo is null;

alter table dian_invoices_import alter column grupo set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dian_grupo_chk') then
    alter table dian_invoices_import add constraint dian_grupo_chk check (grupo in ('RECIBIDO','EMITIDO'));
  end if;
end $$;

create index if not exists dian_grupo_idx on dian_invoices_import (grupo);
