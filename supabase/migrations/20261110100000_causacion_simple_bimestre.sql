-- ════════════════════════════════════════════════════════════════════════════
-- Causación del impuesto SIMPLE por bimestre (botón en /impuesto).
--
-- Reemplaza el uso de postear_causacion_simple (monto único, sin tercero, sin separar ICA del
-- componente nacional, sin pantalla) por una función que replica el asiento real del bimestre 4
-- (CG-156, formulario 2593 del contador):
--     DB 54050505 · DIAN   componente nacional (SIMPLE)
--     DB 54050510 · DIAN   ICA
--     CR 241215   · DIAN   régimen simple por pagar  (= nacional + ICA)
-- Las cifras las dicta la declaración (formulario 2593), no una fórmula: se digitan en pantalla.
--
-- Guards (todos en la función):
--   · bimestre 1..6, montos ≥ 0 y suma > 0, soporte (formulario/recibo) obligatorio
--   · el periodo de la fecha no puede estar cerrado
--   · NO se causa dos veces: aborta si ya hay líneas 54050505/54050510 con fecha dentro del bimestre
--     (cubre CG-156, hecho antes por script). Una diferencia posterior se corrige con un asiento
--     de ajuste, nunca re-causando.
-- La fecha por defecto es el último día del bimestre.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function postear_causacion_simple_bimestre(
  p_anio     integer,
  p_bimestre integer,
  p_nacional numeric,
  p_ica      numeric,
  p_soporte  text,
  p_fecha    date default null
) returns uuid
language plpgsql
as $$
declare
  v_ini   date;
  v_fin   date;
  v_fecha date;
  v_dian  uuid;
  v_total numeric;
  v_cons  integer;
  v_e     uuid;
begin
  if p_bimestre is null or p_bimestre < 1 or p_bimestre > 6 then
    raise exception 'Bimestre inválido: % (debe ser 1 a 6)', p_bimestre; end if;
  if p_anio is null or p_anio < 2026 or p_anio > 2100 then
    raise exception 'Año inválido: %', p_anio; end if;
  if coalesce(p_nacional, 0) < 0 or coalesce(p_ica, 0) < 0 then
    raise exception 'Los montos no pueden ser negativos'; end if;
  v_total := coalesce(p_nacional, 0) + coalesce(p_ica, 0);
  if v_total <= 0 then raise exception 'El impuesto causado debe ser mayor que 0'; end if;
  if coalesce(trim(p_soporte), '') = '' then
    raise exception 'Indica el soporte (formulario 2593 / recibo de la DIAN)'; end if;

  v_ini   := make_date(p_anio, (p_bimestre - 1) * 2 + 1, 1);
  v_fin   := (v_ini + interval '2 months' - interval '1 day')::date;
  v_fecha := coalesce(p_fecha, v_fin);
  if v_fecha < v_ini or v_fecha > v_fin then
    raise exception 'La fecha % está fuera del bimestre % de % (% a %)', v_fecha, p_bimestre, p_anio, v_ini, v_fin; end if;
  if periodo_bloqueado(v_fecha) then
    raise exception 'El periodo de % está cerrado', to_char(v_fecha, 'YYYY-MM'); end if;

  if exists (
    select 1
      from journal_entry_lines l join journal_entries je on je.id = l.journal_entry_id
     where je.estado = 'CONTABILIZADO'
       and l.cuenta_puc in ('54050505', '54050510')
       and je.fecha between v_ini and v_fin
  ) then
    raise exception 'El bimestre % de % ya tiene el impuesto causado en el libro. Una diferencia se ajusta con un asiento aparte, no se vuelve a causar.', p_bimestre, p_anio;
  end if;

  select id into v_dian from terceros where numero_identificacion = '800197268' and merged_into is null limit 1;
  if v_dian is null then raise exception 'No existe el tercero DIAN (800197268)'; end if;

  v_cons := consecutivo_siguiente('CG');
  insert into journal_entries (tipo_comprobante, consecutivo, fecha, periodo, descripcion, documento_soporte, origen_tabla)
    values ('CG', v_cons, v_fecha, to_char(v_fecha, 'YYYY-MM'),
            format('Causación impuesto SIMPLE bimestre %s de %s', p_bimestre, p_anio),
            trim(p_soporte), 'causacion_simple')
    returning id into v_e;

  if coalesce(p_nacional, 0) > 0 then
    perform contab_insert_linea(v_e, '54050505', v_dian, null, p_nacional, 0);   -- DB componente nacional
  end if;
  if coalesce(p_ica, 0) > 0 then
    perform contab_insert_linea(v_e, '54050510', v_dian, null, p_ica, 0);        -- DB ICA
  end if;
  perform contab_insert_linea(v_e, '241215', v_dian, null, 0, v_total);          -- CR SIMPLE por pagar

  return v_e;
end $$;
