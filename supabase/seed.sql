-- Pilot cities Delhi, Ghaziabad, Bengaluru (Q8). Two placeholder rows per city here for SQL tests only;
-- the 45 founder-entered regions load from apps/mobile/src/data/regions.seed.json (Task 31). No real-world claims.
insert into blacklisted_vehicles (plate_norm, source, reason) values
('MH01AB1234','seed','mock: repeated complaints'), ('KA05CD5678','seed','mock: route deviation reports'),
('DL3CAE9012','seed','mock'), ('TN09EF3456','seed','mock'), ('MH12GH7890','seed','mock');
insert into unsafe_regions (name, city, centroid, radius_m, status, report_count) values
('Delhi placeholder 01',     'Delhi',     st_setsrid(st_makepoint(77.2090, 28.6139),4326)::geography, 300, 'amber', 1),
('Delhi placeholder 02',     'Delhi',     st_setsrid(st_makepoint(77.2300, 28.6300),4326)::geography, 200, 'amber', 1),
('Ghaziabad placeholder 01', 'Ghaziabad', st_setsrid(st_makepoint(77.4538, 28.6692),4326)::geography, 300, 'amber', 1),
('Ghaziabad placeholder 02', 'Ghaziabad', st_setsrid(st_makepoint(77.4700, 28.6800),4326)::geography, 200, 'amber', 1),
('Bengaluru placeholder 01', 'Bengaluru', st_setsrid(st_makepoint(77.5946, 12.9716),4326)::geography, 300, 'amber', 1),
('Bengaluru placeholder 02', 'Bengaluru', st_setsrid(st_makepoint(77.6100, 12.9800),4326)::geography, 200, 'amber', 1);
-- (add `city text not null default 'Delhi'` to unsafe_regions in 0001_init.sql; placeholders stay amber, never red)
