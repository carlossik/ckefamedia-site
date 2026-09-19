import Stripe from 'npm:stripe@22.4.0'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { corsHeaders, json } from '../_shared/cors.ts'

type CheckoutRequest = {
  serviceId?: string
  startAt?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  organisationName?: string
  venueName?: string
  postcode?: string
  homeTeam?: string
  awayTeam?: string
  ageGroup?: string
  competition?: string
  notes?: string
  mediaConsentConfirmed?: boolean
  honeypot?: string
}

const requireText = (value: unknown, label: string, maxLength: number): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim().slice(0, maxLength)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)

  let bookingId: string | null = null
  try {
    const body = await request.json() as CheckoutRequest
    if (body.honeypot) return json(request, { error: 'Request rejected' }, 400)

    const customerName = requireText(body.customerName, 'Name', 120)
    const customerEmail = requireText(body.customerEmail, 'Email', 200).toLowerCase()
    const customerPhone = requireText(body.customerPhone, 'Telephone', 50)
    const venueName = requireText(body.venueName, 'Venue', 240)
    const postcode = requireText(body.postcode, 'Postcode', 20).toUpperCase()
    const serviceId = requireText(body.serviceId, 'Service', 80)
    const startAt = requireText(body.startAt, 'Start time', 80)
    if (!/^\S+@\S+\.\S+$/.test(customerEmail)) throw new Error('Enter a valid email address')
    if (!body.mediaConsentConfirmed) throw new Error('Media consent confirmation is required')
    if (Number.isNaN(Date.parse(startAt))) throw new Error('The selected date is invalid')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const stripeKey = Deno.env.get('STRIPE_RESTRICTED_KEY')
    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://ckefamedia.com').replace(/\/$/, '')
    if (!supabaseUrl || !serviceRoleKey || !stripeKey) throw new Error('Booking service is not configured')

    const database = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: holdRows, error: holdError } = await database.rpc('create_media_booking_hold', {
      requested_service_id: serviceId,
      requested_start: startAt,
      requested_customer_name: customerName,
      requested_customer_email: customerEmail,
      requested_customer_phone: customerPhone,
      requested_organisation_name: (body.organisationName ?? '').slice(0, 200),
      requested_venue_name: venueName,
      requested_postcode: postcode,
      requested_home_team: (body.homeTeam ?? '').slice(0, 160),
      requested_away_team: (body.awayTeam ?? '').slice(0, 160),
      requested_age_group: (body.ageGroup ?? '').slice(0, 50),
      requested_competition: (body.competition ?? '').slice(0, 200),
      requested_notes: (body.notes ?? '').slice(0, 2000),
      requested_media_consent: true,
    })
    if (holdError) throw new Error(holdError.message)
    const hold = holdRows?.[0]
    if (!hold) throw new Error('The booking hold could not be created')
    bookingId = hold.booking_id as string

    const { data: service, error: serviceError } = await database
      .from('media_services')
      .select('name,short_description')
      .eq('id', serviceId)
      .single()
    if (serviceError) throw new Error(serviceError.message)

    const stripe = new Stripe(stripeKey, { apiVersion: '2026-07-29.dahlia' })
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      integration_identifier: 'ckefa_media_web_qtmsprxa',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'gbp',
          unit_amount: hold.amount_due_pence as number,
          product_data: { name: service.name, description: service.short_description },
        },
      }],
      metadata: { booking_id: bookingId, booking_reference: hold.booking_reference as string },
      payment_intent_data: { metadata: { booking_id: bookingId, booking_reference: hold.booking_reference as string } },
      success_url: `${siteUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/booking/cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
    })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')

    const { error: updateError } = await database.from('media_bookings').update({ stripe_checkout_session_id: session.id, payment_method: 'stripe_checkout', operations_status: 'provisional', payment_verification_status: 'unpaid' }).eq('id', bookingId)
    if (updateError) throw new Error(updateError.message)

    return json(request, { checkoutUrl: session.url })
  } catch (caught) {
    if (bookingId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseUrl && serviceRoleKey) {
        const database = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
        await database.from('media_bookings').update({ status: 'cancelled', payment_status: 'failed' }).eq('id', bookingId)
      }
    }
    const message = caught instanceof Error ? caught.message : 'The secure checkout could not be started'
    return json(request, { error: message }, 400)
  }
})
