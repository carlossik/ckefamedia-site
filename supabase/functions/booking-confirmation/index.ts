import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { corsHeaders, json } from '../_shared/cors.ts'

type Action = 'confirm' | 'resend_confirmation' | 'balance_paid'

type RequestBody = {
  bookingId?: string
  action?: Action
  quotedTotalPence?: number
  balancePaymentUrl?: string
  balancePaymentReference?: string
}

type BookingRow = {
  id: string
  reference: string
  customer_name: string
  customer_email: string
  customer_phone: string
  organisation_name: string | null
  service_name: string
  event_start: string
  venue_name: string
  postcode: string
  home_team: string | null
  away_team: string | null
  age_group: string | null
  competition: string | null
  amount_due_pence: number
  amount_paid_pence: number
  quoted_total_pence: number | null
  quoted_discount_pence: number
  net_total_pence: number | null
  discount_code: string | null
  discount_label: string | null
  discount_type: 'percentage' | 'fixed' | 'complimentary' | null
  discount_value: number | null
  operations_status: string
  payment_verification_status: string
  settlement_status: string
  balance_payment_url: string | null
}

type BookingSettings = {
  bank_transfer_enabled: boolean
  bank_account_name: string | null
  bank_name: string | null
  bank_sort_code: string | null
  bank_account_number: string | null
  bank_payment_instructions: string | null
}

type EmailContent = { text: string; html: string }

const bookingSelect = 'id,reference,customer_name,customer_email,customer_phone,organisation_name,service_name,event_start,venue_name,postcode,home_team,away_team,age_group,competition,amount_due_pence,amount_paid_pence,quoted_total_pence,quoted_discount_pence,net_total_pence,discount_code,discount_label,discount_type,discount_value,operations_status,payment_verification_status,settlement_status,balance_payment_url'
const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
const date = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(value))
const escapeHtml = (value: string | null | undefined) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const bookingLogoUrl = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/+$/, '')
  return supabaseUrl ? `${supabaseUrl}/functions/v1/booking-confirmation?asset=logo&v=3` : null
}

function discountAmountForTotal(booking: BookingRow, grossTotalPence: number) {
  if (!booking.discount_type || !booking.discount_value || grossTotalPence <= 0) return 0
  if (booking.discount_type === 'complimentary') return grossTotalPence
  if (booking.discount_type === 'percentage') return Math.min(grossTotalPence, Math.round(grossTotalPence * booking.discount_value / 100))
  return Math.min(grossTotalPence, booking.discount_value)
}

function finalTotal(booking: BookingRow) {
  const gross = booking.quoted_total_pence ?? booking.amount_paid_pence
  return booking.net_total_pence ?? Math.max(gross - discountAmountForTotal(booking, gross), 0)
}

function fixtureEvent(booking: BookingRow) {
  if (booking.home_team || booking.away_team) {
    const home = booking.home_team?.trim() || 'TBC'
    const away = booking.away_team?.trim()
    return away ? `${home} v ${away}` : home
  }
  if (booking.competition?.trim()) return booking.competition.trim()
  if (booking.organisation_name?.trim()) return booking.organisation_name.trim()
  return null
}

async function sendEmail(to: string[], subject: string, content: EmailContent) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not configured' }
  const from = Deno.env.get('BOOKING_FROM_EMAIL') ?? 'CKEFA Media <info@ckefamedia.com>'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject,
      html: content.html,
      text: content.text,
    }),
  })
  if (response.ok) return { ok: true, error: null }
  return { ok: false, error: `Email provider returned ${response.status}: ${(await response.text()).slice(0, 500)}` }
}

function balanceInstructionsText(settings: BookingSettings, booking: BookingRow, balancePence: number) {
  if (balancePence <= 0) return 'No remaining balance is due. Your booking is fully paid.'
  const lines = [
    `Remaining balance: ${money(balancePence)}`,
    'Please ensure the remaining balance is received before production begins.',
  ]
  if (booking.balance_payment_url) lines.push(`Online payment link: ${booking.balance_payment_url}`)
  if (settings.bank_transfer_enabled && settings.bank_account_name && settings.bank_sort_code && settings.bank_account_number) {
    lines.push(
      '',
      'Bank transfer details:',
      `Account name: ${settings.bank_account_name}`,
      settings.bank_name ? `Bank: ${settings.bank_name}` : '',
      `Sort code: ${settings.bank_sort_code}`,
      `Account number: ${settings.bank_account_number}`,
      `Payment reference: ${booking.reference}`,
      settings.bank_payment_instructions ?? '',
    )
  }
  return lines.filter(Boolean).join('\n')
}

