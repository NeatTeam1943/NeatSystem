-- =============================================================================
-- NeatSystem core: people, teams, permissions, audit, archive, and the
-- registry that lets every feature plug into the person lifecycle.
--
-- Schema `hub`. Every file in this folder is re-runnable: run them in order
-- on a new project, or again on the live one after a change.
--
-- Rules:
--   * Clients never write tables. Every change goes through a SECURITY
--     DEFINER function that checks permissions and writes the audit log.
--   * Clients read people through `hub.people`, which hides phone / birth
--     date / email from whoever may not see them.
--   * Features (trainings, NEATHUB, …) never write `hub` tables. They
--     declare their permissions and lifecycle hooks with the two
--     `hub.register_*` functions below, from their own migration.
--
-- Supabase dashboard: Settings → API → Exposed schemas: hub, trainings_api, neathub_api.
-- =============================================================================
create schema if not exists hub;
grant usage on schema hub to anon, authenticated, service_role;

do $$ begin
  create type hub.position as enum ('rookie', 'member', 'team_lead', 'captain', 'mentor');  -- 'rookie' is retired (no_rookies)
exception when duplicate_object then null; end $$;
do $$ begin
  create type hub.profile_status as enum ('pending', 'active', 'rejected', 'archived');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- Tables
-- =============================================================================
create table if not exists hub.teams (
  id   text primary key,
  name text not null,
  kind text not null check (kind in ('team', 'subteam')),
  sort int  not null default 0
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

-- A person. id = their login (auth.users.id) once they signed in; a profile
-- a mentor made ahead of time (invited) gets that id when they first sign in.
create table if not exists hub.profiles (
  id             uuid primary key,
  email          text not null default '',
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
  invited        boolean not null default false,
  fav_tool       text check (fav_tool is null or char_length(fav_tool) <= 40),
  avatar_url     text check (avatar_url is null or avatar_url ~ '^https://'),
  requested_team text references hub.teams (id),
  join_note      text check (join_note is null or char_length(join_note) <= 300),
  match_profile  uuid,
  decided_by     uuid,
  decided_at     timestamptz,
  archived_at    timestamptz,
  archived_by    uuid,
  archive_reason text check (archive_reason is null or char_length(archive_reason) <= 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint active_needs_position check (status <> 'active' or position is not null)
);

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
  user_id    uuid not null references hub.profiles (id) on delete cascade on update cascade,
  perm       text not null references hub.permissions (key) on delete cascade,
  granted_by uuid references hub.profiles (id) on delete set null on update cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, perm)
);

-- Append-only; written only by hub.audit().
create table if not exists hub.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb not null default '{}'::jsonb
);

-- What a person looked like when they left the team (profile, every feature's
-- record of them, their audit trail). Survives any later change.
create table if not exists hub.member_archives (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  full_name   text not null,
  archived_at timestamptz not null default now(),
  archived_by uuid,
  reason      text,
  profile     jsonb not null,
  systems     jsonb not null default '{}'::jsonb,
  audit       jsonb not null default '[]'::jsonb,
  restored_at timestamptz,
  restored_by uuid
);

-- Features that keep per-person data. Each one registers (from its own
-- migration) the functions hub calls at a person's lifecycle events:
--   on_claim(old uuid, new uuid)  a profile made ahead of time got its login id
--   snapshot(uuid) returns jsonb  what to keep in the archive when they leave
create table if not exists hub.features (
  id       text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name     text not null,
  on_claim regprocedure,
  snapshot regprocedure,
  sort     int not null default 100
);

-- -----------------------------------------------------------------------------
-- Upgrades of a database made by earlier versions (no-ops on a new one)
-- -----------------------------------------------------------------------------
alter table hub.profiles add column if not exists invited        boolean not null default false;
alter table hub.profiles add column if not exists match_profile  uuid;
alter table hub.profiles add column if not exists archived_at    timestamptz;
alter table hub.profiles add column if not exists archived_by    uuid;
alter table hub.profiles add column if not exists archive_reason text check (archive_reason is null or char_length(archive_reason) <= 300);
alter table hub.profiles alter column email set default '';
-- profiles.id no longer points at auth.users (a profile can exist before its login)
do $$ declare r record; begin
  for r in select c.conname from pg_constraint c
           where c.contype = 'f' and c.conrelid = 'hub.profiles'::regclass and c.confrelid = 'auth.users'::regclass loop
    execute format('alter table hub.profiles drop constraint %I', r.conname);
  end loop;
