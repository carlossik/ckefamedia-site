import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Landmark,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Tag,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fallbackServices } from '../data/services'
import { checkAvailability, createProvisionalBooking, loadPaymentOptions, loadServices, markPaymentSubmitted, previewDiscountCode } from '../lib/booking'
import { formatMoney, localDateInput } from '../lib/format'
import { isSupabaseConfigured } from '../lib/supabase'
import type { BookingDetails, DiscountPreview, PaymentOptions, ProvisionalBookingResult, ServicePackage } from '../types'

const emptyDetails: BookingDetails = {
  serviceId: '', eventDate: '', eventTime: '', customerName: '', customerEmail: '', customerPhone: '', organisationName: '',
  venueName: '', postcode: '', homeTeam: '', awayTeam: '', ageGroup: '', competition: '', notes: '', paymentMethod: '',
  mediaConsentConfirmed: false, honeypot: '', discountCode: '',
}

const emptyPaymentOptions: PaymentOptions = {
  bank_transfer_enabled: false,
  paypal_enabled: false,
  deposit_required: true,
  booking_deposit_pence: 5000,
  provisional_hold_hours: 24,
}

function displayDateTime(date: string, time: string) {
  if (!date || !time) return 'Not selected'
  const value = new Date(`${date}T${time}:00`)
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short' }).format(value)
}