function detailRow(label: string, value: string | null) {
  if (!value) return ''
  return `<tr><td style="padding:9px 0;color:#78837c;font-size:13px;vertical-align:top;width:38%;">${escapeHtml(label)}</td><td style="padding:9px 0;color:#102019;font-size:14px;font-weight:700;vertical-align:top;">${escapeHtml(value)}</td></tr>`
}

function emailShell(title: string, preheader: string, body: string) {
  const logoUrl = bookingLogoUrl()
  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="54" height="54" alt="CKEFA Media" style="display:block;width:54px;height:54px;border-radius:50%;object-fit:cover;">`
    : `<div style="width:54px;height:54px;border-radius:50%;background:#102019;color:#a9dc22;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;letter-spacing:.6px;text-align:center;">CKEFA<br>MEDIA</div>`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#eef2ef;font-family:Arial,Helvetica,sans-serif;color:#102019;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2ef;"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 14px 44px rgba(6,33,22,.10);">
<tr><td style="background:#061a12;padding:25px 30px;border-bottom:4px solid #a9dc22;">
<table role="presentation" width="100%"><tr><td>${logoHtml}</td><td align="right" style="color:#ffffff;font-size:12px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">CKEFA Media</td></tr></table>
</td></tr>
<tr><td style="padding:34px 34px 28px;">${body}</td></tr>
<tr><td style="background:#f4f7f4;padding:22px 34px;color:#67736c;font-size:12px;line-height:1.6;border-top:1px solid #e1e8e3;">CKEFA Media · Grassroots sport, professionally captured.<br><a href="mailto:info@ckefamedia.com" style="color:#315d0c;text-decoration:none;font-weight:700;">info@ckefamedia.com</a></td></tr>
</table></td></tr></table></body></html>`
}

function paymentHtml(settings: BookingSettings, booking: BookingRow, balancePence: number) {
  if (balancePence <= 0) {
    return `<div style="margin:24px 0;padding:20px;border-radius:14px;background:#eaf7da;border:1px solid #cbe99e;"><div style="font-size:12px;color:#4b6b22;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Payment status</div><div style="margin-top:6px;font-size:21px;font-weight:800;color:#17330b;">Paid in full</div></div>`
  }

  const button = booking.balance_payment_url
    ? `<div style="margin:20px 0 10px;"><a href="${escapeHtml(booking.balance_payment_url)}" style="display:inline-block;background:#a9dc22;color:#102019;text-decoration:none;font-weight:800;font-size:14px;padding:14px 22px;border-radius:999px;">Pay remaining balance</a></div>`
    : ''

  const bank = settings.bank_transfer_enabled && settings.bank_account_name && settings.bank_sort_code && settings.bank_account_number
    ? `<div style="margin-top:18px;padding:18px;border:1px solid #dbe4dd;border-radius:14px;background:#fafcf9;">
        <div style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#607068;margin-bottom:10px;">Bank transfer</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${detailRow('Account name', settings.bank_account_name)}
          ${detailRow('Bank', settings.bank_name)}
          ${detailRow('Sort code', settings.bank_sort_code)}
          ${detailRow('Account number', settings.bank_account_number)}
          ${detailRow('Payment reference', booking.reference)}
        </table>
        ${settings.bank_payment_instructions ? `<div style="margin-top:10px;color:#67736c;font-size:12px;line-height:1.6;">${escapeHtml(settings.bank_payment_instructions)}</div>` : ''}
      </div>`
    : ''

  return `<div style="margin:24px 0;padding:20px;border-radius:14px;background:#f3f8e9;border:1px solid #d6e8b6;">
    <div style="font-size:12px;color:#597429;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Remaining balance</div>
    <div style="margin-top:5px;font-size:30px;line-height:1;font-weight:800;color:#102019;">${escapeHtml(money(balancePence))}</div>
    <div style="margin-top:10px;color:#59645e;font-size:13px;line-height:1.6;">Please ensure the remaining balance is received before production begins.</div>
    ${button}${bank}
  </div>`
}

