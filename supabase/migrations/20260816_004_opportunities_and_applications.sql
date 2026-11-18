-- Shared internship, placement and experienced-hiring workflow.

create type public.opportunity_type as enum ('internship', 'graduate_placement', 'full_time', 'part_time', 'apprenticeship', 'contract');
create type public.opportunity_status as enum ('draft', 'published', 'closed', 'archived');
create type public.candidate_application_status as enum ('draft', 'submitted', 'shortlisted', 'interviewing', 'offered', 'rejected', 'withdrawn');

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 160),
  description text not null check (char_length(description) between 30 and 12000),
  type public.opportunity_type not null,
  location text not null check (char_length(location) between 2 and 120),
  work_mode text not null check (work_mode in ('on_site', 'hybrid', 'remote')),
  skills jsonb not null default '[]'::jsonb,
  eligibility jsonb not null default '{}'::jsonb,
  compensation_text text check (char_length(compensation_text) <= 160),
  application_deadline timestamptz not null,
  status public.opportunity_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (application_deadline > created_at)
);

create table public.opportunity_college_access (
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  primary key (opportunity_id, organisation_id)
);

create table public.candidate_applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  status public.candidate_application_status not null default 'draft',
  resume_path text check (char_length(resume_path) <= 500),
  cover_note text check (char_length(cover_note) <= 2000),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, candidate_id),
  check ((status = 'draft' and submitted_at is null) or (status <> 'draft' and submitted_at is not null))
);

create index opportunities_published_deadline_idx on public.opportunities(status, application_deadline);
create index candidate_applications_candidate_idx on public.candidate_applications(candidate_id, status);
create index candidate_applications_opportunity_idx on public.candidate_applications(opportunity_id, status);

create or replace function public.is_active_organisation_member(checked_organisation_id uuid, allowed_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.organisation_members
    where organisation_id = checked_organisation_id and profile_id = auth.uid() and status = 'active' and role = any(allowed_roles)
  )
$$;

alter table public.opportunities enable row level security;
alter table public.opportunity_college_access enable row level security;
alter table public.candidate_applications enable row level security;

create policy "candidates read published opportunities" on public.opportunities
  for select to authenticated using (
    status = 'published' and application_deadline > now()
    or public.is_active_organisation_member(organisation_id, array['company_hr', 'company_admin']::public.app_role[])
    or public.is_platform_admin()
  );
create policy "company teams create opportunities" on public.opportunities
  for insert to authenticated with check (
    created_by = auth.uid() and public.is_active_organisation_member(organisation_id, array['company_hr', 'company_admin']::public.app_role[])
  );
create policy "company teams update own opportunities" on public.opportunities
  for update to authenticated using (public.is_active_organisation_member(organisation_id, array['company_hr', 'company_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.is_active_organisation_member(organisation_id, array['company_hr', 'company_admin']::public.app_role[]) or public.is_platform_admin());
create policy "company teams manage college access" on public.opportunity_college_access
  for all to authenticated using (exists (
    select 1 from public.opportunities o where o.id = opportunity_id and public.is_active_organisation_member(o.organisation_id, array['company_hr', 'company_admin']::public.app_role[])
  )) with check (exists (
    select 1 from public.opportunities o where o.id = opportunity_id and public.is_active_organisation_member(o.organisation_id, array['company_hr', 'company_admin']::public.app_role[])
  ));
create policy "candidates create own applications" on public.candidate_applications
  for insert to authenticated with check (candidate_id = auth.uid());
create policy "candidates manage own draft applications" on public.candidate_applications
  for update to authenticated using (candidate_id = auth.uid() and status = 'draft') with check (candidate_id = auth.uid() and status = 'draft');
create policy "candidates read own applications" on public.candidate_applications
  for select to authenticated using (candidate_id = auth.uid());
create policy "company teams read applications to their opportunity" on public.candidate_applications
  for select to authenticated using (exists (
    select 1 from public.opportunities o where o.id = opportunity_id and public.is_active_organisation_member(o.organisation_id, array['company_hr', 'company_admin']::public.app_role[])
  ));
create policy "company teams review applications" on public.candidate_applications
  for update to authenticated using (exists (
    select 1 from public.opportunities o where o.id = opportunity_id and public.is_active_organisation_member(o.organisation_id, array['company_hr', 'company_admin']::public.app_role[])
  )) with check (reviewed_by = auth.uid());

create or replace function public.submit_candidate_application(opportunity_id uuid, submitted_cover_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  application_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and role in ('college_student', 'job_seeker')) then
    raise exception 'Only active college-student and job-seeker accounts can apply';
  end if;
  if not exists (select 1 from public.opportunities where id = opportunity_id and status = 'published' and application_deadline > now()) then
    raise exception 'This opportunity is not accepting applications';
  end if;

  insert into public.candidate_applications (opportunity_id, candidate_id, status, cover_note, submitted_at)
  values (opportunity_id, auth.uid(), 'submitted', nullif(trim(submitted_cover_note), ''), now())
  on conflict (opportunity_id, candidate_id) do update
    set status = case when public.candidate_applications.status = 'draft' then 'submitted'::public.candidate_application_status else public.candidate_applications.status end,
        cover_note = case when public.candidate_applications.status = 'draft' then excluded.cover_note else public.candidate_applications.cover_note end,
        submitted_at = case when public.candidate_applications.status = 'draft' then now() else public.candidate_applications.submitted_at end,
        updated_at = now()
  returning id into application_id;
  return application_id;
end;
$$;
revoke all on function public.submit_candidate_application(uuid, text) from public;
grant execute on function public.submit_candidate_application(uuid, text) to authenticated;
