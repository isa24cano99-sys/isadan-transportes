-- ════════════════════════════════════════════════════════════════════════════
-- FASE 1 · PASO 1 — Esquema contable base (partida doble)
--   tipos_comprobante · journal_entries · journal_entry_lines
--   + extensión de puc_accounts + triggers de cuadre/inmutabilidad + consecutivos
--
-- Aplicar en Supabase (SQL Editor). Idempotente (if not exists / create or replace /
-- guards en DO blocks). NO inserta datos operativos: solo el seed de tipos_comprobante.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Tipos de comprobante + consecutivo por tipo ───────────────────────────
create table if not exists tipos_comprobante (
  codigo                 text primary key,
  nombre                 text not null,
  siguiente_consecutivo  integer not null default 1
);
alter table tipos_comprobante disable row level security;
grant all on tipos_comprobante to service_role;

insert into tipos_comprobante (codigo, nombre) values
  ('CI', 'Causación Ingreso'),
  ('CG', 'Costo/Gasto'),
  ('CB', 'Pago Banco'),
  ('CN', 'Nómina'),
  ('CP', 'Provisión'),
  ('CA', 'Ajuste/Apertura'),
  ('CC', 'Cierre')
on conflict (codigo) do nothing;

-- ── 2) Extensión de puc_accounts (aditivo: solo columnas nuevas) ─────────────
alter table puc_accounts add column if not exists naturaleza          text;
alter table puc_accounts add column if not exists exige_tercero       boolean not null default true;
alter table puc_accounts add column if not exists exige_centro_costo  boolean not null default false;
alter table puc_accounts add column if not exists concepto_exogena    text;

-- CHECK de naturaleza (pasa en filas viejas con NULL; el seed del PASO 2 las llena)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'puc_accounts_naturaleza_chk') then
    alter table puc_accounts
      add constraint puc_accounts_naturaleza_chk check (naturaleza in ('DEBITO','CREDITO'));
  end if;
end $$;

-- puc_accounts.codigo debe ser UNIQUE para poder ser referenciado por FK.
-- (Si esto falla, hay códigos PUC duplicados — avísame antes de forzar nada.)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'puc_accounts_codigo_uk') then
    alter table puc_accounts add constraint puc_accounts_codigo_uk unique (codigo);
  end if;
end $$;

-- ── 3) Encabezado del asiento ────────────────────────────────────────────────
create table if not exists journal_entries (
  id                 uuid primary key default gen_random_uuid(),
  tipo_comprobante   text not null references tipos_comprobante(codigo),
  consecutivo        integer not null,
  fecha              date not null,
  periodo            text not null,                       -- 'YYYY-MM'
  descripcion        text,
  documento_soporte  text,
  origen_tabla       text,                                -- p.ej. 'trips', 'invoices'
  origen_id          uuid,                                -- id del registro operativo origen
  estado             text not null default 'CONTABILIZADO'
                       check (estado in ('CONTABILIZADO','ANULADO')),
  anula_a            uuid references journal_entries(id), -- asiento que este reversa
  created_at         timestamptz not null default now(),
  created_by         text,
  constraint journal_entries_consecutivo_uk unique (tipo_comprobante, consecutivo)
);
alter table journal_entries disable row level security;
grant all on journal_entries to service_role;

create index if not exists journal_entries_periodo_idx  on journal_entries (periodo);
create index if not exists journal_entries_origen_idx   on journal_entries (origen_tabla, origen_id);

