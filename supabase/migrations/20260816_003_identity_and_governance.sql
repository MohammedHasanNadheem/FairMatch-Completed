-- Identity, onboarding and a single approval queue for every Fairmatch role.
-- Run only after 001_core_schema.sql and 002_personas_and_ai.sql.

create type public.access_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

alter table public.profiles alter column role set default 'job_seeker';

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_role public.app_role not null,
  organisation_name text check (char_length(organisation_name) between 2 and 160),
  organisation_kind public.organisation_kind,
  note text check (char_length(note) <= 1000),
  status public.access_request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((requested_role in ('company_hr', 'company_admin') and organisation_kind = 'company')
      or (requested_role in ('college_coordinator', 'college_admin') and organisation_kind = 'college')
      or (requested_role = 'school_student' and organisation_kind is null)
      or (requested_role in ('college_student', 'job_seeker') and organisation_kind is null))
);

create unique index access_requests_one_open_request_per_role
  on public.access_requests(profile_id, requested_role)
  where status = 'pending';

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role = 'platform_admin'
  )
$$;

-- Auth users receive a private candidate account. Elevated access is only made
-- effective by an administrator's approval action.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  selected_stage public.career_stage;
begin
  selected_stage := case coalesce(new.raw_user_meta_data ->> 'candidate_stage', 'experienced')
    when 'school' then 'school'::public.career_stage
    when 'college' then 'college'::public.career_stage
    else 'experienced'::public.career_stage
  end;

  insert into public.profiles (id, institution_id, role, full_name)
  values (
    new.id,
    null,
    case when selected_stage = 'school' then 'school_student'::public.app_role
         when selected_stage = 'college' then 'college_student'::public.app_role
         else 'job_seeker'::public.app_role end,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1))
  ) on conflict (id) do nothing;

  insert into public.career_profiles (profile_id, stage)
  values (new.id, selected_stage) on conflict (profile_id) do nothing;

  if coalesce(new.raw_user_meta_data ->> 'requested_role', '') in ('college_coordinator', 'college_admin', 'company_hr', 'company_admin') then
    insert into public.access_requests (profile_id, requested_role, organisation_name, organisation_kind)
    values (
      new.id,
      (new.raw_user_meta_data ->> 'requested_role')::public.app_role,
      nullif(trim(new.raw_user_meta_data ->> 'organisation_name'), ''),
      case when new.raw_user_meta_data ->> 'requested_role' in ('company_hr', 'company_admin') then 'company'::public.organisation_kind else 'college'::public.organisation_kind end
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_auth_user();

-- Remove the legacy duplicate policies so that each table has one deliberate rule set.
drop policy if exists "institution members read their institution" on public.institutions;
drop policy if exists "members see their institution" on public.institutions;
drop policy if exists "users read own profile" on public.profiles;
drop policy if exists "users see own profile" on public.profiles;
drop policy if exists "admins manage profiles" on public.profiles;
drop policy if exists "students manage their own profile" on public.student_profiles;
drop policy if exists "student owns profile" on public.student_profiles;
drop policy if exists "officers read student profiles" on public.student_profiles;
drop policy if exists "officer reads students" on public.student_profiles;
drop policy if exists "members read employers" on public.employers;
drop policy if exists "members see employers" on public.employers;
drop policy if exists "officers manage employers" on public.employers;
drop policy if exists "members read published drives" on public.drives;
drop policy if exists "members see drives" on public.drives;
drop policy if exists "recruiters and officers manage drives" on public.drives;
drop policy if exists "staff manage drives" on public.drives;
drop policy if exists "students read own applications" on public.applications;
drop policy if exists "students see own applications" on public.applications;
drop policy if exists "students create own applications" on public.applications;
drop policy if exists "staff review applications" on public.applications;
drop policy if exists "officers review applications" on public.applications;
drop policy if exists "admins and officers read audit events" on public.audit_events;
drop policy if exists "authorized audit read" on public.audit_events;

alter table public.access_requests enable row level security;
drop policy if exists "users manage their career profile" on public.career_profiles;

create policy "users read their profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_platform_admin());
create policy "platform admins manage profiles" on public.profiles
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "users manage candidate profile" on public.career_profiles
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "users create access requests" on public.access_requests
  for insert to authenticated with check (profile_id = auth.uid() and status = 'pending');
create policy "users read own access requests" on public.access_requests
  for select to authenticated using (profile_id = auth.uid() or public.is_platform_admin());
create policy "platform admins review access requests" on public.access_requests
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage organisations" on public.organisations
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "members read organisations" on public.organisations
  for select to authenticated using (public.is_platform_admin() or exists (
    select 1 from public.organisation_members m where m.organisation_id = id and m.profile_id = auth.uid() and m.status = 'active'
  ));
create policy "platform admins manage memberships" on public.organisation_members
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.review_access_request(
  request_id uuid,
  decision public.access_request_status,
  reviewer_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  access_request public.access_requests;
  organisation_id uuid;
  generated_slug text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can review access requests';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'Only approved or rejected decisions are allowed';
  end if;

  select * into access_request from public.access_requests where id = request_id for update;
  if not found or access_request.status <> 'pending' then
    raise exception 'This access request is not pending';
  end if;

  if decision = 'approved' then
    if access_request.organisation_kind is not null then
      generated_slug := lower(regexp_replace(coalesce(access_request.organisation_name, 'organisation'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(access_request.id::text, 1, 8);
      insert into public.organisations (name, kind, slug, verified)
      values (access_request.organisation_name, access_request.organisation_kind, generated_slug, true)
      on conflict (slug) do update set name = excluded.name
      returning id into organisation_id;
      insert into public.organisation_members (organisation_id, profile_id, role, status)
      values (organisation_id, access_request.profile_id, access_request.requested_role, 'active')
      on conflict (organisation_id, profile_id) do update set role = excluded.role, status = 'active';
    end if;
    update public.profiles set role = access_request.requested_role where id = access_request.profile_id;
  end if;

  update public.access_requests
  set status = decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = reviewer_note, updated_at = now()
  where id = access_request.id;
end;
$$;

-- The initial platform administrator is intentionally a deployment-time action:
-- update public.profiles set role = 'platform_admin' where id = '<first-auth-user-uuid>';
