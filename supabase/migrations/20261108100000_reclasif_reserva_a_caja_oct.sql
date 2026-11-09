-- ════════════════════════════════════════════════════════════════════════════
-- Reclasificación octubre 2026: $1.000.000 de la reserva de impuestos a caja.
--
-- Motivo: la reserva 13251005 quedó en $6.800.000 en el libro (depósitos $11.800.000 − pago DIAN
-- CG-181 $5.000.000) pero el ahorro real tiene $5.800.000. El $1.000.000 sobrante no es reserva:
-- por decisión de la dueña se traslada a caja (110505).
--     DB 110505   · caja                       1.000.000
--     CR 13251005 · reserva (Isabella custodia) 1.000.000
-- Los CB de los depósitos no se tocan (inmutables). Resultado esperado: 13251005 = 5.800.000.
-- Idempotente: aborta si ya existe.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_ter   uuid := '98eefbdf-2546-443b-9457-404c8e21ebc0';  -- ISABELLA CANO GARCIA (custodia de la reserva)
  v_fecha date := date '2026-10-31';
  v_monto numeric := 1000000;
  v_desc  text := 'Reclasificación reserva impuestos a caja: sobrante de $1.000.000 frente al ahorro real';
  v_cons  integer; v_e uuid;
begin
  if periodo_bloqueado(v_fecha) then raise exception 'El periodo de % está cerrado', v_fecha; end if;
  if exists (select 1 from journal_entries where tipo_comprobante = 'CG' and descripcion = v_desc and estado = 'CONTABILIZADO') then
    raise exception 'Esta reclasificación ya fue aplicada'; end if;

  v_cons := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla)
    values ('CG', v_cons, v_fecha, to_char(v_fecha, 'YYYY-MM'), v_desc, 'reclasificacion')
    returning id into v_e;

  perform contab_insert_linea(v_e, '110505',   null,  null, v_monto, 0);   -- DB caja
  perform contab_insert_linea(v_e, '13251005', v_ter, null, 0, v_monto);   -- CR reserva
end $$;

-- Verificación
select cuenta_puc, sum(debito - credito) as saldo
  from journal_entry_lines l join journal_entries je on je.id = l.journal_entry_id
 where je.estado = 'CONTABILIZADO' and cuenta_puc in ('13251005', '110505')
 group by cuenta_puc;