-- ── 4) Líneas del asiento (débito/crédito) ───────────────────────────────────
create table if not exists journal_entry_lines (
  id                     uuid primary key default gen_random_uuid(),
  journal_entry_id       uuid not null references journal_entries(id) on delete cascade,
  cuenta_puc             text not null references puc_accounts(codigo),
  tercero_id             uuid references terceros(id),
  centro_costo           text,                            -- p.ej. placa del vehículo
  debito                 numeric(18,2) not null default 0,
  credito                numeric(18,2) not null default 0,
  tercero_nit_snapshot   text,                            -- congela el NIT al momento del asiento
  tercero_nombre_snapshot text,                           -- congela el nombre al momento del asiento
  concepto_exogena       text,
  constraint jel_montos_no_negativos check (debito >= 0 and credito >= 0),
  constraint jel_un_solo_lado       check (not (debito > 0 and credito > 0))
);
alter table journal_entry_lines disable row level security;
grant all on journal_entry_lines to service_role;

create index if not exists jel_entry_idx    on journal_entry_lines (journal_entry_id);
create index if not exists jel_cuenta_idx   on journal_entry_lines (cuenta_puc);
create index if not exists jel_tercero_idx  on journal_entry_lines (tercero_id);

-- ── 5) Trigger de cuadre (DEFERRABLE INITIALLY DEFERRED) ─────────────────────
-- Se evalúa AL FINAL de la transacción: suma débitos y créditos del asiento y
-- rechaza si no son iguales. Constraint trigger porque solo esos son diferibles.
create or replace function valida_asiento_cuadrado()
returns trigger language plpgsql as $$
declare
  v_deb numeric(18,2);
  v_cre numeric(18,2);
begin
  select coalesce(sum(debito), 0), coalesce(sum(credito), 0)
    into v_deb, v_cre
    from journal_entry_lines
   where journal_entry_id = new.journal_entry_id;

  if v_deb <> v_cre then
    raise exception 'Asiento descuadrado (entry %): débitos % <> créditos %',
      new.journal_entry_id, v_deb, v_cre;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_valida_asiento_cuadrado on journal_entry_lines;
create constraint trigger trg_valida_asiento_cuadrado
  after insert on journal_entry_lines
  deferrable initially deferred
  for each row execute function valida_asiento_cuadrado();

-- ── 6) Trigger de inmutabilidad de asientos CONTABILIZADOS ───────────────────
-- BEFORE UPDATE OR DELETE en encabezado y líneas: si el asiento (o el asiento padre
-- de la línea) está CONTABILIZADO, rechaza. La corrección se hace por reversión.
create or replace function bloquea_edicion_contabilizado()
returns trigger language plpgsql as $$
declare
  v_estado text;
begin
  if tg_table_name = 'journal_entries' then
    v_estado := old.estado;
  else  -- journal_entry_lines
    select estado into v_estado from journal_entries where id = old.journal_entry_id;
  end if;

  if v_estado = 'CONTABILIZADO' then
    raise exception 'Asiento CONTABILIZADO es inmutable: no se puede modificar ni eliminar. Corrige con un asiento de reversión (anula_a).';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_bloquea_edicion_entries on journal_entries;
create trigger trg_bloquea_edicion_entries
  before update or delete on journal_entries
  for each row execute function bloquea_edicion_contabilizado();

drop trigger if exists trg_bloquea_edicion_lines on journal_entry_lines;
create trigger trg_bloquea_edicion_lines
  before update or delete on journal_entry_lines
  for each row execute function bloquea_edicion_contabilizado();

-- ── 7) Consecutivo atómico por tipo de comprobante ───────────────────────────
-- Consume el consecutivo actual y avanza el puntero en un solo UPDATE ... RETURNING
-- (row lock; sin SELECT+UPDATE separados que permitirían carreras).
create or replace function consecutivo_siguiente(p_tipo text)
returns integer language plpgsql as $$
declare
  v_consecutivo integer;
begin
  update tipos_comprobante
     set siguiente_consecutivo = siguiente_consecutivo + 1
   where codigo = p_tipo
   returning siguiente_consecutivo - 1 into v_consecutivo;

  if v_consecutivo is null then
    raise exception 'Tipo de comprobante % no existe', p_tipo;
  end if;
  return v_consecutivo;
end;
$$;
