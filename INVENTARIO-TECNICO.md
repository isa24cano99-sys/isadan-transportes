# Inventario Técnico — transcarga

> App de transporte/logística (ISADAN Transportes). Next.js 16.2.7 + React 19.2.4 + Supabase + Vercel.
> Documento **solo lectura**, generado el 2026-07-27. No refleja cambios de esquema posteriores.
> Fuente del esquema: introspección del OpenAPI de PostgREST (producción) + lectura de código.

---

## 0. Resumen ejecutivo

| Área | Estado |
|---|---|
| Router | Next.js **App Router** (sin Pages, sin `route.ts`, sin RPC de Postgres) |
| Lógica de negocio | **Server Actions** (`'use server'`) — 29 archivos |
| Supabase | Un solo cliente **service_role** (servidor). Sin cliente de navegador |
| Auth | PIN **hardcodeado `'1234'`** + cookie base64 sin firmar (12 h) |
| RLS | Deshabilitado en las tablas creadas por la app; irrelevante con service_role |
| Migraciones | **No versionadas.** SQL suelto en comentarios de los actions; se aplica a mano en Supabase |
| Dinero en float | **NINGUNA** columna usa `float`/`real`/`double precision` — todo es `numeric` ✅ |
| Integraciones | Dataico (REST), Flypass (Excel manual), Ministerio (PDF parseado con `unpdf`) |
| Tablas | 28 · fila más poblada: `toll_transactions` (1.383) |

---

## 1. Esquema de base de datos

### 1.0 Columnas de dinero en punto flotante — **AUDITORÍA CLAVE**

**No existe ninguna columna de dinero declarada como `float`, `real` o `double precision`.** Todas las columnas monetarias son `numeric` (decimal exacto de Postgres). Columnas monetarias verificadas, todas `numeric`:

`bank_transactions.amount`, `trips.freight_value` / `advance_amount` / `price_per_ton`, `invoices.total_amount` / `tax_amount`, `legalizations.freight_value` / `advance_amount` / `total_expenses` / `balance`, `legalization_expenses.amount`, `toll_transactions.subtotal` / `tax` / `total`, `loans.loan_amount` / `monthly_payment` / `interest_rate`, `loan_installments.capital` / `interest` / `payment_amount` / `remaining_balance`, `payroll.*` (todos los importes), `accounts_receivable_entries.invoice_amount` / `advance_amount` / `balance`, `client_payments.amount` / `saldo_a_favor`, `bank_reconciliations.extracto_*` / `app_saldo_final` / `diferencia`, `tax_payments.*`, `social_benefits.*`, `payroll_social_security.*`.

> Nota: el OpenAPI de PostgREST reporta el tipo como `numeric` sin exponer la precisión/escala (p.ej. `numeric(14,2)`). Para confirmar escala exacta habría que consultar `information_schema.columns` directamente en Supabase.

### 1.1 Tipos enumerados (Postgres `enum`)

| Enum | Valores |
|---|---|
| `transaction_type` | `INGRESO, EGRESO` |
| `trip_status` | `PLANEADO, EN_CURSO, FINALIZADO, FACTURADO, PAGADO` |
| `invoice_type` | `EMITIDA, RECIBIDA, NOTA_CREDITO` |
| `legalization_status` | `BORRADOR, PENDIENTE, APROBADA` |
| `installment_status` | `PENDIENTE, PAGADA, VENCIDA` |
| `ar_status` | `PENDIENTE, PAGADA, VENCIDA, ABONADA` |
| `vehicle_status` | `ACTIVO, TALLER, INACTIVO` |
| `account_type` | `CORRIENTE, AHORROS` |

Distribución de tipos en el esquema: `text` (117), `numeric` (64), `uuid` (55), `timestamptz` (38), `date` (22), `integer` (16), `boolean` (13), `jsonb` (2), enums (8), `text[]` (1).

> Todos los PK son `id uuid` con default `uuid_generate_v4()` (salvo `tax_payments` que usa `gen_random_uuid()`). No hay columnas de unique/índices expuestas por PostgREST; los únicos conocidos por código son el índice único `invoices_invoice_number_key` sobre `invoices.invoice_number` (usado como target de `ON CONFLICT`).

### 1.2 Tablas prioritarias (detalle completo)

