-- CKEFA Media: audited deletion of administrator-attested test bookings.
-- This is a NEW migration; never edit the already-applied 202610020001 migration.
-- No bookings are removed by this migration.

alter table public.media_bookings
  add column if not exists protected_from_test_deletion boolean not null default false;

-- Preserve the only known genuine production booking, irrespective of whether
-- it has already been archived or completed.
update public.media_bookings
set protected_from_test_deletion = true
where reference = 'CKM-20260926-6EDA88';

-- Refuse a migration in the wrong database rather than silently leaving that
-- production booking unprotected.
do $$
begin
  if not exists (
    select 1 from public.media_bookings
    where reference = 'CKM-20260926-6EDA88'
      and protected_from_test_deletion = true
  ) then
    raise exception 'Expected real booking CKM-20260926-6EDA88 missing: check Supabase project before deploying';
  end if;
end;
$$;

create or replace function public.enforce_media_booking_test_deletion_protection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.protected_from_test_deletion and not new.protected_from_test_deletion then
    raise exception 'Protected real booking cannot be unprotected through the application';
  end if;
  if new.protected_from_test_deletion is distinct from old.protected_from_test_deletion
     and auth.role() is distinct from 'service_role'
     and not public.is_media_admin('administrator') then
    raise exception 'Only administrators can protect real bookings';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_media_booking_test_deletion_protection on public.media_bookings;
create trigger enforce_media_booking_test_deletion_protection
  before update on public.media_bookings
  for each row execute function public.enforce_media_booking_test_deletion_protection();

-- Audit entries deliberately omit customer email, phone and name.
-- Audit history persists after the booking record is removed.
create table if not exists public.media_booking_deletion_audit (
  id bigint generated always as identity primary key,
  booking_id uuid not null,
  booking_reference text not null,
  recorded_amount_paid_pence integer not null,
  had_customer_confirmation boolean not null,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now(),
  reason text not null default 'Administrator attested this was a test with no real payment or refund obligations'
);

alter table public.media_booking_deletion_audit enable row level security;
revoke all on public.media_booking_deletion_audit from public, anon, authenticated;

-- Remove the earlier unpaid-only RPC rather than leave an unaudited path open.
drop function if exists public.delete_media_test_booking(uuid, text);

create or replace function public.delete_media_test_booking(
  requested_booking_id uuid,
  typed_booking_reference text,
  confirmed_test_booking boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_booking public.media_bookings%rowtype;
begin
  if auth.uid() is null or not public.is_media_admin('administrator') then
    raise exception 'Only administrators may permanently delete test bookings';
  end if;

  if confirmed_test_booking is distinct from true then
    raise exception 'You must confirm this was a test with no real payments or refund obligations';
  end if;

  select * into current_booking
  from public.media_bookings
  where id = requested_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;
  if typed_booking_reference is distinct from current_booking.reference then
    raise exception 'Booking reference did not match';
  end if;
  if current_booking.archived_at is null then
    raise exception 'Archive the booking before permanently deleting it';
  end if;
  if current_booking.protected_from_test_deletion then
    raise exception 'This is a protected real booking and cannot be deleted';
  end if;

  -- Records showing payments or confirmation history may be deleted ONLY after
  -- a deliberate administrator attestation that these were simulations.
  insert into public.media_booking_deletion_audit (
    booking_id, booking_reference, recorded_amount_paid_pence,
    had_customer_confirmation, deleted_by
  ) values (
    current_booking.id, current_booking.reference,
    current_booking.amount_paid_pence,
    current_booking.confirmation_email_sent_at is not null,
    auth.uid()
  );

  delete from public.media_bookings where id = current_booking.id;

  if current_booking.discount_code_id is not null then
    update public.media_discount_codes
    set redemption_count = greatest(0, redemption_count - 1)
    where id = current_booking.discount_code_id;
  end if;
end;
$$;

revoke all on function public.delete_media_test_booking(uuid, text, boolean) from public, anon;
grant execute on function public.delete_media_test_booking(uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';
