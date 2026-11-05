export type Role = 'owner' | 'renter' | 'admin'

export const PRIMARY_RENTAL_USE_OPTIONS = [
  { value: 'school_film_video_projects', label: 'School film/video projects' },
  { value: 'campus_journalism', label: 'Campus journalism' },
  { value: 'freelance_client_productions', label: 'Freelance/client productions' },
  { value: 'photography_content_creation', label: 'Photography/content creation' },
  { value: 'personal_hobby_projects', label: 'Personal/hobby projects' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const

export type PrimaryRentalUse = (typeof PRIMARY_RENTAL_USE_OPTIONS)[number]['value']

export type Profile = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  address: string | null
  role: Role
  primary_rental_use: PrimaryRentalUse | null
  is_student: boolean
  verification_status: 'unverified' | 'pending' | 'verified'
  created_at: string
  updated_at: string
}

export type VerificationDocType = 'government_id' | 'selfie' | 'student_id' | 'proof_of_enrollment'
export type VerificationReviewStatus = 'pending' | 'approved' | 'rejected'

export type VerificationSubmission = {
  id: string
  user_id: string
  doc_type: VerificationDocType
  file_path: string
  status: VerificationReviewStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export type VerificationSubmissionWithUser = VerificationSubmission & {
  user: Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'verification_status' | 'is_student'> | null
}

export type AdminUserRow = Profile & {
  gear_listings: { count: number }[]
  bookings: { count: number }[]
}

export type ListingStatus = 'available' | 'paused'
export type ListingCategory = 'Cameras' | 'Lenses' | 'Lighting' | 'Support' | 'Audio'

export type Listing = {
  id: string
  owner_id: string
  name: string
  brand: string
  category: ListingCategory
  meta: string | null
  specs: string | null
  included: string | null
  description: string | null
  daily_rate: number
  security_deposit: number | null
  image_url: string | null
  image_urls: string[] | null
  pickup_address: string | null
  pickup_latitude: number | null
  pickup_longitude: number | null
  status: ListingStatus
  rating: number
  created_at: string
  updated_at: string
}

export type BookingStatus = 'pending' | 'approved' | 'active' | 'returned' | 'completed' | 'declined'

export type Booking = {
  id: string
  listing_id: string
  renter_id: string
  owner_id: string
  start_date: string
  end_date: string
  days: number
  daily_rate_snapshot: number | null
  subtotal: number
  discount_amount: number
  promo_pass_id: string | null
  total: number
  shoot_description: string | null
  status: BookingStatus
  /** Present when hub-operations.sql is installed; legacy rows are version 1. */
  workflow_version?: 1 | 2
  created_at: string
  updated_at: string
}

export type PromoPassStatus = 'pending_review' | 'active' | 'rejected'
export type PromoRedemptionState = 'reserved' | 'consumed' | 'released'

export type PromoPass = {
  id: string
  renter_id: string
  status: PromoPassStatus
  fee_amount: number
  currency: 'PHP'
  discount_rate: number
  discount_cap: number
  reserved_amount: number
  redeemed_amount: number
  gcash_reference: string
  proof_path: string
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  approved_at: string | null
  valid_from: string | null
  valid_until_exclusive: string | null
  created_at: string
  updated_at: string
}

export type PromoPassWithRenter = PromoPass & {
  renter: Pick<Profile, 'id' | 'full_name' | 'email' | 'verification_status'> | null
}

export type BookingQuote = {
  listing_id: string
  daily_rate: number
  days: number
  subtotal: number
  discount_amount: number
  total: number
  promo_pass_id: string | null
  pass_status: PromoPassStatus | 'expired' | null
  pass_valid_from: string | null
  pass_valid_until_exclusive: string | null
  remaining_cap: number
  eligibility_reason: string
}

export type ListingWithOwner = Listing & {
  owner: Pick<Profile, 'id' | 'full_name' | 'verification_status'> | null
}

export type BookingWithRelations = Booking & {
  listing: Listing | null
  renter: (Pick<Profile, 'id' | 'full_name' | 'verification_status' | 'is_student' | 'phone'> & Partial<Pick<Profile, 'primary_rental_use'>>) | null
  owner: Pick<Profile, 'id' | 'full_name' | 'verification_status' | 'phone'> | null
}

// Counterparty identity-document proof rows shown in the booking conversation.
export type CounterpartyVerificationProof = {
  doc_type: VerificationDocType
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  review_note: string | null
  file_path: string
}

// ---------- Versioned Naga Hub rental workflow ----------

/**
 * Version 1 bookings keep the original direct hand-off flow. Version 2 bookings
 * use the guarded Naga Hub custody workflow and immutable approval snapshot.
 */
export type RentalWorkflowVersion = 1 | 2
export type RentalHubParty = 'owner' | 'renter'
export type RentalInspectionKind = 'pre_rental' | 'post_rental'
export type HubInspectionStage = 'pre_release' | 'post_return'

export type RawHubCustodyState = 'owner' | 'hub' | 'renter' | 'hub_return' | 'owner_returned'
export type RawDepositState =
  | 'waived_student'
  | 'awaiting_payment'
  | 'pending_review'
  | 'held'
  | 'refund_pending'
  | 'refunded'
  | 'forfeited'
  | 'rejected'

export type RentalCustodyState =
  | 'with_owner'
  | 'at_hub_pre_rental'
  | 'with_renter'
  | 'at_hub_post_rental'
  | 'issue_hold'
  | 'returned_to_owner'

/** Admin-facing names for the same five non-hold custody milestones. */
export type HubCustodyState =
  | 'awaiting_owner_dropoff'
  | 'at_hub_for_pickup'
  | 'with_renter'
  | 'at_hub_for_return'
  | 'completed'

export type RentalDepositStatus =
  | 'proof_required'
  | 'pending_review'
  | 'verified'
  | 'waived'
  | 'refund_pending'
  | 'refunded'
  | 'issue_hold'
  | 'partially_forfeited'
  | 'forfeited'
  | 'rejected'

export type HubDepositStatus = 'not_submitted' | 'pending_review' | 'accepted' | 'rejected' | 'waived'
export type RentalPaymentStatus = 'awaiting_payment' | 'pending_review' | 'proof_accepted' | 'rejected' | 'not_required'

export const RENTAL_PAYMENT_STATUS_LABELS: Record<RentalPaymentStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  pending_review: 'Pending review',
  proof_accepted: 'Proof accepted',
  rejected: 'Proof rejected',
  not_required: 'Not required',
}

export type RentalPayment = {
  booking_id: string
  amount: number
  currency: 'PHP'
  status: RentalPaymentStatus
  not_required_reason: 'zero_total' | 'pre_feature_released' | null
  gcash_reference: string | null
  proof_path: string | null
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string | null
  updated_at: string | null
}

export type RentalAgreementStatus = 'awaiting_signatures' | 'partially_signed' | 'signed'
export type AgreementSignatureCaptureMethod = 'legacy_click' | 'drawn' | 'uploaded'
export type RentalInspectionStatus = 'draft' | 'finalized'
export type RentalInspectionResult = 'pass' | 'issue'
export type RentalConfirmationKind =
  | 'owner_dropoff'
  | 'pre_inspection'
  | 'renter_pickup'
  | 'renter_return'
  | 'post_inspection'
  | 'owner_collection'

export type HubTransferKind = 'owner_to_hub' | 'hub_to_renter' | 'renter_to_hub' | 'hub_to_owner'
export type HubPhysicalAction = 'receive_from_owner' | 'release_to_renter' | 'receive_from_renter' | 'release_to_owner'
export type HubQueueBucket = 'pickup_due' | 'return_due' | 'issue_hold' | 'completed'

export type IncidentStatus = 'submitted' | 'under_review' | 'resolved'
export type IncidentCategory = 'damage' | 'loss' | 'accessory_missing' | 'late_return' | 'misconduct' | 'other'

export type Incident = {
  id: string
  booking_id: string
  listing_id: string | null
  reported_by: string
  reporter_role: 'owner' | 'renter' | 'admin'
  category: IncidentCategory
  description: string
  incident_date: string
  photo_paths: string[]
  status: IncidentStatus
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type NewIncidentInput = {
  booking_id: string
  category: IncidentCategory
  description: string
  incident_date: string
}

export type HubSettingsInput = {
  exact_address: string
  location_notes: string
  operating_hours: string
  gcash_account_name: string
  gcash_mobile_number: string
  deposit_amount: number
  deposit_policy: string
  hub_latitude: number | null
  hub_longitude: number | null
  service_radius_km: number
}

export type HubSettings = HubSettingsInput & {
  id: string
  name: string
  contact_phone: string | null
  active: boolean
  created_at: string
  updated_at: string
  updated_by: string | null
}

/** The participant-safe, approved-booking view of centralized hub settings. */
export type RentalHubConfig = {
  id: string
  version: number
  name: string
  address: string | null
  location_notes: string | null
  hours: string | null
  contact_phone: string | null
  gcash_recipient_name: string | null
  gcash_recipient_number: string | null
  deposit_amount: number
  deposit_policy: string | null
  active: boolean
  updated_at: string | null
}

/** Private owner/admin listing metadata. It must never be selected in public listing queries. */
export type ListingAsset = {
  listing_id: string
  owner_id?: string
  serial_number: string
  asset_tag: string | null
  acquisition_note: string | null
  created_at: string
  updated_at: string
}

export type RentalOperation = {
  booking_id: string
  workflow_version: RentalWorkflowVersion
  hub_config_id: string | null
  custody_state: RentalCustodyState
  /** Alias retained for participant UI callers while SQL uses raw_custody_state. */
  custody_display_state: RentalCustodyState
  /** Canonical persisted SQL state, exposed for diagnostics only. */
  raw_custody_state: RawHubCustodyState
  assigned_operator_id: string | null
  assigned_operator_name: string | null
  issue_hold_reason: string | null
  owner_dropoff_at: string | null
  renter_pickup_at: string | null
  renter_return_at: string | null
  owner_collection_at: string | null
  created_at: string | null
  updated_at: string | null
}

/** Saver Pass is rental-price support only; it never pays or waives a deposit. */
export type RentalSaverPassDisplay = {
  applied: boolean
  pass_id: string | null
  label: string
  discount_amount: number
  funded_by: 'lensshare' | null
}

/** Waiver display is independent of Saver Pass and is frozen per approved booking. */
export type RentalDepositWaiverDisplay = {
  waived: boolean
  reason: string | null
  basis: 'verified_student' | 'admin_override' | null
  determined_at: string | null
}

export type RentalDeposit = {
  id: string
  booking_id: string
  amount: number
  currency: 'PHP'
  /** Canonical persisted SQL status, exposed for diagnostics only. */
  raw_status: RawDepositState
  status: RentalDepositStatus
  waived: boolean
  waiver_reason: string | null
  waiver_basis: RentalDepositWaiverDisplay['basis']
  gcash_reference: string | null
  proof_path: string | null
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  refund_reference: string | null
  refunded_at: string | null
  created_at: string | null
  updated_at: string | null
}

export type RentalAgreementEquipmentSnapshot = {
  listing_id: string
  name: string
  brand: string | null
  category: string | null
  serial_number: string | null
  included: string | null
}

export type RentalAgreementSnapshot = {
  schema_version: number
  equipment: RentalAgreementEquipmentSnapshot
  hub: {
    config_id: string | null
    name: string
    address: string | null
    hours: string | null
  }
  pricing: {
    daily_rate: number
    days: number
    subtotal: number
    discount_amount: number
    total: number
    currency: 'PHP'
    saver_pass: RentalSaverPassDisplay
  }
  deposit: {
    amount: number
    currency: 'PHP'
    waived: boolean
    waiver_reason: string | null
    waiver_basis: RentalDepositWaiverDisplay['basis']
  }
  start_date: string
  end_date: string
  approved_at: string | null
}

export type RentalAgreementAcceptance = {
  id: string
  agreement_id: string
  booking_id: string
  user_id: string
  party: RentalHubParty
  terms_hash_snapshot: string
  accepted_at: string
  signature_capture_method: AgreementSignatureCaptureMethod
  signature_object_path: string | null
  signature_sha256: string | null
  signature_mime_type: string | null
  signature_byte_size: number | null
}

export type RentalAgreement = {
  id: string
  booking_id: string
  version: number
  status: RentalAgreementStatus
  snapshot: RentalAgreementSnapshot
  terms_hash: string
  owner_acceptance: RentalAgreementAcceptance | null
  renter_acceptance: RentalAgreementAcceptance | null
  owner_signed_at: string | null
  renter_signed_at: string | null
  created_at: string
  updated_at: string
}

export type RentalInspectionPhotoKind = 'overall' | 'serial' | 'accessories' | 'damage' | 'other'
export type RentalInspectionPhoto = {
  id: string
  inspection_id: string
  path: string
  kind: RentalInspectionPhotoKind
  caption: string | null
  sort_order: number
  created_at: string
}

export type RentalInspection = {
  id: string
  booking_id: string
  kind: RentalInspectionKind
  status: RentalInspectionStatus
  result: RentalInspectionResult | null
  serial_number: string | null
  checklist: Record<string, boolean>
  condition_notes: string | null
  issue_notes: string | null
  photos: RentalInspectionPhoto[]
  performed_by: string | null
  finalized_by: string | null
  finalized_at: string | null
  created_at: string
  updated_at: string
}

export type RentalConfirmation = {
  id: string
  booking_id: string
  party: RentalHubParty
  kind: RentalConfirmationKind
  confirmed_by: string
  confirmed_at: string
  created_at: string
}

export type RentalHubEvent = {
  id: string
  booking_id: string
  event_type: string
  summary: string | null
  details: string | null
  metadata: Record<string, unknown>
  actor_id: string | null
  actor_name: string | null
  created_at: string
}

export type RentalWorkflowBlocker = {
  code: string
  action: RentalConfirmationKind | HubPhysicalAction | string
  message: string
  party: RentalHubParty | 'operator' | null
}

export type RentalHubData = {
  booking: BookingWithRelations
  hub: RentalHubConfig | null
  operation: RentalOperation | null
  saver_pass: RentalSaverPassDisplay
  deposit_waiver: RentalDepositWaiverDisplay
  rental_payment: RentalPayment | null
  deposit: RentalDeposit | null
  agreement: RentalAgreement | null
  inspections: RentalInspection[]
  confirmations: RentalConfirmation[]
  blockers: RentalWorkflowBlocker[]
  events: RentalHubEvent[]
  allowed_confirmation_kinds: RentalConfirmationKind[]
}

export type DerivedRentalWorkflow = {
  version: RentalWorkflowVersion
  party: RentalHubParty | null
  custody_state: RentalCustodyState | null
  next_confirmation: RentalConfirmationKind | null
  complete: boolean
  blockers: RentalWorkflowBlocker[]
}

export type HubHandoffQueueItem = {
  booking_id: string
  booking: BookingWithRelations
  custody_state: HubCustodyState
  rental_payment_status: RentalPaymentStatus | null
  deposit_status: HubDepositStatus
  queue_bucket: HubQueueBucket
  assigned_admin_id: string | null
  assigned_admin: Pick<Profile, 'id' | 'full_name'> | null
  pickup_due_at: string | null
  return_due_at: string | null
  issue_hold_reason: string | null
  blocker_count: number
  updated_at: string | null
}

export type HubInspection = {
  id: string
  booking_id: string
  stage: HubInspectionStage
  serial_number: string
  notes: string
  checks: Record<string, boolean>
  photo_paths: string[]
  submitted_by: string | null
  submitted_at: string
  finalized_at: string | null
}

export type HubParticipantConfirmation = {
  party: RentalHubParty
  stage: 'pickup' | 'return'
  confirmed_at: string | null
  blocker_reason: string | null
}

export type HubCustodyTimelineEvent = {
  id: string
  label: string
  detail: string | null
  occurred_at: string
  actor: Pick<Profile, 'id' | 'full_name'> | null
}

export type HubHandoffDetail = {
  booking_id: string
  booking: BookingWithRelations
  custody_state: HubCustodyState
  rental_payment_status: RentalPaymentStatus | null
  deposit_status: HubDepositStatus
  queue_bucket: HubQueueBucket
  assigned_admin_id: string | null
  assigned_admin: Pick<Profile, 'id' | 'full_name'> | null
  pickup_due_at: string | null
  return_due_at: string | null
  issue_hold_reason: string | null
  rental_payment: RentalPayment | null
  deposit: {
    amount: number
    status: HubDepositStatus
    raw_status: RawDepositState
    refund_reference: string | null
    refunded_at: string | null
    forfeited_amount: number
    reference: string | null
    proof_path: string | null
    submitted_at: string | null
    reviewed_at: string | null
    review_note: string | null
  } | null
  agreement: Pick<RentalAgreement, 'id' | 'version' | 'terms_hash' | 'owner_signed_at' | 'renter_signed_at'>
  inspections: HubInspection[]
  participant_confirmations: HubParticipantConfirmation[]
  blockers: string[]
  completion_blockers: string[]
  allowed_transitions: HubPhysicalAction[]
  timeline: HubCustodyTimelineEvent[]
  updated_at: string | null
}

export type PayoutStatus = 'pending' | 'paid'

export type Payout = {
  id: string
  booking_id: string
  owner_id: string
  gross: number
  commission: number
  net: number
  status: PayoutStatus
  paid_at: string | null
  created_at: string
}

export type OwnerFinanceData = {
  bookings: BookingWithRelations[]
  payments: RentalPayment[]
  payouts: (Payout & { booking: BookingWithRelations })[]
  payment_setup_pending: boolean
}

export type HandoffParty = 'owner' | 'renter'
export type HandoffStage = 'agreement' | 'pickup' | 'return'

export type BookingHandoff = {
  id: string
  booking_id: string
  user_id: string
  party: HandoffParty
  stage: HandoffStage
  checklist: Record<string, boolean>
  created_at: string
  updated_at: string
}

export type Review = {
  id: string
  booking_id: string
  listing_id: string
  reviewer_id: string
  reviewee_id: string
  rating: number
  comment: string | null
  created_at: string
}

export type ReviewWithNames = Review & {
  reviewer: Pick<Profile, 'id' | 'full_name'> | null
  reviewee: Pick<Profile, 'id' | 'full_name'> | null
  listing: Pick<Listing, 'id' | 'name'> | null
}

export const COMMISSION_RATE = 0.15

export type MessageAttachment = {
  path: string
  name: string
  type: string
  size: number
}

export type Message = {
  id: string
  booking_id: string
  sender_id: string
  body: string | null
  attachments: MessageAttachment[]
  read_at: string | null
  created_at: string
}

export type PlatformStats = {
  availableListings: number
  verifiedMembers: number
  completedBookings: number
}

export const HUB_INSPECTION_CHECKLISTS = {
  pre_rental: [
    { key: 'identity_match', label: 'Body, model, and mount match the booking', required: true },
    { key: 'power_on', label: 'Power-on and core controls tested', required: true },
    { key: 'optical_condition', label: 'Sensor, glass, and mount condition inspected', required: true },
    { key: 'accessories_counted', label: 'Battery, charger, and listed accessories counted', required: true },
  ],
  post_rental: [
    { key: 'serial_match', label: 'Serial matches the pre-rental record', required: true },
    { key: 'power_on', label: 'Power-on and core controls tested after return', required: true },
    { key: 'no_new_damage', label: 'New damage or wear is fully recorded', required: true },
    { key: 'accessories_returned', label: 'All listed accessories accounted for', required: true },
  ],
} as const

export const HUB_INSPECTION_PHOTO_DEFINITIONS = [
  { kind: 'overall', label: 'Overall kit', requiredFor: ['pre_rental', 'post_rental'] },
  { kind: 'serial', label: 'Serial plate', requiredFor: ['pre_rental', 'post_rental'] },
  { kind: 'accessories', label: 'Included accessories', requiredFor: ['pre_rental', 'post_rental'] },
  { kind: 'damage', label: 'Damage or issue detail', requiredFor: [] },
  { kind: 'other', label: 'Other condition evidence', requiredFor: [] },
] as const satisfies readonly {
  kind: RentalInspectionPhotoKind
  label: string
  requiredFor: readonly RentalInspectionKind[]
}[]

export function listingPhotos(listing: Pick<Listing, 'image_url' | 'image_urls'> | null | undefined): string[] {
  if (!listing) return []
  const photos = Array.isArray(listing.image_urls) ? listing.image_urls.filter((url): url is string => typeof url === 'string' && Boolean(url.trim())) : []
  if (photos.length) return photos.slice(0, 5)
  return listing.image_url?.trim() ? [listing.image_url] : []
}

export function availabilityArea(listing: Pick<Listing, 'pickup_address'> | null | undefined): string {
  return listing?.pickup_address?.trim() || 'Availability area not added'
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'LS'
  return parts.slice(0, 2).map((part) => part[0]!.toUpperCase()).join('')
}

// Shown to owners on bookings so they can gauge the renter's trust standing.
export function renterVerificationLabel(renter: Pick<Profile, 'verification_status' | 'is_student'> | null | undefined): string {
  if (!renter) return ''
  const label = renter.verification_status === 'verified' ? '✓ Verified renter' : renter.verification_status === 'pending' ? 'Verification pending' : 'Unverified renter'
  return renter.is_student ? `${label} · Student` : label
}

// Shown to renters on listings and to the owner themselves so they can gauge the owner's trust standing.
export function ownerVerificationLabel(owner: Pick<Profile, 'verification_status'> | null | undefined): string {
  if (!owner) return ''
  return owner.verification_status === 'verified' ? '✓ Verified owner' : owner.verification_status === 'pending' ? 'Verification pending' : 'Unverified owner'
}

export function pesos(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function rentalDays(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(1, Math.round(ms / 86_400_000))
}
