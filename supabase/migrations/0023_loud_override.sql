-- R43 loud-override channel: persist a guardian's "always alert me loudly"
-- preference server-side so the api can route EMERGENCY/CRITICAL pushes for
-- these guardians to the high-priority vaira-alarm channel.
-- File only for Pre-35; NOT applied to the hosted project.
alter table profiles add column if not exists loud_override boolean not null default false;