end $$;
-- the earlier sub-system registry is replaced by hub.features
drop function if exists hub.archive_member(uuid, text);
drop function if exists hub.subsystem_snapshot(hub.subsystems, uuid);
drop function if exists hub.register_subsystem(text, text, text, text, int, int);
drop table if exists hub.subsystems;
drop function if exists hub.decide_join(uuid, boolean, text, hub.position, int, text);
-- no more rookies
update hub.profiles set position = 'member' where position = 'rookie';
delete from hub.role_permissions where role = 'rookie';

-- -----------------------------------------------------------------------------
-- Constraints that point at profiles. When a profile made ahead of time gets
-- its login id, every reference follows (on update cascade).
-- -----------------------------------------------------------------------------
do $$ begin
  alter table hub.profiles add constraint profiles_decided_by_fkey foreign key (decided_by) references hub.profiles (id) on delete set null on update cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table hub.profiles add constraint profiles_archived_by_fkey foreign key (archived_by) references hub.profiles (id) on delete set null on update cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table hub.profiles add constraint profiles_match_profile_fkey foreign key (match_profile) references hub.profiles (id) on delete set null on update cascade;
exception when duplicate_object then null; end $$;
do $$ declare r record; begin
  for r in select c.conname, c.conrelid::regclass::text as tbl, pg_get_constraintdef(c.oid) as def from pg_constraint c
           where c.contype = 'f' and c.confrelid = 'hub.profiles'::regclass and c.confupdtype <> 'c' loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s on update cascade', r.tbl, r.conname, r.def);
  end loop;
end $$;
alter table hub.profiles drop constraint if exists no_rookies;
alter table hub.profiles add constraint no_rookies check (position is distinct from 'rookie');

create index if not exists profiles_status_idx on hub.profiles (status);
create index if not exists profiles_team_idx on hub.profiles (team);
create index if not exists profiles_email_idx on hub.profiles (lower(email));
create index if not exists audit_at_idx on hub.audit_log (at desc);
create index if not exists audit_target_idx on hub.audit_log (target_type, target_id);
create index if not exists member_archives_user_idx on hub.member_archives (user_id, archived_at desc);

-- -----------------------------------------------------------------------------
-- Core permissions (features add theirs with hub.register_permissions)
-- -----------------------------------------------------------------------------
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

-- =============================================================================
-- Helpers
-- =============================================================================
create or replace function hub.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists profiles_touch on hub.profiles;
create trigger profiles_touch before update on hub.profiles for each row execute function hub.touch_updated_at();

create or replace function hub.is_active(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from hub.profiles p where p.id = p_uid and p.status = 'active');
$$;

create or replace function hub.has_perm(p_perm text, p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from hub.profiles p
    where p.id = p_uid and p.status = 'active' and (
      exists (select 1 from hub.role_permissions rp
              where rp.perm = p_perm and (rp.role = p.position::text or (p.is_admin and rp.role = 'admin')))
      or exists (select 1 from hub.user_permissions up where up.user_id = p.id and up.perm = p_perm)));
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

create or replace function hub.valid_email(p text) returns boolean language sql immutable as $$
  select coalesce(p ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', false)
$$;
create or replace function hub.norm_name(p text) returns text language sql immutable as $$
  select lower(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '["''״׳`]', '', 'g'), '\s+', ' ', 'g')))
