create extension if not exists pgcrypto;

create type public.media_admin_role as enum ('administrator', 'editor');
create type public.media_booking_status as enum ('pending_payment', 'confirmed', 'completed', 'cancelled', 'refunded');
create type public.media_payment_status as enum ('unpaid', 'paid', 'partially_refunded', 'refunded', 'failed');

create table public.media_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role public.media_admin_role not null default 'editor',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text not null,
  description text not null,
  price_pence integer check (price_pence is null or price_pence >= 0),
  deposit_pence integer check (deposit_pence is null or deposit_pence >= 0),
  duration_minutes integer not null default 150 check (duration_minutes >= 30),
  buffer_minutes integer not null default 45 check (buffer_minutes >= 0),
  camera_units integer not null default 1 check (camera_units >= 0),
  crew_units integer not null default 1 check (crew_units >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_booking_settings (
  id smallint primary key default 1 check (id = 1),
  timezone text not null default 'Europe/London',
  camera_capacity integer not null default 3 check (camera_capacity >= 0),
  crew_capacity integer not null default 3 check (crew_capacity >= 0),
  opening_hour integer not null default 8 check (opening_hour between 0 and 23),
  closing_hour integer not null default 20 check (closing_hour between 1 and 23),
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes in (15, 30, 60)),
  default_buffer_minutes integer not null default 45 check (default_buffer_minutes >= 0),
  hold_minutes integer not null default 31 check (hold_minutes between 30 and 60),
  updated_at timestamptz not null default now()
);

insert into public.media_booking_settings (id) values (1) on conflict (id) do nothing;

create table public.media_blackout_periods (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  camera_units_blocked integer,
  crew_units_blocked integer,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (camera_units_blocked is null or camera_units_blocked >= 0),
  check (crew_units_blocked is null or crew_units_blocked >= 0)
);

create table public.media_bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  service_id uuid not null references public.media_services(id),
  service_name text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  organisation_name text,
  venue_name text not null,
  postcode text not null,
  home_team text,
  away_team text,
  age_group text,
  competition text,
  notes text,
  media_consent_confirmed boolean not null default false,
  event_start timestamptz not null,
  event_end timestamptz not null,
  reserved_end timestamptz not null,
  camera_units integer not null check (camera_units >= 0),
  crew_units integer not null check (crew_units >= 0),
  amount_due_pence integer not null check (amount_due_pence >= 0),
  amount_paid_pence integer not null default 0 check (amount_paid_pence >= 0),
  currency text not null default 'gbp' check (currency = 'gbp'),
  status public.media_booking_status not null default 'pending_payment',
  payment_status public.media_payment_status not null default 'unpaid',
  hold_expires_at timestamptz,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (event_end > event_start),
  check (reserved_end >= event_end)
);

create index media_bookings_event_window_idx on public.media_bookings (event_start, reserved_end);
create index media_bookings_customer_email_idx on public.media_bookings (lower(customer_email));
create index media_bookings_status_idx on public.media_bookings (status, payment_status);

create table public.media_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create or replace function public.set_media_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger media_admin_users_updated before update on public.media_admin_users for each row execute function public.set_media_updated_at();
create trigger media_services_updated before update on public.media_services for each row execute function public.set_media_updated_at();
create trigger media_settings_updated before update on public.media_booking_settings for each row execute function public.set_media_updated_at();
create trigger media_bookings_updated before update on public.media_bookings for each row execute function public.set_media_updated_at();

create or replace function public.is_media_admin(required_role public.media_admin_role default 'editor')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.media_admin_users
    where user_id = auth.uid()
      and is_active = true
      and (required_role = 'editor' or role = 'administrator')
  );
$$;

alter table public.media_admin_users enable row level security;
alter table public.media_services enable row level security;
alter table public.media_booking_settings enable row level security;
alter table public.media_blackout_periods enable row level security;
alter table public.media_bookings enable row level security;
alter table public.media_webhook_events enable row level security;

