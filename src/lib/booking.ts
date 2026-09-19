import { fallbackServices } from '../data/services'
import type { BookingDetails, DiscountPreview, PaymentOptions, ProvisionalBookingResult, PublicAvailability, ServicePackage } from '../types'
import { isSupabaseConfigured, supabase } from './supabase'

export async function loadServices(): Promise<ServicePackage[]> {
  if (!isSupabaseConfigured || !supabase) return fallbackServices

  const { data, error } = await supabase
    .from('media_services')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (error) throw error
  return (data ?? []) as ServicePackage[]
}

export async function loadPaymentOptions(): Promise<PaymentOptions> {
  if (!isSupabaseConfigured || !supabase) {
    return { bank_transfer_enabled: true, paypal_enabled: true, deposit_required: true, booking_deposit_pence: 5000, provisional_hold_hours: 24 }
  }

  const { data, error } = await supabase.rpc('get_media_payment_options')
  if (error) throw error
  const row = data?.[0]
  return {
    bank_transfer_enabled: Boolean(row?.bank_transfer_enabled),
    paypal_enabled: Boolean(row?.paypal_enabled),
    deposit_required: row?.deposit_required !== false,
    booking_deposit_pence: Number(row?.booking_deposit_pence ?? 5000),
    provisional_hold_hours: Number(row?.provisional_hold_hours ?? 24),
  }
}

export async function checkAvailability(date: string, time: string, service: ServicePackage): Promise<PublicAvailability> {
  if (!date || !time) return { available: false }
  if (!isSupabaseConfigured || !supabase) return { available: true }

  const { data, error } = await supabase.rpc('get_media_public_availability', {
    requested_date: date,
    requested_time: time,
    requested_service_id: service.id,
  })

  if (error) throw error
  return { available: Boolean(data?.[0]?.available) }
}


export async function previewDiscountCode(code: string, baseAmountPence: number): Promise<DiscountPreview> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      valid: false,
      message: 'Discount codes require the live booking service.',
      code: null,
      label: null,
      discount_type: null,
      discount_value: null,
      base_amount_pence: baseAmountPence,
      discount_amount_pence: 0,
      adjusted_amount_pence: baseAmountPence,
      payment_required: baseAmountPence > 0,
    }
  }

  const { data, error } = await supabase.rpc('preview_media_discount_code', {
    requested_code: code,
    requested_base_amount_pence: baseAmountPence,
  })
  if (error) throw error
  const row = data?.[0] as DiscountPreview | undefined
  if (!row) throw new Error('We could not validate that discount code.')
  return row
}

export async function createProvisionalBooking(details: BookingDetails): Promise<ProvisionalBookingResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Booking submission is awaiting the Supabase production configuration.')
  }
  const { data, error } = await supabase.rpc('create_media_provisional_booking', {
    requested_service_id: details.serviceId,
    requested_date: details.eventDate,
    requested_time: details.eventTime,
    requested_payment_method: details.paymentMethod || null,
    requested_customer_name: details.customerName,
    requested_customer_email: details.customerEmail,
    requested_customer_phone: details.customerPhone,
    requested_organisation_name: details.organisationName,
    requested_venue_name: details.venueName,
    requested_postcode: details.postcode,
    requested_home_team: details.homeTeam,
    requested_away_team: details.awayTeam,
    requested_age_group: details.ageGroup,
    requested_competition: details.competition,
    requested_notes: details.notes,
    requested_media_consent: details.mediaConsentConfirmed,
    requested_honeypot: details.honeypot,
    requested_discount_code: details.discountCode.trim() || null,
  })

  if (error) throw error
  const row = data?.[0] as ProvisionalBookingResult | undefined
  if (!row?.booking_reference) throw new Error('The provisional booking could not be created.')
  return row
}

export async function markPaymentSubmitted(reference: string, email: string, paymentReference: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Payment verification is not configured.')

  const { error } = await supabase.rpc('mark_media_payment_submitted', {
    requested_booking_reference: reference,
    requested_customer_email: email,
    requested_payment_reference: paymentReference,
  })
  if (error) throw error
}