**`bank_transactions`** (860 filas) — movimientos bancarios
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| account_id | uuid | NOT NULL | FK→bank_accounts.id |
| date | date | NOT NULL | |
| type | enum transaction_type | NOT NULL | INGRESO/EGRESO |
| category | text | null | **texto legado** (PUC viejo o `'SIN_CLASIFICAR'`) |
| description | text | NOT NULL | |
| amount | numeric | NOT NULL | dinero |
| reference_type | text | null | p.ej. `'TRIP'` |
| reference_id | uuid | null | viaje asociado |
| created_at | timestamptz | null | def now() |
| source | text | null | def `MANUAL` (o `EXTRACTO_BANCOLOMBIA`) |
| external_ref | text | null | |
| category_id | uuid | null | **FK→transaction_categories.id (clasificación autoritativa)** |
| supplier_nit | text | null | tercero |
| supplier_name | text | null | tercero |

**`trips`** (82 filas) — viajes/manifiestos
| id uuid PK · trip_number text · client_id FK→clients · vehicle_id FK→vehicles · driver_id FK→drivers · origin text NOT NULL · destination text NOT NULL · load_date date NOT NULL · delivery_date date · **freight_value numeric NOT NULL def 0** · **advance_amount numeric NOT NULL def 0** · status enum trip_status def PLANEADO · notes · created_at/updated_at timestamptz · manifest_number text · weight_kg numeric · price_per_ton numeric · load_content text · **dataico_invoice_id text** (UUID de Dataico) · manifest_auth text · manifest_pdf_path text (ruta en Storage) |

**`invoices`** (25 filas) — facturas emitidas / notas crédito
| id uuid PK · **invoice_number text NOT NULL** (único vía índice) · cufe · issue_date date NOT NULL · client_name text NOT NULL · client_nit text · **total_amount numeric NOT NULL def 0** · tax_amount numeric NOT NULL def 0 · invoice_type enum (EMITIDA/RECIBIDA/NOTA_CREDITO) · xml_path · pdf_path · trip_id FK→trips · created_at · dataico_id text (UUID Dataico) · **dian_status text** (`'ANULADA'`…) · pdf_url · xml_url · **credit_note_id text** (`'MANUAL'` o UUID de NC) · credit_note_number text |

**`legalizations`** (82 filas) — legalización de gastos por viaje
| id uuid PK · trip_id FK→trips NOT NULL · driver_id FK→drivers · date date def CURRENT_DATE · advance_amount numeric NOT NULL def 0 · total_expenses numeric def 0 · balance numeric · status enum (BORRADOR/PENDIENTE/APROBADA) def BORRADOR · notes · created_at/updated_at · vehicle_id FK→vehicles · **freight_value numeric** (flete a facturar si difiere del manifiesto) |

**`legalization_expenses`** (371 filas) — líneas de gasto de cada legalización
| id uuid PK · legalization_id FK→legalizations NOT NULL · **expense_type text NOT NULL** (clave/`slug`/PUC — ver §3) · date date NOT NULL · amount numeric NOT NULL · description · attachment_url · created_at |

**`toll_transactions`** (1.383 filas) — peajes Flypass
| id uuid PK · status · type · document text (Referencia 2, clave de dedup) · plate · toll_name · category · pass_date **timestamptz** · subtotal numeric def 0 · tax numeric def 0 · **total numeric def 0** · cufe · nit · trip_id FK→trips · created_at |

**`clients`** (39) — `id · name NOT NULL · nit · phone · email · address · active · created_at/updated_at · dataico_id · third_party_type def CLIENTE · account_code`

**`suppliers`** (18) — `id · dataico_id · nit · name NOT NULL · category · account_code · email · phone · active · created_at/updated_at`

**`supplier_catalog`** (27) — catálogo de terceros para categorización — `id · nit NOT NULL · nombre NOT NULL · cuenta_puc text · categoria NOT NULL · active · created_at`. (Por código también tiene `keywords`, añadida por `proveedores/actions.ts`.)

**`loans`** (6) — `id · entity NOT NULL · loan_amount numeric NOT NULL · interest_rate numeric NOT NULL · term_months int NOT NULL · start_date date NOT NULL · monthly_payment numeric def 0 · active · notes · created_at`

