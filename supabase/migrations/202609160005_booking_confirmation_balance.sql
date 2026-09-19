-- CKEFA Media accepted-booking confirmation and remaining-balance workflow.
-- Current launch policy remains deposit first, then agreed balance before production.
-- payment_policy_snapshot keeps each booking compatible with a future full-payment-before-confirmation model.

alter table public.media_bookings
  add column if not exists quoted_total_pence integer,
  add column if not exists confirmed_by uuid references auth.users(id),
  add column if not exists settlement_status text not null default 'deposit_due',
  add column if not exists payment_policy_snapshot text not null default 'deposit_then_balance',
  add column if not exists balance_payment_url text,
  add column if not exists balance_payment_reference text,
  add column if not exists balance_paid_at timestamptz,
  add column if not exists balance_paid_by uuid references auth.users(id),
  add column if not exists confirmation_email_attempted_at timestamptz,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists confirmation_email_error text;

alter table public.media_bookings
  drop constraint if exists media_bookings_quoted_total_pence_check,
  drop constraint if exists media_bookings_settlement_status_check,
  drop constraint if exists media_bookings_payment_policy_snapshot_check;

alter table public.media_bookings
  add constraint media_bookings_quoted_total_pence_check
    check (quoted_total_pence is null or quoted_total_pence >= 0),
  add constraint media_bookings_settlement_status_check
    check (settlement_status in ('deposit_due', 'deposit_paid', 'balance_due', 'paid_in_full', 'refund_pending', 'refunded')),
  add constraint media_bookings_payment_policy_snapshot_check
    check (payment_policy_snapshot in ('deposit_then_balance', 'full_payment_before_confirmation'));

-- Bring existing records into the settlement lifecycle without changing their operational state.
update public.media_bookings
set settlement_status = case
  when payment_verification_status = 'refunded' or payment_status = 'refunded' then 'refunded'
  when payment_verification_status = 'refund_pending' then 'refund_pending'
  when payment_verification_status = 'verified' or payment_status = 'paid' then 'deposit_paid'
  else 'deposit_due'
end
where settlement_status = 'deposit_due';

create index if not exists media_bookings_settlement_status_idx
  on public.media_bookings (settlement_status, event_start);

comment on column public.media_bookings.quoted_total_pence is
  'Final agreed booking total in pence. For price-on-request services this is entered by CKEFA Media before acceptance.';
comment on column public.media_bookings.settlement_status is
  'Tracks deposit/balance settlement separately from operational confirmation status.';
comment on column public.media_bookings.payment_policy_snapshot is
  'Commercial payment policy captured per booking; currently deposit_then_balance, with full_payment_before_confirmation reserved for fixed-price rollout.';
comment on column public.media_bookings.balance_payment_url is
  'Optional per-booking payment URL for the remaining balance, e.g. PayPal or future Stripe payment link.';
