-- Campo de notas libre en terceros — para matices de clasificación que no encajan en
-- "siempre la misma cuenta" (ej. "a veces combustible, a veces repuestos según el ticket").
-- Opcional. Aplicar en SQL Editor.
alter table terceros add column if not exists notas text;
