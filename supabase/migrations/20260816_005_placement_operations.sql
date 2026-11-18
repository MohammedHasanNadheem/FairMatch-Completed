-- College placement operations, interview coordination, offers and notifications.

create type public.interview_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');
create type public.offer_status as enum ('draft', 'issued', 'accepted', 'declined', 'withdrawn', 'expired');
create type public.notification_kind as enum ('application', 'interview', 'offer', 'access_request', 'system');

create table public.placement_cohorts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  graduation_year integer check (graduation_year between 2020 and 2100),
  programme text check (char_length(programme) <= 160),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organisation_id, name, graduation_year)
);

create table public.cohort_memberships (
  cohort_id uuid not null references public.placement_cohorts(id) on delete cascade,
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cohort_id, candidate_id)
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.candidate_applications(id) on delete cascade,
  scheduled_by uuid not null references public.profiles(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null check (mode in ('in_person', 'video', 'phone')),
  location_or_link text not null check (char_length(location_or_link) between 2 and 500),
  status public.interview_status not null default 'scheduled',
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.candidate_applications(id) on delete cascade,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 2 and 160),
  compensation_text text check (char_length(compensation_text) <= 160),
  joining_date date,
  expires_at timestamptz,
  status public.offer_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind public.notification_kind not null,
  title text not null check (char_length(title) between 2 and 160),
  body text not null check (char_length(body) between 2 and 1000),
  link text check (char_length(link) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.placement_cohorts enable row level security;
alter table public.cohort_memberships enable row level security;
alter table public.interviews enable row level security;
alter table public.offers enable row level security;
alter table public.notifications enable row level security;

create policy "college teams manage cohorts" on public.placement_cohorts
  for all to authenticated using (public.is_active_organisation_member(organisation_id, array['college_coordinator', 'college_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.is_active_organisation_member(organisation_id, array['college_coordinator', 'college_admin']::public.app_role[]) or public.is_platform_admin());
create policy "cohort candidates read own membership" on public.cohort_memberships
  for select to authenticated using (candidate_id = auth.uid());
create policy "college teams manage cohort members" on public.cohort_memberships
  for all to authenticated using (exists (select 1 from public.placement_cohorts c where c.id = cohort_id and public.is_active_organisation_member(c.organisation_id, array['college_coordinator', 'college_admin']::public.app_role[])))
  with check (exists (select 1 from public.placement_cohorts c where c.id = cohort_id and public.is_active_organisation_member(c.organisation_id, array['college_coordinator', 'college_admin']::public.app_role[])));
create policy "candidates read their interviews" on public.interviews
  for select to authenticated using (exists (select 1 from public.candidate_applications a where a.id = application_id and a.candidate_id = auth.uid()));
create policy "company teams manage interviews" on public.interviews
  for all to authenticated using (exists (select 1 from public.candidate_applications a join public.opportunities o on o.id = a.opportunity_id where a.id = application_id and public.is_active_organisation_member(o.organisation_id, array['company_hr', 'company_admin']::public.app_role[])))
  with check (exists (select 1 from public.candidate_applications a join public.opportunities o on o.id = a.opportunity_id where a.id = application_id and public.is_active_organisation_member(o.organisation_id, array['company_hr', 'company_admin']::public.app_role[])));
create policy "candidates read own offers" on public.offers
  for select to authenticated using (exists (select 1 from public.candidate_applications a where a.id = application_id and a.candidate_id = auth.uid()));
create policy "company teams manage offers" on public.offers
  for all to authenticated using (exists (select 1 from public.candidate_applications a join public.opportunities o on o.id = a.opportunity_id where a.id = application_id and public.is_active_organisation_member(o.organisation_id, array['company_hr', 'company_admin']::public.app_role[])))
  with check (exists (select 1 from public.candidate_applications a join public.opportunities o on o.id = a.opportunity_id where a.id = application_id and public.is_active_organisation_member(o.organisation_id, array['company_hr', 'company_admin']::public.app_role[])));
create policy "users read notifications" on public.notifications
  for select to authenticated using (profile_id = auth.uid());
create policy "users mark notifications read" on public.notifications
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create or replace function public.respond_to_offer(offer_id uuid, response public.offer_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  if response not in ('accepted', 'declined') then
    raise exception 'Only accepted or declined responses are allowed';
  end if;
  update public.offers f
  set status = response, updated_at = now()
  where f.id = offer_id
    and f.status = 'issued'
    and (f.expires_at is null or f.expires_at > now())
    and exists (select 1 from public.candidate_applications a where a.id = f.application_id and a.candidate_id = auth.uid());
  if not found then
    raise exception 'This offer cannot be responded to';
  end if;
end;
$$;
revoke all on function public.respond_to_offer(uuid, public.offer_status) from public;
grant execute on function public.respond_to_offer(uuid, public.offer_status) to authenticated;

create or replace view public.placement_outcome_summary with (security_invoker = true) as
select
  o.organisation_id as company_organisation_id,
  o.type,
  count(distinct a.id) filter (where a.status = 'submitted') as submitted_applications,
  count(distinct a.id) filter (where a.status = 'shortlisted') as shortlisted_applications,
  count(distinct i.id) filter (where i.status = 'completed') as completed_interviews,
  count(distinct f.id) filter (where f.status = 'accepted') as accepted_offers
from public.opportunities o
left join public.candidate_applications a on a.opportunity_id = o.id
left join public.interviews i on i.application_id = a.id
left join public.offers f on f.application_id = a.id
group by o.organisation_id, o.type;
