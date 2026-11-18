-- Secure skills evidence and assessment engine. Apply after migration 013.

create type public.assessment_attempt_status as enum ('in_progress', 'completed', 'expired');
create type public.skill_evidence_type as enum ('assessment', 'project', 'certificate', 'work_sample', 'experience');
create type public.skill_evidence_status as enum ('self_declared', 'verified', 'rejected');

create table public.skill_assessments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 3 and 160),
  description text not null check (char_length(description) between 20 and 1200),
  skill_family text not null check (char_length(skill_family) between 2 and 100),
  audience public.app_role[] not null,
  duration_minutes integer not null check (duration_minutes between 5 and 180),
  passing_score integer not null check (passing_score between 1 and 100),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.skill_assessments(id) on delete cascade,
  position integer not null check (position between 1 and 500),
  prompt text not null check (char_length(prompt) between 10 and 2000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  correct_option integer not null check (correct_option between 0 and 7),
  explanation text not null check (char_length(explanation) between 10 and 2000),
  skill_tag text not null check (char_length(skill_tag) between 2 and 100),
  unique (assessment_id, position),
  check (correct_option < jsonb_array_length(options))
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.skill_assessments(id) on delete cascade,
  status public.assessment_attempt_status not null default 'in_progress',
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  score numeric(5,2) check (score between 0 and 100),
  passed boolean,
  result_breakdown jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (profile_id, assessment_id, started_at)
);

create table public.candidate_skill_evidence (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  skill_name text not null check (char_length(skill_name) between 2 and 100),
  title text not null check (char_length(title) between 3 and 180),
  evidence_type public.skill_evidence_type not null,
  description text check (char_length(description) <= 2000),
  evidence_url text check (evidence_url is null or (evidence_url ~ '^https://[^[:space:]]+$' and char_length(evidence_url) <= 1000)),
  verification_status public.skill_evidence_status not null default 'self_declared',
  source_attempt_id uuid unique references public.assessment_attempts(id) on delete set null,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assessment_attempts_profile_idx on public.assessment_attempts(profile_id, started_at desc);
create index candidate_skill_evidence_profile_idx on public.candidate_skill_evidence(profile_id, created_at desc);

alter table public.skill_assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.candidate_skill_evidence enable row level security;

grant select on public.skill_assessments, public.assessment_attempts, public.candidate_skill_evidence to authenticated;
grant insert, update, delete on public.candidate_skill_evidence to authenticated;
-- assessment_questions deliberately has no client table grant; questions are returned by a controlled RPC without answer keys.
revoke all on public.assessment_questions from anon, authenticated;

create policy "eligible users read published assessments" on public.skill_assessments
  for select to authenticated using (
    public.is_platform_admin() or (published and (select role from public.profiles where id = auth.uid()) = any(audience))
  );
create policy "users read own assessment attempts" on public.assessment_attempts
  for select to authenticated using (profile_id = auth.uid() or public.is_platform_admin());
create policy "users manage self-declared evidence" on public.candidate_skill_evidence
  for all to authenticated using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and verification_status = 'self_declared' and source_attempt_id is null and verified_by is null and verified_at is null);
create policy "authorised hiring teams read candidate evidence" on public.candidate_skill_evidence
  for select to authenticated using (exists (
    select 1 from public.candidate_applications application
    join public.opportunities opportunity on opportunity.id = application.opportunity_id
    where application.candidate_id = candidate_skill_evidence.profile_id
      and public.is_active_organisation_member(opportunity.organisation_id, array['company_hr', 'company_admin']::public.app_role[])
  ));

create or replace function public.start_skill_assessment(target_assessment_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  selected_assessment public.skill_assessments;
  attempt_id uuid;
  questions jsonb;
  user_role public.app_role;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into user_role from public.profiles where id = auth.uid() and active;
  select * into selected_assessment from public.skill_assessments
    where id = target_assessment_id and published and user_role = any(audience);
  if not found then raise exception 'Assessment is unavailable for this account'; end if;
  if (select count(*) from public.assessment_attempts where profile_id = auth.uid() and assessment_id = target_assessment_id and started_at > now() - interval '30 days') >= 3 then
    raise exception 'Retake limit reached. Try again after the 30-day window';
  end if;
  update public.assessment_attempts set status = 'expired'
    where profile_id = auth.uid() and assessment_id = target_assessment_id and status = 'in_progress';
  insert into public.assessment_attempts(profile_id, assessment_id) values (auth.uid(), target_assessment_id) returning id into attempt_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'position', position, 'prompt', prompt, 'options', options, 'skillTag', skill_tag) order by position), '[]'::jsonb)
    into questions from public.assessment_questions where assessment_id = target_assessment_id;
  return jsonb_build_object('attemptId', attempt_id, 'title', selected_assessment.title, 'durationMinutes', selected_assessment.duration_minutes, 'startedAt', now(), 'questions', questions);
end;
$$;