**`loan_installments`** (313) — `id · loan_id FK→loans · installment_number int · due_date date · capital numeric · interest numeric · payment_amount numeric · remaining_balance numeric · status enum installment_status · paid_date date`

**`payroll`** (1) — nómina conductores — `id · driver_id FK→drivers · period · year int · month int · base_salary · total_percentage · total_favor_conductor · total_favor_empresa · prima · other_additions · other_deductions · net_payment · paid bool · paid_date · notes · created_at` (todos los importes `numeric`)

**`transaction_categories`** (70) — categorías de negocio → PUC — `id · name NOT NULL · description · **puc_code text** · type text NOT NULL (NEGOCIO/CASA) · active · created_at`

**`puc_accounts`** (85) — **catálogo maestro PUC** — `id · codigo text NOT NULL · nombre text NOT NULL · tipo text NOT NULL · categoria_legaliz text · active def true · created_at` (ver §2)

### 1.3 Tablas de soporte (resumen)

- **`accounts_receivable`** (0) — cartera legado (`client_id, invoice_id, trip_id, amount, due_date, status enum ar_status, paid_date`). **Vacía**; la cartera activa usa `accounts_receivable_entries`.
- **`accounts_receivable_entries`** (17) — cartera actual — `client_id/name/nit · invoice_id FK · invoice_number · invoice_amount · invoice_date · advance_amount · **balance numeric (columna generada = invoice_amount − advance_amount)** · status text def PENDIENTE · paid_date · notes`.
- **`client_payments`** (0) — pagos multi-factura — `client_nit/name · amount · payment_date · description · **covered_invoices text[]** · saldo_a_favor · bank_transaction_id · created_at`.
- **`bank_accounts`** (1) — `bank_name · account_number · account_type enum · initial_balance · active`.
- **`bank_reconciliations`** (2) — conciliación mensual — `account_id FK · year · month · status · extracto_saldo_inicial/total_ingresos/total_egresos/saldo_final · app_saldo_final · diferencia · transacciones_conciliadas/sin_registrar/sin_confirmar · closed_at · **extracto_data jsonb · resultado_data jsonb**`.
- **`description_patterns`** (103) — **patrones aprendidos de categorización** — `pattern text · category_id FK→transaction_categories · match_count int · supplier_nit/name · created_at/updated_at`.
- **`dian_invoices_import`** (103) — facturas DIAN recibidas — `document_type · cufe · folio · prefix · issue_date · reception_date · nit/name_issuer/receiver · iva · total · status · matched_toll_id FK→toll_transactions`.
- **`vehicles`** (3), **`drivers`** (4) — maestros de flota/conductores.
- **`employees`** (0), **`social_benefits`** (1), **`payroll_social_security`** (3) — nómina/prestaciones/seguridad social.
- **`tax_payments`** (1) — RST/ICA por bimestre — `year · bimestre · income · rst_gross · pension_contribution · ica · rst_net · total_to_pay · paid`.
- **`documents`** (10) — documentos genéricos (polimórfico: `entity_type` + `entity_id`, `file_path`, `expiration_date`).

---

## 2. Catálogo de cuentas contables (PUC)

**Sí existe tabla maestra: `puc_accounts` (85 filas)**, editable en runtime. Esquema en §1.2. Muestra:

| codigo | nombre | tipo |
|---|---|---|
| 111005 | Moneda nacional | ACTIVO |
| 11100510 | Ahorros bancolombia 49900005996 | ACTIVO |
| 133015 | A trabajadores | ACTIVO |
| 13301510 | Anticipo a trabajadores | ACTIVO |
| 13551500 | Retención en la fuente 0.1% | ACTIVO |
| 13551505 | Retención en la fuente 1% | ACTIVO |
| 13551510 | Retención en la fuente 1.5% | ACTIVO |
| 13659510 | Prestamo empleados | ACTIVO |
| 220501 | Proveedores nacionales | PASIVO |
| … | (85 en total) | |

Los códigos PUC viven en **tres capas**:

