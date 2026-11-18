create or replace function public.current_institution_id() returns uuid language sql stable security definer set search_path = public as $$ select institution_id from public.profiles where id = auth.uid() $$;
create or replace function public.has_app_role(required_role public.app_role) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from public.profiles where id=auth.uid() and active and (role=required_role or role='platform_admin')) $$;

alter table public.institutions enable row level security;
alter table public.profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.employers enable row level security;
alter table public.drives enable row level security;
alter table public.applications enable row level security;
alter table public.audit_events enable row level security;

create policy "members see their institution" on public.institutions for select to authenticated using(id=public.current_institution_id());
create policy "users see own profile" on public.profiles for select to authenticated using(id=auth.uid());
create policy "admins manage profiles" on public.profiles for all to authenticated using(institution_id=public.current_institution_id() and public.has_app_role('platform_admin')) with check(institution_id=public.current_institution_id() and public.has_app_role('platform_admin'));
create policy "student owns profile" on public.student_profiles for all to authenticated using(profile_id=auth.uid()) with check(profile_id=auth.uid());
create policy "officer reads students" on public.student_profiles for select to authenticated using(public.has_app_role('placement_officer'));
create policy "members see employers" on public.employers for select to authenticated using(institution_id=public.current_institution_id());
create policy "officers manage employers" on public.employers for all to authenticated using(institution_id=public.current_institution_id() and public.has_app_role('placement_officer')) with check(institution_id=public.current_institution_id() and public.has_app_role('placement_officer'));
create policy "members see drives" on public.drives for select to authenticated using(institution_id=public.current_institution_id() and (status='published' or public.has_app_role('placement_officer') or public.has_app_role('recruiter')));
create policy "staff manage drives" on public.drives for all to authenticated using(institution_id=public.current_institution_id() and (public.has_app_role('placement_officer') or public.has_app_role('recruiter'))) with check(institution_id=public.current_institution_id() and (public.has_app_role('placement_officer') or public.has_app_role('recruiter')));
create policy "students see own applications" on public.applications for select to authenticated using(student_id=auth.uid());
create policy "students create own applications" on public.applications for insert to authenticated with check(student_id=auth.uid() and institution_id=public.current_institution_id());
create policy "staff review applications" on public.applications for all to authenticated using(institution_id=public.current_institution_id() and (public.has_app_role('placement_officer') or public.has_app_role('recruiter'))) with check(institution_id=public.current_institution_id() and (public.has_app_role('placement_officer') or public.has_app_role('recruiter')));
create policy "authorized audit read" on public.audit_events for select to authenticated using(institution_id=public.current_institution_id() and (public.has_app_role('platform_admin') or public.has_app_role('placement_officer')));
