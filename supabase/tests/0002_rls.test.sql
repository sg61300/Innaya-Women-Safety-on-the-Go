begin;
set local role postgres;
select plan(2);

-- next_event_seq starts at 1 for a journey with no events
select is(
  next_event_seq('00000000-0000-0000-0000-0000000000aa'),
  1::bigint,
  'next_event_seq returns 1 for a fresh journey uuid');

-- nearby_responders returns no rows for a journey with no locations
select is(
  (select count(*) from nearby_responders('00000000-0000-0000-0000-0000000000bb', 100)),
  0::bigint,
  'nearby_responders returns 0 rows when the journey has no locations');

select * from finish();
rollback;