1. **`puc_accounts`** — fuente maestra. Cuentas custom se crean con `crearPucCuentaAction` (`bancos/puc-actions.ts:6`), que autogenera un código de 9 dígitos empezando por `9`: `` `9${Date.now().toString().slice(-8)}` ``.
2. **`transaction_categories` (70 filas)** — categorías de negocio que apuntan a un PUC vía `puc_code` + `type` (NEGOCIO/CASA). Es la **clasificación autoritativa** de una transacción bancaria (vía FK `category_id`). Ejemplos: `13301510 Anticipo conductor`, `28050510 Anticipo de cliente`, `41450510 Ingreso por flete`, `42100510 Intereses bancarios recibidos`, `52050610 Nómina conductores`. **Varias categorías comparten el mismo `puc_code`** (p.ej. dos `42100510`, una NEGOCIO y otra CASA), por eso la UI muestra siempre el `name`, no el nombre del PUC.
3. **Constantes hardcodeadas en TypeScript** — los sets del Estado de Resultados (`reportes/page.tsx:7-18`):

```ts
PERSONAL_COST_CATS   = ['52050610','52059510','52056810','52057010','52057210','52056910','52053010','52053610','52053910','52052710','52058410','52058495']
GENERAL_COST_CATS    = ['52201005','52304010','52352010','52353010','52353510','52401005','52950510','52956010','51103010']
FINANCIAL_EXP_CATS   = ['53050505','53050510','53152010']
TAX_CATS             = ['51150510']
PERSONAL_OWNER_CATS  = ['52959510','52959511','52959505','52959507','52959520','52959530','52959535']
ANTICIPO_CATS        = ['28050510']
ANTICIPO_NO_LEG_CATS = ['13301510']
FINANCIAL_INC_CATS   = ['42100510']
PEAJE_PUC_EXCLUIDO   = '61450575'   // se excluye del P&L bancario (doble conteo con toll_transactions)
```

Mapas de nombres legibles: `PUC_NAMES` (`reportes/EstadoResultadosClient.tsx:14-34`), `PUC_TIPO_LABELS` (`components/PucSelector.tsx`). Los `tipo` informales de PUC: `INGRESO, INGRESO_FINANCIERO, INGRESO_NO_FACTURADO, COSTO_OPERACIONAL, GASTO_PERSONAL, GASTO_ADMIN, GASTO_FINANCIERO, GASTO_PERSONAL_PROPIETARIO, IMPUESTO, ACTIVO_ANTICIPO`.

**Sincronización** `sincronizarPucCodesAction` (`bancos/category-actions.ts:279-331`): reconcilia `transaction_categories.puc_code` contra códigos reales de `puc_accounts`; para códigos huérfanos prueba prefijos cada vez más cortos (10→4) y toma el match más específico. Existe un script Node espejo `scripts/sync-puc-codes.mjs` — **⚠ contiene la service_role key hardcodeada en texto plano** (ver §10).

---

## 3. Asignación de cuenta contable

Es una **mezcla**: sugerencia automática (3 pasos) con override manual del usuario para transacciones bancarias, y un **mapa hardcodeado aparte** para legalizaciones.

### 3.1 Transacciones bancarias — `sugerirCategoriaAction` (`bancos/category-actions.ts:108-161`)

Tres pasos ordenados:
1. **Reglas fijas** — `categorizarPorReglas` (`lib/transaction-categorizer.ts:28-62`): array `RULES` de `{keywords[], category}` que hace `normed.includes(k)`; devuelve un **nombre** de categoría, resuelto luego con `ilike('name', ruleName)`. Ejemplos: flypass/peaje→Peajes operación; 4x1000/gmf→GMF 4x1000; nomina/salario→Nómina conductores; acpm/combustible→Combustible tractomula; dataico→Software contable; anticipo tsg…→Anticipo de cliente.
2. **Catálogo de proveedores** — `buscarPorProveedor` (`lib/transaction-categorizer.ts:78-119`): matchea `supplier_catalog.keywords` contra la descripción; con `cuenta_puc` busca la categoría por `puc_code`.
3. **Patrones aprendidos** — `description_patterns` ordenados por `match_count` desc: primer `pattern` contenido en la descripción normalizada → su `category_id`.

