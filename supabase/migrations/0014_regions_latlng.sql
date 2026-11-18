-- Task 31 review round (F2/F3): expose the region centroid as plain lat/lng.
-- The centroid is a PostGIS geography, so neither regions_near (returns setof
-- unsafe_regions) nor a plain PostgREST select('*') hands the client a usable
-- coordinate. Two stored generated columns fix both call paths at once with no
-- function-signature change: the map places each region circle at its true
-- centre (not stacked on the user), and the detail-screen "navigate around"
-- deep-link can target daddr=<lat>,<lng> instead of an unresolvable placeholder
-- name. st_x/st_y over the geography::geometry cast are IMMUTABLE, so they are
-- legal in a generated expression. File only — never applied to the hosted
-- project by a lane (R16).
alter table unsafe_regions
  add column if not exists lat double precision generated always as (st_y(centroid::geometry)) stored,
  add column if not exists lng double precision generated always as (st_x(centroid::geometry)) stored;
