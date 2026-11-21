-- =============================================================================
-- NeatSystem people, round 3:
--   * no more rookies: everyone who was a rookie is a member;
--   * profiles made ahead of time: a mentor adds someone by email (team,
--     position, grade, phone...) before they ever sign in. When that person
--     signs in with Google with the same email, the profile becomes theirs,
--     including whatever the sub-systems already recorded for it;
-- Re-runnable. Run after 0002_platform.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- No rookies
-- -----------------------------------------------------------------------------
update hub.profiles set position = 'member' where position = 'rookie';
delete from hub.role_permissions where role = 'rookie';
alter table hub.profiles drop constraint if exists no_rookies;
alter table hub.profiles add constraint no_rookies check (position is distinct from 'rookie');

-- Approve or reject a join request. New members start as 'member'.
create or replace function hub.decide_join(
  p_user      uuid,
  p_approve   boolean,
  p_team      text default null,
  p_position  hub.position default 'member',
  p_grad_year int default null,
  p_reason    text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_p hub.profiles;
  v_pos hub.position := coalesce(p_position, 'member');
begin
  perform hub.require_perm('users.approve');
  select * into v_p from hub.profiles where id = p_user for update;
  if not found or v_p.status <> 'pending' then
    raise exception 'הבקשה כבר טופלה או לא קיימת' using errcode = 'P0002';
  end if;
  if p_approve then
    if v_pos = 'rookie' then v_pos := 'member'; end if;
    if v_pos <> 'member' and not hub.has_perm('users.edit_membership') then
      raise exception 'אין הרשאה לקבוע תפקיד' using errcode = '42501';
    end if;
    if v_pos = 'mentor' and not hub.has_perm('users.grant_permissions') then
      raise exception 'רק מי שמחלק הרשאות יכול לצרף מנטור' using errcode = '42501';
    end if;
    update hub.profiles set
      status = 'active',
      team = coalesce(p_team, v_p.requested_team),
      position = v_pos,
      grad_year = coalesce(p_grad_year, v_p.grad_year),
      decided_by = auth.uid(), decided_at = now()
    where id = p_user;
    perform hub.audit('user.approved', 'user', p_user::text,
      jsonb_build_object('team', coalesce(p_team, v_p.requested_team), 'position', v_pos));
  else
    update hub.profiles set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_user;
    perform hub.audit('user.rejected', 'user', p_user::text, jsonb_build_object('reason', p_reason));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Profiles made ahead of time
-- -----------------------------------------------------------------------------
alter table hub.profiles add column if not exists invited boolean not null default false;  -- added by a mentor, hasn't signed in yet

-- such a profile has no login yet, so profiles.id can't point at auth.users any more
do $$ declare r record; begin
  for r in select c.conname from pg_constraint c
           where c.contype = 'f' and c.conrelid = 'hub.profiles'::regclass and c.confrelid = 'auth.users'::regclass loop
    execute format('alter table hub.profiles drop constraint %I', r.conname);
  end loop;
end $$;

-- when the person signs in, the profile's id becomes their login id: references follow
do $$ declare r record; begin
  for r in select c.conname, c.conrelid::regclass::text as tbl, pg_get_constraintdef(c.oid) as def from pg_constraint c
           where c.contype = 'f' and c.confrelid = 'hub.profiles'::regclass and c.confupdtype <> 'c' loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s on update cascade', r.tbl, r.conname, r.def);
  end loop;
end $$;

create index if not exists profiles_email_idx on hub.profiles (lower(email));

-- people: + invited (new column at the end, so `create or replace` keeps working)
create or replace view hub.people with (security_barrier = true) as
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
  case when p.id = auth.uid() or hub.has_perm('users.view_private') or hub.has_perm('users.approve') or (p.invited and hub.has_perm('users.edit_membership')) then p.email end as email,
  to_char(p.birth_date, 'MM-DD') as birthday,
  p.decided_by,
  p.decided_at,
  p.created_at,
  p.archived_at,
  case when hub.has_perm('users.edit_membership') then p.archive_reason end as archive_reason,
  p.invited
from hub.profiles p
where p.id = auth.uid()
   or (hub.is_active() and p.status = 'active')
   or (p.status in ('pending', 'rejected') and (hub.has_perm('users.approve') or hub.has_perm('users.edit_membership')))
   or (p.status = 'archived' and hub.has_perm('users.edit_membership'));
grant select on hub.people to authenticated;

create or replace function hub.valid_email(p text) returns boolean language sql immutable as $$
  select coalesce(p ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', false)
$$;

-- A mentor adds someone before they sign in. Returns the profile id.
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
  v_pos hub.position := coalesce(p_position, 'member');
begin
  perform hub.require_perm('users.edit_membership');
  if v_pos = 'mentor' then perform hub.require_perm('users.grant_permissions'); end if;
  if v_pos = 'rookie' then v_pos := 'member'; end if;
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
  -- signed in once already (but never asked to join): the profile is theirs right away
  select u.id into v_auth from auth.users u where lower(u.email) = v_email limit 1;
  v_id := coalesce(v_auth, gen_random_uuid());
  insert into hub.profiles (id, email, full_name, team, subteams, position, grad_year, phone, status, invited, decided_by, decided_at)
  values (v_id, v_email, btrim(p_full_name), p_team, coalesce(p_subteams, '{}'), v_pos, p_grad_year, nullif(btrim(p_phone), ''),
          'active', v_auth is null, auth.uid(), now());
  perform hub.audit('user.invited', 'user', v_id::text, jsonb_build_object('team', p_team, 'position', v_pos));
  return v_id;
end $$;

-- Details only the person edits once they're in (email, phone, birth date), for a profile made ahead of time.
create or replace function hub.update_invite(p_user uuid, p_email text, p_phone text, p_birth_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
begin
  perform hub.require_perm('users.edit_membership');
  if not exists (select 1 from hub.profiles where id = p_user and invited) then
    raise exception 'אפשר לערוך כאן רק מי שעוד לא התחבר/ה' using errcode = 'P0002';
  end if;
  if not hub.valid_email(v_email) then raise exception 'מייל לא תקין' using errcode = '22023'; end if;
  if exists (select 1 from hub.profiles where lower(email) = v_email and id <> p_user) then
    raise exception 'כבר יש פרופיל עם המייל הזה' using errcode = '23505';
  end if;
  update hub.profiles set email = v_email, phone = nullif(btrim(p_phone), ''), birth_date = p_birth_date where id = p_user;
  perform hub.audit('user.invite_edited', 'user', p_user::text, '{}'::jsonb);
end $$;

-- The person behind a profile made ahead of time signed in: the profile (and
-- every sub-system's records for it) moves to their login id. Each sub-system
-- that keeps per-person rows defines <schema>.on_profile_claimed(old uuid, new uuid);
-- one that fails is logged and doesn't block the others or the sign-in.
create or replace function hub.claim_profile(p_profile uuid, p_auth uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  f record;
begin
  if p_profile = p_auth then
    update hub.profiles set invited = false where id = p_profile;
    return found;
  end if;
  -- a join request made meanwhile with the same account gives way
  delete from hub.profiles where id = p_auth and status in ('pending', 'rejected');
  if exists (select 1 from hub.profiles where id = p_auth) then return false; end if;
  update hub.profiles set id = p_auth, invited = false where id = p_profile and invited;
  if not found then return false; end if;
  update hub.audit_log set target_id = p_auth::text where target_type = 'user' and target_id = p_profile::text;
  update hub.audit_log set actor = p_auth where actor = p_profile;
  update hub.member_archives set user_id = p_auth where user_id = p_profile;
  for f in select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where p.proname = 'on_profile_claimed' and p.pronargs = 2 and n.nspname <> 'hub'
             and p.proargtypes[0] = 'uuid'::regtype and p.proargtypes[1] = 'uuid'::regtype
           order by n.nspname loop
    begin
      execute format('select %I.on_profile_claimed($1, $2)', f.nspname) using p_profile, p_auth;
    exception when others then
      perform hub.audit('user.claim_failed', 'user', p_auth::text, jsonb_build_object('system', f.nspname, 'error', sqlerrm));
    end;
  end loop;
  perform hub.audit('user.claimed', 'user', p_auth::text, jsonb_build_object('from', p_profile));
  return true;
end $$;

-- first sign-in: Supabase inserts the login → claim a matching profile
create or replace function hub.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from hub.profiles where invited and lower(email) = lower(new.email) limit 1;
  if v is not null then perform hub.claim_profile(v, new.id); end if;
  return new;
exception when others then
  return new;   -- never block a sign-in
end $$;
drop trigger if exists hub_claim_profile on auth.users;
create trigger hub_claim_profile after insert on auth.users for each row execute function hub.on_auth_user_created();

-- for someone who already had a login when the profile was made (the app calls this when there's no active profile)
create or replace function hub.claim_my_profile() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v uuid;
begin
  if auth.uid() is null then return false; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  select id into v from hub.profiles where invited and lower(email) = v_email limit 1;
  if v is null then return false; end if;
  return hub.claim_profile(v, auth.uid());
end $$;

-- asking to join with an email a mentor already added = just signing in
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

  insert into hub.profiles (id, email, full_name, phone, birth_date, grad_year, requested_team, join_note, status)
  values (v_uid, coalesce(v_email, ''), btrim(p_full_name), nullif(btrim(p_phone), ''), p_birth_date, p_grad_year, p_team, nullif(btrim(p_note), ''), 'pending')
  on conflict (id) do update set
    full_name = excluded.full_name, phone = excluded.phone, birth_date = excluded.birth_date,
    grad_year = excluded.grad_year, requested_team = excluded.requested_team, join_note = excluded.join_note,
    status = 'pending', decided_by = null, decided_at = null;

  perform hub.audit('user.join_requested', 'user', v_uid::text,
    jsonb_build_object('team', p_team, 'again', v_cur is not null));
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function
  hub.valid_email(text),
  hub.claim_profile(uuid, uuid),
  hub.on_auth_user_created()
from public, anon, authenticated;
revoke all on function
  hub.decide_join(uuid, boolean, text, hub.position, int, text),
  hub.invite_member(text, text, text, hub.position, int, text, text[]),
  hub.update_invite(uuid, text, text, date),
  hub.claim_my_profile(),
  hub.request_join(text, text, date, int, text, text)
from public, anon;
grant execute on function
  hub.decide_join(uuid, boolean, text, hub.position, int, text),
  hub.invite_member(text, text, text, hub.position, int, text, text[]),
  hub.update_invite(uuid, text, text, date),
  hub.claim_my_profile(),
  hub.request_join(text, text, date, int, text, text)
to authenticated;
