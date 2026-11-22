-- =============================================================================
-- One-time data step (re-runnable): the people imported from StudentTracker
-- become NeatSystem profiles made ahead of time.
--
-- The Firestore import (Nov 2026) kept everyone who wasn't a NeatSystem member
-- yet as a stand-in row in trainings.legacy_people, holding their records.
-- This turns each stand-in into a real profile (name, phone, team — mentor if
-- their rank was ניטמנטור) and moves all their records to it. They take it over
-- when they sign in: by email, or by a join request a mentor approves
-- ("נראה כמו …" in the inbox).
--
-- Run after the migrations. Phones: the delivery script prepends
--   update trainings.legacy_people … from (values …)
-- with the phones it found in the import files.
-- =============================================================================
alter table if exists trainings.legacy_people add column if not exists phone text;

do $$
declare
  l record;
  v uuid;
  v_team text;
  v_pos hub.position;
  n int := 0;
begin
  if to_regclass('trainings.legacy_people') is null then return; end if;
  for l in execute 'select id, name, phone from trainings.legacy_people where claimed_by is null order by name' loop
    -- their team: the team category they hold most in, else one they were a member of
    select c.team into v_team
    from trainings.certs ce join trainings.items i on i.id = ce.item join trainings.categories c on c.id = i.category
    where ce.user_id = l.id and c.kind = 'team' group by c.team order by count(*) desc, c.team limit 1;
    if v_team is null then
      select c.team into v_team from trainings.memberships m join trainings.categories c on c.id = m.category
      where m.user_id = l.id and c.kind = 'team' order by c.sort limit 1;
    end if;
    v_pos := case when exists (select 1 from trainings.rank_current r where r.user_id = l.id and r.rank = 'nitmentor') then 'mentor' else 'member' end;
    v := hub.create_profile('', l.name, v_team, v_pos, null, l.phone);
    perform trainings.move_person(l.id, v);
    -- the stand-in "extra" membership in their own team is now just their team
    delete from trainings.memberships m using trainings.categories c
    where m.user_id = v and m.kind = 'extra' and c.id = m.category and c.kind = 'team' and c.team = v_team;
    execute 'update trainings.legacy_people set claimed_by = $1, claimed_at = now() where id = $2' using v, l.id;
    n := n + 1;
  end loop;
  raise notice 'profiles created: %', n;
end $$;

select count(*) filter (where invited) as "not signed in yet", count(*) as "active profiles"
from hub.profiles where status = 'active';