**Asignación real** (manual/confirmación) en `bancos/[id]/client.tsx` con `CategorySelector`. Se persiste con `actualizarTransaccionAction` o `asignarCategoriaMasivaAction` (`bancos/transaccion/actions.ts`), que además **aprenden el patrón** (insert/incrementa `description_patterns`). Lote de recategorización de lo no clasificado: `recategorizarAction`. Migración texto→FK: `migrarCategoriasAction` (mapa `KEYWORD_TO_NAME`).

**PUC efectivo** al reportar — `pickPuc` (`reportes/page.tsx:180-185`):
```ts
function pickPuc(tx): string | null {
  const joined = tx.transaction_categories?.puc_code   // 1º: join category_id (AUTORITATIVO)
  if (joined) return joined
  const text = tx.category ?? null                     // 2º: texto legado, descartando 'SIN_CLASIFICAR'
  return text && text !== 'SIN_CLASIFICAR' ? text : null
}
```
Prioriza el join `category_id → transaction_categories.puc_code`; el campo texto `category` es respaldo. (Corrige ~151 registros con `category='SIN_CLASIFICAR'` pero `category_id` válido.)

### 3.2 Líneas de legalización — mapa hardcodeado

`legalization_expenses` **no usa `category_id`**; usa el texto `expense_type` + `EXP_TYPE_TO_PUC` (`reportes/EstadoResultadosClient.tsx:36-47`):
```
acpm_contado→61450510 · peajes→61450575 · cargue→61450530 · descargue→61450535
comision_empresa→61450525 · llantas→61450555 · engrase/cambio_aceite→61450545
lavada→61450550 · parqueos→61450560 · carrozada→61450570 · descarrozada→61450572
varada→61450565 · otros→61450585 · porcentaje→61001510
```
`expToPuc(t)`: si `expense_type` ya es numérico ≥7 dígitos (gasto dinámico que guardó el PUC), lo usa tal cual; si no, lo busca en el mapa; fallback `61450585`.

---

## 4. Cálculo del Estado de Resultados

Todo ocurre en el **server component** `reportes/page.tsx` (fetch + pre-proceso) y el **client component** `reportes/EstadoResultadosClient.tsx` (armado del árbol P&L y render). **No hay vista SQL ni RPC** — se calcula en JS a partir de 6 queries.

### 4.1 De qué tablas lee (año seleccionado, `issue_date`/`date`/`pass_date` entre `YYYY-01-01` y `YYYY-12-31`)
1. **`invoices`** (EMITIDA) → ingresos facturados.
2. **`bank_transactions`** (con join `transaction_categories(puc_code,name)`, `.limit(50000)`) → gastos/ingresos bancarios clasificados por PUC.
3. **`legalization_expenses`** (join `legalizations→trips→vehicles`) → costos operacionales por vehículo.
4. **`toll_transactions`** (`.limit(50000)`) → peajes Flypass, agrupados por placa.
5. **`clients`** + **`supplier_catalog`** → resolver el nombre del cliente de cada anticipo por NIT.

### 4.2 Estructura del P&L (una columna por mes seleccionado + TOTAL)
```
INGRESOS
  Ingresos Facturados (41450510)          ← invoices EMITIDA, agrupado por cliente
  Anticipos No Facturados (28050510)      ← bank INGRESO, agrupado por cliente
     – reversa "Aplicado a facturación"   ← negativo: MIN(facturado_mes, anticipo acumulado)
COSTOS OPERACIONALES
  Costos por Vehículo                     ← legalization_expenses vía EXP_TYPE_TO_PUC, por placa→PUC
  Peajes Flypass (61450575)               ← toll_transactions por placa
UTILIDAD BRUTA = Ingresos − Costos
GASTOS OPERACIONALES
  Costos de Personal (52xxx)              ← bank EGRESO ∈ PERSONAL_COST_CATS
  Gastos Generales (52xxx/51103010)       ← bank EGRESO ∈ GENERAL_COST_CATS
UTILIDAD OPERACIONAL
GASTOS FINANCIEROS (neto)                 ← FINANCIAL_EXP_CATS − FINANCIAL_INC_CATS (42100510)
IMPUESTOS (ICA/RST) (51150510)
UTILIDAD NETA
GASTOS PERSONALES (fuera del resultado)   ← PERSONAL_OWNER_CATS (52959xxx)
Transacciones sin clasificar              ← bank con category_id NULL (sección roja, no suma)
```

