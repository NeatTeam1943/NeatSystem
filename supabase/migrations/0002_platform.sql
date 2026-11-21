-- =============================================================================
-- NeatSystem platform (task 2): sub-systems, their permissions, and archiving.
--
-- NeatSystem owns exactly one thing in the shared Supabase project: people
-- (login, profile, team, position, permissions) in schema `hub`.
-- Every sub-system (trainings, neathub, later sunday...) lives in its own repo
-- and owns two schemas of its own in the SAME project:
--
--   <sys>      its tables. Private: no client and no other system reads them.
--   <sys>_api  its contract: views + functions. The only thing others may use.
--
-- What a sub-system may use from hub (the "users contract", kept stable):
--   hub.people                 view, already filtered for the caller
--   hub.is_active(uuid)        is this person an active member
--   hub.has_perm(text, uuid)   does this person hold a permission
--   hub.register_subsystem()   from its migration, once
--   hub.register_permissions() from its migration, once per change
-- It never writes hub tables directly.
--
-- What NeatSystem uses from a sub-system: only <sys>_api.<profile fn>(uuid),
-- a STABLE function returning jsonb in the display format of contract 1
-- (src/core/profileBlocks.ts). The client calls it with GET, which PostgREST
-- runs in a READ ONLY transaction, so the profile page cannot change anything
-- in a sub-system even if that function were wrong.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sub-system registry
-- -----------------------------------------------------------------------------
create table if not exists hub.subsystems (
  id          text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name        text not null,
  api_schema  text not null check (api_schema ~ '^[a-z][a-z0-9_]{1,40}$'),
  profile_fn  text check (profile_fn is null or profile_fn ~ '^[a-z][a-z0-9_]{1,60}$'),
  contract    int  not null default 1,
  sort        int  not null default 100,
  registered_at timestamptz not null default now()
);
alter table hub.subsystems enable row level security;
revoke all on hub.subsystems from anon, authenticated;
grant select on hub.subsystems to authenticated;
drop policy if exists subsystems_read on hub.subsystems;
create policy subsystems_read on hub.subsystems for select to authenticated using (hub.is_active());

-- Called from a sub-system's own migration (runs as the migration owner).
create or replace function hub.register_subsystem(
  p_id text, p_name text, p_api_schema text, p_profile_fn text default 'profile_v1', p_sort int default 100, p_contract int default 1
) returns void
language sql security definer set search_path = '' as $$
  insert into hub.subsystems (id, name, api_schema, profile_fn, sort, contract)
  values (p_id, p_name, p_api_schema, p_profile_fn, p_sort, p_contract)
  on conflict (id) do update set name = excluded.name, api_schema = excluded.api_schema,
    profile_fn = excluded.profile_fn, sort = excluded.sort, contract = excluded.contract;
$$;

-- Permissions a sub-system adds to the shared table. p_perms is a JSON array:
--   [{ "key": "trainings.manage", "label": "...", "grp": "הכשרות", "sort": 1,
--      "roles": ["mentor", "admin"] }]
-- Role defaults are applied only the first time a key appears, so a change a
-- mentor made in the permissions table is never undone by re-running a migration.
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

-- -----------------------------------------------------------------------------
-- Archive: leaving the team keeps everything.
--   * hub.profiles keeps the row (status = archived) — every sub-system keeps
--     its own rows too, so nothing is ever orphaned or deleted.
--   * An archived person fails hub.is_active()/hub.has_perm(), so they lose
--     access to every system at once.
--   * hub.member_archives freezes what every system showed on their profile at
--     that moment (plus the profile row and their audit trail), so the record
--     survives even if a sub-system later changes or drops its data.
-- -----------------------------------------------------------------------------
alter table hub.profiles add column if not exists archived_at    timestamptz;
alter table hub.profiles add column if not exists archived_by    uuid references hub.profiles (id) on delete set null;
alter table hub.profiles add column if not exists archive_reason text check (archive_reason is null or char_length(archive_reason) <= 300);

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
create index if not exists member_archives_user_idx on hub.member_archives (user_id, archived_at desc);
alter table hub.member_archives enable row level security;
revoke all on hub.member_archives from anon, authenticated;

