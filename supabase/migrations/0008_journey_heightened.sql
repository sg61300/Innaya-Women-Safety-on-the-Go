-- A2 review F1: persist heightened mode server-side.
-- The pure core `transition` escalates SCORE=1 → EMERGENCY and
-- GUARDIAN_SAYS_WRONG → EMERGENCY only when ctx.heightened is true (set on the
-- guardian-confirmed cancel edge → RESOLVED_MONITORING). Without a persisted
-- column the server rebuilt ctx with heightened=false and under-escalated after
-- a guardian-confirmed cancel. applyEvent now reads this column into ctx and
-- writes the post-transition value back with the other journey fields.
alter table journeys add column if not exists heightened boolean not null default false;