$$;
create or replace function hub.phone9(p text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 9 then right(regexp_replace(p, '\D', '', 'g'), 9) end
$$;

-- =============================================================================
-- Extension points for features (called from their migrations)
-- =============================================================================
-- Permissions a feature adds. p_perms: [{ "key": "trainings.manage", "label": "...",
-- "grp": "הכשרות", "sort": 1, "roles": ["mentor", "admin"] }]. A role's default
-- applies only the first time a key appears, so a mentor's change in the
-- permissions page is never undone by re-running a migration.
create or replace function hub.register_permissions(p_module text, p_perms jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  v_new boolean;
begin
  for v in select * from jsonb_array_elements(p_perms) loop
    if split_part(v ->> 'key', '.', 1) <> p_module then
      raise exception 'permission % must start with %.', v ->> 'key', p_module;
    end if;
    v_new := not exists (select 1 from hub.permissions where key = v ->> 'key');
    insert into hub.permissions (key, label, grp, module, sort)
    values (v ->> 'key', v ->> 'label', coalesce(v ->> 'grp', p_module), p_module, coalesce((v ->> 'sort')::int, 0))
    on conflict (key) do update set label = excluded.label, grp = excluded.grp, module = excluded.module, sort = excluded.sort;
    if v_new then
      insert into hub.role_permissions (role, perm)
      select r, v ->> 'key' from jsonb_array_elements_text(coalesce(v -> 'roles', '[]'::jsonb)) r
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- A feature's lifecycle hooks (see hub.features).
create or replace function hub.register_feature(p_id text, p_name text, p_on_claim text default null, p_snapshot text default null, p_sort int default 100)
returns void language sql security definer set search_path = '' as $$
  insert into hub.features (id, name, on_claim, snapshot, sort)
  values (p_id, p_name, p_on_claim::regprocedure, p_snapshot::regprocedure, p_sort)
  on conflict (id) do update set name = excluded.name, on_claim = excluded.on_claim, snapshot = excluded.snapshot, sort = excluded.sort;
$$;

-- =============================================================================
-- Read model
-- =============================================================================
-- Visibility: yourself — everything; active members — other active members,
-- without phone / birth date / email (users.view_phone / users.view_private);
-- pending / rejected — users.approve or users.edit_membership; archived —
-- users.edit_membership. Everyone active sees birthdays as MM-DD.
drop view if exists hub.people;
create view hub.people with (security_barrier = true) as
select
  p.id, p.full_name, p.nickname, p.team, p.subteams, p.position, p.is_admin, p.status, p.grad_year,
  p.fav_tool, p.avatar_url, p.requested_team,
  case when p.id = auth.uid() or hub.has_perm('users.approve') then p.join_note end as join_note,
  case when p.id = auth.uid() or hub.has_perm('users.view_phone') then p.phone end as phone,
  case when p.id = auth.uid() or hub.has_perm('users.view_private') then p.birth_date end as birth_date,
  case when p.id = auth.uid() or hub.has_perm('users.view_private') or hub.has_perm('users.approve')
         or (p.invited and hub.has_perm('users.edit_membership')) then p.email end as email,
  to_char(p.birth_date, 'MM-DD') as birthday,
  p.decided_by, p.decided_at, p.created_at, p.archived_at,
  case when hub.has_perm('users.edit_membership') then p.archive_reason end as archive_reason,
  p.invited,
  case when hub.has_perm('users.approve') then p.match_profile end as match_profile
from hub.profiles p
where p.id = auth.uid()
   or (hub.is_active() and p.status = 'active')
   or (p.status in ('pending', 'rejected') and (hub.has_perm('users.approve') or hub.has_perm('users.edit_membership')))
   or (p.status = 'archived' and hub.has_perm('users.edit_membership'));

drop view if exists hub.audit;
create view hub.audit with (security_barrier = true) as
select a.id, a.at, a.actor, ap.full_name as actor_name, a.action, a.target_type, a.target_id, a.details
from hub.audit_log a
left join hub.profiles ap on ap.id = a.actor
where hub.has_perm('audit.view');

drop view if exists hub.archives;
create view hub.archives with (security_barrier = true) as
select a.id, a.user_id, a.full_name, a.archived_at, a.archived_by, ab.full_name as archived_by_name,
       a.reason, a.profile, a.systems, a.audit, a.restored_at, a.restored_by
from hub.member_archives a
left join hub.profiles ab on ab.id = a.archived_by
where hub.has_perm('users.edit_membership');

-- My permission keys (the client shows / hides UI with them; the server checks every write).
create or replace function hub.my_permissions() returns setof text
language sql stable security definer set search_path = '' as $$
  select k.key from hub.permissions k where hub.has_perm(k.key);
$$;

-- =============================================================================
-- Joining
-- =============================================================================
-- The profile made ahead of time that a join request looks like (only when exactly one fits).
create or replace function hub.find_match(p_name text, p_phone text) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select min(p.id::text)::uuid from hub.profiles p
     where p.invited and p.status = 'active' and hub.phone9(p_phone) is not null and hub.phone9(p.phone) = hub.phone9(p_phone)
     having count(*) = 1),
    (select min(p.id::text)::uuid from hub.profiles p
     where p.invited and p.status = 'active' and hub.norm_name(p.full_name) = hub.norm_name(p_name)
     having count(*) = 1))
