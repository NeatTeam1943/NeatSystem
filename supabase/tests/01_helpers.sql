create schema if not exists t;
grant usage on schema t to public;

-- become a signed-in user (or anon with null)
create or replace function t.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid)::text end, false);
end $$;

-- run a statement, return the SQLSTATE it raised ('' if none)
create or replace function t.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return '';
exception when others then
  return sqlstate;
end $$;

create or replace function t.eq(p_got anyelement, p_want anyelement, p_what text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL %: got %, want %', p_what, p_got, p_want;
  end if;
  raise notice 'ok  %', p_what;
end $$;
grant execute on all functions in schema t to public;

-- fixed ids
create or replace function t.id(p_name text) returns uuid language sql immutable as $$
  select (case p_name
    when 'mentor'  then '00000000-0000-0000-0000-000000000001'
    when 'admin'   then '00000000-0000-0000-0000-000000000002'
    when 'lead'    then '00000000-0000-0000-0000-000000000003'
    when 'member'  then '00000000-0000-0000-0000-000000000004'
    when 'rookie'  then '00000000-0000-0000-0000-000000000005'
    when 'newbie'  then '00000000-0000-0000-0000-000000000006'
    when 'stranger' then '00000000-0000-0000-0000-000000000007'
    when 'moneyonly' then '00000000-0000-0000-0000-000000000008'
  end)::uuid
$$;
