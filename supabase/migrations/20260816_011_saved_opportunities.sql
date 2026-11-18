create table if not exists public.saved_opportunities (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, opportunity_id)
);
alter table public.saved_opportunities enable row level security;
drop policy if exists "candidates manage saved opportunities" on public.saved_opportunities;
create policy "candidates manage saved opportunities" on public.saved_opportunities for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