### 4.3 Qué excluye y por qué
- **Facturas anuladas**: `dian_status='ANULADA'` **O** `credit_note_id` **O** `credit_note_number` → no suman como ingreso (evita contar factura + su nota crédito).
- **Peajes en banco** (`PEAJE_PUC_EXCLUIDO='61450575'`): las tx bancarias con ese PUC se descartan en `extractBankTx` para no duplicar con `toll_transactions`.
- **Reversa de anticipos**: cuando a un cliente se le factura, el anticipo ya contado como ingreso se revierte (negativo) en el mes de la factura, con cascada mes a mes (`disponible += anticipos; revert = MIN(facturado, disponible)`). Match por NIT (tolerante al dígito de verificación) y, si el anticipo no trae NIT, por nombre normalizado (sin tildes, sin `S.A.S`/`LTDA`).
- **Sin clasificar**: `category_id IS NULL` → sección aparte, no entra a ninguna cuenta.

---

## 5. Arquitectura

- **Next.js App Router** (`16.2.7`, React `19.2.4`). Sin Pages Router, **0 API routes** (`route.ts`), **0 RPC** (`supabase.rpc`).
- **Lógica de negocio = Server Actions** (`'use server'`): 29 archivos (24 `actions.ts` + 5 `*-actions.ts`). Módulos en `src/app/(dashboard)/`: `bancos, cartera, clientes, conductores, documentos, facturas, impuesto, legalizaciones, nomina, prestaciones, prestamos, proveedores, reportes, vehiculos, viajes`.
- **Supabase**: un único cliente **service_role** de servidor (`src/lib/supabase.ts`), `auth.persistSession=false`, sin prefijo `NEXT_PUBLIC_`. **No hay cliente de navegador** y **no se usa `@supabase/ssr`** aunque está en `package.json`.
- **RLS**: deshabilitado explícitamente en las tablas creadas por la app (`disable row level security` + `grant all to service_role` en `cartera/actions.ts`, `nomina/social-security-actions.ts`). Con service_role, RLS se bypassa igual.
- **Auth**: app mono-usuario. `middleware.ts` exige cookie `tc_session`; `login/actions.ts` valida un **PIN hardcodeado `'1234'`** (existe `lib/pin.ts` que leería `APP_PIN`, pero el login no lo usa). Cookie = token base64 **sin firmar**, 12 h.

---

## 6. Migraciones

**No hay migraciones versionadas.** No existe `supabase/migrations/` ni **ningún archivo `.sql`** en el repo. Los cambios de esquema se aplican **a mano en el panel de Supabase**, documentados como **SQL suelto en comentarios** dentro de los actions:
- `facturas/actions.ts:4-9` — `alter table invoices add column ...` + índice único `invoice_number`; y `alter type public.invoice_type add value 'NOTA_CREDITO'`.
- `cartera/actions.ts:6-38` — `create table accounts_receivable_entries` y `client_payments` (+ `disable row level security`).
- `nomina/social-security-actions.ts:6-27` — `create table payroll_social_security`.
- `proveedores/actions.ts:6-7` — `ALTER TABLE supplier_catalog ADD COLUMN keywords / cuenta_puc`.

Varios actions muestran errores de runtime que instruyen al usuario a correr el SQL (p.ej. "Tabla no existe. Ejecuta el SQL…").

---

## 7. Fechas y zona horaria

- Columnas: fechas de negocio son **`date`** (`load_date`, `issue_date`, `date`, `due_date`, `paid_date`…); auditoría es **`timestamptz`** (`created_at`, `updated_at`, `closed_at`); **`pass_date`** (peajes) y `reception_date` son `timestamptz`. Postgres guarda `timestamptz` en **UTC**.
- **Display protegido**: `formatDate` (`lib/utils.ts:17`) usa `Intl.DateTimeFormat('es-CO', … timeZone:'UTC')` → muestra `date` sin corrimiento.
- **Colombia (DD/MM/YYYY)**: conversión centralizada en `dataico.ts` — `toDataicoDate` (ISO→DD/MM/YYYY) y `parseDateicoDate` (DD/MM/YYYY→ISO). El parser de manifiestos ancla a mediodía (`T12:00:00`) para evitar corrimiento.
- **⚠ Riesgo de corrimiento de día**: **no hay manejo explícito de `America/Bogota`/UTC-5** en ningún lado. Varios "hoy por defecto" usan `new Date().toISOString().slice(0,10)` (UTC): `viajes/nuevo-manifiesto/actions.ts:242,262,360`, `dataico.ts` (fallbacks e `issue_date` de nota crédito con `getFullYear/Month/Date` **locales** = TZ del servidor). En un servidor UTC (Vercel), entre 19:00–23:59 hora Colombia estos ruedan al día siguiente. ~92 usos de `new Date`/`toISOString` en 35 archivos.

