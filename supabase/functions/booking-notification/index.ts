// Receives a Supabase Database Webhook for an INSERT into public.media_bookings.
// Never call this from the public booking page. Set BOOKING_ALERT_WEBHOOK_SECRET in
// Supabase Edge Function secrets and pass it in an x-booking-webhook-secret header.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

type BookingInsertEvent = {
  type?: string
  table?: string
  schema?: string
  record?: { id?: string }
}

const email = (value: string) => value.trim().toLowerCase()
const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
const date = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(value))
const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;')

const result = (message: unknown, status = 200) => new Response(JSON.stringify(message), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

Deno.serve(async (req) => {
  if (req.method !== 'POST') return result({ error: 'Method not allowed' }, 405)

  const secret = Deno.env.get('BOOKING_ALERT_WEBHOOK_SECRET')
  const providedSecret = req.headers.get('x-booking-webhook-secret')
  if (!secret || secret.length < 32 || !providedSecret || providedSecret !== secret) {
    return result({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return result({ error: 'Notification service is not configured' }, 500)
  }

  let event: BookingInsertEvent
  try {
    event = await req.json() as BookingInsertEvent
  } catch {
    return result({ error: 'Invalid JSON' }, 400)
  }
  if (event.type !== 'INSERT' || event.schema !== 'public' || event.table !== 'media_bookings'
    || !/^[a-f0-9-]{36}$/i.test(event.record?.id ?? '')) {
    return result({ error: 'Unexpected database webhook event' }, 400)
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const bookingId = event.record!.id!
  const { data: booking, error: bookingError } = await db.from('media_bookings')
    .select('id,reference,customer_name,customer_email,customer_phone,service_name,event_start,venue_name,postcode,amount_due_pence,deposit_discount_pence,payment_method,operations_status,payment_verification_status')
    .eq('id', bookingId).maybeSingle()
  if (bookingError) return result({ error: 'Could not fetch booking' }, 500)
  if (!booking) return result({ skipped: 'Booking no longer exists' })

  // The unique booking ID acts as an idempotency key (one alert per booking).
  const { error: claimError } = await db.from('media_booking_alert_deliveries').insert({ booking_id: bookingId })
  if (claimError?.code === '23505') return result({ skipped: 'Alert already processed' })
  if (claimError) return result({ error: 'Could not claim notification' }, 500)

  const recipients = Array.from(new Set(
    (Deno.env.get('BOOKING_ALERT_EMAILS') || 'info@ckefamedia.com,carlossik@gmail.com')
      .split(',').map(email).filter(Boolean),
  ))
  const paymentStatus = booking.amount_due_pence === 0 ? 'No deposit required' : 'Awaiting payment verification'
  const lines = [
    `A new CKEFA Media booking has been submitted. This does not mean it has been paid or confirmed.`,
    '',
    `Reference: ${booking.reference}`,
    `Customer: ${booking.customer_name}`,
    `Email: ${booking.customer_email}`,
    `Phone: ${booking.customer_phone}`,
    `Service: ${booking.service_name}`,
    `Date/time: ${date(booking.event_start)}`,
    `Venue: ${booking.venue_name} (${booking.postcode})`,
    `Deposit requested: ${money(booking.amount_due_pence)}`,
    `Deposit discount: ${money(booking.deposit_discount_pence ?? 0)}`,
    `Method selected: ${booking.payment_method || 'No payment required'}`,
    `Payment: ${paymentStatus}`,
    `Booking: ${booking.operations_status}`,
    '',
    'Review: https://ckefamedia.com/admin',
  ]
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172b20;line-height:1.5">
    <h2>New CKEFA Media booking request</h2>
    <p>A customer has submitted a booking request. <strong>No payment or acceptance is implied.</strong></p>
    <table style="border-collapse:collapse;width:100%">${[
      ['Booking reference', booking.reference],
      ['Customer', booking.customer_name], ['Email', booking.customer_email],
      ['Phone', booking.customer_phone], ['Service', booking.service_name],
      ['Date and time', date(booking.event_start)],
      ['Venue', `${booking.venue_name}, ${booking.postcode}`],
      ['Deposit requested', money(booking.amount_due_pence)],
      ['Deposit discount', money(booking.deposit_discount_pence ?? 0)],
      ['Payment method selected', booking.payment_method || 'No payment required'],
      ['Payment status', paymentStatus], ['Booking status', booking.operations_status],
    ].map(([label, value]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee"><strong>${escapeHtml(value)}</strong></td></tr>`).join('')}</table>
    <p><a href="https://ckefamedia.com/admin">Open CKEFA Media admin portal</a></p>
  </div>`

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('BOOKING_FROM_EMAIL') || 'CKEFA Media <info@ckefamedia.com>',
        to: recipients,
        subject: `New booking request: ${booking.reference} – ${booking.service_name}`,
        html, text: lines.join('\n'),
      }),
    })
    if (!response.ok) {
      // Allow a later webhook retry if the provider rejected the email.
      await db.from('media_booking_alert_deliveries').delete().eq('booking_id', bookingId)
      return result({ error: `Email provider failed: ${response.status}` }, 502)
    }
    const sent = await response.json() as { id?: string }
    const { error: savedError } = await db.from('media_booking_alert_deliveries')
      .update({ sent_at: new Date().toISOString(), resend_email_id: sent.id || null })
      .eq('booking_id', bookingId)
    if (savedError) return result({ error: 'Email sent, but delivery log could not be updated' }, 500)
    return result({ ok: true, notified: recipients.length })
  } catch {
    await db.from('media_booking_alert_deliveries').delete().eq('booking_id', bookingId)
    return result({ error: 'Could not contact email provider' }, 502)
  }
})