function acceptedEmail(booking: BookingRow, settings: BookingSettings): EmailContent {
  const grossTotal = booking.quoted_total_pence ?? booking.amount_paid_pence
  const discount = booking.quoted_discount_pence || discountAmountForTotal(booking, grossTotal)
  const total = booking.net_total_pence ?? Math.max(grossTotal - discount, 0)
  const balance = Math.max(total - booking.amount_paid_pence, 0)
  const event = fixtureEvent(booking)
  const complimentary = booking.discount_type === 'complimentary' && total === 0
  const headline = complimentary
    ? 'Your booking is confirmed — no payment required.'
    : balance > 0
      ? 'Your booking is confirmed — please pay the remaining balance.'
      : 'Your booking is confirmed and fully paid.'
  const text = [
    `Hi ${booking.customer_name},`,
    '',
    headline,
    '',
    `Booking reference: ${booking.reference}`,
    `Service: ${booking.service_name}`,
    event ? `Fixture/event: ${event}` : '',
    booking.age_group ? `Age group: ${booking.age_group}` : '',
    `Date and time: ${date(booking.event_start)}`,
    `Venue: ${booking.venue_name}, ${booking.postcode}`,
    '',
    `Agreed price: ${money(grossTotal)}`,
    booking.discount_code ? `Discount (${booking.discount_code}): -${money(discount)}` : '',
    `Final total: ${money(total)}`,
    `Payment received so far: ${money(booking.amount_paid_pence)}`,
    complimentary ? 'No payment is required for this complimentary booking.' : balanceInstructionsText(settings, booking, balance),
    '',
    `Need to make a change? Reply to this email or contact info@ckefamedia.com and quote ${booking.reference}.`,
    '',
    'CKEFA Media',
  ].filter(Boolean).join('\n')

  const discountRow = booking.discount_code && discount > 0
    ? `<tr><td style="padding:9px 0;color:#78837c;font-size:13px;">Discount · ${escapeHtml(booking.discount_code)}</td><td align="right" style="padding:9px 0;color:#315d0c;font-size:14px;font-weight:800;">-${escapeHtml(money(discount))}</td></tr>`
    : ''
  const paymentPanel = complimentary
    ? `<div style="margin:24px 0;padding:20px;border-radius:14px;background:#eaf7da;border:1px solid #cbe99e;"><div style="font-size:12px;color:#4b6b22;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Payment status</div><div style="margin-top:6px;font-size:21px;font-weight:800;color:#17330b;">No payment required</div><div style="margin-top:8px;color:#59645e;font-size:13px;line-height:1.6;">This booking has been confirmed as complimentary. No deposit or remaining balance is due.</div></div>`
    : paymentHtml(settings, booking, balance)

  const html = emailShell(
    `Booking confirmed — ${booking.reference}`,
    headline,
    `<div style="font-size:12px;color:#72900c;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Booking confirmed</div>
     <h1 style="margin:8px 0 12px;font-size:30px;line-height:1.15;color:#102019;">${escapeHtml(headline)}</h1>
     <p style="margin:0 0 24px;color:#59645e;font-size:15px;line-height:1.7;">Hi ${escapeHtml(booking.customer_name)}, your production request has been accepted. Please keep your booking reference handy for any correspondence.</p>
     <div style="padding:18px 20px;background:#071a12;color:#ffffff;border-radius:14px;margin-bottom:22px;"><div style="font-size:11px;color:#a9dc22;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Booking reference</div><div style="margin-top:5px;font-size:20px;font-weight:800;letter-spacing:.4px;">${escapeHtml(booking.reference)}</div></div>
     <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #e5ebe7;border-bottom:1px solid #e5ebe7;padding:10px 0;">
       ${detailRow('Service', booking.service_name)}
       ${detailRow('Fixture / event', event)}
       ${detailRow('Age group', booking.age_group)}
       ${detailRow('Date & time', date(booking.event_start))}
       ${detailRow('Venue', `${booking.venue_name}, ${booking.postcode}`)}
     </table>
     <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-collapse:collapse;">
       <tr><td style="padding:9px 0;color:#78837c;font-size:13px;">Agreed price</td><td align="right" style="padding:9px 0;color:#102019;font-size:14px;font-weight:800;">${escapeHtml(money(grossTotal))}</td></tr>
       ${discountRow}
       <tr><td style="padding:12px 0;border-top:1px solid #e5ebe7;color:#102019;font-size:14px;font-weight:800;">Final total</td><td align="right" style="padding:12px 0;border-top:1px solid #e5ebe7;color:#102019;font-size:20px;font-weight:800;">${escapeHtml(money(total))}</td></tr>
       <tr><td style="padding:7px 0;color:#78837c;font-size:13px;">Paid so far</td><td align="right" style="padding:7px 0;color:#102019;font-size:14px;font-weight:700;">${escapeHtml(money(booking.amount_paid_pence))}</td></tr>
     </table>
     ${paymentPanel}
     <div style="margin-top:26px;padding-top:20px;border-top:1px solid #e5ebe7;color:#59645e;font-size:13px;line-height:1.7;"><strong style="color:#102019;">Need to make a change?</strong><br>Reply directly to this email or contact <a href="mailto:info@ckefamedia.com" style="color:#557b12;font-weight:700;">info@ckefamedia.com</a> and quote <strong>${escapeHtml(booking.reference)}</strong>.</div>`,
  )
  return { text, html }
}

