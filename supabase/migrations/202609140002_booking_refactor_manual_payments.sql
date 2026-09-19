-- Incremental CKEFA Media booking refactor.
-- Keeps the existing Stripe columns/functions available for future Stripe Checkout / Pay by Bank work,
-- while making the current public journey provisional + manually verified.

alter table public.media_booking_settings
  add column if not exists bank_transfer_enabled boolean not null default false,
  add column if not exists bank_account_name text,
  add column if not exists bank_name text,
  add column if not exists bank_sort_code text,
  add column if not exists bank_account_number text,
  add column if not exists bank_payment_instructions text,
  add column if not exists paypal_enabled boolean not null default false,
  add column if not exists paypal_url text,
  add column if not exists verification_hold_hours integer not null default 48;

alter table public.media_booking_settings
  drop constraint if exists media_booking_settings_verification_hold_hours_check;

alter table public.media_booking_settings
  add constraint media_booking_settings_verification_hold_hours_check
  check (verification_hold_hours between 1 and 168);

-- Give customers a realistic window to complete an immediate bank transfer / PayPal payment.
update public.media_booking_settings
set hold_minutes = 60
where id = 1 and hold_minutes < 60;

alter table public.media_bookings
  add column if not exists operations_status text not null default 'provisional',
  add column if not exists payment_method text,
  add column if not exists payment_verification_status text not null default 'unpaid',
  add column if not exists customer_payment_reference text,
  add column if not exists payment_submitted_at timestamptz,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_verified_by uuid references auth.users(id),
  add column if not exists payment_verification_notes text,
  add column if not exists declined_at timestamptz,
  add column if not exists declined_by uuid references auth.users(id),
  add column if not exists decision_notes text,
  add column if not exists refund_required_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid references auth.users(id);

alter table public.media_bookings
  drop constraint if exists media_bookings_operations_status_check,
  drop constraint if exists media_bookings_payment_method_check,
  drop constraint if exists media_bookings_payment_verification_status_check;

alter table public.media_bookings
  add constraint media_bookings_operations_status_check check (
    operations_status in ('provisional', 'awaiting_confirmation', 'confirmed', 'declined', 'completed', 'cancelled', 'refund_pending', 'refunded')
  ),
  add constraint media_bookings_payment_method_check check (
    payment_method is null or payment_method in ('bank_transfer', 'paypal', 'stripe_checkout', 'stripe_pay_by_bank')
  ),
  add constraint media_bookings_payment_verification_status_check check (
    payment_verification_status in ('unpaid', 'pending_verification', 'verified', 'rejected', 'refund_pending', 'refunded')
  );

-- Backfill the new workflow columns without changing historical enum values.
update public.media_bookings
set operations_status = case
  when status = 'confirmed' then 'confirmed'
  when status = 'completed' then 'completed'
  when status = 'refunded' then 'refunded'
  when status = 'cancelled' then 'cancelled'
  else 'provisional'
end,
payment_verification_status = case
  when payment_status = 'paid' then 'verified'
  when payment_status = 'refunded' then 'refunded'
  else 'unpaid'
end
where operations_status = 'provisional'
   or payment_verification_status = 'unpaid';

create index if not exists media_bookings_operations_status_idx
  on public.media_bookings (operations_status, payment_verification_status, event_start);

-- The original slot RPC exposes internal camera/crew counts. Keep it for trusted/internal use only.
revoke execute on function public.get_media_availability(date, uuid) from public, anon, authenticated;

