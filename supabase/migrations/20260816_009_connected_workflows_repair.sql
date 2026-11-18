-- Safe repair for 008. Use this file once if the first 008 run stopped at
-- the record-variable error. It is safe whether 008 was rolled back or partial.

create table if not exists public.application_workflow_events (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.candidate_applications(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('submitted','shortlisted','rejected','interview_scheduled','offer_issued','offer_accepted','offer_declined')),
  reason text check (char_length(reason) <= 2000), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists application_workflow_events_application_idx on public.application_workflow_events(application_id, created_at desc);
create table if not exists public.cohort_join_codes (
  id uuid primary key default gen_random_uuid(), cohort_id uuid not null references public.placement_cohorts(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z2-9]{8,16}$'), expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses between 1 and 100000), uses_count integer not null default 0 check (uses_count >= 0),
  active boolean not null default true, created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now()
);
create index if not exists cohort_join_codes_cohort_idx on public.cohort_join_codes(cohort_id) where active;
alter table public.application_workflow_events enable row level security;
alter table public.cohort_join_codes enable row level security;

drop policy if exists "workflow participants read application history" on public.application_workflow_events;
create policy "workflow participants read application history" on public.application_workflow_events for select to authenticated using (
  exists (select 1 from public.candidate_applications a where a.id = application_id and a.candidate_id = auth.uid())
  or exists (select 1 from public.candidate_applications a join public.opportunities o on o.id = a.opportunity_id where a.id = application_id and public.is_active_organisation_member(o.organisation_id, array['company_hr','company_admin']::public.app_role[]))
  or public.is_platform_admin()
);
drop policy if exists "college teams manage cohort join codes" on public.cohort_join_codes;
create policy "college teams manage cohort join codes" on public.cohort_join_codes for all to authenticated using (
  exists (select 1 from public.placement_cohorts c where c.id = cohort_id and public.is_active_organisation_member(c.organisation_id, array['college_coordinator','college_admin']::public.app_role[])) or public.is_platform_admin()
) with check (
  exists (select 1 from public.placement_cohorts c where c.id = cohort_id and public.is_active_organisation_member(c.organisation_id, array['college_coordinator','college_admin']::public.app_role[])) or public.is_platform_admin()
);
drop policy if exists "company teams read applicants profiles" on public.profiles;
create policy "company teams read applicants profiles" on public.profiles for select to authenticated using (
  exists (select 1 from public.candidate_applications a join public.opportunities o on o.id = a.opportunity_id where a.candidate_id = profiles.id and public.is_active_organisation_member(o.organisation_id, array['company_hr','company_admin']::public.app_role[]))
);
drop policy if exists "company teams read applicants career profiles" on public.career_profiles;
create policy "company teams read applicants career profiles" on public.career_profiles for select to authenticated using (
  exists (select 1 from public.candidate_applications a join public.opportunities o on o.id = a.opportunity_id where a.candidate_id = career_profiles.profile_id and public.is_active_organisation_member(o.organisation_id, array['company_hr','company_admin']::public.app_role[]))
);

create or replace function public.review_candidate_application(target_application_id uuid, next_status public.candidate_application_status, decision_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare target_application public.candidate_applications; opportunity_title text;
begin
  select a.* into target_application from public.candidate_applications a join public.opportunities o on o.id = a.opportunity_id where a.id = target_application_id and public.is_active_organisation_member(o.organisation_id, array['company_hr','company_admin']::public.app_role[]) for update of a;
  if not found then raise exception 'Application not found or you do not have permission to review it'; end if;
  select title into opportunity_title from public.opportunities where id = target_application.opportunity_id;
  if not ((target_application.status = 'submitted' and next_status in ('shortlisted','rejected')) or (target_application.status in ('shortlisted','interviewing') and next_status = 'rejected')) then raise exception 'This application cannot move from % to %', target_application.status, next_status; end if;
  update public.candidate_applications set status = next_status, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = target_application_id;
  insert into public.application_workflow_events (application_id, actor_id, event_type, reason) values (target_application_id, auth.uid(), next_status::text, nullif(trim(decision_reason), ''));
  insert into public.notifications (profile_id, kind, title, body, link) values (target_application.candidate_id, 'application', 'Application update', case when next_status = 'shortlisted' then coalesce(opportunity_title, 'Your application') || ' has been shortlisted.' else coalesce(opportunity_title, 'Your application') || ' has been updated.' end, '#applications');
end;
$$;

create or replace function public.schedule_candidate_interview(target_application_id uuid, starts_at_value timestamptz, ends_at_value timestamptz, interview_mode text, meeting_location_or_link text, interview_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare interview_id uuid; target_application public.candidate_applications; opportunity_title text;
begin
  if interview_mode not in ('in_person','video','phone') then raise exception 'Invalid interview mode'; end if;
  if ends_at_value <= starts_at_value then raise exception 'Interview end must be after the start'; end if;
  select a.* into target_application from public.candidate_applications a join public.opportunities o on o.id = a.opportunity_id where a.id = target_application_id and public.is_active_organisation_member(o.organisation_id, array['company_hr','company_admin']::public.app_role[]) for update of a;
  if not found then raise exception 'Application not found or you do not have permission to schedule it'; end if;
  select title into opportunity_title from public.opportunities where id = target_application.opportunity_id;
  if target_application.status not in ('shortlisted','interviewing') then raise exception 'Only shortlisted candidates can be scheduled for interview'; end if;
  insert into public.interviews (application_id, scheduled_by, starts_at, ends_at, mode, location_or_link, notes) values (target_application_id, auth.uid(), starts_at_value, ends_at_value, interview_mode, meeting_location_or_link, nullif(trim(interview_note), '')) returning id into interview_id;
  update public.candidate_applications set status = 'interviewing', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = target_application_id;
  insert into public.application_workflow_events (application_id, actor_id, event_type, reason, metadata) values (target_application_id, auth.uid(), 'interview_scheduled', nullif(trim(interview_note), ''), jsonb_build_object('interview_id', interview_id, 'starts_at', starts_at_value, 'mode', interview_mode));
  insert into public.notifications (profile_id, kind, title, body, link) values (target_application.candidate_id, 'interview', 'Interview scheduled', coalesce(opportunity_title, 'Your application') || ' has an interview scheduled for ' || to_char(starts_at_value, 'DD Mon YYYY HH24:MI'), '#applications');
  return interview_id;
end;
$$;

create or replace function public.issue_candidate_offer(target_application_id uuid, offer_title text, offer_compensation text default null, offer_joining_date date default null, offer_expires_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare offer_id uuid; target_application public.candidate_applications; opportunity_title text;
begin
  select a.* into target_application from public.candidate_applications a join public.opportunities o on o.id = a.opportunity_id where a.id = target_application_id and public.is_active_organisation_member(o.organisation_id, array['company_hr','company_admin']::public.app_role[]) for update of a;
  if not found then raise exception 'Application not found or you do not have permission to issue an offer'; end if;
  select title into opportunity_title from public.opportunities where id = target_application.opportunity_id;
  if target_application.status not in ('shortlisted','interviewing') then raise exception 'Offers require a shortlisted or interviewing candidate'; end if;
  if char_length(trim(offer_title)) < 2 then raise exception 'Offer title is required'; end if;
  insert into public.offers (application_id, issued_by, title, compensation_text, joining_date, expires_at, status) values (target_application_id, auth.uid(), trim(offer_title), nullif(trim(offer_compensation), ''), offer_joining_date, offer_expires_at, 'issued') on conflict (application_id) do update set issued_by = excluded.issued_by, title = excluded.title, compensation_text = excluded.compensation_text, joining_date = excluded.joining_date, expires_at = excluded.expires_at, status = 'issued', updated_at = now() returning id into offer_id;
  update public.candidate_applications set status = 'offered', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = target_application_id;
  insert into public.application_workflow_events (application_id, actor_id, event_type, metadata) values (target_application_id, auth.uid(), 'offer_issued', jsonb_build_object('offer_id', offer_id));
  insert into public.notifications (profile_id, kind, title, body, link) values (target_application.candidate_id, 'offer', 'New offer issued', coalesce(opportunity_title, 'A role') || ' has issued an offer. Review it in your FairMatch workspace.', '#applications');
  return offer_id;
end;
$$;

create or replace function public.join_cohort_with_code(join_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare matching_code public.cohort_join_codes;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and role = 'college_student') then raise exception 'Only active college-student accounts can join a placement cohort'; end if;
  select * into matching_code from public.cohort_join_codes where code = upper(trim(join_code)) and active for update;
  if not found then raise exception 'That cohort code is invalid or no longer active'; end if;
  if matching_code.expires_at is not null and matching_code.expires_at <= now() then raise exception 'That cohort code has expired'; end if;
  if matching_code.max_uses is not null and matching_code.uses_count >= matching_code.max_uses then raise exception 'That cohort code has reached its usage limit'; end if;
  if exists (select 1 from public.cohort_memberships where cohort_id = matching_code.cohort_id and candidate_id = auth.uid()) then return matching_code.cohort_id; end if;
  insert into public.cohort_memberships (cohort_id, candidate_id) values (matching_code.cohort_id, auth.uid());
  update public.cohort_join_codes set uses_count = uses_count + 1 where id = matching_code.id;
  insert into public.notifications (profile_id, kind, title, body, link) values (auth.uid(), 'system', 'Cohort joined', 'You have joined your college placement cohort.', '#profile');
  return matching_code.cohort_id;
end;
$$;

revoke all on function public.review_candidate_application(uuid, public.candidate_application_status, text) from public;
grant execute on function public.review_candidate_application(uuid, public.candidate_application_status, text) to authenticated;
revoke all on function public.schedule_candidate_interview(uuid, timestamptz, timestamptz, text, text, text) from public;
grant execute on function public.schedule_candidate_interview(uuid, timestamptz, timestamptz, text, text, text) to authenticated;
revoke all on function public.issue_candidate_offer(uuid, text, text, date, timestamptz) from public;
grant execute on function public.issue_candidate_offer(uuid, text, text, date, timestamptz) to authenticated;
revoke all on function public.join_cohort_with_code(text) from public;
grant execute on function public.join_cohort_with_code(text) to authenticated;
