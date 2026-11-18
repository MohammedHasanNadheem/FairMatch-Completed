-- College placement teams can see only candidates in their own cohorts and
-- applications connected to their authorised college opportunities.

create policy "college teams read their opportunity access" on public.opportunity_college_access
  for select to authenticated using (
    public.is_active_organisation_member(organisation_id, array['college_coordinator', 'college_admin']::public.app_role[])
    or public.is_platform_admin()
  );

create policy "college teams read cohort candidate profiles" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.cohort_memberships cm
      join public.placement_cohorts c on c.id = cm.cohort_id
      where cm.candidate_id = profiles.id
        and public.is_active_organisation_member(c.organisation_id, array['college_coordinator', 'college_admin']::public.app_role[])
    )
  );

create policy "college teams read cohort career profiles" on public.career_profiles
  for select to authenticated using (
    exists (
      select 1 from public.cohort_memberships cm
      join public.placement_cohorts c on c.id = cm.cohort_id
      where cm.candidate_id = career_profiles.profile_id
        and public.is_active_organisation_member(c.organisation_id, array['college_coordinator', 'college_admin']::public.app_role[])
    )
  );

create policy "college teams read relevant applications" on public.candidate_applications
  for select to authenticated using (
    exists (
      select 1 from public.cohort_memberships cm
      join public.placement_cohorts c on c.id = cm.cohort_id
      where cm.candidate_id = candidate_applications.candidate_id
        and public.is_active_organisation_member(c.organisation_id, array['college_coordinator', 'college_admin']::public.app_role[])
    )
    or exists (
      select 1 from public.opportunity_college_access access
      where access.opportunity_id = candidate_applications.opportunity_id
        and public.is_active_organisation_member(access.organisation_id, array['college_coordinator', 'college_admin']::public.app_role[])
    )
  );
