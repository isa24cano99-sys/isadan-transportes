-- ════════════════════════════════════════════════════════════════════════════
-- Auxilio de transporte por conductor (para el auto-cálculo de nómina).
-- Vive en drivers (pantalla Conductores), junto al salario — mismo lugar donde se
-- actualizan los valores legales anuales, sin tabla nueva de parámetros. Es un valor
-- pleno (mes completo); la pantalla de nómina lo prorratea por días trabajados.
-- Solo aplica a quienes ganan <= 2 SMMLV (por eso un conductor > 2 SMMLV puede quedar en 0).
-- Aplicar en SQL Editor ANTES de desplegar el código que lo lee.
-- ════════════════════════════════════════════════════════════════════════════
alter table drivers add column if not exists auxilio_transporte numeric(14,2) not null default 0;
comment on column drivers.auxilio_transporte is
  'Auxilio de transporte mensual vigente (valor pleno, mes completo). Se ajusta por decreto anual en la pantalla Conductores; la nómina lo prorratea por días. Solo <= 2 SMMLV.';

-- Seed 2026 = $249.095 para los conductores actuales (todos ganan 1 SMMLV = 1.750.905 <= 2 SMMLV).
update drivers
   set auxilio_transporte = 249095
 where coalesce(auxilio_transporte, 0) = 0
   and salary <= 3501810;   -- 2 × SMMLV 2026 (1.750.905)
