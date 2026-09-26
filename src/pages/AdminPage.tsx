import {
  Ban,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  BadgePercent,
  ExternalLink,
  Landmark,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Video,
  XCircle,
} from 'lucide-react'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { formatDateTime, formatMoney } from '../lib/format'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { BlackoutPeriod, BookingRecord, DiscountCode, DiscountType, ServicePackage } from '../types'

type AdminAccess = { role: 'administrator' | 'editor'; is_active: boolean }
type Settings = {
  camera_capacity: number
  crew_capacity: number
  opening_hour: number
  closing_hour: number
  slot_interval_minutes: number
  default_buffer_minutes: number
  hold_minutes: number
  provisional_hold_hours: number
  verification_hold_hours: number
  deposit_required: boolean
  booking_deposit_pence: number
  bank_transfer_enabled: boolean
  bank_account_name: string | null
  bank_name: string | null
  bank_sort_code: string | null
  bank_account_number: string | null
  bank_payment_instructions: string | null
  paypal_enabled: boolean
  paypal_url: string | null
}

type BookingAction = 'verify_payment' | 'reject_payment' | 'decline' | 'complete' | 'refund'

const defaultSettings: Settings = {
  camera_capacity: 3,
  crew_capacity: 3,
  opening_hour: 8,
  closing_hour: 20,
  slot_interval_minutes: 30,
  default_buffer_minutes: 45,
  hold_minutes: 60,
  provisional_hold_hours: 24,
  verification_hold_hours: 48,
  deposit_required: true,
  booking_deposit_pence: 5000,
  bank_transfer_enabled: false,
  bank_account_name: null,
  bank_name: null,
  bank_sort_code: null,
  bank_account_number: null,
  bank_payment_instructions: null,
  paypal_enabled: false,
  paypal_url: null,
}


function discountAmountForTotal(booking: BookingRecord, grossTotalPence: number) {
  if (!booking.discount_type || !booking.discount_value || grossTotalPence <= 0) return 0
  if (booking.discount_type === 'complimentary') return grossTotalPence
  if (booking.discount_type === 'percentage') return Math.min(grossTotalPence, Math.round(grossTotalPence * booking.discount_value / 100))
  return Math.min(grossTotalPence, booking.discount_value)
}

function netTotalForBooking(booking: BookingRecord, grossTotalPence: number) {
  return Math.max(grossTotalPence - discountAmountForTotal(booking, grossTotalPence), 0)
}