function paidInFullEmail(booking: BookingRow): EmailContent {
  const total = finalTotal(booking)
  const event = fixtureEvent(booking)
  const text = [
    `Hi ${booking.customer_name},`,
    '',
    'Payment received — you are all set.',
    '',
    `Booking reference: ${booking.reference}`,
    `Service: ${booking.service_name}`,
    event ? `Fixture/event: ${event}` : '',
    `Date and time: ${date(booking.event_start)}`,
    `Total paid: ${money(total)}`,
    '',
    'No further payment is required for this booking.',
    'We look forward to covering your event.',
    '',
    'CKEFA Media',
  ].filter(Boolean).join('\n')

  const html = emailShell(
    `Payment received — ${booking.reference}`,
    `No further payment is required for CKEFA Media booking ${booking.reference}.`,
    `<div style="font-size:12px;color:#72900c;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Payment received</div>
     <h1 style="margin:8px 0 12px;font-size:30px;line-height:1.15;color:#102019;">Payment received — you're all set.</h1>
     <p style="margin:0 0 24px;color:#59645e;font-size:15px;line-height:1.7;">Hi ${escapeHtml(booking.customer_name)}, thank you. Your booking account is settled and <strong>no further payment is required.</strong></p>
     <div style="padding:18px 20px;background:#071a12;color:#ffffff;border-radius:14px;margin-bottom:22px;"><div style="font-size:11px;color:#a9dc22;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Booking reference</div><div style="margin-top:5px;font-size:20px;font-weight:800;">${escapeHtml(booking.reference)}</div></div>
     <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #e5ebe7;border-bottom:1px solid #e5ebe7;">
       ${detailRow('Service', booking.service_name)}
       ${detailRow('Fixture / event', event)}
       ${detailRow('Date & time', date(booking.event_start))}
       ${detailRow('Venue', `${booking.venue_name}, ${booking.postcode}`)}
       ${booking.discount_code ? detailRow('Discount code', booking.discount_code) : ''}
     </table>
     <div style="margin:24px 0;padding:20px;border-radius:14px;background:#eaf7da;border:1px solid #cbe99e;"><div style="font-size:12px;color:#4b6b22;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Payment status</div><div style="margin-top:6px;font-size:30px;font-weight:800;color:#17330b;">Paid in full · ${escapeHtml(money(total))}</div><div style="margin-top:8px;color:#315d0c;font-size:14px;font-weight:800;">No further payment required.</div></div>
     <p style="margin:0;color:#59645e;font-size:14px;line-height:1.7;">We look forward to covering your event. If anything changes, reply to this email and quote <strong>${escapeHtml(booking.reference)}</strong>.</p>`,
  )
  return { text, html }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })

  if (request.method === 'GET') {
    const requestUrl = new URL(request.url)
    if (requestUrl.searchParams.get('asset') === 'logo') {
      try {
        const logoBytes = await Deno.readFile(new URL('./assets/ckefa-media-logo.jpeg', import.meta.url))
        return new Response(logoBytes, {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
            'cache-control': 'public, max-age=604800',
            'access-control-allow-origin': '*',
          },
        })
      } catch (error) {
        console.error('CKEFA email logo could not be served', error)
        return new Response('Logo not found', { status: 404 })
      }
    }
    return json(request, { error: 'Not found' }, 404)
  }

  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json(request, { error: 'Booking service is not configured' }, 500)

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : ''
  if (!token) return json(request, { error: 'Authentication required' }, 401)

  const database = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: userData, error: userError } = await database.auth.getUser(token)
  if (userError || !userData.user) return json(request, { error: 'Invalid admin session' }, 401)

  const { data: access, error: accessError } = await database
    .from('media_admin_users')
    .select('role,is_active')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (accessError || !access?.is_active) return json(request, { error: 'CKEFA Media admin access is required' }, 403)

  try {
    const body = await request.json() as RequestBody
    if (!body.bookingId || !body.action) throw new Error('Booking and action are required')

    const { data: bookingData, error: bookingError } = await database
      .from('media_bookings')
      .select(bookingSelect)
      .eq('id', body.bookingId)
      .single()
    if (bookingError) throw bookingError
    let booking = bookingData as BookingRow

    const { data: settingsData, error: settingsError } = await database
      .from('media_booking_settings')
      .select('bank_transfer_enabled,bank_account_name,bank_name,bank_sort_code,bank_account_number,bank_payment_instructions')
      .eq('id', 1)
      .single()
    if (settingsError) throw settingsError
    const settings = settingsData as BookingSettings

    const now = new Date().toISOString()

    if (body.action === 'confirm') {
      if (booking.payment_verification_status !== 'verified') throw new Error('Verify the booking deposit before accepting the booking')
      const quotedTotal = Number(body.quotedTotalPence)
      if (!Number.isInteger(quotedTotal) || quotedTotal <= 0) throw new Error('Enter a valid agreed price')
      const quotedDiscount = discountAmountForTotal(booking, quotedTotal)
      const netTotal = Math.max(quotedTotal - quotedDiscount, 0)
      if (netTotal < booking.amount_paid_pence) throw new Error('After the discount, the final total cannot be less than the amount already paid')
      const balance = Math.max(netTotal - booking.amount_paid_pence, 0)
      const { data: updated, error: updateError } = await database.from('media_bookings').update({
        quoted_total_pence: quotedTotal,
        quoted_discount_pence: quotedDiscount,
        net_total_pence: netTotal,
        balance_payment_url: body.balancePaymentUrl?.trim() || null,
        operations_status: 'confirmed',
        status: 'confirmed',
        confirmed_at: now,
        confirmed_by: userData.user.id,
        hold_expires_at: null,
        settlement_status: balance > 0 ? 'balance_due' : 'paid_in_full',
        confirmation_email_attempted_at: now,
        confirmation_email_error: null,
      }).eq('id', booking.id).select(bookingSelect).single()
      if (updateError) throw updateError
      booking = updated as BookingRow
    }

    if (body.action === 'resend_confirmation') {
      if (booking.operations_status !== 'confirmed') throw new Error('Only confirmed bookings can receive an acceptance confirmation')
      if (booking.quoted_total_pence === null) throw new Error('Set the agreed total before sending the confirmation')
      await database.from('media_bookings').update({ confirmation_email_attempted_at: now, confirmation_email_error: null }).eq('id', booking.id)
    }

    if (body.action === 'balance_paid') {
      if (booking.operations_status !== 'confirmed') throw new Error('The booking must be confirmed before recording the final balance')
      if (booking.quoted_total_pence === null) throw new Error('The agreed total has not been set')
      const { data: updated, error: updateError } = await database.from('media_bookings').update({
        amount_paid_pence: finalTotal(booking),
        settlement_status: 'paid_in_full',
        balance_paid_at: now,
        balance_paid_by: userData.user.id,
        balance_payment_reference: body.balancePaymentReference?.trim() || null,
        payment_status: 'paid',
      }).eq('id', booking.id).select(bookingSelect).single()
      if (updateError) throw updateError
      booking = updated as BookingRow
    }

    const acceptedBalance = Math.max(finalTotal(booking) - booking.amount_paid_pence, 0)
    const subject = body.action === 'balance_paid'
      ? `Payment received — CKEFA Media booking ${booking.reference}`
      : booking.discount_type === 'complimentary' && finalTotal(booking) === 0
        ? `CKEFA Media booking confirmed — no payment required — ${booking.reference}`
        : acceptedBalance > 0
          ? `CKEFA Media booking confirmed — balance due — ${booking.reference}`
          : `CKEFA Media booking confirmed — ${booking.reference}`
    const content = body.action === 'balance_paid' ? paidInFullEmail(booking) : acceptedEmail(booking, settings)
    const result = await sendEmail([booking.customer_email], subject, content)

    if (body.action !== 'balance_paid') {
      await database.from('media_bookings').update(result.ok
        ? { confirmation_email_sent_at: new Date().toISOString(), confirmation_email_error: null }
        : { confirmation_email_error: result.error }
      ).eq('id', booking.id)
    }

    const internalTo = Deno.env.get('BOOKING_NOTIFICATION_TO')
    if (internalTo && result.ok && internalTo.toLowerCase() !== booking.customer_email.toLowerCase()) {
      await sendEmail([internalTo], `Copy: ${subject}`, content)
    }

    return json(request, {
      ok: true,
      emailSent: result.ok,
      emailError: result.error,
      settlementStatus: booking.settlement_status,
      quotedTotalPence: booking.quoted_total_pence,
      amountPaidPence: booking.amount_paid_pence,
      quotedDiscountPence: booking.quoted_discount_pence,
      netTotalPence: booking.net_total_pence,
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Booking confirmation action failed'
    return json(request, { error: message }, 400)
  }
})
