-- Core permission / visibility tests. Run by scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------- seed (as the migration owner) ----------
insert into auth.users (id, email) values
  (t.id('mentor'), 'mentor@x.com'), (t.id('admin'), 'admin@x.com'), (t.id('lead'), 'lead@x.com'),
  (t.id('member'), 'member@x.com'), (t.id('rookie'), 'rookie@x.com'), (t.id('newbie'), 'newbie@x.com'),
  (t.id('stranger'), 'stranger@x.com'), (t.id('moneyonly'), 'money@x.com');

select hub.bootstrap_mentor('mentor@x.com', 'מנטורית ראשונה');
insert into hub.profiles (id, email, full_name, position, is_admin, status, team, phone, birth_date) values
  (t.id('admin'),  'admin@x.com',  'אדמין קפטן', 'captain',   true,  'active', 'software', '050-1111111', '2008-03-02'),
  (t.id('lead'),   'lead@x.com',   'רשצית',      'team_lead', false, 'active', 'build',    '050-2222222', '2008-05-06'),
  (t.id('member'), 'member@x.com', 'חבר צוות',   'member',    false, 'active', 'build',    '050-3333333', '2009-07-08'),
  (t.id('rookie'), 'rookie@x.com', 'חדשה',       'member',    false, 'active', 'build',    null,          null);

set role authenticated;

-- ---------- anonymous ----------
select t.login(null);
select t.eq((select count(*) from hub.people), 0::bigint, 'not signed in sees nobody');

-- ---------- join request ----------
select t.login(t.id('newbie'));
select hub.request_join('ניובי חדש', '050-9999999', '2010-01-01', 2028, 'cad', 'רוצה לבנות רובוטים');
select t.eq((select status::text from hub.people where id = t.id('newbie')), 'pending', 'newbie sees own pending row');
select t.eq((select count(*) from hub.people where id <> t.id('newbie')), 0::bigint, 'pending user sees nobody else');
select t.eq(t.err($$select hub.update_my_profile('x', null, null, null)$$), 'P0002', 'pending user cannot edit profile');

select t.login(t.id('member'));
select t.eq((select count(*) from hub.people where id = t.id('newbie')), 0::bigint, 'member does not see pending requests');
select t.eq(t.err($$select hub.decide_join(t.id('newbie'), true)$$), '42501', 'member cannot approve');

select t.login(t.id('mentor'));
select t.eq((select join_note from hub.people where id = t.id('newbie')), 'רוצה לבנות רובוטים', 'mentor sees request + note');
select hub.decide_join(t.id('newbie'), true, null, 'member', null);
select t.eq((select status::text || '/' || team || '/' || position::text from hub.people where id = t.id('newbie')), 'active/cad/member', 'approved with requested team');
select t.eq(t.err($$select hub.decide_join(t.id('newbie'), true)$$), 'P0002', 'cannot decide twice');

select t.login(t.id('newbie'));
select t.eq(t.err($$select hub.request_join('x x', null, null, null, null)$$), '23505', 'active user cannot re-request');

-- ---------- reject + ask again ----------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'r@x.com');
set role authenticated;
select t.login('00000000-0000-0000-0000-0000000000aa');
select hub.request_join('נדחה', null, null, null, 'build');
select t.login(t.id('admin'));
select hub.decide_join('00000000-0000-0000-0000-0000000000aa', false, p_reason => 'לא מהקבוצה');
select t.login('00000000-0000-0000-0000-0000000000aa');
select t.eq((select status::text from hub.people where id = '00000000-0000-0000-0000-0000000000aa'), 'rejected', 'rejected user sees status');
select hub.request_join('נדחה שוב', null, null, null, 'build');
select t.eq((select status::text from hub.people where id = '00000000-0000-0000-0000-0000000000aa'), 'pending', 'rejected user can ask again');

-- ---------- visibility of private fields ----------
select t.login(t.id('member'));
select t.eq((select phone from hub.people where id = t.id('lead')), null::text, 'member does not see phones');
select t.eq((select birth_date from hub.people where id = t.id('lead')), null::date, 'member does not see birth dates');
select t.eq((select birthday from hub.people where id = t.id('lead')), '05-06', 'member sees birthday MM-DD');
select t.eq((select email from hub.people where id = t.id('lead')), null::text, 'member does not see emails');
select t.eq((select phone from hub.people where id = t.id('member')), '050-3333333', 'member sees own phone');
select t.login(t.id('lead'));
select t.eq((select phone from hub.people where id = t.id('member')), '050-3333333', 'team lead sees phones');
select t.eq((select birth_date from hub.people where id = t.id('member')), null::date, 'team lead does not see birth dates');

