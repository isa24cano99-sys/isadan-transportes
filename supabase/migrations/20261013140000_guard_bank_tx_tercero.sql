-- ════════════════════════════════════════════════════════════════════════════
-- Guard (c1): no guardar un bank_transaction cuya categoría apunte a una cuenta que
-- exige un tercero ESPECÍFICO, sin tercero. Alcance acotado a 4 cuentas cuyo mecanismo
-- de posteo necesita el tercero del movimiento:
--   28050510 anticipo de cliente · 13301510 anticipo de conductor ·
--   220501 pago a proveedor       · 13251005 reserva de impuestos (socio)
-- El gasto directo (clase 5/6 general) NO entra: conserva su fallback a Consumidor Final.
-- Trigger BEFORE INSERT OR UPDATE en bank_transactions → vive en la BD, así la importación
-- y la recategorización masiva tampoco pueden saltárselo (defensa en profundidad).
-- NO contabiliza nada. Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function bloquea_bank_tx_sin_tercero()
returns trigger language plpgsql as $$
declare v_puc text;
begin
  -- sin categoría, o ya tiene tercero → nada que validar
  if new.category_id is null or new.tercero_id is not null then
    return new;
  end if;
  select c.puc_code into v_puc from transaction_categories c where c.id = new.category_id;
  if v_puc in ('28050510','13301510','220501','13251005') then
    raise exception 'La categoría de esta transacción (cuenta %) exige un tercero específico: asígnalo antes de guardar. (Anticipo de cliente, anticipo de conductor, pago a proveedor y reserva de impuestos.)', v_puc;
  end if;
  return new;
end; $$;

drop trigger if exists trg_bank_tx_exige_tercero on bank_transactions;
create trigger trg_bank_tx_exige_tercero
  before insert or update on bank_transactions
  for each row execute function bloquea_bank_tx_sin_tercero();
