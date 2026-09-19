export type ServicePackage = {
  id: string
  slug: string
  name: string
  short_description: string
  description: string
  price_pence: number | null
  deposit_pence: number | null
  duration_minutes: number
  buffer_minutes: number
  camera_units: number
  crew_units: number
  is_active: boolean
  sort_order: number
}

export type PaymentMethod = 'bank_transfer' | 'paypal'

export type DiscountType = 'percentage' | 'fixed' | 'complimentary'

export type DiscountPreview = {
  valid: boolean
  message: string
  code: string | null
  label: string | null
  discount_type: DiscountType | null
  discount_value: number | null
  base_amount_pence: number
  discount_amount_pence: number
  adjusted_amount_pence: number
  payment_required: boolean
}

export type DiscountCode = {
  id: string
  code: string
  label: string
  discount_type: DiscountType
  discount_value: number
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  max_redemptions: number | null
  redemption_count: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type PaymentOptions = {
  bank_transfer_enabled: boolean
  paypal_enabled: boolean
  deposit_required: boolean
  booking_deposit_pence: number
  provisional_hold_hours: number
}

export type PublicAvailability = {
  available: boolean
}

export type BookingDetails = {
  serviceId: string
  eventDate: string
  eventTime: string
  customerName: string
  customerEmail: string
  customerPhone: string
  organisationName: string
  venueName: string
  postcode: string
  homeTeam: string
  awayTeam: string
  ageGroup: string
  competition: string
  notes: string
  paymentMethod: PaymentMethod | ''
  mediaConsentConfirmed: boolean
  honeypot: string
  discountCode: string
}

export type ProvisionalBookingResult = {
  booking_id: string
  booking_reference: string
  amount_due_pence: number
  deposit_before_discount_pence: number
  discount_code: string | null
  discount_label: string | null
  discount_amount_pence: number
  payment_required: boolean
  payment_method: PaymentMethod | null
  bank_account_name: string | null
  bank_name: string | null
  bank_sort_code: string | null
  bank_account_number: string | null
  bank_payment_instructions: string | null
  paypal_url: string | null
  hold_expires_at: string | null
}

export type BookingRecord = {
  id: string
  reference: string
  service_id: string
  service_name: string
  customer_name: string
  customer_email: string
  customer_phone: string
  organisation_name: string | null
  venue_name: string
  postcode: string
  home_team: string | null
  away_team: string | null
  age_group: string | null
  competition: string | null
  event_start: string
  event_end: string
  status: string
  payment_status: string
  operations_status: string
  payment_method: string | null
  payment_verification_status: string
  customer_payment_reference: string | null
  payment_submitted_at: string | null
  payment_verified_at: string | null
  payment_verification_notes: string | null
  decision_notes: string | null
  amount_due_pence: number
  amount_paid_pence: number
  quoted_total_pence: number | null
  quoted_discount_pence: number
  net_total_pence: number | null
  discount_code_id: string | null
  discount_code: string | null
  discount_label: string | null
  discount_type: DiscountType | null
  discount_value: number | null
  deposit_before_discount_pence: number | null
  deposit_discount_pence: number
  settlement_status: string
  payment_policy_snapshot: string
  balance_payment_url: string | null
  balance_payment_reference: string | null
  balance_paid_at: string | null
  confirmation_email_attempted_at: string | null
  confirmation_email_sent_at: string | null
  confirmation_email_error: string | null
  hold_expires_at: string | null
  created_at: string
}

export type BlackoutPeriod = {
  id: string
  starts_at: string
  ends_at: string
  reason: string | null
  created_at: string
}
