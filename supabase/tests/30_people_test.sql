-- Profiles made ahead of time (0003_people.sql). Runs after 10/20 (reuses their people).
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

-- a sub-system that keeps per-person rows, with its claim hook (and one whose hook breaks)
create schema if not exists demo2;
create table demo2.notes (user_id uuid, txt text);
create or replace function demo2.on_profile_claimed(p_old uuid, p_new uuid) returns void language sql security definer as $$
  update demo2.notes set user_id = p_new where user_id = p_old $$;
create schema if not exists demo3;
create or replace function demo3.on_profile_claimed(p_old uuid, p_new uuid) returns void language sql as $$ select 1 / 0 $$;

set role authenticated;
select t.login(t.id('member'));
select t.eq(t.err($$select hub.invite_member('a@b.co', 'מישהו')$$), '42501', 'members cannot add people');

select t.login(t.id('mentor'));
select t.eq(t.err($$select hub.invite_member('not an email', 'מישהו')$$), '22023', 'email is checked');
select t.eq(t.err($$select hub.invite_member('LEAD@x.com', 'כפול')$$), '23505', 'an email that already has a profile');
create temp table inv as select hub.invite_member(' Future.Kid@Gmail.com ', 'ילד עתידי', 'build', 'member', 2030, '050-5555555', array['media']) as id;
select t.eq((select status::text || '/' || invited || '/' || team || '/' || email from hub.people where id = (select id from inv)), 'active/true/build/future.kid@gmail.com', 'added ahead of time as an active member');
select hub.update_membership((select id from inv), p_team => 'cad', p_grad_year => 2029);
select hub.update_invite((select id from inv), 'future.kid@gmail.com', '050-6666666', '2011-05-05');
select t.eq((select team || '/' || grad_year || '/' || phone from hub.people where id = (select id from inv)), 'cad/2029/050-6666666', 'profile edited before they sign in');
select t.eq(t.err($$select hub.update_invite(t.id('lead'), 'x@y.co', null, null)$$), 'P0002', 'update_invite only for people who did not sign in');
select hub.set_user_permission((select id from inv), 'audit.view', true);

select t.login(t.id('member'));
select t.eq((select email from hub.people where id = (select id from inv)), null, 'members do not see their email');
select t.login(t.id('admin'));
select t.eq(t.err($$select hub.invite_member('m@x.co', 'מנטור', null, 'mentor')$$), '42501', 'only who grants permissions adds a mentor');

-- records in sub-systems made before they signed in
reset role;
insert into demo2.notes values ((select id from inv), 'נרשם לפני');
set role authenticated;
select t.eq(t.err($$select hub.claim_profile(gen_random_uuid(), gen_random_uuid())$$), '42501', 'claiming is internal');
reset role;

-- they sign in with Google for the first time (Supabase inserts the login)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000001aa', 'future.kid@gmail.com');
select t.eq((select count(*) from hub.profiles where id = (select id from inv)), 0::bigint, 'the old id is gone');
select t.eq((select status::text || '/' || invited || '/' || team from hub.profiles where id = '00000000-0000-0000-0000-0000000001aa'), 'active/false/cad', 'the profile is theirs');
select t.eq((select count(*) from hub.user_permissions where user_id = '00000000-0000-0000-0000-0000000001aa'), 1::bigint, 'their permissions followed');
select t.eq((select user_id from demo2.notes), '00000000-0000-0000-0000-0000000001aa'::uuid, 'a sub-system moved its rows');
select t.eq((select count(*) from hub.audit_log where action = 'user.claim_failed' and details ->> 'system' = 'demo3'), 1::bigint, 'a broken hook is logged, not fatal');
select t.eq((select count(*) from hub.audit_log where target_id = (select id from inv)::text), 0::bigint, 'history moved to the new id');

-- someone who had a login before the profile was made: it is theirs right away
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000001bb', 'had.login@x.com');
set role authenticated;
select t.login(t.id('mentor'));
select t.eq(hub.invite_member('had.login@x.com', 'עם חשבון'), '00000000-0000-0000-0000-0000000001bb'::uuid, 'existing login gets the profile directly');
select t.eq((select invited from hub.people where id = '00000000-0000-0000-0000-0000000001bb'), false, 'not waiting for a sign-in');

-- a login that sent a join request, and a mentor added the same email meanwhile → asking again just claims
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000001cc', 'asked@x.com');
set role authenticated;
select t.login('00000000-0000-0000-0000-0000000001cc');
select hub.request_join('ביקש לבד', null, null, null, 'build');
select t.login(t.id('mentor'));
select t.eq(t.err($$select hub.invite_member('asked@x.com', 'נוסף')$$), '23505', 'a pending request is approved, not duplicated');
-- the sign-in trigger missed it (e.g. it was off): the app's claim_my_profile() picks it up
select hub.invite_member('later@x.com', 'נוסף מראש', 'software');
reset role;
alter table auth.users disable trigger hub_claim_profile;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000001dd', 'later@x.com');
alter table auth.users enable trigger hub_claim_profile;
set role authenticated;
select t.login('00000000-0000-0000-0000-0000000001dd');
select t.eq(hub.claim_my_profile(), true, 'claimed on their next visit');
select t.eq((select full_name || '/' || status::text || '/' || team from hub.people where id = '00000000-0000-0000-0000-0000000001dd'), 'נוסף מראש/active/software', 'and it is the mentor''s profile');
select t.eq(hub.claim_my_profile(), false, 'only once');

reset role;
drop schema demo2 cascade;
drop schema demo3 cascade;
\echo PEOPLE TESTS PASSED
