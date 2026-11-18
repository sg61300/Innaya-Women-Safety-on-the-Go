-- run with psql against a dev project after applying 0021; expects three NOTICE lines "ok".
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aa01', 'quota@test.local') on conflict do nothing;
insert into profiles (id) values ('00000000-0000-0000-0000-00000000aa01') on conflict do nothing;
-- 6 finished 30-min journeys in the last 24 h → soft only
insert into journeys (owner_id, from_label, to_label, from_geo, to_geo, start_at, eta_seconds, mode, are_you_safe_word_hash, selfie_url, status, consent_version)
select '00000000-0000-0000-0000-00000000aa01', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now() - (g || ' hours')::interval, 1800, 'cab', 'h', 'u', 'done', 'v1' from generate_series(2, 7) g;
do $$ declare q record; begin select * into q from journey_quota_check('00000000-0000-0000-0000-00000000aa01'); if q.journeys_24h = 6 and not q.soft and not q.hard then raise notice 'ok: 6 journeys, no flag'; else raise exception 'bad %', q; end if; end $$;
-- 7th journey → soft flag set, insert allowed
insert into journeys (owner_id, from_label, to_label, from_geo, to_geo, start_at, eta_seconds, mode, are_you_safe_word_hash, selfie_url, status, consent_version)
values ('00000000-0000-0000-0000-00000000aa01', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now(), 1800, 'cab', 'h', 'u', 'planned', 'v1');
do $$ begin if (select anomaly_flag from profiles where id = '00000000-0000-0000-0000-00000000aa01') then raise notice 'ok: soft flag'; else raise exception 'soft flag missing'; end if; end $$;
-- a 17-hour monitoring journey → hard stop on the next insert
update journeys set status = 'monitoring', start_at = now() - interval '17 hours' where owner_id = '00000000-0000-0000-0000-00000000aa01' and status = 'planned';
do $$ begin
  begin
    insert into journeys (owner_id, from_label, to_label, from_geo, to_geo, start_at, eta_seconds, mode, are_you_safe_word_hash, selfie_url, status, consent_version)
    values ('00000000-0000-0000-0000-00000000aa01', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now(), 1800, 'cab', 'h', 'u', 'planned', 'v1');
    raise exception 'hard stop did not fire';
  exception when others then
    if sqlerrm like 'VAIRA_QUOTA_HARD%' then raise notice 'ok: hard stop'; else raise; end if;
  end;
end $$;
rollback;
