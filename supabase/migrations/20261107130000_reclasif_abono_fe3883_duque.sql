-- ════════════════════════════════════════════════════════════════════════════
-- Corrección puntual: abono de $2.940.000 (30-oct-2026) a la FE 3883 de OMAR DE JESUS DUQUE CALLE.
--
-- Problema: la FE 3883 (18-sep, $11.760.000) ya se causó como costo (CG-165: DB 61450590 + IVA /
-- CR 220501). El abono del 30-oct se contabilizó como GASTO DIRECTO (CB-470: DB 61450590 /
-- CR 11100510) → el costo de las llantas queda contado dos veces ($2.940.000) y el pasivo 220501
-- de Duque sigue en $11.760.000 aunque ya se abonó.
--
-- Corrección: UN asiento CG que traslada el abono del gasto al pasivo:
--     DB 220501 · Duque    2.940.000
--     CR 61450590 · SSZ922 2.940.000
-- CB-470 NO se toca (inmutable). No se usa reversión + repostear porque postear_pago_proveedor_banco
-- rechaza una transacción que ya tiene un CB CONTABILIZADO (aunque esté reversado).
-- Efecto neto = lo mismo que haber posteado el abono por "Pago de proveedores": DB 220501 / CR banco.
-- Resultado esperado: 220501·Duque = -8.820.000 ; 61450590 baja 2.940.000.
-- Aplicar en SQL Editor. Idempotente: aborta si ya se aplicó.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_cb   uuid;  v_ter uuid := '31d94fae-8e2e-4e2e-b6ee-0fa9e86aebb0';  -- DUQUE CALLE OMAR DE JESUS (71639900)
  v_bt   uuid;  v_fecha date := date '2026-10-30';  v_monto numeric := 2940000;
  v_cons integer; v_e uuid;
begin
  -- Localiza CB-470 y valida que sea exactamente el abono esperado
  select je.id, je.origen_id into v_cb, v_bt
    from journal_entries je
   where je.tipo_comprobante = 'CB' and je.consecutivo = 470 and je.estado = 'CONTABILIZADO';
  if v_cb is null then raise exception 'CB-470 no existe o no está CONTABILIZADO'; end if;
  if not exists (select 1 from journal_entry_lines
                  where journal_entry_id = v_cb and cuenta_puc = '61450590' and debito = v_monto and tercero_id = v_ter) then
    raise exception 'CB-470 no coincide con el abono esperado (61450590 / % / Duque)', v_monto; end if;
  if periodo_bloqueado(v_fecha) then raise exception 'El periodo de % está cerrado', v_fecha; end if;
  if exists (select 1 from journal_entries where origen_tabla = 'reclasificacion' and origen_id = v_cb) then
    raise exception 'Ya existe una reclasificación para CB-470'; end if;

  v_cons := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla, origen_id)
    values ('CG', v_cons, v_fecha, to_char(v_fecha, 'YYYY-MM'),
            'Reclasificación abono FE 3883 Omar Duque: de gasto directo (CB-470) a pago de proveedor 220501',
            '3883', 'reclasificacion', v_cb)
    returning id into v_e;

  perform contab_insert_linea(v_e, '220501',   v_ter, null,     v_monto, 0);   -- DB baja el pasivo causado en CG-165
  perform contab_insert_linea(v_e, '61450590', v_ter, 'SSZ922', 0, v_monto);   -- CR deshace el gasto duplicado de CB-470
end $$;

-- Recategoriza la transacción bancaria para que la pantalla de bancos refleje que es pago a proveedor
-- (el asiento ya está hecho; la categoría es editable aunque la fila esté contabilizada).
update bank_transactions
   set category_id = (select id from transaction_categories where puc_code = '220501' and name = 'Pago a proveedor' limit 1)
 where description = 'Abono a factura #3883 Omar Duque' and date = '2026-10-30' and amount = 2940000
   and tercero_id = '31d94fae-8e2e-4e2e-b6ee-0fa9e86aebb0';

-- Verificación
select cuenta_puc, sum(debito - credito) as saldo
  from journal_entry_lines
 where tercero_id = '31d94fae-8e2e-4e2e-b6ee-0fa9e86aebb0' and cuenta_puc in ('220501', '61450590', '53152010')
 group by cuenta_puc;