---

## 8. Integraciones

### 8.1 Dataico (facturación electrónica DIAN)
- **`src/lib/dataico.ts`**, base `https://api.dataico.com/direct/dataico_api/v2`. Auth por headers `Auth-token` + `dataico_account_id`.
- **Env vars**: `DATAICO_AUTH_TOKEN`, `DATAICO_ACCOUNT_ID`, `DATAICO_ENV` (def `PRODUCCION`), `DATAICO_RESOLUTION_NUMBER`, `DATAICO_PREFIX`.
- **Funciones**: `getDataicoCustomers` (GET /customers), `getDataicoInvoice(number)` (GET /invoices?number=), `findNextFreeDataicoNumber` (sondea el primer consecutivo libre — se auto-repara si crean facturas a mano), `createDataicoCustomer` (POST /customers), `createDataicoInvoice` (POST /invoices), `createDataicoCreditNote` (POST /credit_notes). **No hay endpoint de listado fiable** (por eso el sondeo).
- **Flujo** (`viajes/[id]/actions.ts`): `generarFacturaAction` calcula consecutivo (max FEIT en `invoices` + `findNextFreeDataicoNumber`), asegura el cliente, aplica la regla de flete de legalización aprobada, crea la factura, guarda en `invoices` (uuid, pdf, xml, cufe) y pone el trip en `FACTURADO`. `crearNotaCreditoAction` resuelve el UUID interno y crea la NC.
- **⚠ Estado conocido (confirmado en código)**: la **creación de notas crédito por API no funciona por falta de numeración de NC en la cuenta Dataico**. `createDataicoCreditNote` está lleno de logs de diagnóstico (`CREDIT NOTE GET/PAYLOAD/RESPONSE`), infiere el número consultando `GET /credit_notes?number=NC3`, y hay una verificación **hardcodeada a `FEIT19`** puramente de diagnóstico. La vía real hoy es marcar la factura como **anulada manualmente** (`marcarFacturaAnuladaManualAction` → `dian_status='ANULADA'`, `credit_note_id='MANUAL'`), tras hacer la NC en la web de Dataico.

### 8.2 Flypass (peajes)
- **`facturas/peajes-actions.ts`** — `importarFlypassAction` lee el Excel con `XLSX`. Sin API. Mapea columnas del reporte de movimientos (Estado, Tipo, **Referencia 2** = clave de dedup, Placa, Peaje, Categoría, Fecha, **Valor con signo invertido**, CUFE, NIT). Filtra solo peajes (excluye recargas/parqueaderos). **Dedup por `document`** contra `toll_transactions`; inserta en batches. Guarda en `toll_transactions` — **no crea transacciones bancarias**.
- **Cruce**: no hay cruce peaje↔viaje. La conciliación de Flypass es **bancaria** (`bancos/conciliacion/actions.ts`): agrupa por día y empareja sumas con tolerancia ±100.

### 8.3 Ministerio de Transporte / manifiestos
- **No hay integración con RNDC/API.** Es **carga manual de PDF + parsing local** con `unpdf` (`extractText`) + regex (`viajes/nuevo-manifiesto/actions.ts`). Extrae `manifest_auth`, `manifest_number`, placa, conductor, ruta, fechas, mercancía, peso, flete, anticipo, cliente/NIT. Sube el PDF a Supabase Storage (bucket `documentos`, `manifiestos/…`), crea el `trip` (EN_CURSO) y una legalización en `BORRADOR`. Dedup por `manifest_auth`.

---

## 9. Volumen actual (conteo de filas)

