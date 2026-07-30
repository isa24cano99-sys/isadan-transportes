-- drivers.hire_date: NOT NULL + CHECK >= 2026-01-30 (inicio de actividades del RUT).
-- Verificado ANTES de aplicar: hire_date ya es NOT NULL y 0 filas violan el rango
--   (select count(*) from drivers where hire_date < '2026-01-30' or hire_date is null → 0).
-- El NOT NULL cierra el hueco del CHECK: con hire_date NULL la expresión da UNKNOWN
-- (no FALSE) y el constraint pasaría, saltándose la regla sin el mensaje de la app.
-- La app también valida en conductores/actions.ts (crear + actualizar); esto es defensa en profundidad.

alter table drivers alter column hire_date set not null;   -- no-op si ya es NOT NULL

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_hire_date_min') then
    alter table drivers
      add constraint drivers_hire_date_min check (hire_date >= '2026-01-30');
  end if;
end $$;
