-- Profiles without an email, join requests that look like them, old logins (0004_join_match.sql).
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

select hub.create_profile('', 'אוהד מדמוני', 'build', 'member', null, '052-647-0052') as ohad \gset
select hub.create_profile('', 'שלי לוי', 'cad') as shelly \gset
select t.eq((select invited and status = 'active' and email = '' from hub.profiles where id = :'ohad'), true, 'a profile with no email');
select t.eq(t.err($$select hub.create_profile('', 'זמני')$$), '', 'create_profile works from the SQL editor');
reset role;
delete from hub.profiles where full_name = 'זמני';

-- clients can't use the internal ones
set role authenticated;
select t.login(t.id('mentor'));
select t.eq(t.err($$select hub.create_profile('', 'yy')$$), '42501', 'create_profile is internal');

-- a join request that matches by phone → the mentor's approval hands over the profile
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000002aa', 'ohad.m@gmail.com');
set role authenticated;
select t.login('00000000-0000-0000-0000-0000000002aa');
select hub.request_join('Ohad Madmony', '0526470052', '2009-01-01', 2027, 'software');
select t.login(t.id('mentor'));
select t.eq((select match_profile from hub.people where id = '00000000-0000-0000-0000-0000000002aa'), :'ohad'::uuid, 'the request looks like the profile (same phone)');
select hub.decide_join('00000000-0000-0000-0000-0000000002aa', true);
select t.eq((select status::text || '/' || team || '/' || email || '/' || invited || '/' || grad_year from hub.people where id = '00000000-0000-0000-0000-0000000002aa'),
  'active/build/ohad.m@gmail.com/false/2027', 'approved = the old profile is theirs, filled with what they wrote');
select t.eq((select count(*) from hub.people where id = :'ohad'), 0::bigint, 'no duplicate left behind');

-- a request that matches but the mentor says it's someone else
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000002bb', 'other@x.com');
set role authenticated;
select t.login('00000000-0000-0000-0000-0000000002bb');
select hub.request_join('שלי לוי', null, null, null, 'cad');
select t.login(t.id('mentor'));
select t.eq((select match_profile from hub.people where id = '00000000-0000-0000-0000-0000000002bb'), :'shelly'::uuid, 'looks like by name');
select hub.decide_join('00000000-0000-0000-0000-0000000002bb', true, p_link => false);
select t.eq((select invited from hub.people where id = :'shelly'), true, 'not linked: the old profile stays');

reset role;
\echo MATCH TESTS PASSED
