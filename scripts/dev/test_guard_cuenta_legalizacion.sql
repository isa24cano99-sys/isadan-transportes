-- TEST del guard mejorado de aprobar_legalizacion. Cada bloque fuerza una línea con una
-- cuenta inválida (simulando un dato colado por otra vía) y espera el mensaje ESPECÍFICO,
-- no el genérico. El RAISE del guard aborta el bloque → nada persiste (leg de prueba incluido).

-- CASO A — cuenta que existe pero es de clase 4 (ingreso): 41450510 "Ingreso por flete".
do $$
declare v_leg uuid; v_trip uuid; v_driver uuid; v_veh uuid; v_date date := date '2026-07-11';
begin
  select id, driver_id, vehicle_id into v_trip, v_driver, v_veh from trips where trip_number='VJ-0045';
  insert into legalizations(trip_id,driver_id,vehicle_id,date,advance_amount,total_expenses,status)
    values(v_trip,v_driver,v_veh,v_date,0,600000,'BORRADOR') returning id into v_leg;
  insert into legalization_expenses(legalization_id,expense_type,date,amount,description,matched_invoice_id) values
    (v_leg,'41450510', v_date, 80000, 'Cobro que se coló', null),
    (v_leg,'porcentaje',v_date,520000, '10', null);
  perform aprobar_legalizacion(v_leg);
  raise exception 'NO deberia llegar aqui (el guard debio abortar)';
end $$;

-- CASO B — expense_type sin puc en el catálogo (slug 'honorarios', categoría sin puc_code).
do $$
declare v_leg uuid; v_trip uuid; v_driver uuid; v_veh uuid; v_date date := date '2026-07-11';
begin
  select id, driver_id, vehicle_id into v_trip, v_driver, v_veh from trips where trip_number='VJ-0045';
  insert into legalizations(trip_id,driver_id,vehicle_id,date,advance_amount,total_expenses,status)
    values(v_trip,v_driver,v_veh,v_date,0,600000,'BORRADOR') returning id into v_leg;
  insert into legalization_expenses(legalization_id,expense_type,date,amount,description,matched_invoice_id) values
    (v_leg,'honorarios',v_date, 80000, 'Honorario colado', null),
    (v_leg,'porcentaje',v_date,520000, '10', null);
  perform aprobar_legalizacion(v_leg);
  raise exception 'NO deberia llegar aqui (el guard debio abortar)';
end $$;
