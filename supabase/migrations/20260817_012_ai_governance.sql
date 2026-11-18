-- FairMatch AI governance: durable rate limits and user-owned, explainable transcripts.
-- Safe to run once after migration 011.

alter table public.ai_conversations drop constraint if exists ai_conversations_context_type_check;
alter table public.ai_conversations add constraint ai_conversations_context_type_check
  check (context_type in ('career_guidance', 'opportunity_match', 'application_support', 'cohort_insight', 'recruiting_support', 'platform_operations'));

alter table public.ai_explanations drop constraint if exists ai_explanations_resource_type_check;
alter table public.ai_explanations add constraint ai_explanations_resource_type_check
  check (resource_type in ('career_path', 'opportunity', 'application', 'candidate', 'cohort', 'platform'));

create table if not exists public.ai_request_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  context_type text not null check (context_type in ('career_guidance', 'opportunity_match', 'application_support', 'cohort_insight', 'recruiting_support', 'platform_operations')),
  created_at timestamptz not null default now()
);

create index if not exists ai_request_events_profile_created_idx
  on public.ai_request_events (profile_id, created_at desc);

alter table public.ai_request_events enable row level security;

drop policy if exists "platform admins read AI request events" on public.ai_request_events;
create policy "platform admins read AI request events" on public.ai_request_events
  for select to authenticated using (public.has_app_role('platform_admin'));

create or replace function public.ai_context_allowed(request_context text, request_role public.app_role)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when request_context in ('career_guidance', 'opportunity_match', 'application_support')
      then request_role in ('school_student', 'college_student', 'job_seeker')
    when request_context = 'cohort_insight'
      then request_role in ('college_coordinator', 'college_admin')
    when request_context = 'recruiting_support'
      then request_role in ('company_hr', 'company_admin')
    when request_context = 'platform_operations'
      then request_role = 'platform_admin'
    else false
  end;
$$;

create or replace function public.authorise_ai_request(request_context text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_profile_id uuid := auth.uid();
  request_role public.app_role;
  minute_count integer;
  day_count integer;
begin
  if request_profile_id is null then
    raise exception 'Authentication required';
  end if;

  select role into request_role
  from public.profiles
  where id = request_profile_id and active = true;

  if request_role is null or not public.ai_context_allowed(request_context, request_role) then
    raise exception 'AI context is not available for this role';
  end if;

  select count(*) into minute_count
  from public.ai_request_events
  where profile_id = request_profile_id and created_at >= now() - interval '1 minute';

  select count(*) into day_count
  from public.ai_request_events
  where profile_id = request_profile_id and created_at >= now() - interval '1 day';

  if minute_count >= 8 or day_count >= 100 then
    return jsonb_build_object('allowed', false, 'minute_count', minute_count, 'day_count', day_count);
  end if;

  insert into public.ai_request_events (profile_id, context_type)
  values (request_profile_id, request_context);

  return jsonb_build_object('allowed', true, 'minute_remaining', 7 - minute_count, 'day_remaining', 99 - day_count);
end;
$$;

create or replace function public.save_ai_exchange(
  request_context text,
  user_content text,
  assistant_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_profile_id uuid := auth.uid();
  request_role public.app_role;
  conversation_id uuid;
  resource_kind text;
begin
  if request_profile_id is null then
    raise exception 'Authentication required';
  end if;

  select role into request_role
  from public.profiles
  where id = request_profile_id and active = true;

  if request_role is null or not public.ai_context_allowed(request_context, request_role) then
    raise exception 'AI context is not available for this role';
  end if;

  if char_length(trim(user_content)) not between 1 and 4000 then
    raise exception 'Invalid user content';
  end if;

  if coalesce(char_length(assistant_payload ->> 'answer'), 0) not between 1 and 5000 then
    raise exception 'Invalid assistant payload';
  end if;

  insert into public.ai_conversations (profile_id, context_type, title)
  values (request_profile_id, request_context, left(trim(user_content), 120))
  returning id into conversation_id;

  insert into public.ai_messages (conversation_id, author, content, safety_metadata)
  values
    (conversation_id, 'user', trim(user_content), jsonb_build_object('identifiers_minimised', true)),
    (conversation_id, 'assistant', assistant_payload ->> 'answer', jsonb_build_object('structured_output_validated', true));

  resource_kind := case request_context
    when 'career_guidance' then 'career_path'
    when 'opportunity_match' then 'opportunity'
    when 'application_support' then 'application'
    when 'cohort_insight' then 'cohort'
    when 'recruiting_support' then 'candidate'
    else 'platform'
  end;

  insert into public.ai_explanations (
    conversation_id,
    profile_id,
    resource_type,
    recommendation,
    evidence,
    gaps,
    confidence,
    limitations,
    next_actions
  ) values (
    conversation_id,
    request_profile_id,
    resource_kind,
    assistant_payload ->> 'answer',
    coalesce(assistant_payload -> 'whyShown', '[]'::jsonb),
    coalesce(assistant_payload -> 'gaps', '[]'::jsonb),
    coalesce(assistant_payload ->> 'confidence', 'low'),
    coalesce(assistant_payload ->> 'limitations', 'AI guidance requires human review.'),
    coalesce(assistant_payload -> 'nextActions', '[]'::jsonb)
  );

  return conversation_id;
end;
$$;

revoke all on function public.ai_context_allowed(text, public.app_role) from public;
grant execute on function public.ai_context_allowed(text, public.app_role) to authenticated;
revoke all on function public.authorise_ai_request(text) from public;
grant execute on function public.authorise_ai_request(text) to authenticated;
revoke all on function public.save_ai_exchange(text, text, jsonb) from public;
grant execute on function public.save_ai_exchange(text, text, jsonb) to authenticated;