$$;

-- A profile made ahead of time gets its person's login id; every feature moves its rows.
create or replace function hub.claim_profile(p_profile uuid, p_auth uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  f hub.features;
begin
  if p_profile = p_auth then
    update hub.profiles set invited = false where id = p_profile;
    return found;
  end if;
  -- a join request made meanwhile with the same login gives way
  delete from hub.profiles where id = p_auth and status in ('pending', 'rejected');
  if exists (select 1 from hub.profiles where id = p_auth) then return false; end if;
  update hub.profiles set id = p_auth, invited = false where id = p_profile and invited;
  if not found then return false; end if;
  update hub.audit_log set target_id = p_auth::text where target_type = 'user' and target_id = p_profile::text;
  update hub.audit_log set actor = p_auth where actor = p_profile;
  update hub.member_archives set user_id = p_auth where user_id = p_profile;
  for f in select * from hub.features where on_claim is not null order by sort, id loop
    begin
      execute format('select %s($1, $2)', f.on_claim::regproc) using p_profile, p_auth;
    exception when others then
      perform hub.audit('user.claim_failed', 'user', p_auth::text, jsonb_build_object('system', f.id, 'error', sqlerrm));
    end;
  end loop;
  perform hub.audit('user.claimed', 'user', p_auth::text, jsonb_build_object('from', p_profile));
  return true;
end $$;

-- First sign-in: Supabase inserts the login → a profile made ahead of time with that email becomes theirs.
create or replace function hub.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from hub.profiles where invited and email <> '' and lower(email) = lower(new.email) limit 1;
  if v is not null then perform hub.claim_profile(v, new.id); end if;
  return new;
exception when others then
  return new;   -- never block a sign-in
end $$;
drop trigger if exists hub_claim_profile on auth.users;
create trigger hub_claim_profile after insert on auth.users for each row execute function hub.on_auth_user_created();

-- For a login that existed before the profile was made (the app calls this when there's no active profile).
create or replace function hub.claim_my_profile() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v uuid;
begin
  if auth.uid() is null then return false; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  select id into v from hub.profiles where invited and email <> '' and lower(email) = v_email limit 1;
  if v is null then return false; end if;
  return hub.claim_profile(v, auth.uid());
end $$;

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
  if hub.claim_my_profile() then return; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select p.status into v_cur from hub.profiles p where p.id = v_uid;
  if v_cur in ('active', 'archived') then
    raise exception 'כבר יש לך חשבון פעיל' using errcode = '23505';
  end if;
  if p_team is not null and not exists (select 1 from hub.teams t where t.id = p_team and t.kind = 'team') then
    raise exception 'צוות לא קיים' using errcode = '22023';
  end if;
  insert into hub.profiles (id, email, full_name, phone, birth_date, grad_year, requested_team, join_note, status, match_profile)
  values (v_uid, coalesce(v_email, ''), btrim(p_full_name), nullif(btrim(p_phone), ''), p_birth_date, p_grad_year, p_team,
          nullif(btrim(p_note), ''), 'pending', hub.find_match(p_full_name, p_phone))
  on conflict (id) do update set
    full_name = excluded.full_name, phone = excluded.phone, birth_date = excluded.birth_date,
    grad_year = excluded.grad_year, requested_team = excluded.requested_team, join_note = excluded.join_note,
    status = 'pending', decided_by = null, decided_at = null, match_profile = excluded.match_profile;
  perform hub.audit('user.join_requested', 'user', v_uid::text, jsonb_build_object('team', p_team, 'again', v_cur is not null));
end $$;

-- Approve or reject. Approving a request that looks like a profile made ahead
-- of time hands that profile to the login (p_link => false: a new profile).
create or replace function hub.decide_join(
  p_user      uuid,
  p_approve   boolean,
  p_team      text default null,
  p_position  hub.position default 'member',
  p_grad_year int default null,
  p_reason    text default null,
  p_link      boolean default true
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_p hub.profiles;
  v_pos hub.position := coalesce(nullif(p_position, 'rookie'), 'member');
begin
  perform hub.require_perm('users.approve');
  select * into v_p from hub.profiles where id = p_user for update;
  if not found or v_p.status <> 'pending' then
    raise exception 'הבקשה כבר טופלה או לא קיימת' using errcode = 'P0002';
  end if;
  if not p_approve then
    update hub.profiles set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_user;
    perform hub.audit('user.rejected', 'user', p_user::text, jsonb_build_object('reason', p_reason));
    return;
  end if;

  if p_link and v_p.match_profile is not null
     and exists (select 1 from hub.profiles where id = v_p.match_profile and invited and status = 'active') then
    -- the profile is theirs: it keeps its team / position; what they wrote fills what it lacks
    if not hub.claim_profile(v_p.match_profile, p_user) then
      raise exception 'החיבור לפרופיל נכשל' using errcode = 'P0001';
    end if;
    update hub.profiles set
      email = case when coalesce(email, '') = '' then v_p.email else email end,
      phone = coalesce(phone, v_p.phone),
      birth_date = coalesce(birth_date, v_p.birth_date),
      grad_year = coalesce(grad_year, p_grad_year, v_p.grad_year),
      team = coalesce(team, p_team, v_p.requested_team),
      decided_by = auth.uid(), decided_at = now()
    where id = p_user;
    perform hub.audit('user.approved', 'user', p_user::text, jsonb_build_object('linked', true));
    return;
  end if;

  if v_pos <> 'member' and not hub.has_perm('users.edit_membership') then
    raise exception 'אין הרשאה לקבוע תפקיד' using errcode = '42501';
  end if;
  if v_pos = 'mentor' and not hub.has_perm('users.grant_permissions') then
    raise exception 'רק מי שמחלק הרשאות יכול לצרף מנטור' using errcode = '42501';
  end if;
  update hub.profiles set
    status = 'active', team = coalesce(p_team, v_p.requested_team), position = v_pos,
    grad_year = coalesce(p_grad_year, v_p.grad_year), match_profile = null,
    decided_by = auth.uid(), decided_at = now()
  where id = p_user;
  perform hub.audit('user.approved', 'user', p_user::text,
    jsonb_build_object('team', coalesce(p_team, v_p.requested_team), 'position', v_pos));
end $$;

-- =============================================================================
-- Profiles made ahead of time
-- =============================================================================
-- For migrations / the SQL editor (not callable by clients). p_email may be ''.
create or replace function hub.create_profile(
  p_email text, p_full_name text, p_team text default null, p_position hub.position default 'member',
  p_grad_year int default null, p_phone text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_email <> '' and exists (select 1 from hub.profiles where lower(email) = v_email) then
    raise exception 'כבר יש פרופיל עם המייל %', v_email;
  end if;
  if v_phone is not null and v_phone !~ '^[0-9+\- ]{7,20}$' then v_phone := null; end if;
  insert into hub.profiles (id, email, full_name, team, position, grad_year, phone, status, invited, decided_at)
  values (v_id, v_email, left(btrim(p_full_name), 80),
          case when exists (select 1 from hub.teams t where t.id = p_team and t.kind = 'team') then p_team end,
          coalesce(nullif(p_position, 'rookie'), 'member'), p_grad_year, v_phone, 'active', true, now());
  perform hub.audit('user.invited', 'user', v_id::text, jsonb_build_object('team', p_team, 'position', p_position));
  return v_id;
end $$;

-- A mentor adds someone by the email they'll sign in with. Returns the profile id.
create or replace function hub.invite_member(
  p_email     text,
  p_full_name text,
  p_team      text default null,
  p_position  hub.position default 'member',
  p_grad_year int default null,
  p_phone     text default null,
  p_subteams  text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_old hub.profiles;
  v_auth uuid;
  v_id uuid;
  v_pos hub.position := coalesce(nullif(p_position, 'rookie'), 'member');
begin
  perform hub.require_perm('users.edit_membership');
  if v_pos = 'mentor' then perform hub.require_perm('users.grant_permissions'); end if;
  if not hub.valid_email(v_email) then raise exception 'מייל לא תקין' using errcode = '22023'; end if;
  if p_team is not null and not exists (select 1 from hub.teams t where t.id = p_team and t.kind = 'team') then
    raise exception 'צוות לא קיים' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_subteams, '{}')) s where not exists (select 1 from hub.teams t where t.id = s and t.kind = 'subteam')) then
    raise exception 'תת-צוות לא קיים' using errcode = '22023';
  end if;
  select * into v_old from hub.profiles where lower(email) = v_email order by (status = 'active') desc limit 1;
  if v_old.id is not null then
    raise exception '%', case
      when v_old.status = 'pending' then 'יש כבר בקשת הצטרפות עם המייל הזה. מאשרים אותה מ"לטיפולי".'
      when v_old.status = 'archived' then 'יש כבר פרופיל עם המייל הזה בארכיון. אפשר להחזיר אותו לפעילות.'
      when v_old.status = 'rejected' then 'בקשה עם המייל הזה נדחתה. כשהם יבקשו שוב, מאשרים מ"לטיפולי".'
      else 'כבר יש חבר/ה עם המייל הזה' end using errcode = '23505';
  end if;
  -- signed in once already (never asked to join): the profile is theirs right away
  select u.id into v_auth from auth.users u where lower(u.email) = v_email limit 1;
  v_id := coalesce(v_auth, gen_random_uuid());
  insert into hub.profiles (id, email, full_name, team, subteams, position, grad_year, phone, status, invited, decided_by, decided_at)
  values (v_id, v_email, btrim(p_full_name), p_team, coalesce(p_subteams, '{}'), v_pos, p_grad_year, nullif(btrim(p_phone), ''),
          'active', v_auth is null, auth.uid(), now());
  perform hub.audit('user.invited', 'user', v_id::text, jsonb_build_object('team', p_team, 'position', v_pos));
  return v_id;
end $$;

-- Email / phone / birth date of someone who hasn't signed in yet (after that, only they edit these).
create or replace function hub.update_invite(p_user uuid, p_email text, p_phone text, p_birth_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform hub.require_perm('users.edit_membership');
  if not exists (select 1 from hub.profiles where id = p_user and invited) then
    raise exception 'אפשר לערוך כאן רק מי שעוד לא התחבר/ה' using errcode = 'P0002';
  end if;
  if v_email <> '' and not hub.valid_email(v_email) then raise exception 'מייל לא תקין' using errcode = '22023'; end if;
  if v_email <> '' and exists (select 1 from hub.profiles where lower(email) = v_email and id <> p_user) then
    raise exception 'כבר יש פרופיל עם המייל הזה' using errcode = '23505';
  end if;
  update hub.profiles set email = v_email, phone = nullif(btrim(p_phone), ''), birth_date = p_birth_date where id = p_user;
  perform hub.audit('user.invite_edited', 'user', p_user::text, '{}'::jsonb);
  -- that email already has a login: theirs now
  perform hub.claim_profile(p_user, u.id) from auth.users u
  where v_email <> '' and lower(u.email) = v_email
    and not exists (select 1 from hub.profiles x where x.id = u.id and x.status in ('active', 'archived'));
end $$;

-- =============================================================================
-- Editing people
-- =============================================================================
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
    nickname = nullif(btrim(p_nickname), ''), phone = nullif(btrim(p_phone), ''), birth_date = p_birth_date,
    fav_tool = nullif(btrim(p_fav_tool), ''), avatar_url = nullif(btrim(p_avatar_url), '')
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

-- Archive: leaving keeps everything. The profile stays (status archived, so no
-- access anywhere), every feature keeps its rows, and hub.member_archives
-- freezes the profile, each feature's snapshot and the audit trail.
create or replace function hub.archive_member(p_user uuid, p_reason text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_p hub.profiles;
  v_systems jsonb := '{}'::jsonb;
  v_snap jsonb;
  f hub.features;
  v_id bigint;
begin
  perform hub.require_perm('users.edit_membership');
  if p_user = auth.uid() then
    raise exception 'אי אפשר להעביר את עצמך לארכיון' using errcode = '42501';
  end if;
  select * into v_p from hub.profiles where id = p_user for update;
  if not found or v_p.status <> 'active' then
    raise exception 'אפשר להעביר לארכיון רק חבר/ה פעיל/ה' using errcode = 'P0002';
  end if;
  if v_p.position = 'mentor' or v_p.is_admin then
    perform hub.require_perm('users.grant_permissions');
  end if;
  for f in select * from hub.features where snapshot is not null order by sort, id loop
    begin
      execute format('select %s($1)', f.snapshot::regproc) into v_snap using p_user;
    exception when others then
      v_snap := jsonb_build_object('error', sqlstate, 'detail', sqlerrm);
    end;
    v_systems := v_systems || jsonb_build_object(f.id, v_snap);
  end loop;
  insert into hub.member_archives (user_id, full_name, archived_by, reason, profile, systems, audit)
  values (
    p_user, v_p.full_name, auth.uid(), nullif(btrim(p_reason), ''),
    to_jsonb(v_p) || jsonb_build_object('extra_permissions',
      (select coalesce(jsonb_agg(up.perm order by up.perm), '[]'::jsonb) from hub.user_permissions up where up.user_id = p_user)),
    jsonb_strip_nulls(v_systems),
    (select coalesce(jsonb_agg(to_jsonb(a) order by a.at), '[]'::jsonb) from hub.audit_log a where a.target_type = 'user' and a.target_id = p_user::text))
  returning id into v_id;
  update hub.profiles set status = 'archived', archived_at = now(), archived_by = auth.uid(), archive_reason = nullif(btrim(p_reason), '')
  where id = p_user;
  perform hub.audit('user.archived', 'user', p_user::text, jsonb_build_object('reason', nullif(btrim(p_reason), ''), 'archive', v_id));
  return v_id;
end $$;

create or replace function hub.restore_member(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_p hub.profiles;
begin
  perform hub.require_perm('users.edit_membership');
  select * into v_p from hub.profiles where id = p_user for update;
  if not found or v_p.status <> 'archived' then
    raise exception 'המשתמש לא בארכיון' using errcode = 'P0002';
  end if;
  if v_p.position = 'mentor' or v_p.is_admin then
    perform hub.require_perm('users.grant_permissions');
  end if;
  update hub.profiles set status = 'active', archived_at = null, archived_by = null, archive_reason = null where id = p_user;
  update hub.member_archives set restored_at = now(), restored_by = auth.uid()
  where id = (select max(id) from hub.member_archives where user_id = p_user and restored_at is null);
  perform hub.audit('user.restored', 'user', p_user::text, '{}'::jsonb);
end $$;

-- Team, position, grade, admin, status. A status change goes through archive / restore.
create or replace function hub.update_membership(
  p_user       uuid,
  p_full_name  text default null,
  p_team       text default null,
  p_clear_team boolean default false,
  p_subteams   text[] default null,
  p_position   hub.position default null,
  p_grad_year  int default null,
  p_is_admin   boolean default null,
  p_status     hub.profile_status default null
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
    select 1 from unnest(p_subteams) s where not exists (select 1 from hub.teams t where t.id = s and t.kind = 'subteam')) then
    raise exception 'תת-צוות לא קיים' using errcode = '22023';
  end if;
  select * into v_old from hub.profiles where id = p_user;
  if not found or v_old.status in ('pending', 'rejected') then
    raise exception 'המשתמש לא נמצא' using errcode = 'P0002';
  end if;
  if v_old.position = 'mentor' then
    perform hub.require_perm('users.grant_permissions');
  end if;
  if p_status = 'archived' and v_old.status = 'active' then
    perform hub.archive_member(p_user, null);
  elsif p_status = 'active' and v_old.status = 'archived' then
    perform hub.restore_member(p_user);
  end if;

  select * into v_old from hub.profiles where id = p_user for update;
  update hub.profiles set
    full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
    team = case when p_clear_team then null else coalesce(p_team, team) end,
    subteams = coalesce(p_subteams, subteams),
    position = coalesce(p_position, position),
    grad_year = coalesce(p_grad_year, grad_year),
    is_admin = coalesce(p_is_admin, is_admin)
  where id = p_user
  returning * into v_new;
  if (v_old.full_name, v_old.team, v_old.subteams, v_old.position, v_old.grad_year, v_old.is_admin)
     is distinct from (v_new.full_name, v_new.team, v_new.subteams, v_new.position, v_new.grad_year, v_new.is_admin) then
    perform hub.audit('user.membership_changed', 'user', p_user::text, jsonb_strip_nulls(jsonb_build_object(
      'full_name', case when v_old.full_name <> v_new.full_name then jsonb_build_array(v_old.full_name, v_new.full_name) end,
      'team', case when v_old.team is distinct from v_new.team then jsonb_build_array(v_old.team, v_new.team) end,
      'subteams', case when v_old.subteams <> v_new.subteams then jsonb_build_array(v_old.subteams, v_new.subteams) end,
      'position', case when v_old.position is distinct from v_new.position then jsonb_build_array(v_old.position, v_new.position) end,
      'grad_year', case when v_old.grad_year is distinct from v_new.grad_year then jsonb_build_array(v_old.grad_year, v_new.grad_year) end,
      'is_admin', case when v_old.is_admin <> v_new.is_admin then jsonb_build_array(v_old.is_admin, v_new.is_admin) end)));
  end if;
end $$;

-- =============================================================================
-- Permissions
-- =============================================================================
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
  perform hub.audit(case when p_on then 'perm.role_granted' else 'perm.role_revoked' end, 'role', p_role, jsonb_build_object('perm', p_perm));
end $$;

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
  perform hub.audit(case when p_on then 'perm.user_granted' else 'perm.user_revoked' end, 'user', p_user::text, jsonb_build_object('perm', p_perm));
end $$;

-- First mentor, once, from the SQL editor after they signed in with Google one time:
--   select hub.bootstrap_mentor('name@gmail.com', 'שם מלא');
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

-- =============================================================================
-- Access
-- =============================================================================
alter table hub.profiles enable row level security;          -- no policies: only through hub.people and functions
alter table hub.audit_log enable row level security;
alter table hub.member_archives enable row level security;
alter table hub.features enable row level security;
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

revoke all on hub.profiles, hub.audit_log, hub.member_archives, hub.features from anon, authenticated;
revoke all on hub.teams, hub.permissions, hub.role_permissions, hub.user_permissions from anon, authenticated;
grant select on hub.teams, hub.permissions, hub.role_permissions, hub.user_permissions to authenticated;
grant select on hub.people, hub.audit, hub.archives to authenticated;

revoke all on all functions in schema hub from public, anon, authenticated;
grant execute on function
  hub.is_active(uuid),
  hub.has_perm(text, uuid),
  hub.my_permissions(),
  hub.request_join(text, text, date, int, text, text),
  hub.claim_my_profile(),
  hub.decide_join(uuid, boolean, text, hub.position, int, text, boolean),
  hub.invite_member(text, text, text, hub.position, int, text, text[]),
  hub.update_invite(uuid, text, text, date),
  hub.update_my_profile(text, text, date, text, text),
  hub.update_membership(uuid, text, text, boolean, text[], hub.position, int, boolean, hub.profile_status),
  hub.archive_member(uuid, text),
  hub.restore_member(uuid),
  hub.set_role_permission(text, text, boolean),
  hub.set_user_permission(uuid, text, boolean)
to authenticated;
