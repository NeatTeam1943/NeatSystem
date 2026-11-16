-- =============================================================================
-- NeatHub core (task 1b): people, teams, permissions, audit.
--
-- Lives in its own schema `hub` in NeatSystem's own Supabase project
-- (MoneyTeam keeps its separate project and is not touched).
--
-- Rules of the road:
--   * Clients never write tables directly. Every change goes through a
--     SECURITY DEFINER function below that checks permissions and writes the
--     audit log in the same transaction.
--   * Clients read through `hub.people` (a view that hides phone / birth date /
--     email from people who may not see them) and a few small catalog tables.
--
-- Supabase dashboard: add `hub` to Settings -> API -> Exposed schemas.
-- =============================================================================

create schema if not exists hub;
grant usage on schema hub to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
do $$ begin
  create type hub.position as enum ('rookie', 'member', 'team_lead', 'captain', 'mentor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type hub.profile_status as enum ('pending', 'active', 'rejected', 'archived');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Teams (main teams + sub-teams). Static catalog, edited by migration.
-- -----------------------------------------------------------------------------
create table if not exists hub.teams (
  id    text primary key,
  name  text not null,
  kind  text not null check (kind in ('team', 'subteam')),
  sort  int  not null default 0
);

insert into hub.teams (id, name, kind, sort) values
  ('cad',       'שרטוט',            'team',    1),
  ('build',     'בנייה',            'team',    2),
  ('software',  'תוכנה',            'team',    3),
  ('media',     'מדיה',             'subteam', 10),
  ('finance',   'פיננסי',           'subteam', 11),
  ('community', 'קהילה והתנדבויות', 'subteam', 12),
  ('awards',    'פרסים ושופטים',    'subteam', 13)
on conflict (id) do update set name = excluded.name, kind = excluded.kind, sort = excluded.sort;

-- -----------------------------------------------------------------------------
-- Profiles. id === auth.users.id (the same id MoneyTeam's `members` uses).
-- -----------------------------------------------------------------------------
create table if not exists hub.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  full_name      text not null check (char_length(btrim(full_name)) between 2 and 80),
  nickname       text check (nickname is null or char_length(nickname) <= 30),
  phone          text check (phone is null or phone ~ '^[0-9+\- ]{7,20}$'),
  birth_date     date check (birth_date is null or birth_date between '1940-01-01' and '2025-12-31'),
  grad_year      int  check (grad_year is null or grad_year between 2000 and 2100),
  team           text references hub.teams (id),
  subteams       text[] not null default '{}',
  position       hub.position,
  is_admin       boolean not null default false,
  status         hub.profile_status not null default 'pending',
  fav_tool       text check (fav_tool is null or char_length(fav_tool) <= 40),
  avatar_url     text check (avatar_url is null or avatar_url ~ '^https://'),
  requested_team text references hub.teams (id),
  join_note      text check (join_note is null or char_length(join_note) <= 300),
  decided_by     uuid references hub.profiles (id) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint active_needs_position check (status <> 'active' or position is not null)
);
create index if not exists profiles_status_idx on hub.profiles (status);
create index if not exists profiles_team_idx on hub.profiles (team);

alter table hub.profiles enable row level security;
-- No policies on purpose: the table is reachable only through hub.people and
-- the functions below (all owned by the migration role).
revoke all on hub.profiles from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Permissions: catalog + defaults per role + per-person extras.
-- Modules add their own keys in their own migrations.
-- -----------------------------------------------------------------------------
create table if not exists hub.permissions (
  key    text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  label  text not null,
  grp    text not null,
  module text not null,
  sort   int  not null default 0
);

create table if not exists hub.role_permissions (
  role text not null check (role in ('rookie', 'member', 'team_lead', 'captain', 'mentor', 'admin')),
  perm text not null references hub.permissions (key) on delete cascade,
  primary key (role, perm)
);

create table if not exists hub.user_permissions (
  user_id    uuid not null references hub.profiles (id) on delete cascade,
  perm       text not null references hub.permissions (key) on delete cascade,
  granted_by uuid references hub.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, perm)
);

