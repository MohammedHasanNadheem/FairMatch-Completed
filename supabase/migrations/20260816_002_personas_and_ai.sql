-- Fairmatch is multi-portal: this migration extends the initial college-placement
-- foundation before the first production deployment. It is safe to run after 001.

alter type public.app_role add value if not exists 'school_student';
alter type public.app_role add value if not exists 'college_student';
alter type public.app_role add value if not exists 'job_seeker';
alter type public.app_role add value if not exists 'college_coordinator';
alter type public.app_role add value if not exists 'college_admin';
alter type public.app_role add value if not exists 'company_hr';
alter type public.app_role add value if not exists 'company_admin';

create type public.career_stage as enum ('school', 'college', 'experienced');
create type public.organisation_kind as enum ('school', 'college', 'company');
create type public.organisation_member_status as enum ('invited', 'active', 'suspended');

-- Existing institution records remain for compatibility with the early placement schema.
-- Organisation membership is the production tenant boundary for every portal.
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  kind public.organisation_kind not null,
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles alter column institution_id drop not null;

create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  status public.organisation_member_status not null default 'invited',
  created_at timestamptz not null default now(),
  primary key (organisation_id, profile_id)
);

create table public.career_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  stage public.career_stage not null,
  headline text check (char_length(headline) <= 180),
  location text check (char_length(location) <= 120),
  preferences jsonb not null default '{}'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  experience jsonb not null default '[]'::jsonb,
  profile_visibility text not null default 'private' check (profile_visibility in ('private', 'shared_with_organisations', 'recruiter_searchable')),
  guardian_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stage <> 'school' or profile_visibility = 'private' or guardian_consent_at is not null)
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  context_type text not null check (context_type in ('career_guidance', 'opportunity_match', 'application_support', 'cohort_insight', 'recruiting_support')),
  title text check (char_length(title) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  author text not null check (author in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  safety_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_explanations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  resource_type text not null check (resource_type in ('career_path', 'opportunity', 'application', 'candidate', 'cohort')),
  resource_id uuid,
  recommendation text not null,
  evidence jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  limitations text not null,
  next_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.career_profiles enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_explanations enable row level security;

create policy "users read their organisation memberships" on public.organisation_members
  for select to authenticated using (profile_id = auth.uid());
create policy "users manage their career profile" on public.career_profiles
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "users manage their AI conversations" on public.ai_conversations
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "users read messages in their conversations" on public.ai_messages
  for select to authenticated using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.profile_id = auth.uid()));
create policy "users read their AI explanations" on public.ai_explanations
  for select to authenticated using (profile_id = auth.uid());

-- Insertions for AI messages/explanations are intentionally service-role only.
-- The Node API checks the authenticated user, role, tenant scope and rate limit first.
