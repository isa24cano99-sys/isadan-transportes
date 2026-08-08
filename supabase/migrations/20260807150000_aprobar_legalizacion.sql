-- ════════════════════════════════════════════════════════════════════════════
-- aprobar_legalizacion(p_leg_id) — al aprobar, contabiliza TODOS los costos de la
-- legalización en UNA sola transacción (atómico: o todos o ninguno; si algo falla, la
-- aprobación falla visible, nunca "a medias").
--
--   Ruteo por expense_type de cada línea (monto>0):
--     porcentaje        → postear_porcentaje_conductor
--     comision_empresa  → postear_comision_empresa
--     resto (costo operativo, cuenta según el mapa verificado):
--        matched_invoice_id puesto (FE enlazada antes de aprobar) → postear_costo_dian (proveedor real)
--        si no                                                    → DB cuenta / CONSUMIDOR FINAL / CR 13301510 conductor
--
--   Anti-dup por línea: si una parte ya está contabilizada (por cualquier camino), se SALTA
--   (no re-postea) en vez de fallar — así re-aprobar una legalización editada no rompe la
--   edición; devuelve {posted, skipped}. Corrección de montos ya posteados: por reversión.
--
--   Guards: conductor con tercero_id, Consumidor Final existe, cuenta de costo válida (5/6),
--   pre-corte/cierre (periodo_bloqueado). Placa opcional (va como centro de costo si existe).
--
--   NO toca legalizaciones aprobadas ANTES de este cambio: solo se dispara al aprobar de aquí
--   en adelante (la acción llama este RPC). Las históricas se cierran con el batch/pantallas.
--   Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function aprobar_legalizacion(p_leg_id uuid)
returns jsonb language plpgsql as $$
declare
  v_leg record; v_cf uuid; v_rec record; v_cuenta text; v_placa text;
  v_existe uuid; v_entry uuid; v_consec integer;
  v_posted integer := 0; v_skipped integer := 0;
begin
  select l.id, l.status, l.date, l.driver_id, d.tercero_id as conductor_ter, v.plate as placa
    into v_leg
    from legalizations l
    left join drivers d  on d.id = l.driver_id
    left join vehicles v on v.id = l.vehicle_id
   where l.id = p_leg_id;
  if not found then raise exception 'Legalización % no existe', p_leg_id; end if;
  if v_leg.conductor_ter is null then
    raise exception 'La legalización no tiene conductor con tercero_id — no se puede contabilizar';
  end if;

  select id into v_cf from terceros where numero_identificacion = '222222222222' limit 1;
  if v_cf is null then raise exception 'No existe el tercero CONSUMIDOR FINAL (222222222222)'; end if;
  v_placa := v_leg.placa;

  for v_rec in
    select le.id as line_id, le.expense_type, le.amount,
           coalesce(le.date, v_leg.date) as fecha, le.matched_invoice_id
      from legalization_expenses le
     where le.legalization_id = p_leg_id and coalesce(le.amount,0) > 0
  loop
    if v_rec.expense_type = 'porcentaje' then
      select e.id into v_existe from journal_entries e
        join journal_entry_lines l on l.journal_entry_id = e.id
       where e.origen_tabla='legalizations' and e.origen_id=p_leg_id and e.tipo_comprobante='CG'
         and e.estado='CONTABILIZADO' and l.cuenta_puc='61450550' limit 1;
      if v_existe is not null then v_skipped := v_skipped+1; continue; end if;
      perform postear_porcentaje_conductor(v_leg.driver_id, v_placa, v_rec.amount, v_rec.fecha, p_leg_id);
      v_posted := v_posted+1;

    elsif v_rec.expense_type = 'comision_empresa' then
      select e.id into v_existe from journal_entries e
        join journal_entry_lines l on l.journal_entry_id = e.id
       where e.origen_tabla='legalizations' and e.origen_id=p_leg_id and e.tipo_comprobante='CG'
         and e.estado='CONTABILIZADO' and l.cuenta_puc='61450580' limit 1;
      if v_existe is not null then v_skipped := v_skipped+1; continue; end if;
      perform postear_comision_empresa(v_placa, v_rec.amount, v_rec.fecha, null, p_leg_id);
      v_posted := v_posted+1;

    else
      -- costo operativo: cuenta verificada por tipo; dinámico = el propio código PUC
      v_cuenta := case v_rec.expense_type
        when 'acpm_contado'  then '61450510' when 'cargue'    then '61450515' when 'descargue' then '61450535'
        when 'peajes'        then '61450575' when 'lavada'    then '61450555' when 'parqueos'  then '61450545'
        when 'engrase'       then '61450540' when 'llantas'   then '61450590' when 'carrozada' then '61450570'
        when 'cambio_aceite' then '61450530' when 'varada'    then '61450525'
        else v_rec.expense_type end;
      if not exists (select 1 from puc_accounts where codigo = v_cuenta and left(codigo,1) in ('5','6')) then
        raise exception 'Tipo de gasto "%" sin cuenta de costo válida (%) — no se puede contabilizar automáticamente', v_rec.expense_type, v_cuenta;
      end if;

      if v_rec.matched_invoice_id is not null then
        select id into v_existe from journal_entries
         where origen_tabla='dian_invoices_import' and origen_id=v_rec.matched_invoice_id
           and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
        if v_existe is not null then v_skipped := v_skipped+1; continue; end if;
        perform postear_costo_dian(v_rec.matched_invoice_id, v_cuenta, '220501');
        v_posted := v_posted+1;
      else
        select id into v_existe from journal_entries
         where origen_tabla='legalization_expenses' and origen_id=v_rec.line_id
           and tipo_comprobante='CG' and estado='CONTABILIZADO' limit 1;
        if v_existe is not null then v_skipped := v_skipped+1; continue; end if;
        if periodo_bloqueado(v_rec.fecha) then
          raise exception 'No se puede contabilizar: el periodo % está cerrado o es pre-corte', to_char(v_rec.fecha,'YYYY-MM');
        end if;
        v_consec := consecutivo_siguiente('CG');
        insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, origen_tabla, origen_id)
          values ('CG', v_consec, v_rec.fecha, to_char(v_rec.fecha,'YYYY-MM'),
                  v_rec.expense_type || ' sin FE · placa ' || coalesce(v_placa,'—') || ' (Consumidor Final)',
                  'legalization_expenses', v_rec.line_id)
          returning id into v_entry;
        perform contab_insert_linea(v_entry, v_cuenta, v_cf, v_placa, v_rec.amount, 0);
        perform contab_insert_linea(v_entry, '13301510', v_leg.conductor_ter, v_placa, 0, v_rec.amount);
        v_posted := v_posted+1;
      end if;
    end if;
  end loop;

  update legalizations set status = 'APROBADA' where id = p_leg_id;
  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped);
end; $$;