-- ---------- direct table access is closed ----------
select t.eq(t.err($$select * from hub.profiles$$), '42501', 'no direct select on profiles');
select t.eq(t.err($$update hub.profiles set full_name = 'hack'$$), '42501', 'no direct update on profiles');
select t.eq(t.err($$insert into hub.audit_log (action) values ('x')$$), '42501', 'no direct insert into audit');
select t.eq(t.err($$insert into hub.role_permissions values ('member', 'audit.view')$$), '42501', 'no direct write to matrix');
select t.eq(t.err($$select hub.audit('x', null, null)$$), '42501', 'audit() is internal');
select t.eq(t.err($$select hub.bootstrap_mentor('member@x.com', 'x')$$), '42501', 'bootstrap is internal');

-- ---------- own profile edit ----------
select t.login(t.id('rookie'));
select hub.update_my_profile('רוקיק', '052-1234567', '2010-02-03', 'מקדחה');
select t.eq((select nickname || '|' || fav_tool from hub.people where id = t.id('rookie')), 'רוקיק|מקדחה', 'own profile updated');
select t.eq(t.err($$select hub.update_my_profile(null, 'not a phone!', null, null)$$), '23514', 'phone format is checked');

-- ---------- membership edits ----------
select t.login(t.id('member'));
select t.eq(t.err($$select hub.update_membership(t.id('rookie'), p_team => 'cad')$$), '42501', 'member cannot edit membership');
select t.login(t.id('admin'));
select hub.update_membership(t.id('rookie'), p_team => 'software', p_subteams => array['media']);
select t.eq((select team || '/' || array_to_string(subteams, ',') from hub.people where id = t.id('rookie')), 'software/media', 'admin moved rookie');
select t.eq(t.err($$select hub.update_membership(t.id('rookie'), p_is_admin => true)$$), '42501', 'admin (not mentor) cannot make admins');
select t.eq(t.err($$select hub.update_membership(t.id('rookie'), p_position => 'mentor')$$), '42501', 'admin cannot make mentors');
select t.eq(t.err($$select hub.update_membership(t.id('mentor'), p_full_name => 'x y')$$), '42501', 'admin cannot edit a mentor');
select t.eq(t.err($$select hub.update_membership(t.id('admin'), p_position => 'mentor')$$), '42501', 'nobody changes own position');
select t.eq(t.err($$select hub.update_membership(t.id('rookie'), p_subteams => array['nope'])$$), '22023', 'unknown subteam rejected');
select t.login(t.id('mentor'));
select hub.update_membership(t.id('rookie'), p_position => 'team_lead');
select t.eq((select position::text from hub.people where id = t.id('rookie')), 'team_lead', 'mentor promoted a member');
select hub.update_membership(t.id('rookie'), p_position => 'member');
select t.eq(t.err($$select hub.update_membership(t.id('rookie'), p_position => 'rookie')$$), '23514', 'no more rookies');
select t.eq(t.err($$select hub.update_membership(t.id('mentor'), p_is_admin => false)$$), '42501', 'mentor cannot change own admin flag');

-- ---------- permission matrix ----------
select t.login(t.id('admin'));
select t.eq(t.err($$select hub.set_role_permission('member', 'users.view_phone', true)$$), '42501', 'admin cannot edit the matrix');
select t.login(t.id('mentor'));
select hub.set_role_permission('member', 'users.view_phone', true);
select t.login(t.id('member'));
select t.eq((select phone from hub.people where id = t.id('lead')), '050-2222222', 'matrix change applies at once');
select t.eq(('users.view_phone' in (select * from hub.my_permissions())), true, 'my_permissions reflects matrix');
select t.login(t.id('mentor'));
select t.eq(t.err($$select hub.set_role_permission('mentor', 'users.grant_permissions', false)$$), '42501', 'cannot lock mentors out');
select hub.set_role_permission('member', 'users.view_phone', false);

-- ---------- per-person extras + audit view ----------
select t.login(t.id('member'));
select t.eq((select count(*) from hub.audit), 0::bigint, 'member cannot read audit');
select t.login(t.id('mentor'));
select hub.set_user_permission(t.id('member'), 'audit.view', true);
select t.login(t.id('member'));
select t.eq((select count(*) > 5 from hub.audit), true, 'extra permission opens audit');
select t.eq((select count(*) from hub.audit where action = 'user.approved' and actor_name = 'מנטורית ראשונה'), 1::bigint, 'approval was audited with actor');
select t.eq((select count(*) from hub.audit where action = 'user.profile_edited' and target_id = t.id('rookie')::text), 1::bigint, 'profile edit was audited');

-- ---------- archive ----------
select t.login(t.id('mentor'));
select hub.update_membership(t.id('member'), p_status => 'archived');
select t.login(t.id('member'));
select t.eq((select count(*) from hub.people), 1::bigint, 'archived user sees only self');
select t.eq(hub.has_perm('audit.view'), false, 'archived user loses permissions');
select t.login(t.id('lead'));
select t.eq((select count(*) from hub.people where id = t.id('member')), 0::bigint, 'archived user hidden from team');
select t.login(t.id('mentor'));
select t.eq((select status::text from hub.people where id = t.id('member')), 'archived', 'mentor still sees archived');

reset role;
\echo ALL TESTS PASSED
