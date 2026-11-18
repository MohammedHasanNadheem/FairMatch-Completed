-- Platform operations: auditable account, organisation and membership management.
-- Run after 005_placement_operations.sql.

create table public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 3 and 120),
  entity_type text not null check (char_length(entity_type) between 3 and 80),
  entity_id uuid,
  reason text check (char_length(reason) <= 1000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_events_created_at_idx on public.platform_audit_events(created_at desc);
alter table public.platform_audit_events enable row level security;
create policy "platform admins read platform audit events" on public.platform_audit_events
  for select to authenticated using (public.is_platform_admin());

-- A suspended account must lose organisation access immediately, even if its
-- historical membership is retained for a later audited reactivation.
create or replace function public.is_active_organisation_member(checked_organisation_id uuid, allowed_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.organisation_members m
    join public.profiles p on p.id = m.profile_id
    where m.organisation_id = checked_organisation_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and p.active
      and m.role = any(allowed_roles)
  )
$$;

create or replace function public.admin_set_account_status(
  target_profile_id uuid,
  should_be_active boolean,
  change_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target_profile public.profiles;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can change account status';
  end if;
  if target_profile_id = auth.uid() then
    raise exception 'You cannot suspend your own administrator account';
  end if;

  select * into target_profile from public.profiles where id = target_profile_id for update;
  if not found then raise exception 'Account not found'; end if;
  if target_profile.role = 'platform_admin' and not should_be_active and
    (select count(*) from public.profiles where role = 'platform_admin' and active) <= 1 then
    raise exception 'At least one active platform administrator must remain';
  end if;

  update public.profiles set active = should_be_active, updated_at = now() where id = target_profile_id;
  insert into public.platform_audit_events (actor_id, action, entity_type, entity_id, reason, metadata)
  values (auth.uid(), case when should_be_active then 'account_activated' else 'account_suspended' end, 'profile', target_profile_id, nullif(trim(change_reason), ''), jsonb_build_object('previous_active', target_profile.active));
end;
$$;

create or replace function public.admin_set_membership_status(
  target_organisation_id uuid,
  target_profile_id uuid,
  new_status public.organisation_member_status,
  change_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can change membership status';
  end if;
  update public.organisation_members set status = new_status
  where organisation_id = target_organisation_id and profile_id = target_profile_id;
  if not found then raise exception 'Organisation membership not found'; end if;
  insert into public.platform_audit_events (actor_id, action, entity_type, entity_id, reason, metadata)
  values (auth.uid(), 'membership_status_changed', 'organisation_membership', target_organisation_id, nullif(trim(change_reason), ''), jsonb_build_object('profile_id', target_profile_id, 'status', new_status));
end;
$$;

revoke all on function public.admin_set_account_status(uuid, boolean, text) from public;
grant execute on function public.admin_set_account_status(uuid, boolean, text) to authenticated;
revoke all on function public.admin_set_membership_status(uuid, uuid, public.organisation_member_status, text) from public;
grant execute on function public.admin_set_membership_status(uuid, uuid, public.organisation_member_status, text) to authenticated;