export function BookingPage() {
  const [searchParams] = useSearchParams()
  const [services, setServices] = useState<ServicePackage[]>(fallbackServices)
  const [selectedService, setSelectedService] = useState<ServicePackage | null>(null)
  const [details, setDetails] = useState<BookingDetails>(emptyDetails)
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptions>(emptyPaymentOptions)
  const [availability, setAvailability] = useState<boolean | null>(null)
  const [booking, setBooking] = useState<ProvisionalBookingResult | null>(null)
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentReported, setPaymentReported] = useState(false)
  const [discountPreview, setDiscountPreview] = useState<DiscountPreview | null>(null)
  const [discountLoading, setDiscountLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void Promise.all([loadServices(), loadPaymentOptions()])
      .then(([items, options]) => {
        setServices(items)
        setPaymentOptions(options)
        const requested = searchParams.get('service')
        if (requested) {
          const match = items.find((item) => item.slug === requested)
          if (match) {
            setSelectedService(match)
            setDetails((current) => ({ ...current, serviceId: match.id }))
          }
        }
      })
      .catch(() => setServices(fallbackServices))
  }, [searchParams])

  useEffect(() => {
    if (!details.eventDate || !details.eventTime || !selectedService) {
      setAvailability(null)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    setAvailability(null)
    void checkAvailability(details.eventDate, details.eventTime, selectedService)
      .then((result) => { if (active) setAvailability(result.available) })
      .catch(() => { if (active) setError('We could not check that date and time. Please try again.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [details.eventDate, details.eventTime, selectedService])

  const baseAmount = paymentOptions.deposit_required
    ? paymentOptions.booking_deposit_pence
    : selectedService?.deposit_pence ?? selectedService?.price_pence ?? null
  const amount = discountPreview?.valid ? discountPreview.adjusted_amount_pence : baseAmount
  const enabledPaymentMethods = useMemo(() => [
    paymentOptions.bank_transfer_enabled ? 'bank_transfer' : null,
    paymentOptions.paypal_enabled ? 'paypal' : null,
  ].filter(Boolean), [paymentOptions])

  const chooseService = (service: ServicePackage) => {
    setSelectedService(service)
    setDetails((current) => ({ ...current, serviceId: service.id, eventDate: '', eventTime: '', discountCode: '' }))
    setDiscountPreview(null)
    setAvailability(null)
    setStep(2)
  }

  const applyDiscount = async () => {
    if (baseAmount === null || !details.discountCode.trim()) {
      setDiscountPreview(null)
      if (!details.discountCode.trim()) setError('Enter a discount code first.')
      return
    }
    setDiscountLoading(true)
    setError('')
    try {
      const preview = await previewDiscountCode(details.discountCode, baseAmount)
      setDiscountPreview(preview)
      if (!preview.valid) setError(preview.message)
      if (preview.valid && !preview.payment_required) setDetails((current) => ({ ...current, paymentMethod: '' }))
    } catch (caught) {
      setDiscountPreview(null)
      setError(caught instanceof Error ? caught.message : 'We could not validate that discount code.')
    } finally {
      setDiscountLoading(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const paymentRequired = (amount ?? 0) > 0
    if (!selectedService || availability !== true || !details.mediaConsentConfirmed || (paymentRequired && !details.paymentMethod)) return
    setLoading(true)
    setError('')
    try {
      const result = await createProvisionalBooking(details)
      setBooking(result)
      setStep(5)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not create the provisional booking.')
    } finally {
      setLoading(false)
    }
  }

  const reportPayment = async (event: FormEvent) => {
    event.preventDefault()
    if (!booking) return
    setLoading(true)
    setError('')
    try {
      await markPaymentSubmitted(booking.booking_reference, details.customerEmail, paymentReference)
      setPaymentReported(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not submit the payment for verification.')
    } finally {
      setLoading(false)
    }
  }

  const steps = ['Service', 'Date & time', 'Match details', 'Review', 'Payment']

  return (
    <>
      <section className="page-hero page-hero--booking"><div className="page-shell"><span className="eyebrow">Book match coverage</span><h1>Check availability. Request your coverage.</h1><p>The public calendar shows only whether your chosen date and time is available. Operational capacity is managed internally by CKEFA Media.</p></div></section>
      <section className="booking-section"><div className="page-shell booking-layout">
        <div className="booking-main">
          <div className="stepper stepper--five" aria-label="Booking progress">
            {steps.map((label, index) => <div className={step >= index + 1 ? 'stepper__item stepper__item--active' : 'stepper__item'} key={label}><span>{step > index + 1 ? <Check size={15} /> : index + 1}</span><small>{label}</small></div>)}
          </div>

          {error ? <div className="alert alert--error"><AlertCircle /> <span>{error}</span></div> : null}
          {!isSupabaseConfigured ? <div className="alert"><AlertCircle /><span><strong>Preview mode:</strong> availability can be reviewed, but live provisional bookings remain disabled until Supabase is connected.</span></div> : null}

          {step === 1 ? <div className="booking-card"><span className="eyebrow">Step 1</span><h2>What would you like us to cover?</h2><div className="booking-services">{services.map((service) => <button type="button" key={service.id} onClick={() => chooseService(service)}><span><strong>{service.name}</strong><small>{service.short_description}</small></span><span>{paymentOptions.deposit_required ? `${formatMoney(paymentOptions.booking_deposit_pence)} deposit` : formatMoney(service.deposit_pence ?? service.price_pence)} <ArrowRight size={17} /></span></button>)}</div></div> : null}

          {step === 2 && selectedService ? <div className="booking-card"><button className="back-link" type="button" onClick={() => setStep(1)}><ArrowLeft /> Change service</button><span className="eyebrow">Step 2</span><h2>Choose the event date and start time.</h2><p className="booking-guidance">Choose the date and start time you need. We will return a simple availability result for that production window.</p><div className="form-grid"><label className="field"><span>Event date *</span><input type="date" required min={localDateInput()} value={details.eventDate} onChange={(event) => setDetails((current) => ({ ...current, eventDate: event.target.value }))} /></label><label className="field"><span>Kick-off / event start *</span><input type="time" required value={details.eventTime} onChange={(event) => setDetails((current) => ({ ...current, eventTime: event.target.value }))} /></label></div>{details.eventDate && details.eventTime ? <div className={`availability-result ${availability === false ? 'availability-result--unavailable' : ''}`}>{loading ? <><LoaderCircle className="spin" /><div><strong>Checking availability…</strong><span>Please wait while we validate the requested time.</span></div></> : availability === true ? <><CheckCircle2 /><div><strong>Available</strong><span>You can continue with your provisional booking request.</span></div></> : <><AlertCircle /><div><strong>Unavailable</strong><span>Please choose another date or time.</span></div></>}</div> : null}<div className="booking-actions"><button className="button button--primary" type="button" disabled={availability !== true} onClick={() => setStep(3)}>Continue <ArrowRight /></button></div></div> : null}

          {step === 3 ? <form className="booking-card" onSubmit={(event) => { event.preventDefault(); setStep(4) }}><button className="back-link" type="button" onClick={() => setStep(2)}><ArrowLeft /> Change date or time</button><span className="eyebrow">Step 3</span><h2>Tell us about the fixture or event.</h2><div className="form-grid"><label className="field"><span>Your name *</span><input required value={details.customerName} onChange={(e) => setDetails({ ...details, customerName: e.target.value })} /></label><label className="field"><span>Email address *</span><input required type="email" value={details.customerEmail} onChange={(e) => setDetails({ ...details, customerEmail: e.target.value })} /></label><label className="field"><span>Telephone *</span><input required type="tel" value={details.customerPhone} onChange={(e) => setDetails({ ...details, customerPhone: e.target.value })} /></label><label className="field"><span>Club or organisation</span><input value={details.organisationName} onChange={(e) => setDetails({ ...details, organisationName: e.target.value })} /></label><label className="field field--wide"><span>Venue name or address *</span><input required value={details.venueName} onChange={(e) => setDetails({ ...details, venueName: e.target.value })} /></label><label className="field"><span>Postcode *</span><input required value={details.postcode} onChange={(e) => setDetails({ ...details, postcode: e.target.value.toUpperCase() })} /></label><label className="field"><span>Age group</span><input placeholder="e.g. U15" value={details.ageGroup} onChange={(e) => setDetails({ ...details, ageGroup: e.target.value })} /></label><label className="field"><span>Home team</span><input value={details.homeTeam} onChange={(e) => setDetails({ ...details, homeTeam: e.target.value })} /></label><label className="field"><span>Away team</span><input value={details.awayTeam} onChange={(e) => setDetails({ ...details, awayTeam: e.target.value })} /></label><label className="field field--wide"><span>Competition or event</span><input value={details.competition} onChange={(e) => setDetails({ ...details, competition: e.target.value })} /></label><label className="field field--wide"><span>Production notes or requirements</span><textarea rows={4} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} /></label><label className="honeypot" aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" value={details.honeypot} onChange={(e) => setDetails({ ...details, honeypot: e.target.value })} /></label></div><div className="booking-actions"><button className="button button--primary" type="submit">Review booking <ArrowRight /></button></div></form> : null}

          {step === 4 && selectedService ? <form className="booking-card" onSubmit={submit}><button className="back-link" type="button" onClick={() => setStep(3)}><ArrowLeft /> Edit match details</button><span className="eyebrow">Step 4</span><h2>Review and create a provisional booking.</h2><div className="review-list"><div><span>Service</span><strong>{selectedService.name}</strong></div><div><span>Date and time</span><strong>{displayDateTime(details.eventDate, details.eventTime)}</strong></div><div><span>Fixture</span><strong>{details.homeTeam || details.organisationName || 'Event'}{details.awayTeam ? ` v ${details.awayTeam}` : ''}</strong></div><div><span>Venue</span><strong>{details.venueName}, {details.postcode}</strong></div><div><span>{paymentOptions.deposit_required ? 'Standard booking deposit' : 'Standard payment'}</span><strong>{formatMoney(baseAmount)}</strong></div>{discountPreview?.valid ? <><div><span>Discount code</span><strong>{discountPreview.code} · {discountPreview.label}</strong></div><div><span>Discount</span><strong>-{formatMoney(discountPreview.discount_amount_pence)}</strong></div></> : null}<div><span>{discountPreview?.valid ? 'Deposit due now' : paymentOptions.deposit_required ? 'Booking deposit' : 'Amount to send'}</span><strong>{formatMoney(amount)}</strong></div></div>

          <div className="discount-box"><div><Tag /><span><strong>Discount or complimentary code</strong><small>Have a CKEFA Media code? Apply it before choosing how to pay.</small></span></div><div className="discount-box__form"><input value={details.discountCode} onChange={(event) => { setDetails({ ...details, discountCode: event.target.value.toUpperCase() }); setDiscountPreview(null) }} placeholder="Enter code" /><button className="button button--outline button--small" type="button" onClick={() => void applyDiscount()} disabled={discountLoading || !details.discountCode.trim()}>{discountLoading ? <><LoaderCircle className="spin" /> Checking…</> : 'Apply code'}</button>{details.discountCode || discountPreview ? <button className="button button--text button--small" type="button" onClick={() => { setDetails({ ...details, discountCode: '', paymentMethod: '' }); setDiscountPreview(null); setError('') }}>Remove</button> : null}</div>{discountPreview?.valid ? <div className={discountPreview.payment_required ? 'discount-result' : 'discount-result discount-result--complimentary'}><CheckCircle2 /><span><strong>{discountPreview.message}</strong>{discountPreview.payment_required ? `${formatMoney(discountPreview.adjusted_amount_pence)} booking deposit due now.` : 'No booking deposit is required. Your request will go straight to CKEFA Media for confirmation.'}</span></div> : null}</div>

          {paymentOptions.deposit_required && (amount ?? 0) > 0 ? <div className="alert"><ShieldCheck /><span><strong>Secure the slot with a {formatMoney(amount)} booking deposit.</strong> Your provisional booking is held for {paymentOptions.provisional_hold_hours} hours while you make the payment. The remaining balance is agreed separately once CKEFA Media confirms the booking.</span></div> : null}

          {(amount ?? 0) > 0 ? <div className="payment-methods"><strong>Payment method</strong>{paymentOptions.bank_transfer_enabled ? <label className={details.paymentMethod === 'bank_transfer' ? 'payment-choice payment-choice--selected' : 'payment-choice'}><input type="radio" name="paymentMethod" value="bank_transfer" checked={details.paymentMethod === 'bank_transfer'} onChange={() => setDetails({ ...details, paymentMethod: 'bank_transfer' })} /><Landmark /><span><b>Bank transfer</b><small>Pay directly from your bank, then submit the payment for manual verification.</small></span></label> : null}{paymentOptions.paypal_enabled ? <label className={details.paymentMethod === 'paypal' ? 'payment-choice payment-choice--selected' : 'payment-choice'}><input type="radio" name="paymentMethod" value="paypal" checked={details.paymentMethod === 'paypal'} onChange={() => setDetails({ ...details, paymentMethod: 'paypal' })} /><ShieldCheck /><span><b>PayPal</b><small>Use the configured CKEFA Media PayPal payment link, then submit the payment for verification.</small></span></label> : null}{enabledPaymentMethods.length === 0 ? <div className="alert"><AlertCircle /><span>Payment instructions have not yet been enabled by CKEFA Media. Please contact the team before submitting a booking.</span></div> : null}</div> : <div className="alert"><CheckCircle2 /><span><strong>No payment required at booking.</strong> This code waives the booking deposit. CKEFA Media will review the request and confirm the booking directly.</span></div>}

          <label className="consent-check"><input type="checkbox" checked={details.mediaConsentConfirmed} onChange={(e) => setDetails({ ...details, mediaConsentConfirmed: e.target.checked })} /><span>I confirm that I am authorised to arrange this coverage and will obtain all required participant, safeguarding and media consents.</span></label>{amount === null ? <div className="alert"><AlertCircle /><span>A payment amount must be configured by CKEFA Media before a provisional booking can be created.</span></div> : null}<button className="button button--primary button--full" type="submit" disabled={loading || !details.mediaConsentConfirmed || ((amount ?? 0) > 0 && !details.paymentMethod) || amount === null || !isSupabaseConfigured}>{loading ? <><LoaderCircle className="spin" /> Creating provisional booking…</> : <>Create provisional booking <ArrowRight /></>}</button><p className="secure-note"><ShieldCheck /> {amount === 0 ? 'Complimentary requests still require CKEFA Media confirmation.' : 'Payment does not automatically confirm production. CKEFA Media verifies the payment and then confirms or declines the booking internally.'}</p></form> : null}

          {step === 5 && booking ? <div className="booking-card payment-instructions"><span className="eyebrow">Step 5</span><h2>{booking.payment_required ? 'Provisional booking' : 'Booking request'} {booking.booking_reference}</h2>{!booking.payment_required ? <div className="success-panel"><CheckCircle2 /><div><strong>No payment required</strong><p>{booking.discount_label ? `${booking.discount_label} has been applied. ` : ''}Your request is now awaiting CKEFA Media confirmation. We will contact you when it has been accepted or declined.</p></div></div> : paymentReported ? <div className="success-panel"><CheckCircle2 /><div><strong>Payment submitted for verification</strong><p>Your booking remains provisional until CKEFA Media verifies the payment and confirms that the production request can be honoured. We will contact you with the outcome.</p></div></div> : <><p>Your requested production window is being held until <strong>{booking.hold_expires_at ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(booking.hold_expires_at)) : 'CKEFA Media reviews the request'}</strong>. Send the <strong>{formatMoney(booking.amount_due_pence)} booking deposit</strong> using the method below, then tell us you have paid before the hold expires. The remaining balance will be agreed separately.</p>{booking.discount_code ? <div className="discount-result"><Tag /><span><strong>{booking.discount_code} applied</strong>{booking.discount_label ? `${booking.discount_label}. ` : ''}You saved {formatMoney(booking.discount_amount_pence)} on the booking deposit.</span></div> : null}{booking.payment_method === 'bank_transfer' ? <div className="bank-details"><div><span>Account name</span><strong>{booking.bank_account_name}</strong></div>{booking.bank_name ? <div><span>Bank</span><strong>{booking.bank_name}</strong></div> : null}<div><span>Sort code</span><strong>{booking.bank_sort_code}</strong></div><div><span>Account number</span><strong>{booking.bank_account_number}</strong></div><div><span>Payment reference</span><strong>{booking.booking_reference}</strong></div>{booking.bank_payment_instructions ? <p>{booking.bank_payment_instructions}</p> : null}</div> : null}{booking.payment_method === 'paypal' && booking.paypal_url ? <a className="button button--primary button--full" href={booking.paypal_url} target="_blank" rel="noreferrer">Open PayPal payment link <ExternalLink /></a> : null}<form className="payment-report-form" onSubmit={reportPayment}><label className="field"><span>Payment / transaction reference (optional)</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder={`e.g. ${booking.booking_reference}`} /></label><button className="button button--primary button--full" type="submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" /> Submitting…</> : 'I have made this payment'}</button></form><p className="secure-note"><AlertCircle /> Do not mark the payment as sent until you have completed the transfer or PayPal payment.</p></>}<div className="button-row"><Link className="button button--outline" to="/">Return home</Link><Link className="button button--outline" to="/contact">Contact CKEFA Media</Link></div></div> : null}
        </div>

        <aside className="booking-aside">
          <span className="eyebrow">Your booking</span>
          <h2>{selectedService?.name ?? 'Select a service'}</h2>
          {details.eventDate ? <div className="aside-detail"><CalendarDays /><span><strong>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(`${details.eventDate}T12:00:00`))}</strong>{details.eventTime ? `${details.eventTime} start` : 'Choose a start time'}</span></div> : null}
          {details.eventTime ? <div className="aside-detail"><Clock3 /><span><strong>{booking ? (!booking.payment_required ? 'Awaiting confirmation' : paymentReported ? 'Payment submitted' : 'Provisionally held') : availability === true ? 'Available' : availability === false ? 'Unavailable' : 'Checking'}</strong>{booking ? (!booking.payment_required ? 'No payment required' : paymentReported ? 'Awaiting payment verification' : booking.hold_expires_at ? `Held until ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(booking.hold_expires_at))}` : 'Awaiting CKEFA Media') : 'Public availability only'}</span></div> : null}
          {details.venueName ? <div className="aside-detail"><MapPin /><span><strong>{details.venueName}</strong>{details.postcode}</span></div> : null}
          <div className="aside-total"><span>{discountPreview?.valid ? 'Deposit after discount' : paymentOptions.deposit_required ? 'Booking deposit' : 'Payment'}</span><strong>{formatMoney(amount)}</strong></div>{discountPreview?.valid && discountPreview.discount_amount_pence > 0 ? <small className="aside-discount">{discountPreview.code}: save {formatMoney(discountPreview.discount_amount_pence)}</small> : null}
          <p>{booking ? (!booking.payment_required ? 'No payment is required. CKEFA Media will confirm or decline the booking request.' : paymentReported ? 'Your payment has been submitted for verification. CKEFA Media will confirm or decline the booking once the payment is verified.' : 'This production slot is now provisionally held while the booking deposit is completed.') : amount === 0 ? 'Your code removes the booking deposit. CKEFA Media will review the request directly.' : paymentOptions.deposit_required ? `The slot is held provisionally for ${paymentOptions.provisional_hold_hours} hours while the booking deposit is paid.` : 'The booking remains provisional while payment is arranged.'}{!booking && amount !== 0 ? ' CKEFA Media then verifies payment and confirms or declines the production request.' : ''}</p>
        </aside>
      </div></section>
    </>
  )
}