create or replace function public.submit_skill_assessment(target_attempt_id uuid, submitted_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  selected_attempt public.assessment_attempts;
  selected_assessment public.skill_assessments;
  question record;
  total_questions integer := 0;
  correct_answers integer := 0;
  answer_value integer;
  calculated_score numeric(5,2);
  breakdown jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(submitted_answers) <> 'object' then raise exception 'Answers must be an object'; end if;
  select * into selected_attempt from public.assessment_attempts where id = target_attempt_id and profile_id = auth.uid() for update;
  if not found or selected_attempt.status <> 'in_progress' then raise exception 'Active assessment attempt not found'; end if;
  select * into selected_assessment from public.skill_assessments where id = selected_attempt.assessment_id;
  if now() > selected_attempt.started_at + make_interval(mins => selected_assessment.duration_minutes + 5) then
    update public.assessment_attempts set status = 'expired', completed_at = now() where id = selected_attempt.id;
    raise exception 'Assessment time expired';
  end if;
  for question in select * from public.assessment_questions where assessment_id = selected_attempt.assessment_id order by position loop
    total_questions := total_questions + 1;
    if submitted_answers ? question.id::text and (submitted_answers ->> question.id::text) ~ '^[0-7]$' then
      answer_value := (submitted_answers ->> question.id::text)::integer;
    else
      answer_value := -1;
    end if;
    if answer_value = question.correct_option then correct_answers := correct_answers + 1; end if;
    breakdown := breakdown || jsonb_build_array(jsonb_build_object('questionId', question.id, 'skillTag', question.skill_tag, 'correct', answer_value = question.correct_option, 'explanation', question.explanation));
  end loop;
  if total_questions = 0 then raise exception 'Assessment has no questions'; end if;
  calculated_score := round((correct_answers::numeric / total_questions::numeric) * 100, 2);
  update public.assessment_attempts set status = 'completed', answers = submitted_answers, score = calculated_score,
    passed = calculated_score >= selected_assessment.passing_score, result_breakdown = breakdown, completed_at = now()
    where id = selected_attempt.id;
  if calculated_score >= selected_assessment.passing_score then
    insert into public.candidate_skill_evidence(profile_id, skill_name, title, evidence_type, description, verification_status, source_attempt_id, verified_at)
    values (auth.uid(), selected_assessment.skill_family, selected_assessment.title, 'assessment', 'Platform-scored assessment completed at ' || calculated_score || '%.', 'verified', selected_attempt.id, now())
    on conflict (source_attempt_id) do nothing;
  end if;
  return jsonb_build_object('score', calculated_score, 'passed', calculated_score >= selected_assessment.passing_score, 'passingScore', selected_assessment.passing_score, 'breakdown', breakdown);
end;
$$;

revoke all on function public.start_skill_assessment(uuid) from public;
grant execute on function public.start_skill_assessment(uuid) to authenticated;
revoke all on function public.submit_skill_assessment(uuid, jsonb) from public;
grant execute on function public.submit_skill_assessment(uuid, jsonb) to authenticated;

insert into public.skill_assessments(id, slug, title, description, skill_family, audience, duration_minutes, passing_score, published) values
  ('a1000000-0000-4000-8000-000000000001', 'digital-work-foundations', 'Digital work foundations', 'Measures practical digital judgement, information handling and safe workplace collaboration.', 'Digital fluency', array['school_student','college_student','job_seeker']::public.app_role[], 15, 70, true),
  ('a1000000-0000-4000-8000-000000000002', 'employability-reasoning', 'Employability reasoning', 'Measures evidence-based prioritisation, communication judgement and accountable workplace decisions.', 'Professional reasoning', array['college_student','job_seeker']::public.app_role[], 15, 70, true)
on conflict (id) do nothing;

insert into public.assessment_questions(assessment_id, position, prompt, options, correct_option, explanation, skill_tag) values
  ('a1000000-0000-4000-8000-000000000001', 1, 'You receive a spreadsheet containing personal student data. What is the safest first action?', '["Upload it to a public drive", "Confirm access permissions and the intended recipients", "Forward it to your personal email", "Copy all rows into a chat tool"]', 1, 'Access and purpose should be verified before personal data is moved or shared.', 'Data responsibility'),
  ('a1000000-0000-4000-8000-000000000001', 2, 'A web source makes an important claim without naming its evidence. What should you do?', '["Repeat it because it looks professional", "Check an independent primary or authoritative source", "Use only the headline", "Assume the newest result is correct"]', 1, 'Important claims should be checked against relevant primary or authoritative evidence.', 'Information literacy'),
  ('a1000000-0000-4000-8000-000000000001', 3, 'A shared document has conflicting edits. Which response best preserves accountable collaboration?', '["Delete the other edits", "Create another unrelated copy", "Review version history and resolve the conflict with the contributor", "Lock everyone out permanently"]', 2, 'Version history plus direct resolution preserves both evidence and collaboration.', 'Collaboration'),
  ('a1000000-0000-4000-8000-000000000002', 1, 'Two urgent tasks have the same deadline. What is the strongest next step?', '["Work on whichever arrived last", "Compare impact, dependencies and effort, then confirm priorities", "Ignore both until reminded", "Choose the easiest without telling anyone"]', 1, 'Transparent prioritisation uses impact, dependencies and effort and confirms assumptions.', 'Prioritisation'),
  ('a1000000-0000-4000-8000-000000000002', 2, 'You discover an error in work already sent to a client. What should you do first?', '["Hide it if it may go unnoticed", "Notify the owner with the impact and a correction plan", "Delete the evidence", "Wait for the client to complain"]', 1, 'Early disclosure with impact and remediation supports accountable decision-making.', 'Accountability'),
  ('a1000000-0000-4000-8000-000000000002', 3, 'A job requirement is unclear. Which application approach is most credible?', '["Claim every possible skill", "Map your evidence to the stated requirements and identify genuine gaps", "Copy another candidate profile", "Avoid all specific examples"]', 1, 'Credible applications connect verifiable evidence to requirements and acknowledge gaps.', 'Evidence communication')
on conflict (assessment_id, position) do nothing;
