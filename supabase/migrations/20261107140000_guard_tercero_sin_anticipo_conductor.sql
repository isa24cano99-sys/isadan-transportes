-- El guard de tercero en bank_transactions deja de exigir tercero para "Anticipo conductor" (13301510).
-- Sigue exigiéndolo para: 28050510 anticipo de cliente · 220501 pago a proveedor · 13251005 reserva de impuestos.
-- Nota: postear_anticipo_conductor_banco sigue exigiendo que el tercero del movimiento sea un conductor
-- al CONTABILIZAR; este cambio solo permite guardar/categorizar la transacción sin tercero.
create or replace function bloquea_bank_tx_sin_tercero()
returns trigger language plpgsql as $$
declare v_puc text;
begin
  if new.category_id is null or new.tercero_id is not null then
    return new;
  end if;
  select c.puc_code into v_puc from transaction_categories c where c.id = new.category_id;
  if v_puc in ('28050510','220501','13251005') then
    raise exception 'La categoría de esta transacción (cuenta %) exige un tercero específico: asígnalo antes de guardar. (Anticipo de cliente, pago a proveedor y reserva de impuestos.)', v_puc;
  end if;
  return new;
end; $$;
