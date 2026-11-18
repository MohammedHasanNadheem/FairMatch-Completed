-- Saved opportunity searches with database-generated in-app alerts. Apply after 014.

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_searches_active_idx on public.saved_searches(profile_id) where active;
alter table public.saved_searches enable row level security;
grant select, insert, update, delete on public.saved_searches to authenticated;

create policy "users manage own saved searches" on public.saved_searches
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create or replace function public.notify_saved_search_matches()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare saved_search public.saved_searches;
declare criteria_keyword text;
declare criteria_type text;
declare criteria_mode text;
begin
  if new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;
  for saved_search in select * from public.saved_searches where active loop
    criteria_keyword := lower(trim(coalesce(saved_search.criteria ->> 'keyword', '')));
    criteria_type := coalesce(saved_search.criteria ->> 'type', 'all');
    criteria_mode := coalesce(saved_search.criteria ->> 'workMode', 'all');
    if (criteria_type = 'all' or criteria_type = new.type::text)
      and (criteria_mode = 'all' or criteria_mode = new.work_mode::text)
      and (criteria_keyword = '' or lower(new.title || ' ' || new.description || ' ' || new.location || ' ' || new.skills::text) like '%' || criteria_keyword || '%') then
      insert into public.notifications(profile_id, kind, title, body, link)
      values (saved_search.profile_id, 'system', 'New opportunity matches ' || saved_search.name, new.title || ' in ' || new.location || ' matches your saved search.', '#discover');
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists opportunities_saved_search_alerts on public.opportunities;
create trigger opportunities_saved_search_alerts
  after insert or update of status on public.opportunities
  for each row execute function public.notify_saved_search_matches();