insert into hub.permissions (key, label, grp, module, sort) values
  ('users.approve',           'אישור בקשות הצטרפות',        'משתמשים', 'core', 1),
  ('users.edit_membership',   'עריכת צוות, תפקיד ושנתון',   'משתמשים', 'core', 2),
  ('users.view_phone',        'צפייה בטלפונים',             'משתמשים', 'core', 3),
  ('users.view_private',      'צפייה בתאריך לידה ובמייל',   'משתמשים', 'core', 4),
  ('users.grant_permissions', 'מתן הרשאות ושינוי הטבלה',     'משתמשים', 'core', 5),
  ('audit.view',              'צפייה ביומן הפעולות',        'משתמשים', 'core', 6)
on conflict (key) do update set label = excluded.label, grp = excluded.grp, module = excluded.module, sort = excluded.sort;

insert into hub.role_permissions (role, perm) values
  ('mentor', 'users.approve'), ('admin', 'users.approve'),
  ('mentor', 'users.edit_membership'), ('admin', 'users.edit_membership'),
  ('team_lead', 'users.view_phone'), ('captain', 'users.view_phone'), ('mentor', 'users.view_phone'), ('admin', 'users.view_phone'),
  ('mentor', 'users.view_private'), ('admin', 'users.view_private'),
  ('mentor', 'users.grant_permissions'),
  ('mentor', 'audit.view'), ('admin', 'audit.view')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Audit log. Append-only; written only by the functions in this file.
-- -----------------------------------------------------------------------------
create table if not exists hub.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb not null default '{}'::jsonb
);
create index if not exists audit_at_idx on hub.audit_log (at desc);
create index if not exists audit_target_idx on hub.audit_log (target_type, target_id);
alter table hub.audit_log enable row level security;
revoke all on hub.audit_log from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function hub.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on hub.profiles;
create trigger profiles_touch before update on hub.profiles
  for each row execute function hub.touch_updated_at();

create or replace function hub.is_active(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from hub.profiles p where p.id = p_uid and p.status = 'active');
$$;

create or replace function hub.has_perm(p_perm text, p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from hub.profiles p
    where p.id = p_uid
      and p.status = 'active'
      and (
        exists (
          select 1 from hub.role_permissions rp
          where rp.perm = p_perm
            and (rp.role = p.position::text or (p.is_admin and rp.role = 'admin'))
        )
        or exists (select 1 from hub.user_permissions up where up.user_id = p.id and up.perm = p_perm)
      )
  );
$$;

