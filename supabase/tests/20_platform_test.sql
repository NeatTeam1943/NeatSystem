-- Platform tests: sub-system registry, permission registration, archive.
-- Runs after 10_core_test.sql on the same database.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

-- ---------- a fake sub-system with a good, a broken and a writing profile fn ----------
create schema if not exists demo;
create schema if not exists demo_api;
create table if not exists demo.points (user_id uuid primary key, n int not null);
insert into demo.points values (t.id('lead'), 7) on conflict do nothing;
create or replace function demo_api.profile_v1(p_user uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('contract', 1, 'blocks', jsonb_build_array(
    jsonb_build_object('kind', 'stats', 'items', jsonb_build_array(jsonb_build_object('label', 'נקודות', 'value', coalesce((select n from demo.points where user_id = p_user), 0))))));
$$;
create or replace function demo_api.broken_v1(p_user uuid) returns jsonb language sql stable as $$ select (1/0)::text::jsonb $$;
create or replace function demo_api.writer_v1(p_user uuid) returns jsonb language plpgsql volatile as $$
begin insert into demo.points values (p_user, 1) on conflict (user_id) do update set n = demo.points.n + 1; return '{}'::jsonb; end $$;

select hub.register_subsystem('demo', 'דמו', 'demo_api', 'profile_v1', 10);
select hub.register_subsystem('broken', 'שבור', 'demo_api', 'broken_v1', 20);
select hub.register_subsystem('writer', 'כותב', 'demo_api', 'writer_v1', 30);
select hub.register_subsystem('gone', 'נעלם', 'nope_api', 'profile_v1', 40);

select hub.register_permissions('demo', '[{"key":"demo.manage","label":"ניהול דמו","sort":1,"roles":["mentor"]}]');
select t.eq((select count(*) from hub.role_permissions where perm = 'demo.manage'), 1::bigint, 'role default applied for a new key');
delete from hub.role_permissions where perm = 'demo.manage';
select hub.register_permissions('demo', '[{"key":"demo.manage","label":"ניהול הדמו","sort":1,"roles":["mentor"]}]');
select t.eq((select count(*) from hub.role_permissions where perm = 'demo.manage'), 0::bigint, 're-registering never undoes a matrix edit');
select t.eq((select label from hub.permissions where key = 'demo.manage'), 'ניהול הדמו', 'label updated on re-register');
select t.eq(t.err($$select hub.register_permissions('demo', '[{"key":"other.x","label":"x"}]')$$), 'P0001', 'module can only add its own keys');

set role authenticated;
select t.login(t.id('lead'));
select t.eq(t.err($$select hub.register_subsystem('x', 'x', 'x_api')$$), '42501', 'clients cannot register sub-systems');
select t.eq(t.err($$select hub.register_permissions('demo', '[]')$$), '42501', 'clients cannot register permissions');
select t.eq((select count(*) from hub.subsystems where id in ('demo', 'broken', 'writer', 'gone')), 4::bigint, 'active members see the registry');

-- ---------- archive ----------
select t.eq(t.err($$select hub.archive_member(t.id('rookie'), 'x')$$), '42501', 'team lead cannot archive');
select t.login(t.id('admin'));
select t.eq(t.err($$select hub.archive_member(t.id('admin'), 'x')$$), '42501', 'nobody archives themselves');
select t.eq(t.err($$select hub.archive_member(t.id('mentor'), 'x')$$), '42501', 'admin cannot archive a mentor');
select hub.update_membership(t.id('lead'), p_subteams => array['media']);
select t.eq(hub.archive_member(t.id('lead'), 'סיים י״ב') > 0, true, 'archive returns the record id');

select t.eq((select status::text || '|' || archive_reason from hub.people where id = t.id('lead')), 'archived|סיים י״ב', 'archived with reason');
select t.eq((select (systems -> 'demo' -> 'blocks' -> 0 -> 'items' -> 0 ->> 'value') from hub.archives where user_id = t.id('lead')), '7', 'snapshot kept the sub-system profile');
select t.eq((select systems -> 'broken' ->> 'error' from hub.archives where user_id = t.id('lead')), '22012', 'a broken sub-system is recorded, not fatal');
select t.eq((select systems -> 'writer' ->> 'error' from hub.archives where user_id = t.id('lead')), 'not_stable', 'a writing function is never called');
select t.eq((select systems -> 'gone' ->> 'error' from hub.archives where user_id = t.id('lead')), 'missing', 'a missing function is recorded');
select t.eq((select profile ->> 'phone' from hub.archives where user_id = t.id('lead')), '050-2222222', 'snapshot keeps the full profile row');
select t.eq((select jsonb_array_length(audit) > 0 from hub.archives where user_id = t.id('lead')), true, 'snapshot keeps the audit trail');
reset role;
select t.eq((select count(*) from demo.points where user_id = t.id('lead') and n = 7), 1::bigint, 'archiving changed nothing in the sub-system');
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
drop schema demo cascade;
drop schema demo_api cascade;
delete from hub.subsystems where id in ('demo', 'broken', 'writer', 'gone');
delete from hub.permissions where module = 'demo';
\echo PLATFORM TESTS PASSED
