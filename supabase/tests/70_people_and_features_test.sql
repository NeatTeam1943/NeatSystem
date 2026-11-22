-- People across features: a profile made ahead of time takes its trainings
-- records along when its person signs in, and the one-time StudentTracker
-- step (supabase/data) turns stand-ins into profiles. Runs last.
\set ON_ERROR_STOP on
set client_min_messages = warning;
reset role;
select trainings.item_id('build', 'אומים') as nuts \gset

-- ---------- certified before they ever signed in ----------
set role authenticated;
select t.login(t.tid('mentor'));
select hub.invite_member('kid@tr.test', 'ילד מראש', 'build') as kid \gset
select t.login(t.tid('lead'));
select trainings_api.grant(:'kid', :'nuts');
reset role;
select t.eq(trainings.is_member(:'kid', 'build'), true, 'a profile made ahead of time is a member');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000c1d0', 'kid@tr.test');
select t.eq((select count(*) from trainings.certs where user_id = '00000000-0000-0000-0000-00000000c1d0' and item = :'nuts'), 1::bigint, 'the certification followed them when they signed in');
select t.eq((select count(*) from trainings.certs where user_id = :'kid'), 0::bigint, 'nothing left on the old id');

-- ---------- StudentTracker stand-ins → profiles ----------
create table if not exists trainings.legacy_people (
  id uuid primary key, fs_id text not null unique, name text not null,
  claimed_by uuid, claimed_at timestamptz, imported_at timestamptz not null default now());
insert into trainings.legacy_people (id, fs_id, name) values (md5('fs:p9')::uuid, 'p9', 'תלמידה ישנה'), (md5('fs:m9')::uuid, 'm9', 'מנטור ישן');
insert into trainings.certs (user_id, item, at) values (md5('fs:p9')::uuid, :'nuts', now());
insert into trainings.rank_current (user_id, category, rank, manual) values (md5('fs:p9')::uuid, 'build', 'nit', false), (md5('fs:m9')::uuid, 'build', 'nitmentor', true);
insert into trainings.memberships (user_id, category, kind, active) values (md5('fs:p9')::uuid, 'build', 'extra', true);
alter table trainings.legacy_people add column if not exists phone text;
update trainings.legacy_people set phone = '054-1112233' where fs_id = 'p9';

\i supabase/data/2026-11-studenttracker-people.sql
select id as old9 from hub.profiles where full_name = 'תלמידה ישנה' \gset
select t.eq((select team || '/' || position || '/' || phone || '/' || invited from hub.profiles where id = :'old9'), 'build/member/054-1112233/true', 'a profile with team and phone');
select t.eq((select position::text from hub.profiles where full_name = 'מנטור ישן'), 'mentor', 'ניטמנטור = mentor');
select t.eq((select count(*) from trainings.certs where user_id = :'old9'), 1::bigint, 'her certifications moved to it');
select t.eq((select rank from trainings.rank_current where user_id = :'old9' and category = 'build'), 'nit', 'and her rank');
select t.eq((select count(*) from trainings.memberships where user_id = :'old9'), 0::bigint, 'the stand-in membership became just her team');
select t.eq(trainings.is_member(:'old9', 'build'), true, 'a member of her team');
select t.eq((select count(*) from trainings.legacy_people where claimed_by is null), 0::bigint, 'no stand-ins left');
\i supabase/data/2026-11-studenttracker-people.sql
select t.eq((select count(*) from hub.profiles where full_name = 'תלמידה ישנה'), 1::bigint, 're-running creates nothing');

-- she signs in and asks to join: matched by phone, a mentor approves → the profile is hers
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000c1d9', 'old9@gmail.com');
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000c1d9');
select hub.request_join('Old Student', '0541112233', null, 2028, 'cad');
select t.login(t.tid('mentor'));
select hub.decide_join('00000000-0000-0000-0000-00000000c1d9', true);
reset role;
select t.eq((select count(*) from trainings.certs where user_id = '00000000-0000-0000-0000-00000000c1d9'), 1::bigint, 'her records are on her login now');
\echo PEOPLE AND FEATURES TESTS PASSED
