-- La legalización hereda el vehículo del viaje cuando no trae uno propio.
-- Motivo: postear/aprobar_legalizacion toma la placa (centro de costo) de legalizations.vehicle_id,
-- pero ninguna pantalla de creación lo llena → cuentas que exigen centro de costo (p.ej. 61450555
-- Lavada) fallaban con "exige centro de costo y no se proporcionó".
create or replace function legalizacion_hereda_vehiculo()
returns trigger language plpgsql as $$
begin
  if new.vehicle_id is null and new.trip_id is not null then
    select t.vehicle_id into new.vehicle_id from trips t where t.id = new.trip_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_legalizacion_hereda_vehiculo on legalizations;
create trigger trg_legalizacion_hereda_vehiculo
  before insert or update on legalizations
  for each row execute function legalizacion_hereda_vehiculo();

-- Backfill solo de las NO aprobadas (las aprobadas ya tienen su asiento; no se tocan).
update legalizations l set vehicle_id = t.vehicle_id
  from trips t
 where t.id = l.trip_id and l.vehicle_id is null and l.status <> 'APROBADA' and t.vehicle_id is not null;
