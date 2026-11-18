-- Regression for 0018: regions_near must filter by distance even though
-- unsafe_regions has generated columns named lat / lng (0014).
begin;
select plan(3);

select is(
  (select count(*) from regions_near(0, 0, 5000)),
  0::bigint,
  'regions_near at lat 0 / lng 0 returns nothing'
);

select ok(
  (select count(*) from regions_near(12.9716, 77.5946, 5000))
    < (select count(*) from unsafe_regions),
  'regions_near 5 km around Bengaluru returns fewer than all rows'
);

select ok(
  (select count(*) from regions_near(28.6139, 77.2090, 5000))
    <= (select count(*) from unsafe_regions where city = 'Delhi'),
  'regions_near 5 km around Delhi returns at most the Delhi rows'
);

select * from finish();
rollback;
