-- Private candidate document vault. Apply after 012_ai_governance.sql.

create type public.candidate_document_kind as enum ('resume', 'certificate', 'portfolio');
create type public.candidate_document_status as enum ('uploaded', 'verified', 'rejected');

create table public.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind public.candidate_document_kind not null default 'resume',
  file_name text not null check (char_length(file_name) between 1 and 180),
  storage_path text not null unique check (char_length(storage_path) between 10 and 500),
  mime_type text not null check (mime_type in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  is_primary boolean not null default false,
  status public.candidate_document_status not null default 'uploaded',
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  verification_note text check (char_length(verification_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index candidate_documents_one_primary_resume
  on public.candidate_documents(profile_id)
  where is_primary and kind = 'resume';
create index candidate_documents_profile_created_idx
  on public.candidate_documents(profile_id, created_at desc);

alter table public.candidate_applications
  add column if not exists resume_document_id uuid references public.candidate_documents(id) on delete set null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-documents',
  'candidate-documents',
  false,
  5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.candidate_documents enable row level security;

grant select, insert, update, delete on public.candidate_documents to authenticated;

drop policy if exists "candidates read their documents" on public.candidate_documents;
create policy "candidates read their documents" on public.candidate_documents
  for select to authenticated using (profile_id = auth.uid() or public.is_platform_admin());
drop policy if exists "candidates create their documents" on public.candidate_documents;
create policy "candidates create their documents" on public.candidate_documents
  for insert to authenticated with check (profile_id = auth.uid() and status = 'uploaded' and verified_by is null and verified_at is null);
drop policy if exists "candidates update unverified documents" on public.candidate_documents;
create policy "candidates update unverified documents" on public.candidate_documents
  for update to authenticated using (profile_id = auth.uid() and status = 'uploaded')
  with check (profile_id = auth.uid() and status = 'uploaded' and verified_by is null and verified_at is null);
drop policy if exists "candidates delete their documents" on public.candidate_documents;
create policy "candidates delete their documents" on public.candidate_documents
  for delete to authenticated using (profile_id = auth.uid());

drop policy if exists "authorised hiring teams read submitted documents" on public.candidate_documents;
create policy "authorised hiring teams read submitted documents" on public.candidate_documents
  for select to authenticated using (exists (
    select 1
    from public.candidate_applications application
    join public.opportunities opportunity on opportunity.id = application.opportunity_id
    where application.resume_document_id = candidate_documents.id
      and public.is_active_organisation_member(opportunity.organisation_id, array['company_hr', 'company_admin']::public.app_role[])
  ));

drop policy if exists "candidate document owners upload private files" on storage.objects;
create policy "candidate document owners upload private files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'candidate-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "candidate document owners read private files" on storage.objects;
create policy "candidate document owners read private files" on storage.objects
  for select to authenticated using (
    bucket_id = 'candidate-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())
  );
drop policy if exists "candidate document owners delete private files" on storage.objects;
create policy "candidate document owners delete private files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'candidate-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "authorised hiring teams read attached files" on storage.objects;
create policy "authorised hiring teams read attached files" on storage.objects
  for select to authenticated using (
    bucket_id = 'candidate-documents'
    and exists (
      select 1
      from public.candidate_documents document
      join public.candidate_applications application on application.resume_document_id = document.id
      join public.opportunities opportunity on opportunity.id = application.opportunity_id
      where document.storage_path = storage.objects.name
        and public.is_active_organisation_member(opportunity.organisation_id, array['company_hr', 'company_admin']::public.app_role[])
    )
  );

create or replace function public.set_primary_candidate_document(document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare selected_document public.candidate_documents;
begin
  select * into selected_document from public.candidate_documents where id = document_id and profile_id = auth.uid();
  if not found or selected_document.kind <> 'resume' then
    raise exception 'Resume document not found';
  end if;
  update public.candidate_documents set is_primary = false, updated_at = now()
  where profile_id = auth.uid() and kind = 'resume' and is_primary;
  update public.candidate_documents set is_primary = true, updated_at = now() where id = selected_document.id;
end;
$$;

create or replace function public.attach_resume_to_application(application_id uuid, document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.candidate_documents where id = document_id and profile_id = auth.uid() and kind = 'resume') then
    raise exception 'Resume document not found';
  end if;
  update public.candidate_applications
  set resume_document_id = document_id, updated_at = now()
  where id = application_id and candidate_id = auth.uid();
  if not found then raise exception 'Application not found'; end if;
end;
$$;

revoke all on function public.set_primary_candidate_document(uuid) from public;
grant execute on function public.set_primary_candidate_document(uuid) to authenticated;
revoke all on function public.attach_resume_to_application(uuid, uuid) from public;
grant execute on function public.attach_resume_to_application(uuid, uuid) to authenticated;
