-- CKEFA Media discount / complimentary booking codes.
-- Adds admin-managed percentage, fixed-value and fully complimentary codes.
-- Public customers can validate/apply a code without being able to enumerate codes.
-- The code snapshot is retained on each booking so future edits do not alter historical bookings.

create table if not exists public.media_discount_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null,
  label text not null,
  discount_type text not null,
  discount_value integer not null default 0,
  is_active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  max_redemptions integer,
  redemption_count integer not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(code)) between 3 and 40),
  check (discount_type in ('percentage', 'fixed', 'complimentary')),
  check (
    (discount_type = 'percentage' and discount_value between 1 and 100)
    or (discount_type = 'fixed' and discount_value > 0)
    or (discount_type = 'complimentary' and discount_value = 100)
  ),
  check (max_redemptions is null or max_redemptions > 0),
  check (redemption_count >= 0),
  check (valid_until is null or valid_from is null or valid_until > valid_from)
);

create unique index if not exists media_discount_codes_code_unique_idx
  on public.media_discount_codes (lower(code));
create index if not exists media_discount_codes_active_idx
  on public.media_discount_codes (is_active, valid_until);

drop trigger if exists media_discount_codes_updated on public.media_discount_codes;
create trigger media_discount_codes_updated
  before update on public.media_discount_codes
  for each row execute function public.set_media_updated_at();

alter table public.media_discount_codes enable row level security;
drop policy if exists "admins read discount codes" on public.media_discount_codes;
drop policy if exists "administrators manage discount codes" on public.media_discount_codes;
create policy "admins read discount codes" on public.media_discount_codes
  for select using (public.is_media_admin());
create policy "administrators manage discount codes" on public.media_discount_codes
  for all using (public.is_media_admin('administrator'))
  with check (public.is_media_admin('administrator'));

alter table public.media_bookings
  add column if not exists discount_code_id uuid references public.media_discount_codes(id) on delete set null,
  add column if not exists discount_code text,
  add column if not exists discount_label text,
  add column if not exists discount_type text,
  add column if not exists discount_value integer,
  add column if not exists deposit_before_discount_pence integer,
  add column if not exists deposit_discount_pence integer not null default 0,
  add column if not exists quoted_discount_pence integer not null default 0,
  add column if not exists net_total_pence integer;

alter table public.media_bookings
  drop constraint if exists media_bookings_discount_type_check,
  drop constraint if exists media_bookings_discount_values_check,
  drop constraint if exists media_bookings_net_total_check;

alter table public.media_bookings
  add constraint media_bookings_discount_type_check
    check (discount_type is null or discount_type in ('percentage', 'fixed', 'complimentary')),
  add constraint media_bookings_discount_values_check
    check (
      (discount_code is null and discount_type is null and discount_value is null)
      or (discount_code is not null and discount_type is not null and discount_value is not null and discount_value >= 0)
    ),
  add constraint media_bookings_net_total_check
    check (
      (deposit_before_discount_pence is null or deposit_before_discount_pence >= 0)
      and deposit_discount_pence >= 0
      and quoted_discount_pence >= 0
      and (net_total_pence is null or net_total_pence >= 0)
    );

comment on table public.media_discount_codes is
  'Admin-managed booking codes. Percentage and fixed codes discount both the booking deposit and final agreed total; complimentary codes waive all customer payment.';
comment on column public.media_bookings.quoted_total_pence is
  'Gross agreed booking price before any booking-code discount.';
comment on column public.media_bookings.net_total_pence is
  'Final customer total after the booking-code discount is applied.';

