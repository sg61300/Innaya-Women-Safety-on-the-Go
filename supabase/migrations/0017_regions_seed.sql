-- W3-D review (D3): server-side seed of the 45 placeholder unsafe regions.
-- Replaces the deleted client-side seedOnce(), which inserted into this shared
-- table behind a per-device flag so every install duplicated the rows. Idempotent
-- via a name guard so re-running never duplicates. FILE ONLY (R16): no lane ever
-- runs this against the hosted project; the founder applies it and replaces the
-- placeholder rows before the pilot (Task 35 QA fails on any founder_filled=false).
-- Kept in sync with apps/mobile/src/data/regions.seed.json (regions.test.ts guards
-- the 45-row count so JSON and SQL cannot drift).

insert into unsafe_regions (name, city, centroid, radius_m, status, report_count, founder_filled)
select v.name, v.city, v.centroid, v.radius_m, v.status::region_status, v.report_count, v.founder_filled
from (values
  ('Delhi placeholder 01', 'Delhi', st_setsrid(st_makepoint(77.211913, 28.619645), 4326)::geography, 200, 'amber', 1, false),
  ('Delhi placeholder 02', 'Delhi', st_setsrid(st_makepoint(77.216605, 28.619911), 4326)::geography, 250, 'amber', 1, false),
  ('Delhi placeholder 03', 'Delhi', st_setsrid(st_makepoint(77.221652, 28.617509), 4326)::geography, 300, 'amber', 1, false),
  ('Delhi placeholder 04', 'Delhi', st_setsrid(st_makepoint(77.225283, 28.612398), 4326)::geography, 150, 'amber', 1, false),
  ('Delhi placeholder 05', 'Delhi', st_setsrid(st_makepoint(77.212545, 28.612103), 4326)::geography, 200, 'amber', 1, false),
  ('Delhi placeholder 06', 'Delhi', st_setsrid(st_makepoint(77.21321, 28.608813), 4326)::geography, 250, 'amber', 1, false),
  ('Delhi placeholder 07', 'Delhi', st_setsrid(st_makepoint(77.211128, 28.605113), 4326)::geography, 300, 'amber', 1, false),
  ('Delhi placeholder 08', 'Delhi', st_setsrid(st_makepoint(77.206234, 28.602477), 4326)::geography, 150, 'amber', 1, false),
  ('Delhi placeholder 09', 'Delhi', st_setsrid(st_makepoint(77.199376, 28.602272), 4326)::geography, 200, 'amber', 1, false),
  ('Delhi placeholder 10', 'Delhi', st_setsrid(st_makepoint(77.205455, 28.612103), 4326)::geography, 250, 'amber', 1, false),
  ('Delhi placeholder 11', 'Delhi', st_setsrid(st_makepoint(77.201876, 28.613243), 4326)::geography, 300, 'amber', 1, false),
  ('Delhi placeholder 12', 'Delhi', st_setsrid(st_makepoint(77.199268, 28.616676), 4326)::geography, 150, 'amber', 1, false),
  ('Delhi placeholder 13', 'Delhi', st_setsrid(st_makepoint(77.199114, 28.621714), 4326)::geography, 200, 'amber', 1, false),
  ('Delhi placeholder 14', 'Delhi', st_setsrid(st_makepoint(77.202341, 28.62703), 4326)::geography, 250, 'amber', 1, false),
  ('Delhi placeholder 15', 'Delhi', st_setsrid(st_makepoint(77.209, 28.617493), 4326)::geography, 300, 'amber', 1, false),
  ('Ghaziabad placeholder 01', 'Ghaziabad', st_setsrid(st_makepoint(77.456715, 28.674945), 4326)::geography, 200, 'amber', 1, false),
  ('Ghaziabad placeholder 02', 'Ghaziabad', st_setsrid(st_makepoint(77.461409, 28.675211), 4326)::geography, 250, 'amber', 1, false),
  ('Ghaziabad placeholder 03', 'Ghaziabad', st_setsrid(st_makepoint(77.466458, 28.672809), 4326)::geography, 300, 'amber', 1, false),
  ('Ghaziabad placeholder 04', 'Ghaziabad', st_setsrid(st_makepoint(77.470092, 28.667698), 4326)::geography, 150, 'amber', 1, false),
  ('Ghaziabad placeholder 05', 'Ghaziabad', st_setsrid(st_makepoint(77.457347, 28.667403), 4326)::geography, 200, 'amber', 1, false),
  ('Ghaziabad placeholder 06', 'Ghaziabad', st_setsrid(st_makepoint(77.458013, 28.664113), 4326)::geography, 250, 'amber', 1, false),
  ('Ghaziabad placeholder 07', 'Ghaziabad', st_setsrid(st_makepoint(77.455929, 28.660413), 4326)::geography, 300, 'amber', 1, false),
  ('Ghaziabad placeholder 08', 'Ghaziabad', st_setsrid(st_makepoint(77.451033, 28.657777), 4326)::geography, 150, 'amber', 1, false),
  ('Ghaziabad placeholder 09', 'Ghaziabad', st_setsrid(st_makepoint(77.444171, 28.657572), 4326)::geography, 200, 'amber', 1, false),
  ('Ghaziabad placeholder 10', 'Ghaziabad', st_setsrid(st_makepoint(77.450253, 28.667403), 4326)::geography, 250, 'amber', 1, false),
  ('Ghaziabad placeholder 11', 'Ghaziabad', st_setsrid(st_makepoint(77.446672, 28.668543), 4326)::geography, 300, 'amber', 1, false),
  ('Ghaziabad placeholder 12', 'Ghaziabad', st_setsrid(st_makepoint(77.444063, 28.671976), 4326)::geography, 150, 'amber', 1, false),
  ('Ghaziabad placeholder 13', 'Ghaziabad', st_setsrid(st_makepoint(77.443909, 28.677014), 4326)::geography, 200, 'amber', 1, false),
  ('Ghaziabad placeholder 14', 'Ghaziabad', st_setsrid(st_makepoint(77.447137, 28.68233), 4326)::geography, 250, 'amber', 1, false),
  ('Ghaziabad placeholder 15', 'Ghaziabad', st_setsrid(st_makepoint(77.4538, 28.672793), 4326)::geography, 300, 'amber', 1, false),
  ('Bengaluru placeholder 01', 'Bengaluru', st_setsrid(st_makepoint(77.597225, 12.977345), 4326)::geography, 200, 'amber', 1, false),
  ('Bengaluru placeholder 02', 'Bengaluru', st_setsrid(st_makepoint(77.601451, 12.977611), 4326)::geography, 250, 'amber', 1, false),
  ('Bengaluru placeholder 03', 'Bengaluru', st_setsrid(st_makepoint(77.605997, 12.975209), 4326)::geography, 300, 'amber', 1, false),
  ('Bengaluru placeholder 04', 'Bengaluru', st_setsrid(st_makepoint(77.609269, 12.970098), 4326)::geography, 150, 'amber', 1, false),
  ('Bengaluru placeholder 05', 'Bengaluru', st_setsrid(st_makepoint(77.597793, 12.969803), 4326)::geography, 200, 'amber', 1, false),
  ('Bengaluru placeholder 06', 'Bengaluru', st_setsrid(st_makepoint(77.598393, 12.966513), 4326)::geography, 250, 'amber', 1, false),
  ('Bengaluru placeholder 07', 'Bengaluru', st_setsrid(st_makepoint(77.596517, 12.962813), 4326)::geography, 300, 'amber', 1, false),
  ('Bengaluru placeholder 08', 'Bengaluru', st_setsrid(st_makepoint(77.592108, 12.960177), 4326)::geography, 150, 'amber', 1, false),
  ('Bengaluru placeholder 09', 'Bengaluru', st_setsrid(st_makepoint(77.585931, 12.959972), 4326)::geography, 200, 'amber', 1, false),
  ('Bengaluru placeholder 10', 'Bengaluru', st_setsrid(st_makepoint(77.591407, 12.969803), 4326)::geography, 250, 'amber', 1, false),
  ('Bengaluru placeholder 11', 'Bengaluru', st_setsrid(st_makepoint(77.588183, 12.970943), 4326)::geography, 300, 'amber', 1, false),
  ('Bengaluru placeholder 12', 'Bengaluru', st_setsrid(st_makepoint(77.585833, 12.974376), 4326)::geography, 150, 'amber', 1, false),
  ('Bengaluru placeholder 13', 'Bengaluru', st_setsrid(st_makepoint(77.585694, 12.979414), 4326)::geography, 200, 'amber', 1, false),
  ('Bengaluru placeholder 14', 'Bengaluru', st_setsrid(st_makepoint(77.588601, 12.98473), 4326)::geography, 250, 'amber', 1, false),
  ('Bengaluru placeholder 15', 'Bengaluru', st_setsrid(st_makepoint(77.5946, 12.975193), 4326)::geography, 300, 'amber', 1, false)
) as v(name, city, centroid, radius_m, status, report_count, founder_filled)
where not exists (select 1 from unsafe_regions r where r.name = v.name);