| Tabla | Filas | | Tabla | Filas |
|---|---:|---|---|---:|
| toll_transactions | 1.383 | | supplier_catalog | 27 |
| legalization_expenses | 371 | | invoices | 25 |
| loan_installments | 313 | | suppliers | 18 |
| description_patterns | 103 | | accounts_receivable_entries | 17 |
| dian_invoices_import | 103 | | documents | 10 |
| bank_transactions | 860 | | loans | 6 |
| legalizations | 82 | | drivers | 4 |
| trips | 82 | | vehicles | 3 |
| puc_accounts | 85 | | payroll_social_security | 3 |
| transaction_categories | 70 | | bank_reconciliations | 2 |
| clients | 39 | | bank_accounts / payroll / social_benefits / tax_payments | 1 c/u |
| | | | accounts_receivable / client_payments / employees | 0 |

---

## 10. Lo que me preocupa (deuda técnica y riesgos)

**Seguridad**
1. **🔴 service_role key hardcodeada en el repo**: `scripts/sync-puc-codes.mjs:1-2` tiene la URL de Supabase + el JWT `service_role` en texto plano. Es acceso total a la base sin RLS. Rotar la key y sacarla del repo.
2. **🔴 PIN hardcodeado `'1234'`** en `login/actions.ts` y cookie de sesión **sin firmar** (base64). Cualquiera que conozca el formato puede fabricar la cookie. Existe `lib/pin.ts` con `APP_PIN` pero el login no lo usa.
3. **`SUPABASE_SERVICE_ROLE_KEY`** se usa para TODO (no hay separación de privilegios). Con RLS deshabilitado, no hay segunda línea de defensa.

**Consistencia esquema ↔ código**
4. **Doble representación de la cuenta** en `bank_transactions`: `category_id` (FK autoritativa) **vs** `category` (texto legado, a menudo `'SIN_CLASIFICAR'` o un PUC viejo). `pickPuc` ya prioriza el FK, pero la columna texto sigue viva y desincronizada (~151 registros con texto ≠ FK).
5. **`legalization_expenses` clasifica por texto** (`expense_type` + mapa hardcodeado `EXP_TYPE_TO_PUC`), mientras las tx bancarias usan `category_id`. Dos caminos distintos para el mismo fin (códigos `614505xx`); frágil si se agrega un tipo nuevo.
6. **Sets de PUC hardcodeados** en `reportes/page.tsx`: si contabilidad crea una cuenta nueva de gasto, no aparece en el P&L hasta que alguien la agregue al array correcto. No hay relación entre `puc_accounts.tipo` y esos sets.
7. **Numeración**: la constante `ANTICIPO_CATS` se declara pero se usa el literal `'28050510'`; pequeñas inconsistencias de este tipo.

**Integraciones a medio hacer**
8. **🟠 Notas crédito por API rotas**: bloqueadas por la numeración de NC no configurada en Dataico. El código quedó con **logs de diagnóstico y un `FEIT19` hardcodeado** (`dataico.ts`, `crearNotaCreditoAction`) que hay que limpiar. Hoy se resuelve marcando anulación manual.
9. **`accounts_receivable` (0 filas) vs `accounts_receivable_entries` (17)**: tabla legado abandonada conviviendo con la nueva. `client_payments` existe pero está vacía (feature de pago multi-factura poco/no usada).

**Operacional**
10. **Sin migraciones versionadas**: todo el esquema vive como SQL en comentarios, aplicado a mano. Reproducir la base en otro entorno (staging) es manual y propenso a divergir. No hay historial de cambios de esquema.
11. **Fechas en UTC sin fijar Colombia** (§7): riesgo real de corrimiento de un día en `load_date`/`issue_date`/fecha de NC cuando el server (Vercel = UTC) corre en la tarde-noche colombiana. Falta un helper `hoyColombia()` centralizado.
12. **`.limit(50000)`** en las queries del P&L: hoy alcanza (860 tx, 1.383 peajes) pero es un tope silencioso; a 1–2 años de operación habrá que paginar o mover el agregado a SQL/vista.
13. **AGENTS.md advierte** que este Next.js "no es el que conoces" y hay que leer `node_modules/next/dist/docs/` antes de escribir código — indica que hay convenciones propias de la versión 16 fáciles de romper.

---

*Generado por inspección de solo lectura del código y del esquema en producción vía PostgREST. No se modificó ningún archivo ni dato.*