create or replace function public.media_discount_amount(
  requested_base_pence integer,
  requested_discount_type text,
  requested_discount_value integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when requested_base_pence is null or requested_base_pence <= 0 then 0
    when requested_discount_type = 'complimentary' then requested_base_pence
    when requested_discount_type = 'percentage' then least(requested_base_pence, round(requested_base_pence * requested_discount_value / 100.0)::integer)
    when requested_discount_type = 'fixed' then least(requested_base_pence, requested_discount_value)
    else 0
  end;
$$;
revoke all on function public.media_discount_amount(integer, text, integer) from public, anon, authenticated;

create or replace function public.preview_media_discount_code(
  requested_code text,
  requested_base_amount_pence integer
)
returns table (
  valid boolean,
  message text,
  code text,
  label text,
  discount_type text,
  discount_value integer,
  base_amount_pence integer,
  discount_amount_pence integer,
  adjusted_amount_pence integer,
  payment_required boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  code_record public.media_discount_codes%rowtype;
  discount_amount integer;
begin
  if requested_base_amount_pence is null or requested_base_amount_pence < 0 then
    raise exception 'A valid booking amount is required';
  end if;

  if nullif(trim(requested_code), '') is null then
    return query select false, 'Enter a discount code.', null::text, null::text, null::text, null::integer,
      requested_base_amount_pence, 0, requested_base_amount_pence, requested_base_amount_pence > 0;
    return;
  end if;

  select * into code_record
  from public.media_discount_codes d
  where lower(d.code) = lower(trim(requested_code));

  if not found
     or not code_record.is_active
     or (code_record.valid_from is not null and code_record.valid_from > now())
     or (code_record.valid_until is not null and code_record.valid_until <= now())
     or (code_record.max_redemptions is not null and code_record.redemption_count >= code_record.max_redemptions) then
    return query select false, 'This discount code is not valid or has expired.', null::text, null::text, null::text, null::integer,
      requested_base_amount_pence, 0, requested_base_amount_pence, requested_base_amount_pence > 0;
    return;
  end if;

  discount_amount := public.media_discount_amount(requested_base_amount_pence, code_record.discount_type, code_record.discount_value);
  return query select true,
    case when code_record.discount_type = 'complimentary' then 'Complimentary booking code applied.' else 'Discount code applied.' end,
    upper(code_record.code), code_record.label, code_record.discount_type, code_record.discount_value,
    requested_base_amount_pence, discount_amount, greatest(requested_base_amount_pence - discount_amount, 0),
    greatest(requested_base_amount_pence - discount_amount, 0) > 0;
end;
$$;
revoke all on function public.preview_media_discount_code(text, integer) from public;
grant execute on function public.preview_media_discount_code(text, integer) to anon, authenticated;

-- Replace the public booking RPC with an optional discount-code argument.
drop function if exists public.create_media_provisional_booking(
  uuid, date, time without time zone, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, text
);

create function public.create_media_provisional_booking(
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
  requested_honeypot text default '',
  requested_discount_code text default null
)
returns table (
  booking_id uuid,
  booking_reference text,
  amount_due_pence integer,
  deposit_before_discount_pence integer,
  discount_code text,
  discount_label text,
  discount_amount_pence integer,
  payment_required boolean,
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
set search_path = public, extensions
as $$
declare
  service_record public.media_services%rowtype;
  settings_record public.media_booking_settings%rowtype;
  code_record public.media_discount_codes%rowtype;
  requested_start timestamptz;
  requested_event_end timestamptz;
  requested_reserved_end timestamptz;
  used_cameras integer;
  used_crews integer;
  blocked_cameras integer;
  blocked_crews integer;
  new_id uuid;
  new_reference text;
  base_payment_amount integer;
  discount_amount integer := 0;
  payment_amount integer;
  new_hold_expires_at timestamptz;
  code_text text := null;
  code_label text := null;
  code_type text := null;
  code_value integer := null;
begin
  if coalesce(trim(requested_honeypot), '') <> '' then raise exception 'Request rejected'; end if;
  if not requested_media_consent then raise exception 'Media consent confirmation is required'; end if;
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

  select * into settings_record from public.media_booking_settings where id = 1 for update;
  select * into service_record from public.media_services where id = requested_service_id and is_active = true;
  if not found then raise exception 'Service is not available'; end if;

  base_payment_amount := case
    when settings_record.deposit_required then settings_record.booking_deposit_pence
    else coalesce(service_record.deposit_pence, service_record.price_pence)
  end;
  if base_payment_amount is null or base_payment_amount <= 0 then
    raise exception 'A booking payment amount has not been configured';
  end if;

  if nullif(trim(requested_discount_code), '') is not null then
    select * into code_record
    from public.media_discount_codes d
    where lower(d.code) = lower(trim(requested_discount_code))
    for update;

    if not found
       or not code_record.is_active
       or (code_record.valid_from is not null and code_record.valid_from > now())
       or (code_record.valid_until is not null and code_record.valid_until <= now())
       or (code_record.max_redemptions is not null and code_record.redemption_count >= code_record.max_redemptions) then
      raise exception 'This discount code is not valid or has expired';
    end if;

    code_text := upper(code_record.code);
    code_label := code_record.label;
    code_type := code_record.discount_type;
    code_value := code_record.discount_value;
    discount_amount := public.media_discount_amount(base_payment_amount, code_type, code_value);
  end if;

  payment_amount := greatest(base_payment_amount - discount_amount, 0);

  if payment_amount > 0 then
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
  new_hold_expires_at := case when payment_amount > 0 then now() + make_interval(hours => settings_record.provisional_hold_hours) else null end;

  insert into public.media_bookings (
    reference, service_id, service_name, customer_name, customer_email, customer_phone,
    organisation_name, venue_name, postcode, home_team, away_team, age_group, competition, notes,
    media_consent_confirmed, event_start, event_end, reserved_end, camera_units, crew_units,
    amount_due_pence, amount_paid_pence, status, payment_status, hold_expires_at,
    operations_status, payment_method, payment_verification_status, settlement_status,
    discount_code_id, discount_code, discount_label, discount_type, discount_value,
    deposit_before_discount_pence, deposit_discount_pence
  ) values (
    new_reference, service_record.id, service_record.name, left(trim(requested_customer_name), 120), lower(left(trim(requested_customer_email), 200)), left(trim(requested_customer_phone), 50),
    nullif(left(trim(requested_organisation_name), 200), ''), left(trim(requested_venue_name), 240), upper(left(trim(requested_postcode), 20)),
    nullif(left(trim(requested_home_team), 160), ''), nullif(left(trim(requested_away_team), 160), ''), nullif(left(trim(requested_age_group), 50), ''),
    nullif(left(trim(requested_competition), 200), ''), nullif(left(trim(requested_notes), 2000), ''), requested_media_consent,
    requested_start, requested_event_end, requested_reserved_end, service_record.camera_units, service_record.crew_units,
    payment_amount, 0, 'pending_payment', 'unpaid', new_hold_expires_at,
    case when payment_amount = 0 then 'awaiting_confirmation' else 'provisional' end,
    case when payment_amount = 0 then null else requested_payment_method end,
    case when payment_amount = 0 then 'verified' else 'unpaid' end,
    case when payment_amount = 0 then 'deposit_paid' else 'deposit_due' end,
    code_record.id, code_text, code_label, code_type, code_value,
    base_payment_amount, discount_amount
  ) returning id into new_id;

  if code_record.id is not null then
    update public.media_discount_codes set redemption_count = redemption_count + 1 where id = code_record.id;
  end if;

  booking_id := new_id;
  booking_reference := new_reference;
  amount_due_pence := payment_amount;
  deposit_before_discount_pence := base_payment_amount;
  discount_code := code_text;
  discount_label := code_label;
  discount_amount_pence := discount_amount;
  payment_required := payment_amount > 0;
  payment_method := case when payment_amount > 0 then requested_payment_method else null end;
  bank_account_name := case when payment_amount > 0 and requested_payment_method = 'bank_transfer' then settings_record.bank_account_name else null end;
  bank_name := case when payment_amount > 0 and requested_payment_method = 'bank_transfer' then settings_record.bank_name else null end;
  bank_sort_code := case when payment_amount > 0 and requested_payment_method = 'bank_transfer' then settings_record.bank_sort_code else null end;
  bank_account_number := case when payment_amount > 0 and requested_payment_method = 'bank_transfer' then settings_record.bank_account_number else null end;
  bank_payment_instructions := case when payment_amount > 0 and requested_payment_method = 'bank_transfer' then settings_record.bank_payment_instructions else null end;
  paypal_url := case when payment_amount > 0 and requested_payment_method = 'paypal' then settings_record.paypal_url else null end;
  hold_expires_at := new_hold_expires_at;
  return next;
end;
$$;

revoke all on function public.create_media_provisional_booking(
  uuid, date, time without time zone, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, text, text
) from public;
grant execute on function public.create_media_provisional_booking(
  uuid, date, time without time zone, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, text, text
) to anon, authenticated;

notify pgrst, 'reload schema';
