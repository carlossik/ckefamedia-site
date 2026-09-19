# CKEFA Media website and booking platform

React + TypeScript website for CKEFA Media with a Supabase-backed provisional booking workflow and internal operations portal.

## Current booking model

- Real CKEFA Media logo used across the site and browser icon.
- Public availability is intentionally reduced to **Available / Unavailable**. Camera and staff capacity remain internal.
- A customer creates a **provisional booking** for an available date/time.
- Current payment options are **manual bank transfer** and an **optional PayPal payment link**, controlled by CKEFA Media in `/admin`.
- A customer can report a payment/reference, but that does not confirm the booking.
- Staff manually verify or reject payment, then confirm or decline the operational booking.
- Paid bookings that cannot be honoured move into a refund workflow instead of being silently cancelled.
- Admin users can add/remove calendar blackouts for unavailable production periods.
- Existing Stripe server-side integration is retained for future Stripe Checkout / **Pay by Bank** activation. Stripe-paid bookings are designed to become payment-verified but still await operational confirmation.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Without Supabase variables the public site can be reviewed in preview mode, but live booking submission is disabled.

## Database migration

For an existing CKEFA Media database that already has the original booking schema, run only:

```text
supabase/migrations/202609140002_booking_refactor_manual_payments.sql
```

For a brand-new Supabase project, run `202609140001_ckefa_media_booking.sql` first, then the incremental `202609140002...` migration.

## Verification

```bash
npm test
npm run build
```

An additional dependency-free refactor smoke test is included:

```bash
npm run test:refactor
```

See [SETUP.md](./SETUP.md) for the production rollout sequence.

## Security

Never commit `.env`, `.env.local`, Supabase service-role keys, Stripe server keys, webhook secrets or mailbox credentials. The historical mailbox password from the legacy implementation should remain rotated and must not be reintroduced.
