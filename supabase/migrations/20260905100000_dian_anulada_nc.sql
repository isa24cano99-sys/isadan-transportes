-- ════════════════════════════════════════════════════════════════════════════
-- Tag "Factura anulada por NC recibida": marca en dian_invoices_import las facturas
-- de proveedor que el propio proveedor anuló y re-emitió (patrón factura errónea →
-- NC → re-emitida, ej. Distracom 475351→475352). Es PURO estado, sin efecto contable:
-- la factura marcada sale de las candidatas de conciliación; la re-emitida sigue normal.
-- Aditivo e idempotente. Aplicar en SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
alter table dian_invoices_import add column if not exists anulada_nc boolean not null default false;
