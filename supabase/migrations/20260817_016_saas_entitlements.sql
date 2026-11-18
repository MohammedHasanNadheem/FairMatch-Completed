-- SaaS plans, tenant entitlements and metered-usage foundations. Apply after 015.

create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'paused', 'cancelled');

create table public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null check (char_length(description) between 10 and 500),
  monthly_price_minor integer check (monthly_price_minor is null or monthly_price_minor >= 0),
  currency char(3) not null default 'INR',
  entitlements jsonb not null default '{}'::jsonb check (jsonb_typeof(entitlements) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisation_subscriptions (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  plan_id uuid not null references public.saas_plans(id) on delete restrict,
  status public.subscription_status not null default 'trialing',
  provider text check (provider is null or provider in ('stripe', 'manual')),
  provider_customer_id text unique check (provider_customer_id is null or char_length(provider_customer_id) between 3 and 255),
  provider_subscription_id text unique check (provider_subscription_id is null or char_length(provider_subscription_id) between 3 and 255),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_usage_monthly (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  metric text not null check (metric in ('active_members', 'published_opportunities', 'ai_requests', 'assessment_starts', 'report_exports')),
  quantity bigint not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, month, metric)
);

alter table public.saas_plans enable row level security;
alter table public.organisation_subscriptions enable row level security;
alter table public.tenant_usage_monthly enable row level security;
grant select on public.saas_plans, public.organisation_subscriptions, public.tenant_usage_monthly to authenticated;

create policy "authenticated users read active plans" on public.saas_plans
  for select to authenticated using (active or public.is_platform_admin());
create policy "organisation admins read subscription" on public.organisation_subscriptions
  for select to authenticated using (public.is_platform_admin() or public.is_active_organisation_member(organisation_id, array['college_admin','company_admin']::public.app_role[]));
create policy "organisation admins read usage" on public.tenant_usage_monthly
  for select to authenticated using (public.is_platform_admin() or public.is_active_organisation_member(organisation_id, array['college_admin','company_admin']::public.app_role[]));

create or replace function public.current_organisation_entitlements()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'organisationId', organisation.id,
      'planCode', plan.code,
      'planName', plan.name,
      'status', subscription.status,
      'trialEndsAt', subscription.trial_ends_at,
      'periodEndsAt', subscription.current_period_ends_at,
      'entitlements', plan.entitlements
    )
    from public.organisation_members membership
    join public.organisations organisation on organisation.id = membership.organisation_id
    join public.organisation_subscriptions subscription on subscription.organisation_id = organisation.id
    join public.saas_plans plan on plan.id = subscription.plan_id
    where membership.profile_id = auth.uid() and membership.status = 'active'
    order by membership.created_at
    limit 1
  ), jsonb_build_object('planCode', 'candidate', 'planName', 'Candidate access', 'status', 'active', 'entitlements', jsonb_build_object('aiRequestsMonthly', 30, 'assessmentsMonthly', 3, 'savedSearches', 10)))
$$;

revoke all on function public.current_organisation_entitlements() from public;
grant execute on function public.current_organisation_entitlements() to authenticated;

insert into public.saas_plans(id, code, name, description, monthly_price_minor, entitlements) values
  ('b1000000-0000-4000-8000-000000000001', 'pilot', 'Pilot', 'Controlled launch plan for one placement or hiring team.', null, '{"members":5,"publishedOpportunities":10,"aiRequestsMonthly":250,"reports":true,"auditRetentionDays":90}'::jsonb),
  ('b1000000-0000-4000-8000-000000000002', 'growth', 'Growth', 'Operational plan for active colleges and hiring organisations.', null, '{"members":30,"publishedOpportunities":100,"aiRequestsMonthly":2500,"reports":true,"auditRetentionDays":365}'::jsonb),
  ('b1000000-0000-4000-8000-000000000003', 'enterprise', 'Enterprise', 'Contract plan with negotiated limits, support and governance controls.', null, '{"members":500,"publishedOpportunities":1000,"aiRequestsMonthly":25000,"reports":true,"auditRetentionDays":2555,"ssoReady":true}'::jsonb)
on conflict (id) do nothing;

-- New verified organisations receive a manually provisioned pilot subscription.
create or replace function public.provision_default_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.organisation_subscriptions(organisation_id, plan_id, status, provider, trial_ends_at)
  values (new.id, 'b1000000-0000-4000-8000-000000000001', 'trialing', 'manual', now() + interval '30 days')
  on conflict (organisation_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organisations_default_subscription on public.organisations;
create trigger organisations_default_subscription after insert on public.organisations
  for each row execute function public.provision_default_subscription();

insert into public.organisation_subscriptions(organisation_id, plan_id, status, provider, trial_ends_at)
select organisation.id, 'b1000000-0000-4000-8000-000000000001', 'trialing', 'manual', now() + interval '30 days'
from public.organisations organisation
on conflict (organisation_id) do nothing;
