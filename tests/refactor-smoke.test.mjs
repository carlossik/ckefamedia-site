import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('real CKEFA Media logo is wired into the shared brand component', () => {
  
  assert.equal(existsSync(new URL('../public/ckefa-media-logo.jpeg', import.meta.url)), true)
  assert.match(read('src/components/Brand.tsx'), /ckefa-media-logo\.jpeg/)
})

test('public booking UI exposes boolean availability only', () => {
  const page = read('src/pages/BookingPage.tsx')
  assert.match(page, />Available</)
  assert.match(page, />Unavailable</)
  assert.doesNotMatch(page, /cameras_remaining|crews_remaining|camera availability|staff availability/i)
})

test('incremental migration contains manual payment, operational and blackout-compatible workflow', () => {
  const migration = read('supabase/migrations/202609140002_booking_refactor_manual_payments.sql')
  for (const required of [
    'get_media_public_availability',
    'create_media_provisional_booking',
    'mark_media_payment_submitted',
    'bank_transfer',
    'paypal',
    'refund_pending',
    'stripe_pay_by_bank',
    'media_blackout_periods',
  ]) assert.match(migration, new RegExp(required))
  assert.match(migration, /revoke execute on function public\.get_media_availability/)
})


test('admin portal exposes payment verification, confirmation/refund and blackout controls', () => {
  const admin = read('src/pages/AdminPage.tsx')
  for (const required of ['verify_payment', 'confirm', 'decline', 'refund', 'media_blackout_periods', 'bank_transfer_enabled', 'paypal_enabled']) {
    assert.match(admin, new RegExp(required))
  }
})


test('global booking deposit policy is configurable and uses a 24-hour provisional hold', () => {
  const migration = read('supabase/migrations/202609160003_booking_deposit_policy.sql')
  const bookingPage = read('src/pages/BookingPage.tsx')
  const admin = read('src/pages/AdminPage.tsx')
  const bookingLib = read('src/lib/booking.ts')

  for (const required of ['booking_deposit_pence', 'deposit_required', 'provisional_hold_hours', '5000', '24']) {
    assert.match(migration, new RegExp(required))
  }
  assert.match(migration, /settings_record\.booking_deposit_pence/)
  assert.match(migration, /make_interval\(hours => settings_record\.provisional_hold_hours\)/)
  assert.match(migration, /create_media_booking_hold/)
  assert.match(bookingPage, /Booking deposit/)
  assert.match(bookingPage, /remaining balance/i)
  assert.match(admin, /Deposit amount \(£\)/)
  assert.match(admin, /Provisional hold \(hours\)/)
  assert.match(bookingLib, /booking_deposit_pence/)
})

test('Stripe webhook no longer auto-confirms paid production bookings', () => {
  const webhook = read('supabase/functions/stripe-webhook/index.ts')
  assert.match(webhook, /operations_status:\s*'awaiting_confirmation'/)
  assert.match(webhook, /payment_verification_status:\s*'verified'/)
})

test('accepted bookings capture an agreed total, remaining balance and customer confirmation email workflow', () => {
  const migration = read('supabase/migrations/202609160005_booking_confirmation_balance.sql')
  const admin = read('src/pages/AdminPage.tsx')
  const booking = read('src/pages/BookingPage.tsx')
  const notification = read('supabase/functions/booking-confirmation/index.ts')

  for (const required of ['quoted_total_pence', 'settlement_status', 'balance_payment_url', 'confirmation_email_sent_at', 'payment_policy_snapshot']) {
    assert.match(migration, new RegExp(required))
  }
  assert.match(admin, /Accept & email customer/)
  assert.match(admin, /Mark balance paid/)
  assert.match(admin, /Resend confirmation/)
  assert.match(booking, /Provisionally held/)
  assert.match(notification, /remaining balance is received before production begins/i)
  assert.match(notification, /RESEND_API_KEY/)
})


test('customer confirmation is branded HTML and uses real fixture or event details', () => {
  const notification = read('supabase/functions/booking-confirmation/index.ts')
  const admin = read('src/pages/AdminPage.tsx')
  const styles = read('src/styles.css')

  assert.match(notification, /html:\s*content\.html/)
  assert.match(notification, /Booking confirmed/)
  assert.match(notification, /Pay remaining balance/)
  assert.match(notification, /booking\.competition/)
  assert.match(notification, /booking\.organisation_name/)
  assert.doesNotMatch(notification, /return booking\.home_team[^\n]*booking\.service_name/)
  assert.match(admin, /booking-workflow-card/)
  assert.match(admin, /Customer communication/)
  assert.match(styles, /booking-workflow-card__grid/)
})

test('discount and complimentary codes are supported without exposing admin code records publicly', () => {
  const migration = read('supabase/migrations/202609180006_discount_codes_and_complimentary_bookings.sql')
  const booking = read('src/pages/BookingPage.tsx')
  const admin = read('src/pages/AdminPage.tsx')
  const bookingLib = read('src/lib/booking.ts')

  for (const required of ['media_discount_codes', 'percentage', 'fixed', 'complimentary', 'preview_media_discount_code', 'requested_discount_code', 'net_total_pence']) {
    assert.match(migration, new RegExp(required))
  }
  assert.match(booking, /Discount or complimentary code/)
  assert.match(booking, /No payment required/)
  assert.match(admin, /Discount & complimentary codes/)
  assert.match(admin, /Create code/)
  assert.match(bookingLib, /preview_media_discount_code/)
})