-- What one sub-system shows for a person, called server-side. Never throws:
-- a broken or missing function becomes {"error": ...} in the snapshot.
-- Only STABLE / IMMUTABLE functions are called (Postgres refuses data changes
-- inside them), so archiving cannot write into a sub-system either.
create or replace function hub.subsystem_snapshot(p_sys hub.subsystems, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_out jsonb;
  v_vol "char";
begin
  if p_sys.profile_fn is null then return null; end if;
  select p.provolatile into v_vol
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = p_sys.api_schema and p.proname = p_sys.profile_fn
    and p.pronargs = 1 and p.proargtypes[0] = 'uuid'::regtype and p.prorettype = 'jsonb'::regtype;
  if v_vol is null then
    return jsonb_build_object('error', 'missing', 'detail', format('%s.%s(uuid) returns jsonb not found', p_sys.api_schema, p_sys.profile_fn));
  end if;
  if v_vol = 'v' then
    return jsonb_build_object('error', 'not_stable', 'detail', 'profile function must be STABLE');
  end if;
  begin
    execute format('select %I.%I($1)', p_sys.api_schema, p_sys.profile_fn) into v_out using p_user;
    return v_out;
  exception when others then
    return jsonb_build_object('error', sqlstate, 'detail', sqlerrm);
  end;
end $$;

create or replace function hub.archive_member(p_user uuid, p_reason text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_p hub.profiles;
  v_systems jsonb := '{}'::jsonb;
  v_s hub.subsystems;
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

  -- Snapshot first, while the person is still active (sub-systems usually
  -- show nothing for archived people).
  for v_s in select * from hub.subsystems order by sort, id loop
    v_systems := v_systems || jsonb_build_object(v_s.id, hub.subsystem_snapshot(v_s, p_user));
  end loop;

  insert into hub.member_archives (user_id, full_name, archived_by, reason, profile, systems, audit)
  values (
    p_user, v_p.full_name, auth.uid(), nullif(btrim(p_reason), ''),
    to_jsonb(v_p) || jsonb_build_object(
      'extra_permissions', (select coalesce(jsonb_agg(up.perm order by up.perm), '[]'::jsonb) from hub.user_permissions up where up.user_id = p_user)),
    jsonb_strip_nulls(v_systems),
    (select coalesce(jsonb_agg(to_jsonb(a) order by a.at), '[]'::jsonb)
       from hub.audit_log a where a.target_type = 'user' and a.target_id = p_user::text)
  )
  returning id into v_id;

  update hub.profiles set
    status = 'archived', archived_at = now(), archived_by = auth.uid(), archive_reason = nullif(btrim(p_reason), '')
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

-- Archive records, for whoever may manage membership.
drop view if exists hub.archives;
create view hub.archives with (security_barrier = true) as
select a.id, a.user_id, a.full_name, a.archived_at, a.archived_by, ab.full_name as archived_by_name,
       a.reason, a.profile, a.systems, a.audit, a.restored_at, a.restored_by
from hub.member_archives a
left join hub.profiles ab on ab.id = a.archived_by
where hub.has_perm('users.edit_membership');
grant select on hub.archives to authenticated;

-- people: expose when / why someone left (same visibility as status itself).
-- `create or replace` (new columns at the end) instead of drop + create.
-- Sub-systems must not build VIEWS on hub.people (that would pin its shape);
-- they read it inside functions, which Postgres does not pin.
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
  case when p.id = auth.uid() or hub.has_perm('users.view_private') or hub.has_perm('users.approve') then p.email end as email,
  to_char(p.birth_date, 'MM-DD') as birthday,
  p.decided_by,
  p.decided_at,
  p.created_at,
  p.archived_at,
  case when hub.has_perm('users.edit_membership') then p.archive_reason end as archive_reason
from hub.profiles p
where p.id = auth.uid()
   or (hub.is_active() and p.status = 'active')
   or (p.status in ('pending', 'rejected') and (hub.has_perm('users.approve') or hub.has_perm('users.edit_membership')))
   or (p.status = 'archived' and hub.has_perm('users.edit_membership'));
grant select on hub.people to authenticated;

-- update_membership keeps its signature; a status change now goes through the
-- archive functions so it always leaves a snapshot behind.
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
      'is_admin', case when v_old.is_admin <> v_new.is_admin then jsonb_build_array(v_old.is_admin, v_new.is_admin) end
    )));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function
  hub.register_subsystem(text, text, text, text, int, int),
  hub.register_permissions(text, jsonb),
  hub.subsystem_snapshot(hub.subsystems, uuid),
  hub.archive_member(uuid, text),
  hub.restore_member(uuid)
from public, anon, authenticated;
grant execute on function
  hub.archive_member(uuid, text),
  hub.restore_member(uuid)
to authenticated;
-- register_* and subsystem_snapshot stay internal (migrations / archive only).
