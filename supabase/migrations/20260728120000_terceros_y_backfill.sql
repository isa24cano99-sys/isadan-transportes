-- ════════════════════════════════════════════════════════════════════════════
-- Semana 1 — Modelo de terceros (exógena/1001), backfill y fusión de duplicados
-- Aplicar en Supabase (SQL Editor) o con `supabase db push`.
-- ════════════════════════════════════════════════════════════════════════════

-- ── DV DIAN (módulo 11) — plpgsql claro. IMMUTABLE. Uso opcional en DB/verificación.
-- (NO se usa dentro de la columna generada `completo`; la validez del DV se hace en la app.)
create or replace function calcular_dv(nit text)
returns smallint
language plpgsql
immutable
as $$
declare
  pesos int[] := array[3,7,13,17,19,23,29,37,41,43,47,53,59,67,71];
  num   text  := regexp_replace(coalesce(nit, ''), '\D', '', 'g');
  suma  int   := 0;
  i     int;
  residuo int;
begin
  -- multiplicar cada dígito, de DERECHA a IZQUIERDA, por la serie de pesos
  for i in 1..length(num) loop
    suma := suma + substr(num, length(num) - i + 1, 1)::int * pesos[i];
  end loop;
  residuo := suma % 11;
  if residuo < 2 then return residuo::smallint; else return (11 - residuo)::smallint; end if;
end;
$$;