create or replace function public.get_media_public_availability(
  requested_date date,
  requested_time time without time zone,
  requested_service_id uuid
)
returns table (available boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  service_record public.media_services%rowtype;
  settings_record public.media_booking_settings%rowtype;
  requested_start timestamptz;
  requested_event_end timestamptz;
  requested_reserved_end timestamptz;
  used_cameras integer;
  used_crews integer;
  blocked_cameras integer;
  blocked_crews integer;
begin
  select * into service_record
  from public.media_services
  where id = requested_service_id and is_active = true;

  if not found then
    available := false;
    return next;
    return;
  end if;

  select * into settings_record from public.media_booking_settings where id = 1;
  requested_start := (requested_date + requested_time) at time zone settings_record.timezone;
  requested_event_end := requested_start + make_interval(mins => service_record.duration_minutes);
  requested_reserved_end := requested_event_end + make_interval(mins => service_record.buffer_minutes);

  if requested_start <= now()
     or extract(hour from requested_time)::integer < settings_record.opening_hour
     or extract(hour from requested_time)::integer >= settings_record.closing_hour
     or requested_event_end > ((requested_date + make_time(settings_record.closing_hour, 0, 0)) at time zone settings_record.timezone) then
    available := false;
    return next;
    return;
  end if;

  select coalesce(sum(b.camera_units), 0)::integer, coalesce(sum(b.crew_units), 0)::integer
    into used_cameras, used_crews
  from public.media_bookings b
  where b.event_start < requested_reserved_end
    and b.reserved_end > requested_start
    and (
      b.operations_status in ('awaiting_confirmation', 'confirmed', 'completed', 'refund_pending')
      or (b.operations_status = 'provisional' and b.hold_expires_at > now())
    );

  select
    coalesce(sum(coalesce(bp.camera_units_blocked, settings_record.camera_capacity)), 0)::integer,
    coalesce(sum(coalesce(bp.crew_units_blocked, settings_record.crew_capacity)), 0)::integer
    into blocked_cameras, blocked_crews
  from public.media_blackout_periods bp
  where bp.starts_at < requested_reserved_end and bp.ends_at > requested_start;

  available := used_cameras + blocked_cameras + service_record.camera_units <= settings_record.camera_capacity
    and used_crews + blocked_crews + service_record.crew_units <= settings_record.crew_capacity;
  return next;
end;
$$;

revoke all on function public.get_media_public_availability(date, time without time zone, uuid) from public;
grant execute on function public.get_media_public_availability(date, time without time zone, uuid) to anon, authenticated;

create or replace function public.get_media_payment_options()
returns table (
  bank_transfer_enabled boolean,
  paypal_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.bank_transfer_enabled
      and nullif(trim(s.bank_account_name), '') is not null
      and nullif(trim(s.bank_sort_code), '') is not null
      and nullif(trim(s.bank_account_number), '') is not null,
    s.paypal_enabled and nullif(trim(s.paypal_url), '') is not null
  from public.media_booking_settings s
  where s.id = 1;
$$;

revoke all on function public.get_media_payment_options() from public;
grant execute on function public.get_media_payment_options() to anon, authenticated;

create or replace function public.create_media_provisional_booking(
  requested_service_id uuid,
  requested_date date,
  requested_time time without time zone,
  requested_payment_method text,
  requested_customer_name text,
  requested_customer_email text,
  requested_customer_phone text,
  requested_organisation_name text,
  requested_venue_name text,
  requested_postcode text,
  requested_home_team text,
  requested_away_team text,
  requested_age_group text,
  requested_competition text,
  requested_notes text,
  requested_media_consent boolean,
  requested_honeypot text default ''
)
returns table (
  booking_id uuid,
  booking_reference text,
  amount_due_pence integer,
  payment_method text,
  bank_account_name text,
  bank_name text,
  bank_sort_code text,
  bank_account_number text,
  bank_payment_instructions text,
  paypal_url text,
  hold_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  service_record public.media_services%rowtype;
  settings_record public.media_booking_settings%rowtype;
  requested_start timestamptz;
  requested_event_end timestamptz;
  requested_reserved_end timestamptz;
  used_cameras integer;
  used_crews integer;
  blocked_cameras integer;
  blocked_crews integer;
  new_id uuid;
  new_reference text;
  payment_amount integer;
  new_hold_expires_at timestamptz;
begin
  if coalesce(trim(requested_honeypot), '') <> '' then
    raise exception 'Request rejected';
  end if;
  if not requested_media_consent then
    raise exception 'Media consent confirmation is required';
  end if;
  if nullif(trim(requested_customer_name), '') is null
     or nullif(trim(requested_customer_email), '') is null
     or nullif(trim(requested_customer_phone), '') is null
     or nullif(trim(requested_venue_name), '') is null
     or nullif(trim(requested_postcode), '') is null then
    raise exception 'Complete all required booking details';
  end if;
  if lower(trim(requested_customer_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select * into settings_record
  from public.media_booking_settings
  where id = 1
  for update;

  select * into service_record
  from public.media_services
  where id = requested_service_id and is_active = true;
  if not found then raise exception 'Service is not available'; end if;

  if requested_payment_method = 'bank_transfer' then
    if not settings_record.bank_transfer_enabled
       or nullif(trim(settings_record.bank_account_name), '') is null
       or nullif(trim(settings_record.bank_sort_code), '') is null
       or nullif(trim(settings_record.bank_account_number), '') is null then
      raise exception 'Bank transfer is not currently available';
    end if;
  elsif requested_payment_method = 'paypal' then
    if not settings_record.paypal_enabled or nullif(trim(settings_record.paypal_url), '') is null then
      raise exception 'PayPal is not currently available';
    end if;
  else
    raise exception 'Select an available payment method';
  end if;

  payment_amount := coalesce(service_record.deposit_pence, service_record.price_pence);
  if payment_amount is null or payment_amount <= 0 then
    raise exception 'Payment pricing has not been configured for this service';
  end if;

  requested_start := (requested_date + requested_time) at time zone settings_record.timezone;
  requested_event_end := requested_start + make_interval(mins => service_record.duration_minutes);
  requested_reserved_end := requested_event_end + make_interval(mins => service_record.buffer_minutes);

  if requested_start <= now()
     or extract(hour from requested_time)::integer < settings_record.opening_hour
     or extract(hour from requested_time)::integer >= settings_record.closing_hour
     or requested_event_end > ((requested_date + make_time(settings_record.closing_hour, 0, 0)) at time zone settings_record.timezone) then
    raise exception 'The selected date and time is unavailable';
  end if;

  select coalesce(sum(b.camera_units), 0)::integer, coalesce(sum(b.crew_units), 0)::integer
    into used_cameras, used_crews
  from public.media_bookings b
  where b.event_start < requested_reserved_end
    and b.reserved_end > requested_start
    and (
      b.operations_status in ('awaiting_confirmation', 'confirmed', 'completed', 'refund_pending')
      or (b.operations_status = 'provisional' and b.hold_expires_at > now())
    );

  select
    coalesce(sum(coalesce(bp.camera_units_blocked, settings_record.camera_capacity)), 0)::integer,
    coalesce(sum(coalesce(bp.crew_units_blocked, settings_record.crew_capacity)), 0)::integer
    into blocked_cameras, blocked_crews
  from public.media_blackout_periods bp
  where bp.starts_at < requested_reserved_end and bp.ends_at > requested_start;

  if used_cameras + blocked_cameras + service_record.camera_units > settings_record.camera_capacity
     or used_crews + blocked_crews + service_record.crew_units > settings_record.crew_capacity then
    raise exception 'The selected date and time has just become unavailable';
  end if;

  new_reference := 'CKM-' || to_char(now() at time zone settings_record.timezone, 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
  new_hold_expires_at := now() + make_interval(mins => settings_record.hold_minutes);

  insert into public.media_bookings (
    reference, service_id, service_name, customer_name, customer_email, customer_phone,
    organisation_name, venue_name, postcode, home_team, away_team, age_group, competition, notes,
    media_consent_confirmed, event_start, event_end, reserved_end, camera_units, crew_units,
    amount_due_pence, amount_paid_pence, status, payment_status, hold_expires_at,
    operations_status, payment_method, payment_verification_status
  ) values (
    new_reference, service_record.id, service_record.name, left(trim(requested_customer_name), 120), lower(left(trim(requested_customer_email), 200)), left(trim(requested_customer_phone), 50),
    nullif(left(trim(requested_organisation_name), 200), ''), left(trim(requested_venue_name), 240), upper(left(trim(requested_postcode), 20)),
    nullif(left(trim(requested_home_team), 160), ''), nullif(left(trim(requested_away_team), 160), ''), nullif(left(trim(requested_age_group), 50), ''),
    nullif(left(trim(requested_competition), 200), ''), nullif(left(trim(requested_notes), 2000), ''), requested_media_consent,
    requested_start, requested_event_end, requested_reserved_end, service_record.camera_units, service_record.crew_units,
    payment_amount, 0, 'pending_payment', 'unpaid', new_hold_expires_at,
    'provisional', requested_payment_method, 'unpaid'
  ) returning id into new_id;

  booking_id := new_id;
  booking_reference := new_reference;
  amount_due_pence := payment_amount;
  payment_method := requested_payment_method;
  bank_account_name := case when requested_payment_method = 'bank_transfer' then settings_record.bank_account_name else null end;
  bank_name := case when requested_payment_method = 'bank_transfer' then settings_record.bank_name else null end;
  bank_sort_code := case when requested_payment_method = 'bank_transfer' then settings_record.bank_sort_code else null end;
  bank_account_number := case when requested_payment_method = 'bank_transfer' then settings_record.bank_account_number else null end;
  bank_payment_instructions := case when requested_payment_method = 'bank_transfer' then settings_record.bank_payment_instructions else null end;
  paypal_url := case when requested_payment_method = 'paypal' then settings_record.paypal_url else null end;
  hold_expires_at := new_hold_expires_at;
  return next;
end;
$$;

revoke all on function public.create_media_provisional_booking(uuid, date, time without time zone, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text) from public;
grant execute on function public.create_media_provisional_booking(uuid, date, time without time zone, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text) to anon, authenticated;

create or replace function public.mark_media_payment_submitted(
  requested_booking_reference text,
  requested_customer_email text,
  requested_payment_reference text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_record public.media_booking_settings%rowtype;
  matched_id uuid;
begin
  select * into settings_record from public.media_booking_settings where id = 1;

  select id into matched_id
  from public.media_bookings
  where reference = upper(trim(requested_booking_reference))
    and lower(customer_email) = lower(trim(requested_customer_email))
    and operations_status = 'provisional'
    and hold_expires_at > now()
  for update;

  if matched_id is null then
    raise exception 'This provisional booking could not be found or its payment window has expired';
  end if;

  update public.media_bookings
  set payment_verification_status = 'pending_verification',
      customer_payment_reference = nullif(left(trim(requested_payment_reference), 160), ''),
      payment_submitted_at = now(),
      hold_expires_at = now() + make_interval(hours => settings_record.verification_hold_hours)
  where id = matched_id;

  return true;
end;
$$;

revoke all on function public.mark_media_payment_submitted(text, text, text) from public;
grant execute on function public.mark_media_payment_submitted(text, text, text) to anon, authenticated;

comment on column public.media_bookings.payment_method is
  'Current methods: bank_transfer/paypal. stripe_checkout and stripe_pay_by_bank are reserved for future Stripe activation.';