create policy "active services are public" on public.media_services for select using (is_active = true or public.is_media_admin());
create policy "admins manage services" on public.media_services for all using (public.is_media_admin('administrator')) with check (public.is_media_admin('administrator'));
create policy "admins read booking settings" on public.media_booking_settings for select using (public.is_media_admin());
create policy "admins manage booking settings" on public.media_booking_settings for update using (public.is_media_admin('administrator')) with check (public.is_media_admin('administrator'));
create policy "admins manage blackouts" on public.media_blackout_periods for all using (public.is_media_admin()) with check (public.is_media_admin());
create policy "admins manage bookings" on public.media_bookings for all using (public.is_media_admin()) with check (public.is_media_admin());
create policy "users read own admin membership" on public.media_admin_users for select using (user_id = auth.uid() or public.is_media_admin('administrator'));
create policy "administrators manage admin membership" on public.media_admin_users for all using (public.is_media_admin('administrator')) with check (public.is_media_admin('administrator'));

revoke all on public.media_webhook_events from anon, authenticated;

insert into public.media_services (slug, name, short_description, description, duration_minutes, buffer_minutes, camera_units, crew_units, sort_order)
values
('match-recording', 'Match Recording', 'Full-match HD coverage captured from the best available position.', 'A professionally recorded full match, prepared for private delivery or publication.', 150, 45, 1, 1, 1),
('live-streaming', 'Live Streaming', 'Bring supporters closer with a professionally managed live broadcast.', 'Live match production for YouTube and supported social platforms, subject to venue connectivity.', 180, 60, 1, 1, 2),
('recording-highlights', 'Recording + Highlights', 'Full-match coverage plus a sharp, shareable highlights package.', 'Match recording with professionally edited key moments for teams, players and social channels.', 150, 45, 1, 1, 3),
('player-reel', 'Player Highlight Reel', 'A focused individual edit for development, recruitment and memories.', 'A curated player reel assembled from supplied or CKEFA-recorded match footage.', 150, 45, 1, 1, 4),
('game-analysis', 'Game Analysis', 'Structured footage and insights that support coaching and player development.', 'Match footage prepared with key phases and moments for team review.', 150, 45, 1, 1, 5),
('photography', 'In-game Photography', 'Action, emotion and matchday moments captured professionally.', 'A matchday photography package with edited digital images.', 150, 45, 0, 1, 6),
('event-coverage', 'Tournament & Event Coverage', 'Flexible multi-match coverage for tournaments, festivals and showcases.', 'A tailored production plan for football, basketball and community sporting events.', 480, 60, 2, 2, 7)
on conflict (slug) do nothing;