-- ── set_updated_at genérico ──────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ── TABLA MAESTRA terceros ───────────────────────────────────────────────────
create table if not exists terceros (
  id                    uuid primary key default gen_random_uuid(),
  tipo_persona          text not null,                 -- 'NATURAL' | 'JURIDICA'
  tipo_documento        text not null,                 -- código DIAN (11,12,13,21,22,31,41,42,50,91)
  numero_identificacion text not null,                 -- solo dígitos, normalizado
  digito_verificacion   smallint,                      -- solo si tipo_documento='31'
  razon_social          text,                          -- si JURIDICA
  primer_apellido       text,                          -- si NATURAL
  segundo_apellido      text,
  primer_nombre         text,
  otros_nombres         text,
  direccion             text,
  codigo_pais           text default '169',            -- 169 = Colombia
  codigo_departamento   text,                          -- DANE 2 díg
  codigo_municipio      text,                          -- DANE 3 díg
  email                 text,
  telefono              text,
  es_cliente            boolean default false,
  es_proveedor          boolean default false,
  cuenta_puc_sugerida   text,
  activo                boolean default true,
  merged_into           uuid references terceros(id),
  -- ── §5: completitud progresiva (columna generada — SOLO presencia de campos) ──
  -- La VALIDEZ del DV (módulo 11) se valida en la app (nit.ts) al guardar, por eso
  -- aquí solo se exige que el DV esté PRESENTE cuando es NIT. Así el GENERATED no
  -- llama funciones y siempre aplica (ver nota del punto #4).
  completo boolean generated always as (
    tipo_documento is not null
    and numero_identificacion is not null and numero_identificacion <> ''
    and (tipo_documento <> '31' or digito_verificacion is not null)
    and (
      (tipo_persona = 'JURIDICA' and razon_social is not null and razon_social <> '')
      or (tipo_persona = 'NATURAL' and primer_nombre is not null and primer_nombre <> '' and primer_apellido is not null and primer_apellido <> '')
    )
    and direccion is not null and direccion <> ''
    and codigo_departamento is not null and codigo_departamento <> ''
    and codigo_municipio is not null and codigo_municipio <> ''
  ) stored,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
-- UNIQUE (tipo_documento, numero_identificacion) solo entre los NO fusionados
create unique index if not exists terceros_identificacion_uk
  on terceros (tipo_documento, numero_identificacion) where merged_into is null;
create index if not exists terceros_num_ident_idx on terceros (numero_identificacion);

drop trigger if exists trg_terceros_updated on terceros;
create trigger trg_terceros_updated before update on terceros
  for each row execute function set_updated_at();

alter table terceros disable row level security;
grant all on terceros to service_role;

-- ── Bitácora de fusiones (auditoría) ─────────────────────────────────────────
create table if not exists terceros_merges (
  id                uuid primary key default gen_random_uuid(),
  fecha             timestamptz default now(),
  id_sobreviviente  uuid not null references terceros(id),
  id_duplicado      uuid not null references terceros(id),
  nit_sobreviviente text,
  nit_duplicado     text,
  afectadas         jsonb            -- {tabla: nº de filas movidas}
);
alter table terceros_merges disable row level security;
grant all on terceros_merges to service_role;

-- ── §1: tercero_id en las tablas legado (NO se borran; solo se enlazan) ───────
alter table clients          add column if not exists tercero_id uuid references terceros(id);
alter table suppliers        add column if not exists tercero_id uuid references terceros(id);
alter table supplier_catalog add column if not exists tercero_id uuid references terceros(id);
alter table drivers          add column if not exists tercero_id uuid references terceros(id);  -- conductores (y socios que son conductores)
alter table employees        add column if not exists tercero_id uuid references terceros(id);  -- empleados / socios
alter table supplier_catalog add column if not exists keywords   text[] default '{}';   -- método 4 backfill

-- ── Backfill en bank_transactions ────────────────────────────────────────────
alter table bank_transactions add column if not exists tercero_id          uuid references terceros(id);
alter table bank_transactions add column if not exists asignacion_metodo   text;   -- 1-patrones,2-dian,3-peaje,4-catalogo,5-viaje,6-conductor,7-socio,manual
alter table bank_transactions add column if not exists asignacion_confianza text;  -- 'ALTA' | 'MEDIA' | 'BAJA'
alter table bank_transactions add column if not exists periodo_pre_corte   boolean default false; -- true = ≤ 2026-06-30 (copia de trabajo, no libro)

-- ── Configuración editable (clave/valor) — para no hardcodear cuentas ─────────
create table if not exists configuracion (
  clave       text primary key,
  valor       text,
  descripcion text,
  updated_at  timestamptz default now()
);
alter table configuracion disable row level security;
grant all on configuracion to service_role;

-- Cuenta contrapartida de los movimientos con socio — PENDIENTE decisión del contador
-- (opciones: 110505 Caja general · 2355 Socios · 135595 CxC socios). Se deja NULL.
insert into configuracion (clave, valor, descripcion)
select 'cuenta_contrapartida_movimiento_socio', null,
       'PUC contra el que se registran los movimientos con socios. Opciones: 110505 Caja general / 2355 Socios / 135595 CxC socios. Pendiente decisión del contador.'
where not exists (select 1 from configuracion where clave = 'cuenta_contrapartida_movimiento_socio');

-- ── Categoría MOVIMIENTO_CON_SOCIO (no es ingreso/egreso de proveedor) ─────────
-- El tercero es el socio/empleado; la cuenta contrapartida es configurable (arriba).
insert into transaction_categories (name, type, puc_code, description, active)
select 'Movimiento con socio', 'NEGOCIO', null,
       'Movimiento con un socio o empleado (préstamos, sobregiros, gastos personales cubiertos por la empresa). El tercero es el socio, no un proveedor ni consumidor final. Cuenta contrapartida configurable (configuracion.cuenta_contrapartida_movimiento_socio).', true
where not exists (select 1 from transaction_categories where name = 'Movimiento con socio');

-- ════════════════════════════════════════════════════════════════════════════
-- §4 — fusionar_terceros: SOLO la fusión, atómica, con verificación y rollback
-- (el auto-fill del backfill va por separado, no dentro de esta transacción)
-- NO toca invoices (registro histórico enviado a la DIAN).
-- ════════════════════════════════════════════════════════════════════════════
create or replace function fusionar_terceros(id_sobreviviente uuid, id_duplicado uuid)
returns jsonb
language plpgsql
as $$
declare
  nit_dup text; nit_sob text; nombre_sob text;
  c_cli int; c_sup int; c_cat_t int; c_bank int; c_are int; c_pay int; c_patt int; c_cat_n int;
  orphan int; afectadas jsonb;
begin
  if id_sobreviviente = id_duplicado then raise exception 'sobreviviente y duplicado son el mismo'; end if;

  select numero_identificacion into nit_dup from terceros where id = id_duplicado;
  select numero_identificacion, coalesce(razon_social, trim(coalesce(primer_nombre,'')||' '||coalesce(primer_apellido,'')))
    into nit_sob, nombre_sob from terceros where id = id_sobreviviente;
  if nit_dup is null or nit_sob is null then raise exception 'tercero sobreviviente o duplicado no existe'; end if;

  -- 1) Repuntar el enlace autoritativo tercero_id
  update clients          set tercero_id = id_sobreviviente where tercero_id = id_duplicado; get diagnostics c_cli   = row_count;
  update suppliers        set tercero_id = id_sobreviviente where tercero_id = id_duplicado; get diagnostics c_sup   = row_count;
  update supplier_catalog set tercero_id = id_sobreviviente where tercero_id = id_duplicado; get diagnostics c_cat_t = row_count;

  -- 2) Actualizar NITs denormalizados (texto) duplicado -> sobreviviente  (NO invoices)
  update bank_transactions            set supplier_nit = nit_sob, supplier_name = nombre_sob where supplier_nit = nit_dup; get diagnostics c_bank = row_count;
  update accounts_receivable_entries  set client_nit   = nit_sob, client_name   = nombre_sob where client_nit   = nit_dup; get diagnostics c_are  = row_count;
  update client_payments              set client_nit   = nit_sob, client_name   = nombre_sob where client_nit   = nit_dup; get diagnostics c_pay  = row_count;
  update description_patterns         set supplier_nit = nit_sob, supplier_name = nombre_sob where supplier_nit = nit_dup; get diagnostics c_patt = row_count;
  update supplier_catalog             set nit          = nit_sob, nombre        = nombre_sob where nit          = nit_dup; get diagnostics c_cat_n = row_count;

  -- 3) Marcar el duplicado (NO se borra)
  update terceros set merged_into = id_sobreviviente, activo = false, updated_at = now() where id = id_duplicado;

  -- 4) Verificar que no quedó nada apuntando al duplicado (salvo invoices, intocada)
  select (select count(*) from clients          where tercero_id = id_duplicado)
       + (select count(*) from suppliers        where tercero_id = id_duplicado)
       + (select count(*) from supplier_catalog where tercero_id = id_duplicado)
       + (select count(*) from bank_transactions            where supplier_nit = nit_dup)
       + (select count(*) from accounts_receivable_entries  where client_nit   = nit_dup)
       + (select count(*) from client_payments              where client_nit   = nit_dup)
       + (select count(*) from description_patterns         where supplier_nit = nit_dup)
       + (select count(*) from supplier_catalog             where nit          = nit_dup)
    into orphan;
  if orphan > 0 then
    raise exception 'Quedaron % filas apuntando al duplicado (nit %). ROLLBACK.', orphan, nit_dup;
  end if;

  afectadas := jsonb_build_object(
    'clients_tercero_id', c_cli, 'suppliers_tercero_id', c_sup, 'supplier_catalog_tercero_id', c_cat_t,
    'bank_transactions', c_bank, 'ar_entries', c_are, 'client_payments', c_pay,
    'description_patterns', c_patt, 'supplier_catalog_nit', c_cat_n
  );

  insert into terceros_merges (id_sobreviviente, id_duplicado, nit_sobreviviente, nit_duplicado, afectadas)
  values (id_sobreviviente, id_duplicado, nit_sob, nit_dup, afectadas);

  return afectadas;
end;
$$;
