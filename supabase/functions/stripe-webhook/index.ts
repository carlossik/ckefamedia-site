import Stripe from 'npm:stripe@22.4.0'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

type BookingEmailData = {
  reference: string
  customer_name: string
  customer_email: string
  customer_phone: string
  service_name: string
  event_start: string
  venue_name: string
  postcode: string
  home_team: string | null
  away_team: string | null
  amount_paid_pence: number
}

const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
const date = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(value))

async function sendEmail(to: string[], subject: string, text: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return
  const from = Deno.env.get('BOOKING_FROM_EMAIL') ?? 'CKEFA Media Bookings <bookings@ckefamedia.com>'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  })
  if (!response.ok) console.error('Booking email failed', response.status)
}

async function notifyBooking(booking: BookingEmailData) {
  const fixture = booking.home_team ? `${booking.home_team}${booking.away_team ? ` v ${booking.away_team}` : ''}` : booking.service_name
  const summary = [
    `Booking reference: ${booking.reference}`,
    `Service: ${booking.service_name}`,
    `Fixture/event: ${fixture}`,
    `Date and time: ${date(booking.event_start)}`,
    `Venue: ${booking.venue_name}, ${booking.postcode}`,
    `Payment received: ${money(booking.amount_paid_pence)}`,
  ].join('\n')
  await Promise.all([
    sendEmail([booking.customer_email], `CKEFA Media payment received — ${booking.reference}`, `Hi ${booking.customer_name},\n\nThank you. Your payment has been received and your booking is now awaiting CKEFA Media operational confirmation.\n\n${summary}\n\nWe will contact you once the production request has been confirmed or if a refund is required.\n\nCKEFA Media\ninfo@ckefamedia.com`),
    sendEmail([Deno.env.get('BOOKING_NOTIFICATION_TO') ?? 'info@ckefamedia.com'], `Paid booking awaiting confirmation — ${booking.reference}`, `A CKEFA Media booking has been paid and now requires an operational confirmation decision.\n\n${summary}\nCustomer: ${booking.customer_name}\nEmail: ${booking.customer_email}\nTelephone: ${booking.customer_phone}`),
  ])
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const stripeKey = Deno.env.get('STRIPE_RESTRICTED_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) return new Response('Webhook configuration is incomplete', { status: 500 })

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-07-29.dahlia' })
  let event: Stripe.Event
  try {
    const signature = request.headers.get('stripe-signature')
    if (!signature) throw new Error('Missing Stripe signature')
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret)
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  const database = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { error: eventError } = await database.from('media_webhook_events').insert({ stripe_event_id: event.id, event_type: event.type })
  if (eventError?.code === '23505') return new Response('Already processed', { status: 200 })
  if (eventError) return new Response('Could not record webhook', { status: 500 })

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const bookingId = session.metadata?.booking_id
      if (!bookingId) throw new Error('Booking metadata is missing')
      const { data: booking, error } = await database.from('media_bookings').update({
        status: 'pending_payment', payment_status: 'paid', operations_status: 'awaiting_confirmation', payment_verification_status: 'verified', payment_method: 'stripe_checkout', amount_paid_pence: session.amount_total ?? 0,
        stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        payment_verified_at: new Date().toISOString(), hold_expires_at: null,
      }).eq('id', bookingId).select('reference,customer_name,customer_email,customer_phone,service_name,event_start,venue_name,postcode,home_team,away_team,amount_paid_pence').single()
      if (error) throw error
      await notifyBooking(booking as BookingEmailData)
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session
      const bookingId = session.metadata?.booking_id
      if (bookingId) await database.from('media_bookings').update({ status: 'cancelled', operations_status: 'cancelled' }).eq('id', bookingId).eq('status', 'pending_payment')
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge
      const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
      if (paymentIntent) await database.from('media_bookings').update({ status: 'refunded', payment_status: 'refunded', operations_status: 'refunded', payment_verification_status: 'refunded', refunded_at: new Date().toISOString() }).eq('stripe_payment_intent_id', paymentIntent)
    }
  } catch (caught) {
    console.error('Webhook processing failed', caught instanceof Error ? caught.message : 'Unknown error')
    return new Response('Webhook processing failed', { status: 500 })
  }

  return new Response('ok', { status: 200 })
})
