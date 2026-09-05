-- ════════════════════════════════════════════════════════════════════════════
-- Catálogo municipios_dane: siembra los 4 municipios de creación reciente que el CSV
-- fuente omitía (Guachené 2006, Norosí 2011, San José de Uré 2007, Tuchín 2008).
-- Idempotente (where not exists). Ninguno es ruta actual de ISADAN, pero deja el
-- catálogo DANE-completo. (El fix real del bug de Buenaventura fue el fetchAll en
-- terceros/page.tsx — la tabla ya tenía Buenaventura, el select('*') la truncaba.)
-- ════════════════════════════════════════════════════════════════════════════
insert into municipios_dane (codigo_completo, codigo_departamento, codigo_municipio, nombre_departamento, nombre_municipio)
select v.* from (values
  ('19300','19','300','Cauca','Guachené'),
  ('13491','13','491','Bolívar','Norosí'),
  ('23682','23','682','Córdoba','San José de Uré'),
  ('23815','23','815','Córdoba','Tuchín')
) as v(codigo_completo, codigo_departamento, codigo_municipio, nombre_departamento, nombre_municipio)
where not exists (select 1 from municipios_dane m where m.codigo_completo = v.codigo_completo);