create or replace function public.get_media_availability(requested_date date, requested_service_id uuid)
returns table (
  start_at timestamptz,
  end_at timestamptz,
  label text,
  available boolean,
  cameras_remaining integer,
  crews_remaining integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  service_record public.media_services%rowtype;
  settings_record public.media_booking_settings%rowtype;
  slot_start timestamptz;
  slot_end timestamptz;
  reserved_until timestamptz;
  used_cameras integer;
  used_crews integer;
  blocked_cameras integer;
  blocked_crews integer;
begin
  select * into service_record from public.media_services where id = requested_service_id and is_active = true;
  if not found then raise exception 'Service is not available'; end if;
  select * into settings_record from public.media_booking_settings where id = 1;

  for slot_start in
    select generate_series(
      (requested_date + make_time(settings_record.opening_hour, 0, 0)) at time zone settings_record.timezone,
      (requested_date + make_time(settings_record.closing_hour, 0, 0)) at time zone settings_record.timezone - make_interval(mins => service_record.duration_minutes),
      make_interval(mins => settings_record.slot_interval_minutes)
    )
  loop
    slot_end := slot_start + make_interval(mins => service_record.duration_minutes);
    reserved_until := slot_end + make_interval(mins => service_record.buffer_minutes);

    select coalesce(sum(b.camera_units), 0)::integer, coalesce(sum(b.crew_units), 0)::integer
      into used_cameras, used_crews
    from public.media_bookings b
    where b.event_start < reserved_until
      and b.reserved_end > slot_start
      and (
        b.status in ('confirmed', 'completed')
        or (b.status = 'pending_payment' and b.hold_expires_at > now())
      );

    select
      coalesce(sum(coalesce(bp.camera_units_blocked, settings_record.camera_capacity)), 0)::integer,
      coalesce(sum(coalesce(bp.crew_units_blocked, settings_record.crew_capacity)), 0)::integer
      into blocked_cameras, blocked_crews
    from public.media_blackout_periods bp
    where bp.starts_at < reserved_until and bp.ends_at > slot_start;

    start_at := slot_start;
    end_at := slot_end;
    label := to_char(slot_start at time zone settings_record.timezone, 'HH24:MI');
    cameras_remaining := greatest(settings_record.camera_capacity - used_cameras - blocked_cameras, 0);
    crews_remaining := greatest(settings_record.crew_capacity - used_crews - blocked_crews, 0);
    available := slot_start > now()
      and cameras_remaining >= service_record.camera_units
      and crews_remaining >= service_record.crew_units;
    return next;
  end loop;
end;
$$;

grant execute on function public.get_media_availability(date, uuid) to anon, authenticated;

create or replace function public.create_media_booking_hold(
  requested_service_id uuid,
  requested_start timestamptz,
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
  requested_media_consent boolean
)
returns table (booking_id uuid, booking_reference text, amount_due_pence integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  service_record public.media_services%rowtype;
  settings_record public.media_booking_settings%rowtype;
  requested_event_end timestamptz;
  requested_reserved_end timestamptz;
  used_cameras integer;
  used_crews integer;
  blocked_cameras integer;
  blocked_crews integer;
  new_id uuid;
  new_reference text;
  payment_amount integer;
begin
  if not requested_media_consent then raise exception 'Media consent confirmation is required'; end if;
  if requested_start <= now() then raise exception 'The selected start time is no longer available'; end if;

  select * into settings_record from public.media_booking_settings where id = 1 for update;
  select * into service_record from public.media_services where id = requested_service_id and is_active = true;
  if not found then raise exception 'Service is not available'; end if;

  payment_amount := coalesce(service_record.deposit_pence, service_record.price_pence);
  if payment_amount is null or payment_amount <= 0 then raise exception 'Online pricing has not been configured for this service'; end if;

  requested_event_end := requested_start + make_interval(mins => service_record.duration_minutes);
  requested_reserved_end := requested_event_end + make_interval(mins => service_record.buffer_minutes);

  select coalesce(sum(camera_units), 0)::integer, coalesce(sum(crew_units), 0)::integer
    into used_cameras, used_crews
  from public.media_bookings
  where event_start < requested_reserved_end and reserved_end > requested_start
    and (status in ('confirmed', 'completed') or (status = 'pending_payment' and hold_expires_at > now()));

  select
    coalesce(sum(coalesce(camera_units_blocked, settings_record.camera_capacity)), 0)::integer,
    coalesce(sum(coalesce(crew_units_blocked, settings_record.crew_capacity)), 0)::integer
    into blocked_cameras, blocked_crews
  from public.media_blackout_periods
  where starts_at < requested_reserved_end and ends_at > requested_start;

  if used_cameras + blocked_cameras + service_record.camera_units > settings_record.camera_capacity
     or used_crews + blocked_crews + service_record.crew_units > settings_record.crew_capacity then
    raise exception 'The selected production slot has just become unavailable';
  end if;

  new_reference := 'CKM-' || to_char(now() at time zone settings_record.timezone, 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

  insert into public.media_bookings (
    reference, service_id, service_name, customer_name, customer_email, customer_phone,
    organisation_name, venue_name, postcode, home_team, away_team, age_group, competition, notes,
    media_consent_confirmed, event_start, event_end, reserved_end, camera_units, crew_units,
    amount_due_pence, hold_expires_at
  ) values (
    new_reference, service_record.id, service_record.name, trim(requested_customer_name), lower(trim(requested_customer_email)), trim(requested_customer_phone),
    nullif(trim(requested_organisation_name), ''), trim(requested_venue_name), upper(trim(requested_postcode)), nullif(trim(requested_home_team), ''),
    nullif(trim(requested_away_team), ''), nullif(trim(requested_age_group), ''), nullif(trim(requested_competition), ''), nullif(trim(requested_notes), ''),
    requested_media_consent, requested_start, requested_event_end, requested_reserved_end, service_record.camera_units, service_record.crew_units,
    payment_amount, now() + make_interval(mins => settings_record.hold_minutes)
  ) returning id into new_id;

  booking_id := new_id;
  booking_reference := new_reference;
  amount_due_pence := payment_amount;
  return next;
end;
$$;

revoke all on function public.create_media_booking_hold(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_media_booking_hold(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean) to service_role;
