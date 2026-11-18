-- Makes a candidate's offer decision visible in the workflow history and alerts the issuing recruiter.
create or replace function public.respond_to_offer(offer_id uuid, response public.offer_status) returns void
language plpgsql security definer set search_path = public as $$
declare target_offer public.offers; target_application public.candidate_applications;
begin
  if response not in ('accepted', 'declined') then
    raise exception 'Only accepted or declined responses are allowed';
  end if;
  select f.* into target_offer
  from public.offers f join public.candidate_applications a on a.id = f.application_id
  where f.id = offer_id and a.candidate_id = auth.uid() for update of f;
  if not found or target_offer.status <> 'issued' or (target_offer.expires_at is not null and target_offer.expires_at <= now()) then
    raise exception 'This offer cannot be responded to';
  end if;
  select * into target_application from public.candidate_applications where id = target_offer.application_id;
  update public.offers set status = response, updated_at = now() where id = target_offer.id;
  insert into public.application_workflow_events (application_id, actor_id, event_type)
  values (target_offer.application_id, auth.uid(), case when response = 'accepted' then 'offer_accepted' else 'offer_declined' end);
  insert into public.notifications (profile_id, kind, title, body, link)
  values (target_offer.issued_by, 'offer', 'Offer response received', coalesce(target_offer.title, 'A candidate offer') || ' was ' || response::text || '.', '#applications');
end;
$$;
revoke all on function public.respond_to_offer(uuid, public.offer_status) from public;
grant execute on function public.respond_to_offer(uuid, public.offer_status) to authenticated;