create or replace function hub.require_perm(p_perm text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not hub.has_perm(p_perm) then
    raise exception 'אין הרשאה: %', p_perm using errcode = '42501';
  end if;
end $$;

create or replace function hub.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into hub.audit_log (actor, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- Read model: hub.people
-- Owner-rights view (bypasses profiles RLS) that applies the visibility rules:
--   * yourself: everything
--   * active members: other active members, without phone / birth date / email
--   * phone: users.view_phone; birth date + email: users.view_private
--   * pending / rejected requests: users.approve or users.edit_membership
--   * archived: users.edit_membership
-- Everyone active sees birthdays as MM-DD (for the home screen).
-- -----------------------------------------------------------------------------
drop view if exists hub.people;
create view hub.people with (security_barrier = true) as
select
  p.id,
  p.full_name,
  p.nickname,
  p.team,
  p.subteams,
  p.position,
  p.is_admin,
  p.status,
  p.grad_year,
  p.fav_tool,
  p.avatar_url,
  p.requested_team,
  case when p.id = auth.uid() or hub.has_perm('users.approve') then p.join_note end as join_note,
  case when p.id = auth.uid() or hub.has_perm('users.view_phone') then p.phone end as phone,
  case when p.id = auth.uid() or hub.has_perm('users.view_private') then p.birth_date end as birth_date,
  case when p.id = auth.uid() or hub.has_perm('users.view_private') or hub.has_perm('users.approve') then p.email end as email,
  to_char(p.birth_date, 'MM-DD') as birthday,
  p.decided_by,
  p.decided_at,
  p.created_at
from hub.profiles p
where p.id = auth.uid()
   or (hub.is_active() and p.status = 'active')
   or (p.status in ('pending', 'rejected') and (hub.has_perm('users.approve') or hub.has_perm('users.edit_membership')))
   or (p.status = 'archived' and hub.has_perm('users.edit_membership'));

grant select on hub.people to authenticated;

-- Catalog reads
alter table hub.teams enable row level security;
alter table hub.permissions enable row level security;
alter table hub.role_permissions enable row level security;
alter table hub.user_permissions enable row level security;

drop policy if exists teams_read on hub.teams;
create policy teams_read on hub.teams for select to authenticated using (true);
drop policy if exists permissions_read on hub.permissions;
create policy permissions_read on hub.permissions for select to authenticated using (hub.is_active());
drop policy if exists role_permissions_read on hub.role_permissions;
create policy role_permissions_read on hub.role_permissions for select to authenticated using (hub.is_active());
drop policy if exists user_permissions_read on hub.user_permissions;
create policy user_permissions_read on hub.user_permissions for select to authenticated
  using (user_id = auth.uid() or hub.has_perm('users.grant_permissions') or hub.has_perm('users.edit_membership'));

revoke all on hub.teams, hub.permissions, hub.role_permissions, hub.user_permissions from anon, authenticated;
grant select on hub.teams, hub.permissions, hub.role_permissions, hub.user_permissions to authenticated;

-- Audit read: a view so the RLS-free table never leaks
drop view if exists hub.audit;
create view hub.audit with (security_barrier = true) as
select a.id, a.at, a.actor, ap.full_name as actor_name, a.action, a.target_type, a.target_id, a.details
from hub.audit_log a
left join hub.profiles ap on ap.id = a.actor
where hub.has_perm('audit.view');
grant select on hub.audit to authenticated;

-- My permission keys (the client uses this to show / hide UI; the server
-- still checks every write on its own).
create or replace function hub.my_permissions() returns setof text
language sql stable security definer set search_path = '' as $$
  select k.key from hub.permissions k where hub.has_perm(k.key);
$$;

-- -----------------------------------------------------------------------------
-- Write API
-- -----------------------------------------------------------------------------

-- A signed-in Google user with no active profile asks to join.
create or replace function hub.request_join(
  p_full_name  text,
  p_phone      text,
  p_birth_date date,
  p_grad_year  int,
  p_team       text,
  p_note       text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_cur   hub.profile_status;
begin
  if v_uid is null then
    raise exception 'צריך להתחבר' using errcode = '28000';
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select p.status into v_cur from hub.profiles p where p.id = v_uid;
  if v_cur in ('active', 'archived') then
    raise exception 'כבר יש לך חשבון פעיל' using errcode = '23505';
  end if;
  if p_team is not null and not exists (select 1 from hub.teams t where t.id = p_team and t.kind = 'team') then
    raise exception 'צוות לא קיים' using errcode = '22023';
  end if;

  insert into hub.profiles (id, email, full_name, phone, birth_date, grad_year, requested_team, join_note, status)
  values (v_uid, coalesce(v_email, ''), btrim(p_full_name), nullif(btrim(p_phone), ''), p_birth_date, p_grad_year, p_team, nullif(btrim(p_note), ''), 'pending')
  on conflict (id) do update set
    full_name = excluded.full_name, phone = excluded.phone, birth_date = excluded.birth_date,
    grad_year = excluded.grad_year, requested_team = excluded.requested_team, join_note = excluded.join_note,
    status = 'pending', decided_by = null, decided_at = null;

  perform hub.audit('user.join_requested', 'user', v_uid::text,
    jsonb_build_object('team', p_team, 'again', v_cur is not null));
end $$;

-- Approve or reject a join request.
create or replace function hub.decide_join(
  p_user      uuid,
  p_approve   boolean,
  p_team      text default null,
  p_position  hub.position default 'rookie',
  p_grad_year int default null,
  p_reason    text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_p hub.profiles;
begin
  perform hub.require_perm('users.approve');
  select * into v_p from hub.profiles where id = p_user for update;
  if not found or v_p.status <> 'pending' then
    raise exception 'הבקשה כבר טופלה או לא קיימת' using errcode = 'P0002';
  end if;
  if p_approve then
    -- Only someone who may edit membership can start a person above rookie.
    if p_position <> 'rookie' and not hub.has_perm('users.edit_membership') then
      raise exception 'אין הרשאה לקבוע תפקיד' using errcode = '42501';
    end if;
    if p_position = 'mentor' and not hub.has_perm('users.grant_permissions') then
      raise exception 'רק מי שמחלק הרשאות יכול לצרף מנטור' using errcode = '42501';
    end if;
    update hub.profiles set
      status = 'active',
      team = coalesce(p_team, v_p.requested_team),
      position = coalesce(p_position, 'rookie'),
      grad_year = coalesce(p_grad_year, v_p.grad_year),
      decided_by = auth.uid(), decided_at = now()
    where id = p_user;
    perform hub.audit('user.approved', 'user', p_user::text,
      jsonb_build_object('team', coalesce(p_team, v_p.requested_team), 'position', p_position));
  else
    update hub.profiles set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_user;
    perform hub.audit('user.rejected', 'user', p_user::text, jsonb_build_object('reason', p_reason));
  end if;
end $$;

-- A person edits their own details.
create or replace function hub.update_my_profile(
  p_nickname   text,
  p_phone      text,
  p_birth_date date,
  p_fav_tool   text,
  p_avatar_url text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old hub.profiles;
begin
  select * into v_old from hub.profiles where id = auth.uid() for update;
  if not found or v_old.status <> 'active' then
    raise exception 'אין פרופיל פעיל' using errcode = 'P0002';
  end if;
  update hub.profiles set
    nickname = nullif(btrim(p_nickname), ''),
    phone = nullif(btrim(p_phone), ''),
    birth_date = p_birth_date,
    fav_tool = nullif(btrim(p_fav_tool), ''),
    avatar_url = nullif(btrim(p_avatar_url), '')
  where id = auth.uid();
  perform hub.audit('user.profile_edited', 'user', auth.uid()::text, jsonb_build_object(
    'fields', (select coalesce(jsonb_agg(f), '[]'::jsonb) from (values
      ('nickname', v_old.nickname is distinct from nullif(btrim(p_nickname), '')),
      ('phone', v_old.phone is distinct from nullif(btrim(p_phone), '')),
      ('birth_date', v_old.birth_date is distinct from p_birth_date),
      ('fav_tool', v_old.fav_tool is distinct from nullif(btrim(p_fav_tool), '')),
      ('avatar_url', v_old.avatar_url is distinct from nullif(btrim(p_avatar_url), ''))
    ) as x(f, changed) where changed)));
end $$;

-- Someone with users.edit_membership changes another person's membership.
-- NULL arguments mean "leave as is". Admin flag needs users.grant_permissions.
create or replace function hub.update_membership(
  p_user      uuid,
  p_full_name text default null,
  p_team      text default null,
  p_clear_team boolean default false,
  p_subteams  text[] default null,
  p_position  hub.position default null,
  p_grad_year int default null,
  p_is_admin  boolean default null,
  p_status    hub.profile_status default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old hub.profiles;
  v_new hub.profiles;
begin
  perform hub.require_perm('users.edit_membership');
  if p_user = auth.uid() and (p_position is not null or p_is_admin is not null or p_status is not null) then
    raise exception 'אי אפשר לשנות לעצמך תפקיד, אדמין או סטטוס' using errcode = '42501';
  end if;
  if p_is_admin is not null or p_position = 'mentor' then
    perform hub.require_perm('users.grant_permissions');
  end if;
  if p_status is not null and p_status not in ('active', 'archived') then
    raise exception 'סטטוס לא חוקי כאן' using errcode = '22023';
  end if;
  if p_subteams is not null and exists (
    select 1 from unnest(p_subteams) s where not exists (select 1 from hub.teams t where t.id = s and t.kind = 'subteam')
  ) then
    raise exception 'תת-צוות לא קיים' using errcode = '22023';
  end if;

  select * into v_old from hub.profiles where id = p_user for update;
  if not found or v_old.status in ('pending', 'rejected') then
    raise exception 'המשתמש לא נמצא' using errcode = 'P0002';
  end if;
  -- Changing a mentor needs the same power as making one.
  if v_old.position = 'mentor' then
    perform hub.require_perm('users.grant_permissions');
  end if;

  update hub.profiles set
    full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
    team = case when p_clear_team then null else coalesce(p_team, team) end,
    subteams = coalesce(p_subteams, subteams),
    position = coalesce(p_position, position),
    grad_year = coalesce(p_grad_year, grad_year),
    is_admin = coalesce(p_is_admin, is_admin),
    status = coalesce(p_status, status)
  where id = p_user
  returning * into v_new;

  perform hub.audit('user.membership_changed', 'user', p_user::text, jsonb_strip_nulls(jsonb_build_object(
    'full_name', case when v_old.full_name <> v_new.full_name then jsonb_build_array(v_old.full_name, v_new.full_name) end,
    'team', case when v_old.team is distinct from v_new.team then jsonb_build_array(v_old.team, v_new.team) end,
    'subteams', case when v_old.subteams <> v_new.subteams then jsonb_build_array(v_old.subteams, v_new.subteams) end,
    'position', case when v_old.position is distinct from v_new.position then jsonb_build_array(v_old.position, v_new.position) end,
    'grad_year', case when v_old.grad_year is distinct from v_new.grad_year then jsonb_build_array(v_old.grad_year, v_new.grad_year) end,
    'is_admin', case when v_old.is_admin <> v_new.is_admin then jsonb_build_array(v_old.is_admin, v_new.is_admin) end,
    'status', case when v_old.status <> v_new.status then jsonb_build_array(v_old.status, v_new.status) end
  )));
end $$;

-- Toggle a cell in the role x permission table.
create or replace function hub.set_role_permission(p_role text, p_perm text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform hub.require_perm('users.grant_permissions');
  if p_role = 'mentor' and p_perm = 'users.grant_permissions' and not p_on then
    raise exception 'אי אפשר להוריד ממנטורים את ההרשאה לחלק הרשאות' using errcode = '42501';
  end if;
  if p_on then
    insert into hub.role_permissions (role, perm) values (p_role, p_perm) on conflict do nothing;
  else
    delete from hub.role_permissions where role = p_role and perm = p_perm;
  end if;
  perform hub.audit(case when p_on then 'perm.role_granted' else 'perm.role_revoked' end, 'role', p_role,
    jsonb_build_object('perm', p_perm));
end $$;

-- Give / take an extra permission from one person.
create or replace function hub.set_user_permission(p_user uuid, p_perm text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform hub.require_perm('users.grant_permissions');
  if not exists (select 1 from hub.profiles where id = p_user and status = 'active') then
    raise exception 'המשתמש לא נמצא' using errcode = 'P0002';
  end if;
  if p_on then
    insert into hub.user_permissions (user_id, perm, granted_by) values (p_user, p_perm, auth.uid()) on conflict do nothing;
  else
    delete from hub.user_permissions where user_id = p_user and perm = p_perm;
  end if;
  perform hub.audit(case when p_on then 'perm.user_granted' else 'perm.user_revoked' end, 'user', p_user::text,
    jsonb_build_object('perm', p_perm));
end $$;

-- First mentor. Run once from the SQL editor (service role) after that person
-- has signed in with Google one time:  select hub.bootstrap_mentor('name@gmail.com', 'שם מלא');
create or replace function hub.bootstrap_mentor(p_email text, p_full_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
begin
  select u.id into v_uid from auth.users u where lower(u.email) = lower(p_email);
  if v_uid is null then
    raise exception 'המשתמש עוד לא התחבר אף פעם עם %', p_email;
  end if;
  insert into hub.profiles (id, email, full_name, position, is_admin, status)
  values (v_uid, p_email, p_full_name, 'mentor', true, 'active')
  on conflict (id) do update set position = 'mentor', is_admin = true, status = 'active';
  perform hub.audit('user.bootstrap_mentor', 'user', v_uid::text, '{}'::jsonb);
  return v_uid;
end $$;

-- -----------------------------------------------------------------------------
-- Function privileges: nothing is callable unless granted here.
-- -----------------------------------------------------------------------------
revoke all on all functions in schema hub from public, anon, authenticated;
grant execute on function
  hub.is_active(uuid),
  hub.has_perm(text, uuid),
  hub.my_permissions(),
  hub.request_join(text, text, date, int, text, text),
  hub.decide_join(uuid, boolean, text, hub.position, int, text),
  hub.update_my_profile(text, text, date, text, text),
  hub.update_membership(uuid, text, text, boolean, text[], hub.position, int, boolean, hub.profile_status),
  hub.set_role_permission(text, text, boolean),
  hub.set_user_permission(uuid, text, boolean)
to authenticated;
-- hub.audit, hub.require_perm and hub.bootstrap_mentor stay internal.
