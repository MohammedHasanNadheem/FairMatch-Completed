-- Account privacy rights and administrator fulfilment workflow. Apply after 016.

create type public.privacy_request_kind as enum ('data_export', 'correction', 'account_deletion', 'consent_withdrawal');
create type public.privacy_request_status as enum ('submitted', 'in_progress', 'completed', 'rejected', 'cancelled');

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind public.privacy_request_kind not null,
  status public.privacy_request_status not null default 'submitted',
  due_at timestamptz not null default (now() + interval '30 days'),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create unique index privacy_requests_one_open_kind
  on public.privacy_requests(profile_id, kind)
  where status in ('submitted', 'in_progress');
create index privacy_requests_admin_queue
  on public.privacy_requests(status, due_at);

alter table public.privacy_requests enable row level security;
grant select on public.privacy_requests to authenticated;

create policy "users read own privacy requests" on public.privacy_requests
  for select to authenticated using (profile_id = auth.uid() or public.is_platform_admin());
create policy "platform admins review privacy requests" on public.privacy_requests
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.submit_privacy_request(request_kind public.privacy_request_kind)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.privacy_requests(profile_id, kind)
  values (auth.uid(), request_kind)
  returning id into request_id;
  insert into public.notifications(profile_id, kind, title, body, link)
  values (auth.uid(), 'system', 'Privacy request received', 'Your ' || replace(request_kind::text, '_', ' ') || ' request is recorded and due for review by ' || to_char(now() + interval '30 days', 'DD Mon YYYY') || '.', '#account');
  return request_id;
exception when unique_violation then
  raise exception 'An open request of this type already exists';
end;
$$;

create or replace function public.review_privacy_request(target_request_id uuid, next_status public.privacy_request_status, reviewer_note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare selected_request public.privacy_requests;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
  if next_status not in ('in_progress', 'completed', 'rejected') then raise exception 'Invalid privacy request decision'; end if;
  select * into selected_request from public.privacy_requests where id = target_request_id for update;
  if not found or selected_request.status not in ('submitted', 'in_progress') then raise exception 'Open privacy request not found'; end if;
  update public.privacy_requests set status = next_status, reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = nullif(trim(reviewer_note), ''), completed_at = case when next_status = 'completed' then now() else null end, updated_at = now()
    where id = selected_request.id;
  insert into public.notifications(profile_id, kind, title, body, link)
  values (selected_request.profile_id, 'system', 'Privacy request updated', 'Your ' || replace(selected_request.kind::text, '_', ' ') || ' request is now ' || replace(next_status::text, '_', ' ') || '.', '#account');
end;
$$;

revoke all on function public.submit_privacy_request(public.privacy_request_kind) from public;
grant execute on function public.submit_privacy_request(public.privacy_request_kind) to authenticated;
revoke all on function public.review_privacy_request(uuid, public.privacy_request_status, text) from public;
grant execute on function public.review_privacy_request(uuid, public.privacy_request_status, text) to authenticated;