export function AdminPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [access, setAccess] = useState<AdminAccess | null>(null)
  const [tab, setTab] = useState<'bookings' | 'services' | 'availability' | 'discounts'>('bookings')
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [services, setServices] = useState<ServicePackage[]>([])
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [blackouts, setBlackouts] = useState<BlackoutPeriod[]>([])
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([])
  const [newDiscountCode, setNewDiscountCode] = useState('')
  const [newDiscountLabel, setNewDiscountLabel] = useState('')
  const [newDiscountType, setNewDiscountType] = useState<DiscountType>('percentage')
  const [newDiscountValue, setNewDiscountValue] = useState('10')
  const [newDiscountExpiry, setNewDiscountExpiry] = useState('')
  const [newDiscountMaxUses, setNewDiscountMaxUses] = useState('')
  const [newDiscountNotes, setNewDiscountNotes] = useState('')
  const [blackoutStartsAt, setBlackoutStartsAt] = useState('')
  const [blackoutEndsAt, setBlackoutEndsAt] = useState('')
  const [blackoutReason, setBlackoutReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, string>>({})
  const [balanceUrlDrafts, setBalanceUrlDrafts] = useState<Record<string, string>>({})
  const [balanceReferenceDrafts, setBalanceReferenceDrafts] = useState<Record<string, string>>({})

  const loadAdminData = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setMessage('')
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { setSignedIn(false); setLoading(false); return }
    setSignedIn(true)
    const { data: accessData } = await supabase.from('media_admin_users').select('role,is_active').eq('user_id', userData.user.id).maybeSingle()
    const typedAccess = accessData as AdminAccess | null
    setAccess(typedAccess)
    if (!typedAccess?.is_active) { setLoading(false); return }

    const [bookingsResult, servicesResult, settingsResult, blackoutsResult, discountsResult] = await Promise.all([
      supabase.from('media_bookings').select('*').order('event_start', { ascending: true }),
      supabase.from('media_services').select('*').order('sort_order'),
      supabase.from('media_booking_settings').select('*').eq('id', 1).single(),
      supabase.from('media_blackout_periods').select('id,starts_at,ends_at,reason,created_at').order('starts_at', { ascending: true }),
      supabase.from('media_discount_codes').select('*').order('created_at', { ascending: false }),
    ])

    const error = bookingsResult.error ?? servicesResult.error ?? settingsResult.error ?? blackoutsResult.error ?? discountsResult.error
    if (error) {
      setMessage(error.message)
    } else {
      setBookings((bookingsResult.data ?? []) as BookingRecord[])
      setServices((servicesResult.data ?? []) as ServicePackage[])
      setSettings({ ...defaultSettings, ...(settingsResult.data as Partial<Settings>) })
      setBlackouts((blackoutsResult.data ?? []) as BlackoutPeriod[])
      setDiscountCodes((discountsResult.data ?? []) as DiscountCode[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    void loadAdminData()
    const { data } = supabase.auth.onAuthStateChange(() => void loadAdminData())
    return () => data.subscription.unsubscribe()
  }, [loadAdminData])

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setLoading(true); setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setMessage(error.message); setLoading(false) }
  }

  const sendPasswordReset = async () => {
    if (!supabase) return

    const resetEmail = email.trim()

    if (!resetEmail) {
      setMessage('Enter your email address first.')
      return
    }

    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    })

    setLoading(false)

    setMessage(
      error
        ? error.message
        : 'Password recovery email sent. Check your inbox.'
    )
  }

  const signOut = async () => { await supabase?.auth.signOut(); setSignedIn(false); setAccess(null) }

  const runBookingAction = async (booking: BookingRecord, action: BookingAction) => {
    if (!supabase) return
    setMessage('')
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id ?? null
    const now = new Date().toISOString()
    let changes: Record<string, unknown> = {}

   if (action === 'verify_payment') {
  const isManualPayment =
    booking.payment_verification_status !== 'pending_verification'

  let paypalReference = ''

  if (isManualPayment) {
    if (
      booking.operations_status !== 'provisional' ||
      (booking.payment_method && booking.payment_method !== 'paypal') ||
      booking.amount_paid_pence > 0
    ) {
      setMessage('This booking is not eligible for manual PayPal verification.')
      return
    }

    const enteredReference = window.prompt(
      'Enter the PayPal transaction ID after checking the payment in PayPal:'
    )

    if (enteredReference === null) return

    paypalReference = enteredReference.trim()

    if (!paypalReference) {
      setMessage('A PayPal transaction ID is required.')
      return
    }

    const confirmed = window.confirm(
      `Confirm that ${formatMoney(booking.amount_due_pence)} has been received for booking ${booking.reference}?`
    )

    if (!confirmed) return
  }

  changes = {
    payment_verification_status: 'verified',
    payment_status: 'paid',
    amount_paid_pence: booking.amount_due_pence,
    payment_verified_at: now,
    payment_verified_by: userId,
    operations_status: 'awaiting_confirmation',
    settlement_status:
      booking.payment_policy_snapshot === 'full_payment_before_confirmation'
        ? 'paid_in_full'
        : 'deposit_paid',
    hold_expires_at: null,
    ...(paypalReference
      ? {
      customer_payment_reference: paypalReference,
      payment_method: 'paypal',
    }
  : {}),
  }
}
    if (action === 'reject_payment') {
      changes = {
        payment_verification_status: 'rejected',
        payment_status: 'unpaid',
        operations_status: 'provisional',
        settlement_status: 'deposit_due',
        payment_verified_at: null,
        payment_verified_by: null,
        hold_expires_at: new Date(Date.now() + settings.provisional_hold_hours * 60 * 60_000).toISOString(),
      }
    }
    if (action === 'decline') {
      const paid = booking.amount_paid_pence > 0 && (booking.payment_verification_status === 'verified' || booking.payment_status === 'paid')
      changes = paid
        ? { operations_status: 'refund_pending', status: 'cancelled', payment_verification_status: 'refund_pending', settlement_status: 'refund_pending', refund_required_at: now, declined_at: now, declined_by: userId, hold_expires_at: null }
        : { operations_status: 'declined', status: 'cancelled', declined_at: now, declined_by: userId, hold_expires_at: null }
    }
    if (action === 'complete') {
      changes = { operations_status: 'completed', status: 'completed' }
    }
    if (action === 'refund') {
      changes = {
        operations_status: 'refunded',
        status: 'refunded',
        payment_verification_status: 'refunded',
        payment_status: 'refunded',
        settlement_status: 'refunded',
        refunded_at: now,
        refunded_by: userId,
      }
    }

    const { error } = await supabase.from('media_bookings').update(changes).eq('id', booking.id)
    setMessage(error ? error.message : 'Booking workflow updated.')
    if (!error) await loadAdminData()
  }

  const runConfirmationAction = async (booking: BookingRecord, action: 'confirm' | 'resend_confirmation' | 'balance_paid') => {
    if (!supabase) return
    setMessage('')
    const body: Record<string, unknown> = { bookingId: booking.id, action }

    if (action === 'confirm') {
      const totalText = quoteDrafts[booking.id] ?? (booking.quoted_total_pence !== null ? (booking.quoted_total_pence / 100).toFixed(2) : '')
      const total = Number(totalText)
      if (!Number.isFinite(total) || total <= 0) {
        setMessage('Enter the agreed total price before accepting the booking.')
        return
      }
      const totalPence = Math.round(total * 100)
      const netTotalPence = netTotalForBooking(booking, totalPence)
      if (netTotalPence < booking.amount_paid_pence) {
        setMessage('After the discount, the final total cannot be less than the amount already paid.')
        return
      }
      body.quotedTotalPence = totalPence
      body.balancePaymentUrl = (balanceUrlDrafts[booking.id] ?? booking.balance_payment_url ?? '').trim()
    }

    if (action === 'balance_paid') {
      body.balancePaymentReference = (balanceReferenceDrafts[booking.id] ?? '').trim()
    }

    const { data, error } = await supabase.functions.invoke('booking-confirmation', { body })
    if (error) {
      setMessage(error.message)
      return
    }
    const result = data as { emailSent?: boolean; emailError?: string | null } | null
    if (action === 'confirm') {
      setMessage(result?.emailSent ? 'Booking accepted and confirmation email sent.' : `Booking accepted, but the email was not sent${result?.emailError ? `: ${result.emailError}` : '.'}`)
    } else if (action === 'resend_confirmation') {
      setMessage(result?.emailSent ? 'Confirmation email resent.' : `Confirmation email was not sent${result?.emailError ? `: ${result.emailError}` : '.'}`)
    } else {
      setMessage(result?.emailSent ? 'Remaining balance marked paid and customer notified.' : `Remaining balance marked paid${result?.emailError ? `, but the email was not sent: ${result.emailError}` : '.'}`)
    }
    await loadAdminData()
  }

  const saveService = async (service: ServicePackage) => {
    if (!supabase) return
    const { error } = await supabase.from('media_services').update({
      name: service.name,
      short_description: service.short_description,
      price_pence: service.price_pence,
      deposit_pence: service.deposit_pence,
      duration_minutes: service.duration_minutes,
      buffer_minutes: service.buffer_minutes,
      camera_units: service.camera_units,
      crew_units: service.crew_units,
      is_active: service.is_active,
    }).eq('id', service.id)
    setMessage(error ? error.message : `${service.name} saved.`)
  }

  const saveSettings = async () => {
    if (!supabase) return
    const { error } = await supabase.from('media_booking_settings').update(settings).eq('id', 1)
    setMessage(error ? error.message : 'Availability and payment settings saved.')
    if (!error) await loadAdminData()
  }

  const addBlackout = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || !blackoutStartsAt || !blackoutEndsAt) return
    setMessage('')
    const startsAt = new Date(blackoutStartsAt)
    const endsAt = new Date(blackoutEndsAt)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      setMessage('Blackout end time must be after the start time.')
      return
    }
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('media_blackout_periods').insert({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: blackoutReason.trim() || null,
      created_by: userData.user?.id ?? null,
      camera_units_blocked: null,
      crew_units_blocked: null,
    })
    if (error) {
      setMessage(error.message)
      return
    }
    setBlackoutStartsAt('')
    setBlackoutEndsAt('')
    setBlackoutReason('')
    setMessage('Calendar blackout added.')
    await loadAdminData()
  }

  const removeBlackout = async (id: string) => {
    if (!supabase) return
    const { error } = await supabase.from('media_blackout_periods').delete().eq('id', id)
    setMessage(error ? error.message : 'Calendar blackout removed.')
    if (!error) await loadAdminData()
  }


  const createDiscountCode = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || access?.role !== 'administrator') return
    const code = newDiscountCode.trim().toUpperCase()
    const label = newDiscountLabel.trim()
    if (code.length < 3 || !label) { setMessage('Enter a code and customer-facing label.'); return }
    let discountValue = 100
    if (newDiscountType === 'percentage') discountValue = Math.round(Number(newDiscountValue))
    if (newDiscountType === 'fixed') discountValue = Math.round(Number(newDiscountValue) * 100)
    if (!Number.isFinite(discountValue) || discountValue <= 0) { setMessage('Enter a valid discount value.'); return }
    const maxRedemptions = newDiscountMaxUses.trim() ? Number(newDiscountMaxUses) : null
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('media_discount_codes').insert({
      code,
      label,
      discount_type: newDiscountType,
      discount_value: discountValue,
      valid_until: newDiscountExpiry ? new Date(`${newDiscountExpiry}T23:59:59`).toISOString() : null,
      max_redemptions: maxRedemptions && maxRedemptions > 0 ? Math.floor(maxRedemptions) : null,
      notes: newDiscountNotes.trim() || null,
      created_by: userData.user?.id ?? null,
    })
    if (error) { setMessage(error.message); return }
    setNewDiscountCode(''); setNewDiscountLabel(''); setNewDiscountType('percentage'); setNewDiscountValue('10'); setNewDiscountExpiry(''); setNewDiscountMaxUses(''); setNewDiscountNotes('')
    setMessage('Discount code created.')
    await loadAdminData()
  }

  const toggleDiscountCode = async (discount: DiscountCode) => {
    if (!supabase || access?.role !== 'administrator') return
    const { error } = await supabase.from('media_discount_codes').update({ is_active: !discount.is_active }).eq('id', discount.id)
    setMessage(error ? error.message : `${discount.code} ${discount.is_active ? 'disabled' : 'enabled'}.`)
    if (!error) await loadAdminData()
  }

  const deleteDiscountCode = async (discount: DiscountCode) => {
    if (!supabase || access?.role !== 'administrator') return
    const { error } = await supabase.from('media_discount_codes').delete().eq('id', discount.id)
    setMessage(error ? error.message : `${discount.code} deleted.`)
    if (!error) await loadAdminData()
  }

  if (!isSupabaseConfigured) return <AdminShell><div className="admin-state"><Settings2 /><h1>Administration setup required</h1><p>Add the Supabase project URL and publishable key to the environment before staff can sign in.</p><Link className="button button--primary" to="/">Return to website</Link></div></AdminShell>
  if (loading) return <AdminShell><div className="admin-state"><LoaderCircle className="spin" /><h1>Loading CKEFA Media</h1></div></AdminShell>
  if (!signedIn) return <AdminShell><form className="login-card" onSubmit={signIn}><span className="eyebrow">Staff access</span><h1>Sign in to CKEFA Media</h1><p>Manage bookings, payment verification, availability and service pricing.</p>{message ? <div className="alert alert--error">{message}</div> : null}<label className="field"><span>Email address</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="field"><span>Password</span><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="button button--primary button--full" type="submit"><LogIn /> Sign in</button><button className="button button--outline button--full" type="button" onClick={() => void sendPasswordReset()}>Forgot password?</button></form></AdminShell>
  if (!access?.is_active) return <AdminShell onSignOut={signOut}><div className="admin-state"><Settings2 /><h1>This account does not have portal access.</h1><p>Ask an administrator to add the user ID to <code>media_admin_users</code>.</p></div></AdminShell>

  return <AdminShell onSignOut={signOut}><div className="admin-dashboard">
    <div className="admin-title"><div><span className="eyebrow">Operations portal</span><h1>CKEFA Media bookings</h1><p>Manage provisional requests, manual payment verification, operational decisions and calendar blackouts.</p></div><button className="button button--outline" type="button" onClick={() => void loadAdminData()}><RefreshCw /> Refresh</button></div>
    {message ? <div className="alert">{message}</div> : null}
    <div className="admin-tabs" role="tablist"><button className={tab === 'bookings' ? 'active' : ''} onClick={() => setTab('bookings')}><CalendarDays /> Bookings</button><button className={tab === 'services' ? 'active' : ''} onClick={() => setTab('services')}><Video /> Services & pricing</button><button className={tab === 'discounts' ? 'active' : ''} onClick={() => setTab('discounts')}><BadgePercent /> Discount codes</button><button className={tab === 'availability' ? 'active' : ''} onClick={() => setTab('availability')}><Settings2 /> Availability & payments</button></div>

    {tab === 'bookings' ? <section className="admin-panel admin-panel--bookings">
      <div className="admin-panel__heading"><div><h2>Booking workflow</h2><p>{bookings.length} booking{bookings.length === 1 ? '' : 's'} recorded. Each card shows the commercial and operational state separately so the next action is clear.</p></div></div>
      <div className="booking-workflow-list">
        {bookings.map((booking) => {
          const quotedTotal = booking.quoted_total_pence ?? 0
          const finalTotal = booking.net_total_pence ?? (booking.quoted_total_pence !== null ? netTotalForBooking(booking, quotedTotal) : 0)
          const balanceDue = Math.max(finalTotal - booking.amount_paid_pence, 0)
          const eventLabel = booking.home_team || booking.away_team
            ? `${booking.home_team || 'TBC'}${booking.away_team ? ` v ${booking.away_team}` : ''}`
            : booking.competition || booking.organisation_name || 'Event details not specified'
          return <article className="booking-workflow-card" key={booking.id}>
            <div className="booking-workflow-card__header">
              <div><span className="eyebrow">{booking.service_name}</span><h3>{eventLabel}</h3><p>{booking.reference} Â· {formatDateTime(booking.event_start)}</p></div>
              <div className="booking-workflow-card__statuses"><span className={`table-pill table-pill--${booking.payment_verification_status}`}>{booking.payment_verification_status.replaceAll('_', ' ')}</span><span className={`table-pill table-pill--ops-${booking.operations_status}`}>{booking.operations_status.replaceAll('_', ' ')}</span></div>
            </div>
            <div className="booking-workflow-card__grid">
              <div className="workflow-summary-block"><span>Customer</span><strong>{booking.customer_name}</strong><small>{booking.customer_email}</small><small>{booking.customer_phone}</small></div>
              <div className="workflow-summary-block"><span>Venue</span><strong>{booking.venue_name}</strong><small>{booking.postcode}</small>{booking.age_group ? <small>Age group: {booking.age_group}</small> : null}</div>
              <div className="workflow-summary-block"><span>Payment</span><strong>{booking.quoted_total_pence !== null ? `${formatMoney(booking.amount_paid_pence)} paid of ${formatMoney(finalTotal)}` : booking.amount_due_pence > 0 ? `${formatMoney(booking.amount_due_pence)} deposit` : 'No deposit required'}</strong>{booking.discount_code ? <small className="workflow-discount">Code {booking.discount_code}: {booking.discount_label || 'discount applied'}{booking.quoted_discount_pence > 0 ? ` (-${formatMoney(booking.quoted_discount_pence)})` : booking.deposit_discount_pence > 0 ? ` (-${formatMoney(booking.deposit_discount_pence)} deposit)` : ''}</small> : null}<small>{booking.payment_method?.replaceAll('_', ' ') ?? (booking.amount_due_pence === 0 ? 'Complimentary / waived payment' : 'Payment method not selected')}</small>{booking.quoted_total_pence !== null ? <small>Balance: {formatMoney(balanceDue)}</small> : null}{booking.customer_payment_reference ? <small>Deposit ref: {booking.customer_payment_reference}</small> : null}</div>
              <div className="workflow-summary-block"><span>Customer communication</span><strong>{booking.confirmation_email_sent_at ? 'Confirmation sent' : 'Not yet confirmed by email'}</strong>{booking.confirmation_email_sent_at ? <small>{formatDateTime(booking.confirmation_email_sent_at)}</small> : null}{booking.confirmation_email_error ? <small className="workflow-error">Email issue: {booking.confirmation_email_error}</small> : null}<small>Settlement: {booking.settlement_status?.replaceAll('_', ' ')}</small></div>
            </div>
            <div className="workflow-action-panel">
              <div className="workflow-action-panel__intro"><strong>Next action</strong><small>{booking.payment_verification_status === 'pending_verification' ? 'Check the customer payment before moving the booking forward.' : booking.operations_status === 'awaiting_confirmation' ? 'Set the agreed total, then accept the production request and email the customer.' : booking.operations_status === 'confirmed' && balanceDue > 0 ? 'The booking is confirmed. Record the remaining balance when received.' : booking.settlement_status === 'paid_in_full' ? 'Payment is complete. Mark the job complete after production.' : 'Review the booking status and take the appropriate operational action.'}</small></div>
              <div className="workflow-actions workflow-actions--card">
                {booking.payment_verification_status === 'pending_verification' ? <><button className="button button--small button--primary" type="button" onClick={() => void runBookingAction(booking, 'verify_payment')}><CircleDollarSign /> Verify Â£{(booking.amount_due_pence / 100).toFixed(0)} deposit</button><button className="button button--small button--outline" type="button" onClick={() => void runBookingAction(booking, 'reject_payment')}><XCircle /> Reject claim</button></> : null}
                {booking.operations_status === 'awaiting_confirmation' ? <>
                  <div className="workflow-fields">
                    <label className="field"><span>Agreed price before discount (Â£)</span><input type="number" min="0.01" step="0.01" value={quoteDrafts[booking.id] ?? (booking.quoted_total_pence !== null ? (booking.quoted_total_pence / 100).toFixed(2) : '')} onChange={(e) => setQuoteDrafts((current) => ({ ...current, [booking.id]: e.target.value }))} placeholder="e.g. 250.00" />{booking.discount_code ? <small>Code {booking.discount_code} will be applied to the final total automatically.</small> : null}</label>
                    <label className="field"><span>Balance payment link (optional)</span><input type="url" value={balanceUrlDrafts[booking.id] ?? booking.balance_payment_url ?? ''} onChange={(e) => setBalanceUrlDrafts((current) => ({ ...current, [booking.id]: e.target.value }))} placeholder="PayPal / future Stripe link" /></label>
                  </div>
                  <button className="button button--small button--primary" type="button" onClick={() => void runConfirmationAction(booking, 'confirm')}><CheckCircle2 /> Accept & email customer</button>
                  <button className="button button--small button--danger" type="button" onClick={() => void runBookingAction(booking, 'decline')}><Ban /> Decline</button>
                </> : null}
               {booking.operations_status === 'provisional' &&
 booking.payment_verification_status !== 'pending_verification' ? (
  <>
    {booking.amount_due_pence > 0 &&
     booking.amount_paid_pence === 0 &&
     (!booking.payment_method || booking.payment_method === 'paypal') ? (
      <button
        className="button button--small button--primary"
        type="button"
        onClick={() => void runBookingAction(booking, 'verify_payment')}
      >
        <CircleDollarSign />
        Record verified PayPal deposit ({formatMoney(booking.amount_due_pence)})
      </button>
    ) : null}

    <button
      className="button button--small button--danger"
      type="button"
      onClick={() => void runBookingAction(booking, 'decline')}
    >
      <Ban /> Decline
    </button>
  </>
) : null}
                {booking.operations_status === 'confirmed' ? <>
                  {balanceDue > 0 ? <><div className="workflow-fields workflow-fields--single"><label className="field"><span>Balance payment reference (optional)</span><input value={balanceReferenceDrafts[booking.id] ?? ''} onChange={(e) => setBalanceReferenceDrafts((current) => ({ ...current, [booking.id]: e.target.value }))} placeholder={booking.reference} /></label></div><button className="button button--small button--primary" type="button" onClick={() => void runConfirmationAction(booking, 'balance_paid')}><CircleDollarSign /> Mark balance paid ({formatMoney(balanceDue)})</button></> : null}
                  <button className="button button--small button--outline" type="button" onClick={() => void runConfirmationAction(booking, 'resend_confirmation')}><RefreshCw /> Resend confirmation</button>
                  {booking.settlement_status === 'paid_in_full' ? <button className="button button--small button--outline" type="button" onClick={() => void runBookingAction(booking, 'complete')}><CheckCircle2 /> Complete production</button> : null}
                </> : null}
                {booking.operations_status === 'refund_pending' ? <button className="button button--small button--danger" type="button" onClick={() => void runBookingAction(booking, 'refund')}><RotateCcw /> Mark refunded</button> : null}
              </div>
            </div>
          </article>
        })}
        {bookings.length === 0 ? <div className="empty-cell">No bookings have been received yet.</div> : null}
      </div>
    </section> : null}

    {tab === 'services' ? <section className="admin-panel"><div className="admin-panel__heading"><div><h2>Services and pricing</h2><p>Prices are stored in pence. Camera and crew values are internal capacity controls and are never shown on the public booking page.</p></div></div><div className="admin-service-list">{services.map((service, index) => <div className="admin-service" key={service.id}><div className="admin-service__title"><strong>{service.name}</strong><label><input type="checkbox" checked={service.is_active} onChange={(e) => setServices((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, is_active: e.target.checked } : item))} /> Live</label></div><div className="admin-fields"><label className="field"><span>Full price (pence)</span><input type="number" min="0" value={service.price_pence ?? ''} onChange={(e) => setServices((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, price_pence: e.target.value ? Number(e.target.value) : null } : item))} /></label><label className="field"><span>Duration (minutes)</span><input type="number" min="30" value={service.duration_minutes} onChange={(e) => setServices((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, duration_minutes: Number(e.target.value) } : item))} /></label><label className="field"><span>Buffer (minutes)</span><input type="number" min="0" value={service.buffer_minutes} onChange={(e) => setServices((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, buffer_minutes: Number(e.target.value) } : item))} /></label><label className="field"><span>Internal camera units</span><input type="number" min="0" max="10" value={service.camera_units} onChange={(e) => setServices((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, camera_units: Number(e.target.value) } : item))} /></label><label className="field"><span>Internal crew units</span><input type="number" min="0" max="20" value={service.crew_units} onChange={(e) => setServices((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, crew_units: Number(e.target.value) } : item))} /></label></div><button className="button button--outline button--small" type="button" onClick={() => void saveService(service)}><Save /> Save service</button></div>)}</div></section> : null}

    {tab === 'discounts' ? <div className="admin-stack">
      <section className="admin-panel"><div className="admin-panel__heading"><div><h2>Discount & complimentary codes</h2><p>Create reusable codes for percentage discounts, fixed-value discounts or bookings where no payment is required. Codes apply to both the booking deposit and the final agreed price.</p></div></div>
      {access.role === 'administrator' ? <form className="discount-admin-form" onSubmit={createDiscountCode}><div className="admin-fields"><label className="field"><span>Code</span><input required minLength={3} value={newDiscountCode} onChange={(e) => setNewDiscountCode(e.target.value.toUpperCase().replace(/\s+/g, ''))} placeholder="e.g. TEAMFREE" /></label><label className="field"><span>Customer-facing label</span><input required value={newDiscountLabel} onChange={(e) => setNewDiscountLabel(e.target.value)} placeholder="e.g. Partner team complimentary coverage" /></label><label className="field"><span>Type</span><select value={newDiscountType} onChange={(e) => setNewDiscountType(e.target.value as DiscountType)}><option value="percentage">Percentage discount</option><option value="fixed">Fixed Â£ discount</option><option value="complimentary">Complimentary â€” 100% off</option></select></label>{newDiscountType !== 'complimentary' ? <label className="field"><span>{newDiscountType === 'percentage' ? 'Discount (%)' : 'Discount amount (Â£)'}</span><input type="number" min={newDiscountType === 'percentage' ? 1 : 0.01} max={newDiscountType === 'percentage' ? 100 : undefined} step={newDiscountType === 'percentage' ? 1 : 0.01} value={newDiscountValue} onChange={(e) => setNewDiscountValue(e.target.value)} /></label> : null}<label className="field"><span>Expiry date (optional)</span><input type="date" value={newDiscountExpiry} onChange={(e) => setNewDiscountExpiry(e.target.value)} /></label><label className="field"><span>Maximum uses (optional)</span><input type="number" min="1" value={newDiscountMaxUses} onChange={(e) => setNewDiscountMaxUses(e.target.value)} placeholder="Unlimited" /></label><label className="field field--wide"><span>Internal notes (optional)</span><textarea rows={2} value={newDiscountNotes} onChange={(e) => setNewDiscountNotes(e.target.value)} placeholder="Who this code is for" /></label></div><button className="button button--primary" type="submit"><BadgePercent /> Create code</button></form> : <p className="empty-note">Only administrators can create or change discount codes.</p>}</section>
      <section className="admin-panel"><div className="admin-panel__heading"><div><h2>Existing codes</h2><p>{discountCodes.length} code{discountCodes.length === 1 ? '' : 's'} configured.</p></div></div><div className="discount-code-list">{discountCodes.map((discount) => <article className="discount-code-card" key={discount.id}><div><div className="discount-code-card__title"><strong>{discount.code}</strong><span className={discount.is_active ? 'table-pill table-pill--verified' : 'table-pill'}>{discount.is_active ? 'active' : 'disabled'}</span></div><h3>{discount.label}</h3><p>{discount.discount_type === 'complimentary' ? '100% complimentary â€” no customer payment required' : discount.discount_type === 'percentage' ? `${discount.discount_value}% off` : `${formatMoney(discount.discount_value)} off`}</p><small>Used {discount.redemption_count}{discount.max_redemptions ? ` of ${discount.max_redemptions}` : ' times'}{discount.valid_until ? ` Â· expires ${formatDateTime(discount.valid_until)}` : ''}</small>{discount.notes ? <small>{discount.notes}</small> : null}</div>{access.role === 'administrator' ? <div className="discount-code-card__actions"><button className="button button--small button--outline" type="button" onClick={() => void toggleDiscountCode(discount)}>{discount.is_active ? 'Disable' : 'Enable'}</button><button className="button button--small button--danger" type="button" onClick={() => void deleteDiscountCode(discount)}><Trash2 /> Delete</button></div> : null}</article>)}{discountCodes.length === 0 ? <p className="empty-note">No discount codes yet. Create a complimentary code for trusted teams or a percentage/fixed code for promotions.</p> : null}</div></section>
    </div> : null}

    {tab === 'availability' ? <div className="admin-stack">
      <section className="admin-panel"><div className="admin-panel__heading"><div><h2>Internal capacity</h2><p>These values drive Available / Unavailable on the public site without exposing cameras or staff numbers.</p></div></div><div className="settings-grid">{([['camera_capacity','Camera capacity'],['crew_capacity','Concurrent crew capacity'],['opening_hour','First booking hour'],['closing_hour','Last booking hour'],['slot_interval_minutes','Slot interval (minutes)'],['default_buffer_minutes','Default buffer (minutes)'],['provisional_hold_hours','Provisional booking hold (hours)'],['verification_hold_hours','Payment verification hold (hours)']] as [keyof Settings,string][]).map(([key,label]) => typeof settings[key] === 'number' ? <label className="field" key={key}><span>{label}</span><input type="number" min="0" value={settings[key] as number} onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })} /></label> : null)}</div></section>

      <section className="admin-panel"><div className="admin-panel__heading"><div><h2>Booking deposit & payment methods</h2><p>Use one configurable deposit across CKEFA Media bookings. The remaining balance is agreed separately. Current payments are manually verified, while the Stripe schema remains available for future Stripe Checkout / Pay by Bank activation.</p></div></div><div className="payment-admin-grid"><div className="admin-service"><div className="admin-service__title"><strong>Booking deposit policy</strong><label><input type="checkbox" checked={settings.deposit_required} onChange={(e) => setSettings({ ...settings, deposit_required: e.target.checked })} /> Deposit required</label></div><div className="admin-fields"><label className="field"><span>Deposit amount (Â£)</span><input type="number" min="1" step="0.01" disabled={!settings.deposit_required} value={(settings.booking_deposit_pence / 100).toFixed(2)} onChange={(e) => setSettings({ ...settings, booking_deposit_pence: Math.max(0, Math.round(Number(e.target.value || 0) * 100)) })} /></label><label className="field"><span>Provisional hold (hours)</span><input type="number" min="1" max="168" value={settings.provisional_hold_hours} onChange={(e) => setSettings({ ...settings, provisional_hold_hours: Number(e.target.value) })} /></label></div><p className="empty-note">Recommended starting policy: Â£50 deposit with a 24-hour provisional hold. Payment secures the provisional slot; CKEFA Media still confirms or declines the booking after verification.</p></div><div className="admin-service"><div className="admin-service__title"><strong><Landmark /> Bank transfer</strong><label><input type="checkbox" checked={settings.bank_transfer_enabled} onChange={(e) => setSettings({ ...settings, bank_transfer_enabled: e.target.checked })} /> Enabled</label></div><div className="admin-fields"><label className="field"><span>Account name</span><input value={settings.bank_account_name ?? ''} onChange={(e) => setSettings({ ...settings, bank_account_name: e.target.value })} /></label><label className="field"><span>Bank name</span><input value={settings.bank_name ?? ''} onChange={(e) => setSettings({ ...settings, bank_name: e.target.value })} /></label><label className="field"><span>Sort code</span><input value={settings.bank_sort_code ?? ''} onChange={(e) => setSettings({ ...settings, bank_sort_code: e.target.value })} /></label><label className="field"><span>Account number</span><input value={settings.bank_account_number ?? ''} onChange={(e) => setSettings({ ...settings, bank_account_number: e.target.value })} /></label><label className="field field--wide"><span>Extra payment instructions</span><textarea rows={3} value={settings.bank_payment_instructions ?? ''} onChange={(e) => setSettings({ ...settings, bank_payment_instructions: e.target.value })} /></label></div></div><div className="admin-service"><div className="admin-service__title"><strong>PayPal payment link</strong><label><input type="checkbox" checked={settings.paypal_enabled} onChange={(e) => setSettings({ ...settings, paypal_enabled: e.target.checked })} /> Enabled</label></div><label className="field"><span>PayPal URL</span><input type="url" placeholder="https://paypal.me/..." value={settings.paypal_url ?? ''} onChange={(e) => setSettings({ ...settings, paypal_url: e.target.value })} /></label></div></div><button className="button button--primary" type="button" onClick={() => void saveSettings()}><Save /> Save availability & payments</button></section>

      <section className="admin-panel"><div className="admin-panel__heading"><div><h2>Calendar blackouts</h2><p>Block holidays, maintenance windows, staff unavailability or any period that must show as unavailable publicly.</p></div></div><form className="blackout-form" onSubmit={addBlackout}><label className="field"><span>Start</span><input type="datetime-local" required value={blackoutStartsAt} onChange={(e) => setBlackoutStartsAt(e.target.value)} /></label><label className="field"><span>End</span><input type="datetime-local" required value={blackoutEndsAt} onChange={(e) => setBlackoutEndsAt(e.target.value)} /></label><label className="field"><span>Reason</span><input placeholder="e.g. Equipment maintenance" value={blackoutReason} onChange={(e) => setBlackoutReason(e.target.value)} /></label><button className="button button--primary" type="submit"><CalendarDays /> Add blackout</button></form><div className="blackout-list">{blackouts.map((blackout) => <div className="blackout-item" key={blackout.id}><div><strong>{formatDateTime(blackout.starts_at)} â†’ {formatDateTime(blackout.ends_at)}</strong><span>{blackout.reason || 'No reason supplied'}</span></div><button className="button button--tiny button--danger" type="button" onClick={() => void removeBlackout(blackout.id)}><Trash2 /> Remove</button></div>)}{blackouts.length === 0 ? <p className="empty-note">No blackout periods configured.</p> : null}</div></section>
    </div> : null}
  </div></AdminShell>
}

function AdminShell({ children, onSignOut }: { children: React.ReactNode; onSignOut?: () => void }) {
  return <div className="admin-frame"><header className="admin-header"><div className="page-shell"><Brand compact /><div><Link className="button button--outline button--small" to="/">View website <ExternalLink /></Link>{onSignOut ? <button className="button button--outline button--small" type="button" onClick={onSignOut}><LogOut /> Sign out</button> : null}</div></div></header><main className="page-shell admin-main">{children}</main></div>
}
