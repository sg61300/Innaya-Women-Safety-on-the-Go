begin;
select plan(3);

insert into unsafe_regions (id, centroid, radius_m, status)
values ('00000000-0000-0000-0000-000000000001', st_setsrid(st_makepoint(72.87, 19.07), 4326)::geography, 200, 'amber');

-- 5 distinct reporters keeps amber
insert into unsafe_reports (region_id, reporter_id, reason)
select '00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'harassment' from generate_series(1,5);
select is((select status from unsafe_regions where id='00000000-0000-0000-0000-000000000001'), 'amber', 'stays amber at 5 reports');
select is((select report_count from unsafe_regions where id='00000000-0000-0000-0000-000000000001'), 5, 'report_count = 5');

-- 6th distinct reporter flips to red
insert into unsafe_reports (region_id, reporter_id, reason) values ('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'stalking');
select is((select status from unsafe_regions where id='00000000-0000-0000-0000-000000000001'), 'red', 'red at >5 reports');

select * from finish();
rollback;
