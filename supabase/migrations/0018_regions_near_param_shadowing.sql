-- Session 12 (2026-09-05): regions_near returned ALL rows for ANY point
-- (verified on hosted: 45 rows for Delhi, for a 500 m Bengaluru radius, and for
-- lat 0 / lng 0). Root cause: 0014 added generated columns unsafe_regions.lat /
-- .lng, and in a SQL-language function a column name takes precedence over a
-- same-named parameter, so st_makepoint(lng, lat) used each row's own centroid
-- and every distance was 0. Parameter names stay (clients call rpc with
-- { lat, lng, radius_m }); references are qualified with the function name.
create or replace function regions_near(lat float8, lng float8, radius_m int)
  returns setof unsafe_regions language sql stable security definer set search_path = public, extensions as $$
  select r.* from unsafe_regions r
  where st_dwithin(
    r.centroid,
    st_setsrid(st_makepoint(regions_near.lng, regions_near.lat), 4326)::geography,
    regions_near.radius_m
  )
$$;
