-- Individual AI access, monthly metering and Stripe-ready subscription state.
-- Apply after 017. Stripe webhooks are the only production writer of paid state.

create table public.ai_access_plans (
  code text primary key check (code ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null check (char_length(description) between 10 and 500),
  monthly_ai_requests integer not null check (monthly_ai_requests between 1 and 100000),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_access_plans(code, name, description, monthly_ai_requests, features) values
  ('free', 'FairMatch Free', 'Essential explainable career guidance for every verified account.', 30, '{"guidedPlans":3,"advancedApplicationSupport":false,"priorityGeneration":false}'::jsonb),
  ('career-pro', 'Career Pro', 'Higher monthly AI usage with advanced application and interview workspaces.', 300, '{"guidedPlans":50,"advancedApplicationSupport":true,"priorityGeneration":true}'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_ai_requests = excluded.monthly_ai_requests,
  features = excluded.features,
  active = true,
  updated_at = now();

create table public.profile_ai_subscriptions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  plan_code text not null references public.ai_access_plans(code) on delete restrict,
  status public.subscription_status not null default 'trialing',
  provider text not null default 'stripe' check (provider in ('stripe', 'manual')),
  provider_customer_id text unique check (provider_customer_id is null or char_length(provider_customer_id) between 3 and 255),
  provider_subscription_id text unique check (provider_subscription_id is null or char_length(provider_subscription_id) between 3 and 255),
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_access_plans enable row level security;
alter table public.profile_ai_subscriptions enable row level security;
grant select on public.ai_access_plans, public.profile_ai_subscriptions to authenticated;

create policy "authenticated users read active AI plans" on public.ai_access_plans
  for select to authenticated using (active or public.is_platform_admin());
create policy "users read their AI subscription" on public.profile_ai_subscriptions
  for select to authenticated using (profile_id = auth.uid() or public.is_platform_admin());

create or replace function public.current_ai_entitlement()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  request_profile_id uuid := auth.uid();
  request_role public.app_role;
  selected_plan_code text := 'free';
  selected_plan_name text := 'FairMatch Free';
  selected_status text := 'active';
  selected_limit integer := 30;
  used_this_month integer := 0;
begin
  if request_profile_id is null then raise exception 'Authentication required'; end if;
  select role into request_role from public.profiles where id = request_profile_id and active = true;
  if request_role is null then raise exception 'Active profile required'; end if;

  if request_role in ('school_student', 'college_student', 'job_seeker') then
    select plan.code, plan.name, subscription.status::text, plan.monthly_ai_requests
      into selected_plan_code, selected_plan_name, selected_status, selected_limit
    from public.profile_ai_subscriptions subscription
    join public.ai_access_plans plan on plan.code = subscription.plan_code and plan.active
    where subscription.profile_id = request_profile_id
      and subscription.status in ('trialing', 'active')
      and (subscription.current_period_ends_at is null or subscription.current_period_ends_at > now())
    limit 1;
    if not found then
      select code, name, 'active', monthly_ai_requests
        into selected_plan_code, selected_plan_name, selected_status, selected_limit
      from public.ai_access_plans where code = 'free';
    end if;
  elsif request_role in ('college_coordinator', 'college_admin', 'company_hr', 'company_admin') then
    select plan.code, plan.name, subscription.status::text,
      greatest(1, coalesce((plan.entitlements ->> 'aiRequestsMonthly')::integer, 30))
      into selected_plan_code, selected_plan_name, selected_status, selected_limit
    from public.organisation_members membership
    join public.organisation_subscriptions subscription on subscription.organisation_id = membership.organisation_id
    join public.saas_plans plan on plan.id = subscription.plan_id
    where membership.profile_id = request_profile_id and membership.status = 'active'
      and subscription.status in ('trialing', 'active')
    order by membership.created_at
    limit 1;
    if not found then selected_plan_code := 'free'; selected_plan_name := 'FairMatch Free'; selected_status := 'active'; selected_limit := 30; end if;
  else
    selected_plan_code := 'platform'; selected_plan_name := 'Platform operations'; selected_status := 'active'; selected_limit := 1000;
  end if;

  select count(*) into used_this_month from public.ai_request_events
  where profile_id = request_profile_id and created_at >= date_trunc('month', now());

  return jsonb_build_object(
    'planCode', selected_plan_code,
    'planName', selected_plan_name,
    'status', selected_status,
    'monthlyLimit', selected_limit,
    'usedThisMonth', used_this_month,
    'remaining', greatest(0, selected_limit - used_this_month),
    'renewsAt', date_trunc('month', now()) + interval '1 month',
    'upgradeAvailable', request_role in ('school_student', 'college_student', 'job_seeker') and selected_plan_code = 'free'
  );
end;
$$;

revoke all on function public.current_ai_entitlement() from public;
grant execute on function public.current_ai_entitlement() to authenticated;

create or replace function public.authorise_ai_request(request_context text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_profile_id uuid := auth.uid();
  request_role public.app_role;
  entitlement jsonb;
  monthly_limit integer;
  minute_count integer;
  day_count integer;
  month_count integer;
begin
  if request_profile_id is null then raise exception 'Authentication required'; end if;
  select role into request_role from public.profiles where id = request_profile_id and active = true;
  if request_role is null or not public.ai_context_allowed(request_context, request_role) then
    raise exception 'AI context is not available for this role';
  end if;

  entitlement := public.current_ai_entitlement();
  monthly_limit := greatest(1, coalesce((entitlement ->> 'monthlyLimit')::integer, 30));
  select count(*) into minute_count from public.ai_request_events where profile_id = request_profile_id and created_at >= now() - interval '1 minute';
  select count(*) into day_count from public.ai_request_events where profile_id = request_profile_id and created_at >= now() - interval '1 day';
  select count(*) into month_count from public.ai_request_events where profile_id = request_profile_id and created_at >= date_trunc('month', now());

  if minute_count >= 8 then
    return entitlement || jsonb_build_object('allowed', false, 'reason', 'minute_limit', 'retryAfterSeconds', 60);
  end if;
  if day_count >= 100 then
    return entitlement || jsonb_build_object('allowed', false, 'reason', 'day_limit', 'retryAfterSeconds', 3600);
  end if;
  if month_count >= monthly_limit then
    return entitlement || jsonb_build_object('allowed', false, 'reason', 'monthly_plan_limit', 'upgradeAvailable', entitlement -> 'upgradeAvailable');
  end if;

  insert into public.ai_request_events(profile_id, context_type) values (request_profile_id, request_context);
  return entitlement || jsonb_build_object('allowed', true, 'usedThisMonth', month_count + 1, 'remaining', greatest(0, monthly_limit - month_count - 1), 'minuteRemaining', 7 - minute_count, 'dayRemaining', 99 - day_count);
end;
$$;

revoke all on function public.authorise_ai_request(text) from public;
grant execute on function public.authorise_ai_request(text) to authenticated;
