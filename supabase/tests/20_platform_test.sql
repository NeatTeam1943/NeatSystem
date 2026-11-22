-- Platform tests: feature registry, permission registration, archive.
-- Runs after 10_core_test.sql on the same database.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

-- ---------- a fake feature with a good, a broken and a writing snapshot ----------
create schema if not exists demo;
create table if not exists demo.points (user_id uuid primary key, n int not null);
insert into demo.points values (t.id('lead'), 7) on conflict do nothing;
create or replace function demo.snapshot(p_user uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('points', coalesce((select n from demo.points where user_id = p_user), 0)) $$;
create or replace function demo.broken(p_user uuid) returns jsonb language sql stable as $$ select (1/0)::text::jsonb $$;

select hub.register_feature('demo', 'דמו', null, 'demo.snapshot(uuid)', 10);
select hub.register_feature('broken', 'שבור', null, 'demo.broken(uuid)', 20);
select t.eq(t.err($$select hub.register_feature('gone', 'נעלם', null, 'demo.nope(uuid)')$$), '42883', 'a hook must exist');

select hub.register_permissions('demo', '[{"key":"demo.manage","label":"ניהול דמו","sort":1,"roles":["mentor"]}]');
select t.eq((select count(*) from hub.role_permissions where perm = 'demo.manage'), 1::bigint, 'role default applied for a new key');
delete from hub.role_permissions where perm = 'demo.manage';
select hub.register_permissions('demo', '[{"key":"demo.manage","label":"ניהול הדמו","sort":1,"roles":["mentor"]}]');
select t.eq((select count(*) from hub.role_permissions where perm = 'demo.manage'), 0::bigint, 're-registering never undoes a matrix edit');
select t.eq((select label from hub.permissions where key = 'demo.manage'), 'ניהול הדמו', 'label updated on re-register');
select t.eq(t.err($$select hub.register_permissions('demo', '[{"key":"other.x","label":"x"}]')$$), 'P0001', 'module can only add its own keys');

set role authenticated;
select t.login(t.id('lead'));
select t.eq(t.err($$select hub.register_feature('x', 'x')$$), '42501', 'clients cannot register features');
select t.eq(t.err($$select hub.register_permissions('demo', '[]')$$), '42501', 'clients cannot register permissions');
select t.eq(t.err($$select * from hub.features$$), '42501', 'the registry is closed');

-- ---------- archive ----------
select t.eq(t.err($$select hub.archive_member(t.id('rookie'), 'x')$$), '42501', 'team lead cannot archive');
select t.login(t.id('admin'));
select t.eq(t.err($$select hub.archive_member(t.id('admin'), 'x')$$), '42501', 'nobody archives themselves');
select t.eq(t.err($$select hub.archive_member(t.id('mentor'), 'x')$$), '42501', 'admin cannot archive a mentor');
select hub.update_membership(t.id('lead'), p_subteams => array['media']);
select t.eq(hub.archive_member(t.id('lead'), 'סיים י״ב') > 0, true, 'archive returns the record id');

select t.eq((select status::text || '|' || archive_reason from hub.people where id = t.id('lead')), 'archived|סיים י״ב', 'archived with reason');
select t.eq((select systems -> 'demo' ->> 'points' from hub.archives where user_id = t.id('lead')), '7', 'the archive kept the feature''s snapshot');
select t.eq((select systems -> 'broken' ->> 'error' from hub.archives where user_id = t.id('lead')), '22012', 'a broken snapshot is recorded, not fatal');
select t.eq((select profile ->> 'phone' from hub.archives where user_id = t.id('lead')), '050-2222222', 'snapshot keeps the full profile row');
select t.eq((select jsonb_array_length(audit) > 0 from hub.archives where user_id = t.id('lead')), true, 'snapshot keeps the audit trail');
reset role;
select t.eq((select count(*) from demo.points where user_id = t.id('lead') and n = 7), 1::bigint, 'archiving changed nothing in the feature');
set role authenticated;

select t.login(t.id('lead'));
select t.eq(hub.is_active(), false, 'archived person is locked out of every system');
select t.eq((select count(*) from hub.archives), 0::bigint, 'archived person cannot read archives');
select t.login(t.id('rookie'));
select t.eq((select count(*) from hub.archives), 0::bigint, 'members cannot read archives');
select t.eq(t.err($$select * from hub.member_archives$$), '42501', 'archive table is closed');

select t.login(t.id('admin'));
select t.eq(t.err($$select hub.archive_member(t.id('lead'), 'again')$$), 'P0002', 'cannot archive twice');
select hub.restore_member(t.id('lead'));
select t.eq((select status::text from hub.people where id = t.id('lead')), 'active', 'restored');
select t.eq((select restored_at is not null from hub.archives where user_id = t.id('lead')), true, 'archive record marks the restore and stays');
select t.eq((select count(*) from hub.audit where action in ('user.archived', 'user.restored') and target_id = t.id('lead')::text), 2::bigint, 'archive + restore audited');

reset role;
delete from hub.features where id in ('demo', 'broken');
drop schema demo cascade;
delete from hub.permissions where module = 'demo';
\echo PLATFORM TESTS PASSED
