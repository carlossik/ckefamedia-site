-- CKEFA Media: administrator-only booking cleanup and deduplicated new-booking email alerts.
-- Does not modify or remove any existing booking.

alter table public.media_bookings
  add column if not exists archived_at timestamptz;

create index if not exists media_bookings_archived_at_idx
  on public.media_bookings (archived_at);

-- Editors must not be able to archive records by calling the Supabase API directly.
create or replace function public.enforce_media_booking_archive_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at
     and auth.role() is distinct from 'service_role'
     and not public.is_media_admin('administrator') then
    raise exception 'Only administrators may archive or restore bookings';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_media_booking_archive_access on public.media_bookings;
create trigger enforce_media_booking_archive_access
  before update on public.media_bookings
  for each row execute function public.enforce_media_booking_archive_access();

-- Restrict direct REST deletes: they must use the confirmed, administrator-only RPC below.
-- This is restrictive in addition to the existing permissive all-actions policy.
drop policy if exists "No direct booking deletion" on public.media_bookings;
create policy "No direct booking deletion"
  on public.media_bookings as restrictive for delete to authenticated
  using (false);

create or replace function public.delete_media_test_booking(
  requested_booking_id uuid,
  typed_booking_reference text
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
    raise exception 'Only administrators may delete test bookings';
  end if;

  select * into current_booking
  from public.media_bookings
  where id = requested_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if coalesce(typed_booking_reference, '') <> current_booking.reference then
    raise exception 'Booking reference did not match';
  end if;

  if current_booking.archived_at is null then
    raise exception 'Archive the booking before permanently deleting it';
  end if;

  -- Don't delete any booking with recorded payment evidence or customer confirmation.
  if current_booking.amount_paid_pence <> 0
     or current_booking.payment_status <> 'unpaid'
     or current_booking.customer_payment_reference is not null
     or current_booking.stripe_checkout_session_id is not null
     or current_booking.stripe_payment_intent_id is not null
     or current_booking.payment_verified_at is not null
     or current_booking.payment_submitted_at is not null
     or current_booking.confirmation_email_sent_at is not null
     or current_booking.confirmed_at is not null
  then
    raise exception 'This booking has payment or confirmation history. Keep it archived instead';
  end if;

  delete from public.media_bookings where id = current_booking.id;

  if current_booking.discount_code_id is not null then
    update public.media_discount_codes
    set redemption_count = greatest(0, redemption_count - 1)
    where id = current_booking.discount_code_id;
  end if;
end;
$$;

revoke all on function public.delete_media_test_booking(uuid, text) from public, anon;
grant execute on function public.delete_media_test_booking(uuid, text) to authenticated;

-- A server-side idempotency key so duplicate webhook deliveries don't email twice.
create table if not exists public.media_booking_alert_deliveries (
  booking_id uuid primary key references public.media_bookings(id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  resend_email_id text
);

alter table public.media_booking_alert_deliveries enable row level security;
revoke all on public.media_booking_alert_deliveries from anon, authenticated;

notify pgrst, 'reload schema';