test('percentage and fixed discounts are applied once and retained at final confirmation', () => {
  const admin = read('src/pages/AdminPage.tsx')
  const confirmation = read('supabase/functions/booking-confirmation/index.ts')

  assert.match(admin, /booking\.deposit_discount_pence/)
  assert.match(confirmation, /deposit_discount_pence/)
  assert.match(confirmation, /Math\.max\(booking\.deposit_discount_pence \?\? 0, 0\)/)
  assert.doesNotMatch(confirmation, /grossTotalPence \* booking\.discount_value \/ 100/)
  assert.match(admin, /discount already awarded at booking will be retained/i)
})

test('booking confirmation references the project logo and distinguishes balance-due from paid-in-full email copy', () => {
  const notification = read('supabase/functions/booking-confirmation/index.ts')
  const config = read('supabase/config.toml')
  assert.equal(existsSync(new URL('../supabase/functions/booking-confirmation/assets/ckefa-media-logo.jpeg', import.meta.url)), true)
  assert.match(notification, /booking-confirmation\?asset=logo/)
  assert.match(notification, /escapeHtml\(logoUrl\)/)
  assert.match(config, /static_files/)
  assert.match(notification, /Pay remaining balance/)
  assert.match(notification, /No further payment required/)
  assert.match(notification, /Payment received — you're all set/)
})

test('administrators can archive bookings and protect paid bookings from test deletion', () => {
  const admin = read('src/pages/AdminPage.tsx')
  const migration = read('supabase/migrations/202610020001_booking_alerts_and_cleanup.sql')
  for (const label of ['Archive booking', 'Restore booking', 'Delete test booking permanently']) {
    assert.match(admin, new RegExp(label))
  }
  assert.match(admin, /requiredInput: booking\.reference/)
  assert.match(admin, /supabase\.rpc\('delete_media_test_booking'/)
  assert.match(migration, /is_media_admin\('administrator'\)/)
  assert.match(migration, /current_booking\.amount_paid_pence <> 0/)
  assert.match(migration, /current_booking\.customer_payment_reference is not null/)
  assert.match(migration, /confirmation_email_sent_at is not null/)
  assert.match(migration, /Archive the booking before permanently deleting it/)
  assert.match(migration, /as restrictive for delete to authenticated/)
})

test('new booking email alert is server-only, deduplicated and sent to two destinations', () => {
  const notify = read('supabase/functions/booking-notification/index.ts')
  const migration = read('supabase/migrations/202610020001_booking_alerts_and_cleanup.sql')
  const config = read('supabase/config.toml')
  assert.match(notify, /BOOKING_ALERT_WEBHOOK_SECRET/)
  assert.match(notify, /BOOKING_ALERT_EMAILS/)
  assert.match(notify, /info@ckefamedia\.com,carlossik@gmail\.com/)
  assert.match(notify, /'INSERT'/)
  assert.match(notify, /'media_bookings'/)
  assert.match(notify, /RESEND_API_KEY/)
  assert.match(notify, /media_booking_alert_deliveries/)
  assert.match(migration, /booking_id uuid primary key/)
  assert.match(config, /\[functions\.booking-notification\]/)
  assert.doesNotMatch(read('src/lib/booking.ts'), /booking-notification/)
})


test('administrator-attested paid test deletion is audited and real bookings stay protected', () => {
  const migration = read('supabase/migrations/202610020002_audited_test_booking_cleanup.sql')
  const admin = read('src/pages/AdminPage.tsx')
  for (const evidence of [
    'protected_from_test_deletion',
    'CKM-20260926-6EDA88',
    'media_booking_deletion_audit',
    "public.is_media_admin('administrator')",
    'confirmed_test_booking is distinct from true',
    'current_booking.archived_at is null',
    'typed_booking_reference is distinct from current_booking.reference',
    'insert into public.media_booking_deletion_audit',
    'drop function if exists public.delete_media_test_booking(uuid, text)',
    'as restrictive for delete to authenticated',
  ]) {
    const location = evidence === 'as restrictive for delete to authenticated'
      ? read('supabase/migrations/202610020001_booking_alerts_and_cleanup.sql')
      : migration
    assert.ok(location.includes(evidence), `Missing database protection: ${evidence}`)
  }
  assert.match(admin, /confirmed_test_booking: true/)
  assert.match(admin, /requiredInput: booking\.reference/)
  assert.match(admin, /protected_from_test_deletion/)
  assert.match(admin, /I confirm this is a TEST booking/)
  assert.doesNotMatch(admin, /booking\.amount_paid_pence === 0 && !booking\.customer_payment_reference/)
})

test('all admin destructive actions use reusable branded dialogues instead of browser popups', () => {
  const admin = read('src/pages/AdminPage.tsx')
  const dialog = read('src/components/ActionDialog.tsx')
  const css = read('src/styles.css')
  for (const name of ['archiveBooking', 'deleteTestBooking', 'protectRealBooking',
    'deleteDiscountCode', 'removeBlackout', 'confirmBookingDecision']) {
    assert.match(admin, new RegExp(name))
  }
  assert.match(admin, /<ActionDialog request={dialog}/)
  assert.match(dialog, /aria-modal="true"/)
  assert.match(dialog, /requiredInput/)
  assert.match(dialog, /acknowledgement/)
  assert.match(dialog, /event.key === 'Escape'/)
  assert.match(dialog, /onKeyDown/)
  assert.match(css, /action-dialog-backdrop/)
  assert.doesNotMatch(admin, /window\.(?:alert|confirm|prompt)\s*\(/)
})
