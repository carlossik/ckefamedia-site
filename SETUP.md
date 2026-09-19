# CKEFA Media booking refactor — production setup

## 1. Apply the incremental Supabase migration

If the existing CKEFA Media booking schema is already live, run this file in the Supabase SQL editor:

```text
supabase/migrations/202609140002_booking_refactor_manual_payments.sql
```

Do **not** rerun the original `202609140001...` migration against an existing database.

For a new database only, run `202609140001_ckefa_media_booking.sql`, then `202609140002_booking_refactor_manual_payments.sql`, then create the first admin using `supabase/setup-admin.sql`.

The incremental migration preserves the original booking/payment enums and Stripe columns while adding the manual-payment and operational workflow. It also revokes public execution of the legacy availability RPC that exposed camera/crew counts and replaces it with a boolean-only public availability RPC.

## 2. Configure the browser application

Create `.env.local` locally (do not commit it):

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Add the same two values to the production host's build environment. Only the Supabase URL and publishable browser key should use `VITE_` variables.

## 3. Configure services and internal capacity

Sign in to `/admin` and review **Services & pricing / Availability & payments**.

For every active service confirm:

- price and/or deposit;
- duration and buffer;
- internal camera units required;
- internal crew units required.

Then set CKEFA Media's internal camera/crew capacity and opening/closing hours. These capacity figures are used by the availability calculation but are never returned to the public booking page.

## 4. Enable bank transfer

In the admin portal enter the bank account name, optional bank name, sort code and account number, plus any customer payment instructions. Enable **Bank transfer** only after the details have been checked.

Customer flow:

1. Available date/time is selected.
2. A provisional booking/reference is created.
3. Bank details and the booking reference are shown.
4. Customer reports that payment has been sent (optional transaction reference).
5. Staff verify or reject the payment in `/admin`.
6. A verified payment moves the booking to **Awaiting confirmation**.
7. Staff then **Confirm** or **Decline** the production request.
8. If a paid request must be declined, it moves to **Refund pending** until staff mark the refund complete.

The provisional hold defaults to 60 minutes. Reporting a payment extends the verification hold using `verification_hold_hours` (48 hours by default), giving staff time to reconcile the transfer.

## 5. Optional PayPal payment link

If CKEFA Media wants PayPal available now, add the approved PayPal payment URL in the admin portal and enable PayPal. The same manual verification and operational confirmation lifecycle applies.

If PayPal is disabled, it is not presented to the customer.

## 6. Calendar blackouts

Use **Availability & payments → Calendar blackouts** to block dates/times for staff unavailability, equipment maintenance, travel, existing off-platform work or any other operational reason.

A full blackout consumes the configured internal camera and crew capacity for the overlap and makes affected public requests return only **Unavailable**. Blackouts can be removed by authorised staff from the same screen.

## 7. Booking status operating model

The new internal workflow separates payment from operational acceptance:

- `provisional` — availability is temporarily held; payment not yet verified.
- `awaiting_confirmation` — payment is verified; CKEFA Media must decide whether to honour the request.
- `confirmed` — production booking accepted.
- `declined` — unpaid request declined.
- `refund_pending` — paid request declined/cancelled and money must be returned.
- `refunded` — refund completed.
- `completed` — production work completed.

Payment verification is independently tracked as `unpaid`, `pending_verification`, `verified`, `rejected`, `refund_pending` or `refunded`.

## 8. Future Stripe / Pay by Bank compatibility

Stripe is deliberately **not required** for the current manual-payment launch. The existing `create-checkout-session` and `stripe-webhook` Edge Functions are retained so Stripe can be re-enabled later without replacing the booking model.

The database already reserves these payment method values:

```text
stripe_checkout
stripe_pay_by_bank
```

The webhook has been adjusted so a successful Stripe payment marks payment as verified and moves the booking to **Awaiting confirmation**; it no longer automatically confirms production. A future Stripe Pay by Bank implementation should follow that same transition.

When Stripe is activated, configure server-only secrets in Supabase, never in the React client:

```text
STRIPE_RESTRICTED_KEY=...
STRIPE_WEBHOOK_SECRET=...
SITE_URL=https://ckefamedia.com
RESEND_API_KEY=...
BOOKING_NOTIFICATION_TO=info@ckefamedia.com
BOOKING_FROM_EMAIL=CKEFA Media Bookings <bookings@ckefamedia.com>
```

Deploy the functions only when Stripe is being used:

```bash
supabase functions deploy create-checkout-session --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```

## 9. Build and deploy

```bash
npm install
npm test
npm run test:refactor
npm run build
```

Deploy `dist` to Netlify or the current web host. `netlify.toml` retains the SPA routing and security-header configuration.

Before production release, complete one end-to-end bank-transfer test with a test/nominal payment and verify the full sequence: public availability → provisional booking → payment submitted → manual verification → operational confirmation. Also test decline/refund and an overlapping blackout.
