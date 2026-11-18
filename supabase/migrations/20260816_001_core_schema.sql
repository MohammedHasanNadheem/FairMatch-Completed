create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'recruiter', 'placement_officer', 'platform_admin');
create type public.application_status as enum ('draft', 'submitted', 'shortlisted', 'interviewing', 'offered', 'rejected', 'withdrawn');

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete restrict,
  role public.app_role not null default 'student',
  full_name text not null check (char_length(full_name) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  register_number text not null,
  department text not null,
  graduation_year integer not null check (graduation_year between 2020 and 2100),
  cgpa numeric(3,2) check (cgpa between 0 and 10),
  current_arrears integer not null default 0 check (current_arrears >= 0),
  skills jsonb not null default '[]'::jsonb,
  unique (profile_id, register_number)
);

create table public.employers (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  website text,
  created_at timestamptz not null default now(),
  unique (institution_id, name)
);

create table public.drives (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  employer_id uuid not null references public.employers(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  role_title text not null check (char_length(role_title) between 2 and 120),
  location text not null,
  min_cgpa numeric(3,2) not null default 0 check (min_cgpa between 0 and 10),
  max_arrears integer not null default 0 check (max_arrears >= 0),
  application_deadline timestamptz not null,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  drive_id uuid not null references public.drives(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status public.application_status not null default 'submitted',
  resume_path text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (drive_id, student_id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_institution_id() returns uuid language sql stable security definer set search_path = public as $$ select institution_id from public.profiles where id = auth.uid() $$;
create or replace function public.has_app_role(required_role public.app_role) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.profiles where id = auth.uid() and active and (role = required_role or role = 'platform_admin')) $$;

alter table public.institutions enable row level security;
alter table public.profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.employers enable row level security;
alter table public.drives enable row level security;
alter table public.applications enable row level security;
alter table public.audit_events enable row level security;

create policy "institution members read their institution" on public.institutions for select to authenticated using (id = public.current_institution_id());
create policy "users read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "admins manage profiles" on public.profiles for all to authenticated using (institution_id = public.current_institution_id() and public.has_app_role('platform_admin')) with check (institution_id = public.current_institution_id() and public.has_app_role('platform_admin'));
create policy "students manage their own profile" on public.student_profiles for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "officers read student profiles" on public.student_profiles for select to authenticated using (public.has_app_role('placement_officer'));
create policy "members read employers" on public.employers for select to authenticated using (institution_id = public.current_institution_id());
create policy "officers manage employers" on public.employers for all to authenticated using (institution_id = public.current_institution_id() and public.has_app_role('placement_officer')) with check (institution_id = public.current_institution_id() and public.has_app_role('placement_officer'));
create policy "members read published drives" on public.drives for select to authenticated using (institution_id = public.current_institution_id() and (status = 'published' or public.has_app_role('placement_officer') or public.has_app_role('recruiter')));
create policy "recruiters and officers manage drives" on public.drives for all to authenticated using (institution_id = public.current_institution_id() and (public.has_app_role('recruiter') or public.has_app_role('placement_officer'))) with check (institution_id = public.current_institution_id() and (public.has_app_role('recruiter') or public.has_app_role('placement_officer')));
create policy "students read own applications" on public.applications for select to authenticated using (student_id = auth.uid());
create policy "students create own applications" on public.applications for insert to authenticated with check (student_id = auth.uid() and institution_id = public.current_institution_id());
create policy "officers review applications" on public.applications for all to authenticated using (institution_id = public.current_institution_id() and (public.has_app_role('placement_officer') or public.has_app_role('recruiter'))) with check (institution_id = public.current_institution_id() and (public.has_app_role('placement_officer') or public.has_app_role('recruiter')));
create policy "admins and officers read audit events" on public.audit_events for select to authenticated using (institution_id = public.current_institution_id() and (public.has_app_role('platform_admin') or public.has_app_role('placement_officer')));
