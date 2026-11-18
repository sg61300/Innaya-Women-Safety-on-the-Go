-- Task 22 / Task 31: nearest-regions RPC used by the dashboard region count and
-- the unsafe-regions map. The brief text names 0003_extras.sql, which does not
-- exist in this repo (regions live in 0001_init.sql); per the W3 controller
-- ruling "next migration number is 0012", the function ships as a new file.
-- File only — never applied to the hosted project by a lane (R16).
create or replace function regions_near(lat float8, lng float8, radius_m int)
  returns setof unsafe_regions language sql stable security definer set search_path = public, extensions as $$
  select * from unsafe_regions
  where st_dwithin(centroid, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m)
$$;
