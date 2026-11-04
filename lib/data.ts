'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { deriveRentalBlockers } from '@/lib/rental-workflow'
import type {
  AdminUserRow,
  Booking,
  BookingHandoff,
  BookingStatus,
  BookingWithRelations,
  HandoffParty,
  HandoffStage,
  HubCustodyState,
  HubDepositStatus,
  HubHandoffDetail,
  HubHandoffQueueItem,
  HubInspection,
  HubInspectionStage,
  HubPhysicalAction,
  HubQueueBucket,
  HubSettings,
  HubSettingsInput,
  HubTransferKind,
  Incident,
  IncidentCategory,
  IncidentStatus,
  Listing,
  ListingAsset,
  ListingStatus,
  ListingWithOwner,
  Message,
  MessageAttachment,
  NewIncidentInput,
  Payout,
  PlatformStats,
  PromoPass,
  PromoPassWithRenter,
  BookingQuote,
  PrimaryRentalUse,
  Profile,
  RentalAgreement,
  RentalConfirmation,
  RentalConfirmationKind,
  RentalCustodyState,
  RentalDeposit,
  RentalDepositWaiverDisplay,
  RentalHubConfig,
  RentalHubData,
  RentalHubEvent,
  RentalHubParty,
  RentalInspection,
  RentalInspectionKind,
  RentalInspectionPhoto,
  RentalInspectionPhotoKind,
  RentalOperation,
  RentalSaverPassDisplay,
  RentalWorkflowBlocker,
  RawDepositState,
  RawHubCustodyState,
  Review,
  ReviewWithNames,
  Role,
  VerificationDocType,
  VerificationSubmission,
  VerificationSubmissionWithUser,
} from '@/lib/types'

const BOOKING_SELECT = '*, listing:gear_listings(*), renter:profiles!bookings_renter_id_fkey(id, full_name, verification_status, is_student, phone), owner:profiles!bookings_owner_id_fkey(id, full_name)'
const OWNER_BOOKING_SELECT = '*, listing:gear_listings(*), renter:profiles!bookings_renter_id_fkey(id, full_name, verification_status, is_student, phone, primary_rental_use), owner:profiles!bookings_owner_id_fkey(id, full_name)'

function missingPrimaryRentalUseColumn(error: { message?: string } | null): boolean {
  const message = error?.message ?? ''
  return /primary_rental_use/.test(message) && /(column|schema cache|does not exist)/i.test(message)
}

export async function fetchListings(): Promise<ListingWithOwner[]> {
  const supabase = createClient()
  const fetchWithFilter = () => supabase
    .from('gear_listings')
    .select('*, owner:profiles!gear_listings_owner_id_fkey(id, full_name)')
    .eq('status', 'available')
    .eq('in_service_area', true)
    .order('rating', { ascending: false })
  let { data, error } = await fetchWithFilter()
  // Before supabase/service-area-and-incidents.sql is applied the column
  // does not exist; fall back to the unfiltered query so browse still works.
  if (error && (error.code === 'PGRST204' || error.code === '42703') && /in_service_area/.test(error.message)) {
    ({ data, error } = await supabase
      .from('gear_listings')
      .select('*, owner:profiles!gear_listings_owner_id_fkey(id, full_name)')
      .eq('status', 'available')
      .order('rating', { ascending: false }))
  }
  if (error) throw error
  return (data ?? []) as ListingWithOwner[]
}

export async function fetchOwnerListings(ownerId: string): Promise<Listing[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('gear_listings')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Listing[]
}

export type NewListing = Pick<Listing, 'name' | 'brand' | 'category' | 'daily_rate'> & {
  meta?: string | null
  specs?: string | null
  included?: string | null
  description?: string | null
  image_url?: string | null
  image_urls?: string[]
  pickup_address?: string | null
  pickup_latitude?: number | null
  pickup_longitude?: number | null
  status?: ListingStatus
}

function listingErrorMessage(error: { code?: string; message?: string }): string {
  const message = error.message ?? ''
  if ((error.code === 'PGRST204' || error.code === '42703') && /image_urls/.test(message)) {
    return 'Photo galleries are not set up yet. Run supabase/listing-media.sql in the Supabase SQL Editor, then try again.'
  }
  if ((error.code === 'PGRST204' || error.code === '42703') && /pickup_(address|latitude|longitude)/.test(message)) {
    return 'Availability areas are not set up yet. Run supabase/listing-locations.sql in the Supabase SQL Editor, then try again.'
  }
  if (error.code === '23503' && /owner_id/.test(message)) {
    return 'Your owner profile is not ready yet. Sign out and back in, or ask an administrator to restore your profile.'
  }
  if (/row-level security|policy/i.test(message)) {
    return 'LensShare could not save this listing with your owner account. Check the listing and storage policies in Supabase.'
  }
  return message || 'Saving the listing failed.'
}

function missingListingColumn(error: { code?: string; message?: string } | null, column: string): boolean {
  return Boolean(error && (error.code === 'PGRST204' || error.code === '42703') && new RegExp(`\\b${column}\\b`).test(error.message ?? ''))
}

export async function insertListing(ownerId: string, values: NewListing): Promise<Listing> {
  const supabase = createClient()
  const save = (payload: Record<string, unknown>) => supabase
    .from('gear_listings')
    .insert({ ...payload, owner_id: ownerId })
    .select('*')
    .single()

  let { data, error } = await save(values)
  if (missingListingColumn(error, 'image_urls') && (values.image_urls?.length ?? 0) <= 1) {
    const { image_urls: _imageUrls, ...legacyValues } = values
    const legacyResult = await save(legacyValues)
    data = legacyResult.data
    error = legacyResult.error
    if (data) data = { ...data, image_urls: values.image_urls ?? null }
  }
  if (error) throw new Error(listingErrorMessage(error))
  return data as Listing
}

export async function updateListing(id: string, ownerId: string, values: NewListing): Promise<Listing> {
  const fields = ['name', 'brand', 'category', 'daily_rate', 'meta', 'specs', 'included', 'description', 'image_url', 'image_urls', 'pickup_address', 'pickup_latitude', 'pickup_longitude', 'status'] as const
  const updates = Object.fromEntries(fields.filter((field) => values[field] !== undefined).map((field) => [field, values[field]]))
  const supabase = createClient()
  const save = (payload: Record<string, unknown>) => supabase
    .from('gear_listings')
    .update(payload)
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select('*')
    .single()

  let { data, error } = await save(updates)
  if (missingListingColumn(error, 'image_urls') && (values.image_urls?.length ?? 0) <= 1) {
    const { image_urls: _imageUrls, ...legacyUpdates } = updates
    const legacyResult = await save(legacyUpdates)
    data = legacyResult.data
    error = legacyResult.error
    if (data) data = { ...data, image_urls: values.image_urls ?? null }
  }
  if (error) throw new Error(listingErrorMessage(error))
  return data as Listing
}

export async function setListingStatus(id: string, status: ListingStatus): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('gear_listings').update({ status }).eq('id', id)
  if (error) throw error
}

export type UploadedGearPhoto = { path: string; url: string }

export async function uploadGearPhoto(userId: string, file: File): Promise<UploadedGearPhoto> {
  const supabase = createClient()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'gear-photo'
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`
  const { error } = await supabase.storage.from('gear-photos').upload(path, file)
  if (error) throw new Error(listingErrorMessage(error))
  const { data } = supabase.storage.from('gear-photos').getPublicUrl(path)
  return { path, url: data.publicUrl }
}

async function removeGearPhotoPaths(paths: string[]): Promise<void> {
  if (!paths.length) return
  const supabase = createClient()
  const { error } = await supabase.storage.from('gear-photos').remove(paths)
  if (error) throw new Error(listingErrorMessage(error))
}

export async function deleteUnreferencedGearPhotos(ownerId: string, candidates: UploadedGearPhoto[]): Promise<void> {
  if (!candidates.length) return
  const supabase = createClient()
  const { data, error } = await supabase
    .from('gear_listings')
    .select('image_url, image_urls')
    .eq('owner_id', ownerId)
  if (error && !missingListingColumn(error, 'image_urls')) throw new Error(listingErrorMessage(error))

  let rows = data as Pick<Listing, 'image_url' | 'image_urls'>[] | null
  if (missingListingColumn(error, 'image_urls')) {
    const legacyResult = await supabase.from('gear_listings').select('image_url').eq('owner_id', ownerId)
    if (legacyResult.error) throw new Error(listingErrorMessage(legacyResult.error))
    rows = (legacyResult.data ?? []).map((row) => ({ ...row, image_urls: null }))
  }

  const referenced = new Set((rows ?? []).flatMap((row) => [row.image_url, ...(row.image_urls ?? [])]).filter((url): url is string => Boolean(url)))
  const paths = candidates.filter((photo) => !referenced.has(photo.url)).map((photo) => photo.path)
  await removeGearPhotoPaths(paths)
}

export function gearPhotoPath(url: string, userId: string): string | null {
  try {
    const marker = '/storage/v1/object/public/gear-photos/'
    const parsed = new URL(url)
    const index = parsed.pathname.indexOf(marker)
    if (index < 0) return null
    const path = decodeURIComponent(parsed.pathname.slice(index + marker.length))
    return path.startsWith(`${userId}/`) ? path : null
  } catch {
    return null
  }
}

export async function fetchOwnerBookings(ownerId: string): Promise<BookingWithRelations[]> {
  const supabase = createClient()
  const fetchBookings = (select: string) => supabase
    .from('bookings')
    .select(select)
    .eq('owner_id', ownerId)
    .order('start_date', { ascending: true })

  let { data, error } = await fetchBookings(OWNER_BOOKING_SELECT)
  if (missingPrimaryRentalUseColumn(error)) {
    const legacyResult = await fetchBookings(BOOKING_SELECT)
    data = legacyResult.data
    error = legacyResult.error
  }
  if (error) throw error
  return (data ?? []) as unknown as BookingWithRelations[]
}

export async function fetchRenterBookings(renterId: string): Promise<BookingWithRelations[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('renter_id', renterId)
    .order('start_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as BookingWithRelations[]
}

// Returns true when [start, end) overlaps no active booking for the listing.
// The aggregate RPC bypasses booking-row RLS but reveals only listing ids.
export async function checkAvailability(listingId: string, start: string, end: string): Promise<boolean> {
  const unavailable = await fetchUnavailableListingIds(start, end)
  return !unavailable.includes(listingId)
}

export async function quoteBooking(listingId: string, startDate: string, endDate: string): Promise<BookingQuote> {
  const supabase = createClient()
  const { data, error } = await supabase
    .rpc('quote_booking', { p_listing_id: listingId, p_start_date: startDate, p_end_date: endDate })
    .single()
  if (error) throw error
  return data as BookingQuote
}

export async function createBooking(input: {
  listing_id: string
  start_date: string
  end_date: string
  shoot_description: string | null
  expected_daily_rate: number
}): Promise<Booking> {
  const supabase = createClient()
  const { data, error } = await supabase
    .rpc('create_booking', {
      p_listing_id: input.listing_id,
      p_start_date: input.start_date,
      p_end_date: input.end_date,
      p_shoot_description: input.shoot_description,
      p_expected_daily_rate: input.expected_daily_rate,
    })
    .single()
  if (error) throw error
  return data as Booking
}

// Maps a Supabase error to a user-facing message; recognizes the
// bookings_no_overlap exclusion violation (code 23P01).
export function bookingErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string }
  if (err?.code === '23P01' || /bookings_no_overlap/.test(err?.message ?? '')) {
    return 'Those dates are already booked for this gear. Please pick a different range.'
  }
  const message = err?.message ?? ''
  if (/verified renter|identity verification/i.test(message)) {
    return 'Booking blocked: your account must be a verified renter before you can request a rental.'
  }
  if (/listing rate changed/i.test(message)) {
    return 'The owner changed this listing’s daily rate. Review the updated total and try again.'
  }
  if (/row-level security|policy|permission denied/i.test(message)) {
    return 'Booking blocked: your account or the booking service is not ready for this request.'
  }
  return message || 'Something went wrong. Please try again.'
}

export async function fetchBookingById(bookingId: string): Promise<BookingWithRelations | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('id', bookingId)
    .maybeSingle()
  if (error) throw error
  return (data as BookingWithRelations | null) ?? null
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
  const supabase = createClient()
  const { data, error } = await supabase
    .rpc('transition_booking_status', { p_booking_id: id, p_new_status: status })
    .single()
  if (error) throw error
  return data as Booking
}

// ---------- Version 2 Naga Hub workflow ----------

export const HUB_DEPOSIT_BUCKET = 'deposit-proofs'
export const HUB_INSPECTION_BUCKET = 'inspection-photos'
export const HUB_PRIVATE_URL_TTL_SECONDS = 300
export const HUB_DEPOSIT_PROOF_MAX_BYTES = 5 * 1024 * 1024
export const HUB_INSPECTION_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const HUB_INSPECTION_PHOTO_LIMIT = 8

const HUB_DEPOSIT_FILE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

const HUB_INSPECTION_FILE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

type UnknownRow = Record<string, unknown>

function asObject(value: unknown): UnknownRow {
  if (typeof value === 'string') {
    try { return asObject(JSON.parse(value)) } catch { return {} }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRow : {}
}

function asArray(value: unknown): unknown[] {
  if (typeof value === 'string') {
    try { return asArray(JSON.parse(value)) } catch { return [] }
  }
  return Array.isArray(value) ? value : []
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null
}

function asNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : fallback
}

function firstDefined(row: UnknownRow, keys: string[]): unknown {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key]
  return undefined
}

function unwrapRpcObject(value: unknown, key?: string): UnknownRow {
  const item = Array.isArray(value) ? value[0] : value
  const row = asObject(item)
  if (key && row[key] !== undefined) return asObject(row[key])
  return row
}

function unwrapRpcRows(value: unknown, key?: string): unknown[] {
  if (Array.isArray(value)) return value
  const row = asObject(value)
  if (key) return asArray(row[key])
  return asArray(row.items ?? row.rows ?? row.data)
}

async function callRpc(name: string, args: UnknownRow = {}): Promise<unknown> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

function hubInstructionFields(value: unknown): Partial<HubSettingsInput> {
  const parsed = asObject(value)
  return {
    location_notes: asString(parsed.location_notes),
    operating_hours: asString(parsed.operating_hours),
    gcash_account_name: asString(parsed.gcash_account_name),
    gcash_mobile_number: asString(parsed.gcash_mobile_number),
    deposit_policy: asString(parsed.deposit_policy),
  }
}

async function fetchHubRow(hubId: string | null): Promise<UnknownRow | null> {
  if (!hubId) return null
  const { data, error } = await createClient().from('rental_hubs').select('*').eq('id', hubId).maybeSingle()
  if (error) throw error
  return data ? asObject(data) : null
}

async function fetchOperatorRow(operatorId: string | null): Promise<UnknownRow | null> {
  if (!operatorId) return null
  const { data, error } = await createClient().from('profiles').select('id, full_name').eq('id', operatorId).maybeSingle()
  if (error) throw error
  return data ? asObject(data) : null
}

async function enrichHubRpcValue(value: unknown): Promise<{ row: UnknownRow; viewerId: string | null }> {
  const row = unwrapRpcObject(value)
  const bookingRow = asObject(row.booking ?? row.booking_detail)
  const operationRow = asObject(row.operation ?? row.booking_operation)
  const bookingId = asNullableString(bookingRow.id ?? bookingRow.booking_id)
  const hubId = asNullableString(operationRow.hub_id ?? operationRow.hub_config_id)
  const operatorId = asNullableString(operationRow.operator_id ?? operationRow.assigned_operator_id)
  const supabase = createClient()
  const [{ data: authData, error: authError }, booking, hub, operator] = await Promise.all([
    supabase.auth.getUser(),
    bookingId ? fetchBookingById(bookingId) : Promise.resolve(null),
    fetchHubRow(hubId),
    fetchOperatorRow(operatorId),
  ])
  if (authError) throw authError
  return {
    viewerId: authData.user?.id ?? null,
    row: {
      ...row,
      booking: booking ?? bookingRow,
      hub: hub ?? row.hub,
      operation: { ...operationRow, ...(operator ? { assigned_operator: operator } : {}) },
    },
  }
}

function normalizeBookingWithRelations(value: unknown): BookingWithRelations | null {
  const row = asObject(value)
  const id = asNullableString(row.id ?? row.booking_id)
  if (!id) return null
  const listingValue = firstDefined(row, ['listing', 'gear_listing', 'equipment'])
  const renterValue = firstDefined(row, ['renter', 'renter_profile'])
  const ownerValue = firstDefined(row, ['owner', 'owner_profile'])
  return {
    ...row,
    id,
    days: asNumber(row.days, 1),
    daily_rate_snapshot: row.daily_rate_snapshot == null ? null : asNumber(row.daily_rate_snapshot),
    subtotal: asNumber(row.subtotal),
    discount_amount: asNumber(row.discount_amount),
    total: asNumber(row.total),
    listing: Object.keys(asObject(listingValue)).length ? asObject(listingValue) as Listing : null,
    renter: Object.keys(asObject(renterValue)).length ? asObject(renterValue) as BookingWithRelations['renter'] : null,
    owner: Object.keys(asObject(ownerValue)).length ? asObject(ownerValue) as BookingWithRelations['owner'] : null,
  } as unknown as BookingWithRelations
}

function canonicalCustodyState(value: unknown): RawHubCustodyState {
  const state = asString(value)
  if (state === 'with_owner' || state === 'awaiting_owner_dropoff') return 'owner'
  if (state === 'at_hub_pre_rental' || state === 'at_hub_for_pickup') return 'hub'
  if (state === 'with_renter') return 'renter'
  if (state === 'at_hub_post_rental' || state === 'at_hub_for_return' || state === 'issue_hold') return 'hub_return'
  if (state === 'returned_to_owner' || state === 'completed') return 'owner_returned'
  if (['owner', 'hub', 'renter', 'hub_return', 'owner_returned'].includes(state)) return state as RawHubCustodyState
  return 'owner'
}

function participantCustodyState(value: unknown, issueReason?: unknown): RentalCustodyState {
  const state = canonicalCustodyState(value)
  if (asNullableString(issueReason)) return 'issue_hold'
  if (state === 'hub') return 'at_hub_pre_rental'
  if (state === 'renter') return 'with_renter'
  if (state === 'hub_return') return 'at_hub_post_rental'
  if (state === 'owner_returned') return 'returned_to_owner'
  return 'with_owner'
}

function adminCustodyState(value: unknown, row: UnknownRow = {}): HubCustodyState {
  const state = canonicalCustodyState(value)
  if (state === 'hub') return 'at_hub_for_pickup'
  if (state === 'renter') return 'with_renter'
  if (state === 'hub_return') return 'at_hub_for_return'
  if (state === 'owner_returned') return 'completed'
  return 'awaiting_owner_dropoff'
}

function canonicalDepositStatus(value: unknown): RawDepositState {
  const status = asString(value)
  if (status === 'proof_required' || status === 'not_submitted') return 'awaiting_payment'
  if (status === 'accepted') return 'held'
  if (status === 'waived') return 'waived_student'
  if (status === 'retained') return 'forfeited'
  if (['waived_student', 'awaiting_payment', 'pending_review', 'held', 'refund_pending', 'refunded', 'forfeited', 'rejected'].includes(status)) return status as RawDepositState
  return 'awaiting_payment'
}

function participantDepositStatus(value: unknown): RentalDeposit['status'] {
  const status = canonicalDepositStatus(value)
  if (status === 'awaiting_payment') return 'proof_required'
  if (status === 'held') return 'verified'
  if (status === 'waived_student') return 'waived'
  return status
}

function adminDepositStatus(value: unknown): HubDepositStatus {
  const status = canonicalDepositStatus(value)
  if (status === 'awaiting_payment') return 'not_submitted'
  if (status === 'held' || status === 'refund_pending' || status === 'refunded' || status === 'forfeited') return 'accepted'
  if (status === 'waived_student') return 'waived'
  if (status === 'pending_review' || status === 'rejected') return status
  return 'not_submitted'
}

function normalizeHubConfig(value: unknown): RentalHubConfig | null {
  const row = asObject(value)
  if (!Object.keys(row).length) return null
  const instructions = hubInstructionFields(row.instructions)
  return {
    id: asString(row.id ?? row.hub_id),
    version: asNumber(row.version, 1),
    name: asString(row.name, 'Naga City Hub'),
    address: asNullableString(row.address ?? row.address_text ?? row.exact_address),
    location_notes: asNullableString(row.location_notes ?? instructions.location_notes ?? row.instructions),
    hours: asNullableString(row.hours ?? row.operating_hours ?? instructions.operating_hours),
    contact_phone: asNullableString(row.contact_phone),
    gcash_recipient_name: asNullableString(row.gcash_recipient_name ?? row.gcash_account_name ?? instructions.gcash_account_name),
    gcash_recipient_number: asNullableString(row.gcash_recipient_number ?? row.gcash_mobile_number ?? instructions.gcash_mobile_number),
    deposit_amount: asNumber(row.deposit_amount ?? row.standard_deposit ?? row.standard_deposit_snapshot, 2000),
    deposit_policy: asNullableString(row.deposit_policy ?? instructions.deposit_policy ?? row.instructions),
    active: asBoolean(row.active ?? row.is_active, true),
    updated_at: asNullableString(row.updated_at),
  }
}

function normalizeOperation(value: unknown): RentalOperation | null {
  const row = asObject(value)
  if (!Object.keys(row).length) return null
  const operator = asObject(row.assigned_operator ?? row.operator)
  return {
    booking_id: asString(row.booking_id),
    workflow_version: asNumber(row.workflow_version ?? row.version, 2) === 1 ? 1 : 2,
    hub_config_id: asNullableString(row.hub_config_id ?? row.hub_id),
    custody_state: participantCustodyState(row.custody_state, row.issue_hold_reason ?? row.issue_note ?? row.issue_hold),
    custody_display_state: participantCustodyState(row.custody_state, row.issue_hold_reason ?? row.issue_note ?? row.issue_hold),
    raw_custody_state: canonicalCustodyState(row.custody_state),
    assigned_operator_id: asNullableString(row.assigned_operator_id ?? row.operator_id),
    assigned_operator_name: asNullableString(row.assigned_operator_name ?? operator.full_name),
    issue_hold_reason: asNullableString(row.issue_hold_reason ?? row.issue_note),
    owner_dropoff_at: asNullableString(row.owner_dropoff_at),
    renter_pickup_at: asNullableString(row.renter_pickup_at),
    renter_return_at: asNullableString(row.renter_return_at),
    owner_collection_at: asNullableString(row.owner_collection_at),
    created_at: asNullableString(row.created_at),
    updated_at: asNullableString(row.updated_at),
  }
}

function normalizeSaverPass(value: unknown, booking: BookingWithRelations): RentalSaverPassDisplay {
  const row = asObject(value)
  const discount = asNumber(row.discount_amount, Number(booking.discount_amount) || 0)
  const passId = asNullableString(row.pass_id ?? row.promo_pass_id ?? booking.promo_pass_id)
  return {
    applied: asBoolean(row.applied, Boolean(passId || discount > 0)),
    pass_id: passId,
    label: asString(row.label, '30-Day Saver Pass'),
    discount_amount: discount,
    funded_by: discount > 0 ? 'lensshare' : null,
  }
}

function normalizeWaiver(value: unknown, depositValue: unknown): RentalDepositWaiverDisplay {
  const row = asObject(value)
  const deposit = asObject(depositValue)
  const waived = asBoolean(row.waived, canonicalDepositStatus(deposit.status) === 'waived_student' || asBoolean(deposit.waived))
  const rawBasis = asString(row.basis ?? deposit.waiver_basis)
  return {
    waived,
    reason: asNullableString(row.reason ?? deposit.waiver_reason),
    basis: rawBasis === 'verified_student' || rawBasis === 'admin_override' ? rawBasis : null,
    determined_at: asNullableString(row.determined_at ?? deposit.waiver_determined_at),
  }
}

function normalizeDeposit(value: unknown, bookingId: string): RentalDeposit | null {
  const row = asObject(value)
  if (!Object.keys(row).length) return null
  const rawBasis = asString(row.waiver_basis)
  return {
    id: asString(row.id),
    booking_id: asString(row.booking_id, bookingId),
    amount: asNumber(row.amount, 2000),
    currency: 'PHP',
    raw_status: canonicalDepositStatus(row.status),
    status: participantDepositStatus(row.status),
    waived: asBoolean(row.waived, canonicalDepositStatus(row.status) === 'waived_student'),
    waiver_reason: asNullableString(row.waiver_reason),
    waiver_basis: rawBasis === 'verified_student' || rawBasis === 'admin_override' ? rawBasis : null,
    gcash_reference: asNullableString(row.gcash_reference ?? row.reference),
    proof_path: asNullableString(row.proof_path),
    submitted_at: asNullableString(row.submitted_at),
    reviewed_by: asNullableString(row.reviewed_by),
    reviewed_at: asNullableString(row.reviewed_at),
    review_note: asNullableString(row.review_note),
    refund_reference: asNullableString(row.refund_reference),
    refunded_at: asNullableString(row.refunded_at),
    created_at: asNullableString(row.created_at),
    updated_at: asNullableString(row.updated_at),
  }
}

function normalizeAgreementSnapshot(value: unknown, booking: BookingWithRelations, saverPass: RentalSaverPassDisplay, waiver: RentalDepositWaiverDisplay, hub: RentalHubConfig | null): RentalAgreement['snapshot'] {
  const row = asObject(value)
  const equipment = asObject(row.equipment ?? row.listing)
  const pricing = asObject(row.pricing)
  const deposit = asObject(row.deposit)
  return {
    schema_version: asNumber(row.schema_version ?? row.version, 1),
    equipment: {
      listing_id: asString(equipment.listing_id ?? equipment.id, booking.listing_id),
      name: asString(equipment.name, booking.listing?.name ?? 'Rental equipment'),
      brand: asNullableString(equipment.brand ?? booking.listing?.brand),
      category: asNullableString(equipment.category ?? booking.listing?.category),
      serial_number: asNullableString(equipment.serial_number),
      included: asNullableString(equipment.included ?? booking.listing?.included),
    },
    hub: {
      config_id: asNullableString(asObject(row.hub).config_id ?? hub?.id),
      name: asString(asObject(row.hub).name, hub?.name ?? 'Naga City Hub'),
      address: asNullableString(asObject(row.hub).address ?? hub?.address),
      hours: asNullableString(asObject(row.hub).hours ?? hub?.hours),
    },
    pricing: {
      daily_rate: asNumber(pricing.daily_rate, Number(booking.daily_rate_snapshot ?? booking.listing?.daily_rate ?? 0)),
      days: asNumber(pricing.days, booking.days),
      subtotal: asNumber(pricing.subtotal, Number(booking.subtotal)),
      discount_amount: asNumber(pricing.discount_amount, Number(booking.discount_amount)),
      total: asNumber(pricing.total, Number(booking.total)),
      currency: 'PHP',
      saver_pass: normalizeSaverPass(pricing.saver_pass ?? saverPass, booking),
    },
    deposit: {
      amount: asNumber(deposit.amount, hub?.deposit_amount ?? 2000),
      currency: 'PHP',
      waived: asBoolean(deposit.waived, waiver.waived),
      waiver_reason: asNullableString(deposit.waiver_reason ?? waiver.reason),
      waiver_basis: (() => {
        const basis = asString(deposit.waiver_basis ?? waiver.basis)
        return basis === 'verified_student' || basis === 'admin_override' ? basis : null
      })(),
    },
    start_date: asString(row.start_date, booking.start_date),
    end_date: asString(row.end_date, booking.end_date),
    approved_at: asNullableString(row.approved_at),
  }
}

function normalizeAgreement(
  value: unknown,
  booking: BookingWithRelations,
  saverPass: RentalSaverPassDisplay,
  waiver: RentalDepositWaiverDisplay,
  hub: RentalHubConfig | null,
  acceptancesValue: unknown = [],
): RentalAgreement | null {
  const row = asObject(value)
  if (!Object.keys(row).length) return null
  const acceptances = asArray(acceptancesValue).map(asObject)
  const ownerAcceptance = acceptances.find((item) => asString(item.party) === 'owner')
  const renterAcceptance = acceptances.find((item) => asString(item.party) === 'renter')
  const ownerSignedAt = asNullableString(row.owner_signed_at ?? ownerAcceptance?.accepted_at)
  const renterSignedAt = asNullableString(row.renter_signed_at ?? renterAcceptance?.accepted_at)
  return {
    id: asString(row.id),
    booking_id: asString(row.booking_id, booking.id),
    version: asNumber(row.version, 1),
    status: ownerSignedAt && renterSignedAt ? 'signed' : ownerSignedAt || renterSignedAt ? 'partially_signed' : 'awaiting_signatures',
    snapshot: normalizeAgreementSnapshot(row.snapshot, booking, saverPass, waiver, hub),
    terms_hash: asString(row.terms_hash),
    owner_signed_at: ownerSignedAt,
    renter_signed_at: renterSignedAt,
    owner_signature_hash: asNullableString(row.owner_signature_hash ?? ownerAcceptance?.terms_hash_snapshot),
    renter_signature_hash: asNullableString(row.renter_signature_hash ?? renterAcceptance?.terms_hash_snapshot),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  }
}

function inspectionKind(value: unknown): RentalInspectionKind {
  return asString(value) === 'post_return' || asString(value) === 'post_rental' ? 'post_rental' : 'pre_rental'
}

function normalizeInspectionPhoto(value: unknown, inspectionId: string, index: number): RentalInspectionPhoto {
  const row = typeof value === 'string' ? { path: value } : asObject(value)
  const rawKind = asString(row.kind)
  const kind: RentalInspectionPhotoKind = ['overall', 'serial', 'accessories', 'damage', 'other'].includes(rawKind)
    ? rawKind as RentalInspectionPhotoKind
    : index === 0 ? 'overall' : 'other'
  return {
    id: asString(row.id, `${inspectionId}:${index}`),
    inspection_id: asString(row.inspection_id, inspectionId),
    path: asString(row.path ?? row.file_path ?? row.object_path),
    kind,
    caption: asNullableString(row.caption),
    sort_order: asNumber(row.sort_order, index),
    created_at: asString(row.created_at),
  }
}

function normalizeInspection(value: unknown, bookingId: string, photosValue: unknown = []): RentalInspection | null {
  const row = asObject(value)
  if (!Object.keys(row).length) return null
  const id = asString(row.id, `${bookingId}:${asString(row.kind ?? row.inspection_kind ?? row.stage, 'inspection')}`)
  const finalizedAt = asNullableString(row.finalized_at ?? row.submitted_at)
  const issueNotes = asNullableString(row.issue_notes ?? (asBoolean(row.issue_hold) ? row.notes : null))
  const rawResult = asString(row.result)
  const relatedPhotos = asArray(photosValue).filter((photo) => asString(asObject(photo).inspection_id) === id)
  const photoValues = asArray(row.photos).length ? asArray(row.photos) : asArray(row.photo_paths).length ? asArray(row.photo_paths) : relatedPhotos
  return {
    id,
    booking_id: asString(row.booking_id, bookingId),
    kind: inspectionKind(row.kind ?? row.inspection_kind ?? row.stage),
    status: asString(row.status) === 'draft' && !finalizedAt ? 'draft' : finalizedAt ? 'finalized' : 'draft',
    result: rawResult === 'pass' || rawResult === 'issue' ? rawResult : finalizedAt ? issueNotes ? 'issue' : 'pass' : null,
    serial_number: asNullableString(row.serial_number ?? row.meter_reading),
    checklist: asObject(row.checklist ?? row.checks) as Record<string, boolean>,
    condition_notes: asNullableString(row.condition_notes ?? row.condition_summary ?? row.notes),
    issue_notes: issueNotes,
    photos: photoValues.map((photo, index) => normalizeInspectionPhoto(photo, id, index)).filter((photo) => Boolean(photo.path)),
    performed_by: asNullableString(row.performed_by ?? row.submitted_by),
    finalized_by: asNullableString(row.finalized_by ?? row.submitted_by),
    finalized_at: finalizedAt,
    created_at: asString(row.created_at ?? row.submitted_at),
    updated_at: asString(row.updated_at ?? row.submitted_at),
  }
}

const CONFIRMATION_KINDS = new Set<RentalConfirmationKind>(['owner_dropoff', 'pre_inspection', 'renter_pickup', 'renter_return', 'post_inspection', 'owner_collection'])

function normalizeConfirmation(value: unknown, bookingId: string): RentalConfirmation | null {
  const row = asObject(value)
  const rawParty = asString(row.party)
  if (rawParty !== 'owner' && rawParty !== 'renter') return null
  const transferKind = asString(row.transfer_kind)
  const inspectionKindValue = asString(row.inspection_kind)
  const rawKind = asString(row.kind ?? row.confirmation_kind) || (inspectionKindValue === 'pre_release'
    ? 'pre_inspection'
    : inspectionKindValue === 'post_return'
      ? 'post_inspection'
      : transferKind === 'owner_to_hub'
        ? 'owner_dropoff'
        : transferKind === 'hub_to_renter'
          ? 'renter_pickup'
          : transferKind === 'renter_to_hub'
            ? 'renter_return'
            : transferKind === 'hub_to_owner' ? 'owner_collection' : '')
  if (!CONFIRMATION_KINDS.has(rawKind as RentalConfirmationKind)) return null
  const party: RentalHubParty = rawParty
  return {
    id: asString(row.id, `${bookingId}:${party}:${rawKind}`),
    booking_id: asString(row.booking_id, bookingId),
    party,
    kind: rawKind as RentalConfirmationKind,
    confirmed_by: asString(row.confirmed_by ?? row.user_id),
    confirmed_at: asString(row.confirmed_at ?? row.created_at),
    created_at: asString(row.created_at ?? row.confirmed_at),
  }
}

function normalizeBlocker(value: unknown): RentalWorkflowBlocker | null {
  if (typeof value === 'string') return { code: 'server_blocker', action: 'next_step', message: value, party: null }
  const row = asObject(value)
  const message = asNullableString(row.message ?? row.reason)
  if (!message) return null
  const rawParty = asString(row.party)
  return {
    code: asString(row.code, 'server_blocker'),
    action: asString(row.action, 'next_step'),
    message,
    party: rawParty === 'owner' || rawParty === 'renter' || rawParty === 'operator' ? rawParty : null,
  }
}

function normalizeEvent(value: unknown, bookingId: string, index: number): RentalHubEvent | null {
  const row = asObject(value)
  if (!Object.keys(row).length) return null
  const actor = asObject(row.actor)
  return {
    id: asString(row.id, `${bookingId}:event:${index}`),
    booking_id: asString(row.booking_id, bookingId),
    event_type: asString(row.event_type ?? row.type, 'hub_event'),
    summary: asNullableString(row.summary ?? row.label),
    details: asNullableString(row.details ?? row.detail),
    metadata: asObject(row.metadata),
    actor_id: asNullableString(row.actor_id ?? actor.id),
    actor_name: asNullableString(row.actor_name ?? actor.full_name),
    created_at: asString(row.created_at ?? row.occurred_at),
  }
}

function transferConfirmationRows(row: UnknownRow): unknown[] {
  const transfers = new Map(asArray(row.transfers).map((value) => {
    const transfer = asObject(value)
    return [asString(transfer.id), asString(transfer.transfer_kind)]
  }))
  return asArray(row.transfer_confirmations).map((value) => {
    const confirmation = asObject(value)
    return { ...confirmation, transfer_kind: confirmation.transfer_kind ?? transfers.get(asString(confirmation.transfer_id)) }
  })
}

function inspectionConfirmationRows(row: UnknownRow): unknown[] {
  const inspections = new Map(asArray(row.inspections).map((value) => {
    const inspection = asObject(value)
    return [asString(inspection.id), asString(inspection.inspection_kind)]
  }))
  return asArray(row.inspection_confirmations).map((value) => {
    const confirmation = asObject(value)
    return { ...confirmation, inspection_kind: confirmation.inspection_kind ?? inspections.get(asString(confirmation.inspection_id)) }
  })
}

function deriveAllowedParticipantConfirmations(data: RentalHubData, viewerId: string | null): RentalConfirmationKind[] {
  const party: RentalHubParty | null = viewerId === data.booking.owner_id ? 'owner' : viewerId === data.booking.renter_id ? 'renter' : null
  if (!party || !data.operation || ['declined', 'completed'].includes(data.booking.status)) return []
  const existing = new Set(data.confirmations.filter((row) => row.party === party).map((row) => row.kind))
  const blocked = (kind: RentalConfirmationKind) => data.blockers.some((row) => row.action === kind)
  const allowed: RentalConfirmationKind[] = []
  const finalized = new Set(data.inspections.filter((row) => row.status === 'finalized').map((row) => row.kind))

  if (finalized.has('pre_rental') && !existing.has('pre_inspection')) allowed.push('pre_inspection')
  if (finalized.has('post_rental') && !existing.has('post_inspection')) allowed.push('post_inspection')
  if (party === 'owner' && data.operation.custody_state === 'with_owner' && !existing.has('owner_dropoff') && !blocked('owner_dropoff')) allowed.push('owner_dropoff')
  if (party === 'renter' && data.operation.custody_state === 'at_hub_pre_rental' && !existing.has('renter_pickup') && !blocked('renter_pickup')) allowed.push('renter_pickup')
  if (party === 'renter' && data.operation.custody_state === 'with_renter' && !existing.has('renter_return') && !blocked('renter_return')) allowed.push('renter_return')
  if (party === 'owner' && data.operation.custody_state === 'at_hub_post_rental' && !existing.has('owner_collection') && !blocked('owner_collection')) allowed.push('owner_collection')
  return allowed
}

function normalizeRentalHub(value: unknown, viewerId: string | null = null): RentalHubData | null {
  const row = unwrapRpcObject(value, 'fetch_rental_hub')
  const booking = normalizeBookingWithRelations(row.booking ?? row.booking_detail ?? row)
  if (!booking) return null
  const hub = normalizeHubConfig(row.hub ?? row.hub_config ?? row.settings)
  const saverPass = normalizeSaverPass(row.saver_pass, booking)
  const waiver = normalizeWaiver(row.deposit_waiver ?? row.waiver, row.deposit)
  const aggregate: RentalHubData = {
    booking,
    hub,
    operation: normalizeOperation(row.operation ?? row.booking_operation),
    saver_pass: saverPass,
    deposit_waiver: waiver,
    deposit: normalizeDeposit(row.deposit ?? row.booking_deposit, booking.id),
    agreement: normalizeAgreement(row.agreement ?? row.booking_agreement, booking, saverPass, waiver, hub, row.acceptances),
    inspections: asArray(row.inspections).map((item) => normalizeInspection(item, booking.id, row.inspection_photos)).filter((item): item is RentalInspection => Boolean(item)),
    confirmations: [
      ...asArray(row.confirmations),
      ...transferConfirmationRows(row),
      ...inspectionConfirmationRows(row),
    ].map((item) => normalizeConfirmation(item, booking.id)).filter((item): item is RentalConfirmation => Boolean(item)),
    blockers: asArray(row.blockers).map(normalizeBlocker).filter((item): item is RentalWorkflowBlocker => Boolean(item)),
    events: asArray(row.events).map((item, index) => normalizeEvent(item, booking.id, index)).filter((item): item is RentalHubEvent => Boolean(item)),
    allowed_confirmation_kinds: asArray(row.allowed_confirmation_kinds ?? row.allowed_confirmations)
      .map((kind) => asString(kind))
      .filter((kind): kind is RentalConfirmationKind => CONFIRMATION_KINDS.has(kind as RentalConfirmationKind)),
  }
  aggregate.blockers = deriveRentalBlockers(aggregate)
  if (!aggregate.allowed_confirmation_kinds.length) aggregate.allowed_confirmation_kinds = deriveAllowedParticipantConfirmations(aggregate, viewerId)
  return aggregate
}

export async function fetchRentalHub(bookingId: string): Promise<RentalHubData | null> {
  const value = await callRpc('fetch_rental_hub', { p_booking_id: bookingId })
  const enriched = await enrichHubRpcValue(value)
  return normalizeRentalHub(enriched.row, enriched.viewerId)
}

export async function decideRentalRequest(bookingId: string, decision: 'approved' | 'declined'): Promise<Booking> {
  const value = await callRpc('decide_rental_request', { p_booking_id: bookingId, p_decision: decision === 'approved' ? 'approve' : 'decline' })
  const row = unwrapRpcObject(value, 'decide_rental_request')
  return (normalizeBookingWithRelations(row.booking ?? row) ?? row) as Booking
}

function validatedHubFile(file: File, allowed: Record<string, string>, maxBytes: number, label: string): { extension: string; contentType: string } {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const contentType = allowed[extension]
  if (!contentType || (file.type && file.type !== contentType && !(extension === 'jpg' && file.type === 'image/jpeg'))) {
    throw new Error(`${file.name} is not an accepted ${label} file.`)
  }
  if (!file.size) throw new Error(`${file.name} is empty.`)
  if (file.size > maxBytes) throw new Error(`${file.name} is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`)
  return { extension, contentType }
}

export function validateDepositProof(file: File): void {
  validatedHubFile(file, HUB_DEPOSIT_FILE_TYPES, HUB_DEPOSIT_PROOF_MAX_BYTES, 'deposit proof')
}

export function validateInspectionPhotos(files: File[]): void {
  if (!files.length) throw new Error('Choose at least one inspection photo.')
  if (files.length > HUB_INSPECTION_PHOTO_LIMIT) throw new Error(`Upload no more than ${HUB_INSPECTION_PHOTO_LIMIT} inspection photos at once.`)
  for (const file of files) validatedHubFile(file, HUB_INSPECTION_FILE_TYPES, HUB_INSPECTION_PHOTO_MAX_BYTES, 'inspection photo')
}

async function uploadHubPrivateFiles(bucket: string, prefix: string, files: File[], allowed: Record<string, string>, maxBytes: number, label: string): Promise<string[]> {
  const supabase = createClient()
  const paths: string[] = []
  try {
    for (const file of files) {
      const { extension, contentType } = validatedHubFile(file, allowed, maxBytes, label)
      const path = `${prefix}/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '3600', contentType, upsert: false })
      if (error) throw error
      paths.push(path)
    }
    return paths
  } catch (error) {
    if (paths.length) await supabase.storage.from(bucket).remove(paths)
    throw error
  }
}

async function removeHubPrivateFiles(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return
  const { error } = await createClient().storage.from(bucket).remove(paths)
  if (error) throw error
}

export async function submitDepositProof(bookingId: string, gcashReference: string, file: File): Promise<RentalDeposit | null> {
  const reference = gcashReference.trim()
  if (!reference) throw new Error('Enter the GCash receipt reference.')
  validateDepositProof(file)
  const { data: authData, error: authError } = await createClient().auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error('Sign in before submitting deposit proof.')
  const [proofPath] = await uploadHubPrivateFiles(HUB_DEPOSIT_BUCKET, `${authData.user.id}/${bookingId}`, [file], HUB_DEPOSIT_FILE_TYPES, HUB_DEPOSIT_PROOF_MAX_BYTES, 'deposit proof')
  try {
    const value = await callRpc('submit_booking_deposit_proof', {
      p_booking_id: bookingId,
      p_gcash_reference: reference,
      p_proof_path: proofPath,
    })
    return normalizeDeposit(unwrapRpcObject(value, 'submit_booking_deposit_proof'), bookingId)
  } catch (error) {
    await removeHubPrivateFiles(HUB_DEPOSIT_BUCKET, [proofPath!]).catch(() => undefined)
    throw error
  }
}

export async function signRentalAgreement(bookingId: string): Promise<RentalAgreement | null> {
  const value = await callRpc('accept_booking_agreement', { p_booking_id: bookingId })
  const hub = await fetchRentalHub(bookingId)
  if (hub?.agreement) return hub.agreement
  return Object.keys(unwrapRpcObject(value)).length ? null : null
}

export async function confirmRentalStep(bookingId: string, kind: RentalConfirmationKind): Promise<void> {
  if (kind === 'pre_inspection' || kind === 'post_inspection') {
    await callRpc('confirm_booking_inspection', {
      p_booking_id: bookingId,
      p_inspection_kind: kind === 'pre_inspection' ? 'pre_release' : 'post_return',
    })
    return
  }
  const transferKinds: Partial<Record<RentalConfirmationKind, HubTransferKind>> = {
    owner_dropoff: 'owner_to_hub',
    renter_pickup: 'hub_to_renter',
    renter_return: 'renter_to_hub',
    owner_collection: 'hub_to_owner',
  }
  const transferKind = transferKinds[kind]
  if (!transferKind) throw new Error('This rental confirmation is not supported.')
  await confirmHubTransfer(bookingId, transferKind)
}

export async function fetchInspectionPhotoUrl(path: string): Promise<string> {
  return fetchSignedPrivateFileUrl(HUB_INSPECTION_BUCKET, path)
}

export async function fetchListingAsset(listingId: string): Promise<ListingAsset | null> {
  const row = unwrapRpcObject(await callRpc('fetch_listing_asset', { p_listing_id: listingId }), 'fetch_listing_asset')
  if (!Object.keys(row).length || !row.listing_id) return null
  return row as ListingAsset
}

export async function saveListingAsset(listingId: string, serialNumber: string): Promise<ListingAsset> {
  const serial = serialNumber.trim()
  if (!serial) throw new Error('Enter the equipment serial number.')
  if (serial.length > 160) throw new Error('The equipment serial number must be 160 characters or fewer.')
  const row = unwrapRpcObject(await callRpc('upsert_listing_asset', { p_listing_id: listingId, p_serial_number: serial }), 'upsert_listing_asset')
  return row as ListingAsset
}

function normalizeHubSettings(value: unknown): HubSettings {
  const row = asObject(value)
  return {
    id: asString(row.id),
    name: asString(row.name, 'Naga City Hub'),
    exact_address: asString(row.exact_address ?? row.address ?? row.address_text),
    location_notes: asString(row.location_notes ?? row.instructions),
    operating_hours: asString(row.operating_hours ?? row.hours),
    gcash_account_name: asString(row.gcash_account_name ?? row.gcash_recipient_name),
    gcash_mobile_number: asString(row.gcash_mobile_number ?? row.gcash_recipient_number),
    deposit_amount: asNumber(row.deposit_amount ?? row.standard_deposit, 2000),
    deposit_policy: asString(row.deposit_policy ?? row.instructions),
    hub_latitude: row.hub_latitude === null || row.hub_latitude === undefined ? 13.6218 : asNumber(row.hub_latitude, 13.6218),
    hub_longitude: row.hub_longitude === null || row.hub_longitude === undefined ? 123.1948 : asNumber(row.hub_longitude, 123.1948),
    service_radius_km: asNumber(row.service_radius_km, 15),
    contact_phone: asNullableString(row.contact_phone),
    active: asBoolean(row.active ?? row.is_active, true),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
    updated_by: asNullableString(row.updated_by),
  }
}

export async function fetchAdminHubSettings(): Promise<HubSettings> {
  const supabase = createClient()
  const { data, error } = await supabase.from('rental_hubs').select('*').eq('code', 'naga').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('The Naga Hub configuration was not found.')
  return normalizeHubSettings(data)
}

export async function saveAdminHubSettings(input: HubSettingsInput): Promise<HubSettings> {
  if (Number(input.deposit_amount) !== 2000) throw new Error('The approved Naga Hub deposit is fixed at ₱2,000.')
  const hubLatitude = input.hub_latitude ?? 13.6218
  const hubLongitude = input.hub_longitude ?? 123.1948
  const serviceRadiusKm = Number(input.service_radius_km || 15)
  if (hubLatitude < -90 || hubLatitude > 90 || hubLongitude < -180 || hubLongitude > 180 || serviceRadiusKm <= 0 || serviceRadiusKm > 200) {
    throw new Error('Enter valid hub coordinates and a service radius from 0 to 200 km.')
  }
  const current = await fetchAdminHubSettings()
  const instructions = [input.operating_hours.trim(), input.location_notes.trim(), input.deposit_policy.trim()].filter(Boolean).join('\n\n')
  const value = await callRpc('update_hub_settings', {
    p_hub_id: current.id,
    p_name: current.name,
    p_address_text: input.exact_address.trim(),
    p_contact_phone: current.contact_phone,
    p_instructions: instructions || null,
    p_standard_deposit: 2000,
    p_is_active: current.active,
    p_hub_latitude: hubLatitude,
    p_hub_longitude: hubLongitude,
    p_service_radius_km: serviceRadiusKm,
  })
  const row = unwrapRpcObject(value, 'update_hub_settings')
  return Object.keys(row).length ? normalizeHubSettings(row) : fetchAdminHubSettings()
}

export async function fetchHubOperators(): Promise<Pick<Profile, 'id' | 'full_name' | 'email'>[]> {
  const { data, error } = await createClient().from('profiles').select('id, full_name, email').eq('role', 'admin').order('full_name')
  if (error) throw error
  return (data ?? []) as Pick<Profile, 'id' | 'full_name' | 'email'>[]
}

function queueBucket(value: unknown, custody: HubCustodyState, issueReason: string | null): HubQueueBucket {
  const bucket = asString(value)
  if (['pickup_due', 'return_due', 'issue_hold', 'completed'].includes(bucket)) return bucket as HubQueueBucket
  if (issueReason) return 'issue_hold'
  if (custody === 'with_renter' || custody === 'at_hub_for_return') return 'return_due'
  if (custody === 'completed') return 'completed'
  return 'pickup_due'
}

function normalizeQueueItem(value: unknown): HubHandoffQueueItem | null {
  const row = asObject(value)
  const booking = normalizeBookingWithRelations(row.booking ?? row.booking_detail)
  const bookingId = asNullableString(row.booking_id ?? booking?.id)
  if (!booking || !bookingId) return null
  const operation = asObject(row.operation)
  const source = { ...operation, ...row }
  const custody = adminCustodyState(source.custody_state, source)
  const issueReason = asNullableString(source.issue_hold_reason)
  const assigned = asObject(row.assigned_admin ?? row.assigned_operator ?? operation.assigned_operator)
  return {
    booking_id: bookingId,
    booking,
    custody_state: custody,
    deposit_status: adminDepositStatus(row.deposit_status ?? asObject(row.deposit).status),
    queue_bucket: queueBucket(row.queue_bucket, custody, issueReason),
    assigned_admin_id: asNullableString(row.assigned_admin_id ?? row.assigned_operator_id ?? operation.assigned_operator_id),
    assigned_admin: Object.keys(assigned).length ? { id: asString(assigned.id), full_name: asString(assigned.full_name) } : null,
    pickup_due_at: asNullableString(row.pickup_due_at ?? booking.start_date),
    return_due_at: asNullableString(row.return_due_at ?? booking.end_date),
    issue_hold_reason: issueReason,
    blocker_count: asNumber(row.blocker_count, asArray(row.blockers).length),
    updated_at: asNullableString(row.updated_at ?? operation.updated_at),
  }
}

export async function fetchAdminHubHandoffQueue(): Promise<HubHandoffQueueItem[]> {
  const value = await callRpc('fetch_hub_admin_queue')
  return unwrapRpcRows(value, 'fetch_hub_admin_queue').map(normalizeQueueItem).filter((item): item is HubHandoffQueueItem => Boolean(item))
}

export const fetchHubAdminQueue = fetchAdminHubHandoffQueue

function normalizeHubInspection(value: unknown, bookingId: string): HubInspection | null {
  const row = asObject(value)
  if (!Object.keys(row).length) return null
  return {
    id: asString(row.id, `${bookingId}:${asString(row.stage ?? row.kind)}`),
    booking_id: asString(row.booking_id, bookingId),
    stage: inspectionKind(row.stage ?? row.kind) === 'post_rental' ? 'post_return' : 'pre_release',
    serial_number: asString(row.serial_number),
    notes: asString(row.notes ?? row.condition_notes),
    checks: asObject(row.checks ?? row.checklist) as Record<string, boolean>,
    photo_paths: (asArray(row.photo_paths).length ? asArray(row.photo_paths) : asArray(row.photos).map((photo) => asObject(photo).path)).map((path) => asString(path)).filter(Boolean),
    submitted_by: asNullableString(row.submitted_by ?? row.performed_by),
    submitted_at: asString(row.submitted_at ?? row.updated_at ?? row.created_at),
    finalized_at: asNullableString(row.finalized_at),
  }
}

function normalizeHandoffDetail(value: unknown): HubHandoffDetail | null {
  const row = unwrapRpcObject(value, 'fetch_hub_booking_detail')
  const booking = normalizeBookingWithRelations(row.booking ?? row.booking_detail)
  if (!booking) return null
  const operation = asObject(row.operation)
  const source = { ...operation, ...row }
  const custody = adminCustodyState(source.custody_state, source)
  const issueReason = asNullableString(source.issue_hold_reason)
  const assigned = asObject(row.assigned_admin ?? row.assigned_operator ?? operation.assigned_operator)
  const depositRow = asObject(row.deposit)
  const agreementRow = asObject(row.agreement)
  const confirmations = asArray(row.participant_confirmations ?? row.confirmations).map((value) => {
    const item = asObject(value)
    const rawParty = asString(item.party)
    return {
      party: rawParty === 'owner' ? 'owner' as const : 'renter' as const,
      stage: asString(item.stage).includes('return') || ['renter_return', 'post_inspection', 'owner_collection'].includes(asString(item.kind)) ? 'return' as const : 'pickup' as const,
      confirmed_at: asNullableString(item.confirmed_at ?? item.created_at),
      blocker_reason: asNullableString(item.blocker_reason),
    }
  })
  const events = asArray(row.timeline ?? row.events)
  const depositStatus = adminDepositStatus(row.deposit_status ?? depositRow.status)
  const detail: HubHandoffDetail = {
    booking_id: booking.id,
    booking,
    custody_state: custody,
    deposit_status: depositStatus,
    queue_bucket: queueBucket(row.queue_bucket, custody, issueReason),
    assigned_admin_id: asNullableString(row.assigned_admin_id ?? row.assigned_operator_id ?? operation.assigned_operator_id),
    assigned_admin: Object.keys(assigned).length ? { id: asString(assigned.id), full_name: asString(assigned.full_name) } : null,
    pickup_due_at: asNullableString(row.pickup_due_at ?? booking.start_date),
    return_due_at: asNullableString(row.return_due_at ?? booking.end_date),
    issue_hold_reason: issueReason,
    deposit: Object.keys(depositRow).length ? {
      amount: asNumber(depositRow.amount, 2000),
      status: adminDepositStatus(depositRow.status),
      reference: asNullableString(depositRow.reference ?? depositRow.gcash_reference),
      proof_path: asNullableString(depositRow.proof_path),
      submitted_at: asNullableString(depositRow.submitted_at),
      reviewed_at: asNullableString(depositRow.reviewed_at),
      review_note: asNullableString(depositRow.review_note),
    } : null,
    agreement: {
      id: asString(agreementRow.id),
      version: asNumber(agreementRow.version, 1),
      terms_hash: asString(agreementRow.terms_hash),
      owner_signed_at: asNullableString(agreementRow.owner_signed_at),
      renter_signed_at: asNullableString(agreementRow.renter_signed_at),
    },
    inspections: asArray(row.inspections).map((item) => normalizeHubInspection(item, booking.id)).filter((item): item is HubInspection => Boolean(item)),
    participant_confirmations: confirmations,
    blockers: asArray(row.blockers).map((blocker) => typeof blocker === 'string' ? blocker : asString(asObject(blocker).message ?? asObject(blocker).reason)).filter(Boolean),
    allowed_transitions: asArray(row.allowed_transitions).map((action) => asString(action)).filter((action): action is HubPhysicalAction => ['receive_from_owner', 'release_to_renter', 'receive_from_renter', 'release_to_owner'].includes(action)),
    timeline: events.map((value, index) => {
      const event = asObject(value)
      const actor = asObject(event.actor)
      return {
        id: asString(event.id, `${booking.id}:timeline:${index}`),
        label: asString(event.label ?? event.summary ?? event.event_type, 'Hub event'),
        detail: asNullableString(event.detail ?? event.details),
        occurred_at: asString(event.occurred_at ?? event.created_at),
        actor: Object.keys(actor).length ? { id: asString(actor.id), full_name: asString(actor.full_name) } : null,
      }
    }),
    updated_at: asNullableString(row.updated_at ?? operation.updated_at),
  }
  return detail
}

export async function fetchAdminHubHandoffDetail(bookingId: string): Promise<HubHandoffDetail> {
  const detail = normalizeHandoffDetail(await callRpc('fetch_hub_booking_detail', { p_booking_id: bookingId }))
  if (!detail) throw new Error('This booking does not have a Naga Hub hand-off record.')
  return detail
}

export const fetchHubBookingDetail = fetchAdminHubHandoffDetail

export async function assignAdminHubHandoff(bookingId: string, adminId: string | null): Promise<void> {
  if (!adminId) throw new Error('Choose an administrator to assign this hand-off.')
  await callRpc('assign_booking_operator', { p_booking_id: bookingId, p_operator_id: adminId })
}

export const assignBookingOperator = assignAdminHubHandoff

function privateHubFileBucket(path: string): string {
  return path.startsWith('deposit-proofs/') ? HUB_DEPOSIT_BUCKET
    : path.startsWith('inspection-photos/') ? HUB_INSPECTION_BUCKET
      : /(^|\/)deposit|receipt|proof/i.test(path) ? HUB_DEPOSIT_BUCKET : HUB_INSPECTION_BUCKET
}

function stripBucketPrefix(bucket: string, path: string): string {
  return path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path
}

async function fetchSignedPrivateFileUrl(bucket: string, path: string): Promise<string> {
  if (!path || path.startsWith('/') || path.includes('..')) throw new Error('Invalid private hub file path.')
  const objectPath = stripBucketPrefix(bucket, path)
  const { data, error } = await createClient().storage.from(bucket).createSignedUrl(objectPath, HUB_PRIVATE_URL_TTL_SECONDS)
  if (error) throw error
  return data.signedUrl
}

export async function fetchSignedAdminHubFileUrl(path: string): Promise<string> {
  return fetchSignedPrivateFileUrl(privateHubFileBucket(path), path)
}

export async function reviewAdminHubDepositProof(bookingId: string, decision: 'accepted' | 'rejected', note: string | null): Promise<void> {
  await callRpc('review_booking_deposit', {
    p_booking_id: bookingId,
    p_decision: decision === 'accepted' ? 'approve' : 'reject',
    p_review_note: note?.trim() || null,
    p_amount: null,
  })
}

export const reviewBookingDepositProof = reviewAdminHubDepositProof

export type SaveRentalInspectionInput = {
  kind: RentalInspectionKind
  serial_number?: string
  checklist?: Record<string, boolean>
  condition_notes: string
  meter_reading?: string | null
  notes?: string | null
  issue_notes?: string | null
}

function sqlInspectionKind(kind: RentalInspectionKind): HubInspectionStage {
  return kind === 'post_rental' ? 'post_return' : 'pre_release'
}

async function uploadInspectionFiles(bookingId: string, inspectionId: string, files: File[]): Promise<string[]> {
  return uploadHubPrivateFiles(
    HUB_INSPECTION_BUCKET,
    `${bookingId}/${inspectionId}`,
    files,
    HUB_INSPECTION_FILE_TYPES,
    HUB_INSPECTION_PHOTO_MAX_BYTES,
    'inspection photo',
  )
}

export async function saveRentalInspection(bookingId: string, input: SaveRentalInspectionInput, files: File[] = []): Promise<string> {
  if (!input.condition_notes.trim()) throw new Error('Enter condition notes.')
  if (input.serial_number && input.serial_number.trim().length > 160) throw new Error('The serial number must be 160 characters or fewer.')
  if (files.length) validateInspectionPhotos(files)

  // First save creates/returns the inspection id needed by the private storage path.
  const first = unwrapRpcObject(await callRpc('save_booking_inspection', {
    p_booking_id: bookingId,
    p_inspection_kind: sqlInspectionKind(input.kind),
    p_condition_summary: input.condition_notes.trim(),
    p_meter_reading: input.meter_reading?.trim() || input.serial_number?.trim() || null,
    p_notes: input.notes?.trim() || input.issue_notes?.trim() || (input.checklist ? JSON.stringify(input.checklist) : null),
    p_photo_paths: [],
  }), 'save_booking_inspection')
  const inspectionId = asString(first.id ?? first.inspection_id)
  if (!inspectionId) throw new Error('The inspection was saved without an inspection identifier.')
  if (!files.length) return inspectionId

  const uploadedPaths = await uploadInspectionFiles(bookingId, inspectionId, files)
  try {
    await callRpc('save_booking_inspection', {
      p_booking_id: bookingId,
      p_inspection_kind: sqlInspectionKind(input.kind),
      p_condition_summary: input.condition_notes.trim(),
      p_meter_reading: input.meter_reading?.trim() || input.serial_number?.trim() || null,
      p_notes: input.notes?.trim() || input.issue_notes?.trim() || (input.checklist ? JSON.stringify(input.checklist) : null),
      p_photo_paths: uploadedPaths,
    })
    return inspectionId
  } catch (error) {
    await removeHubPrivateFiles(HUB_INSPECTION_BUCKET, uploadedPaths).catch(() => undefined)
    throw error
  }
}

export async function finalizeRentalInspection(inspectionId: string): Promise<void> {
  await callRpc('finalize_booking_inspection', { p_inspection_id: inspectionId })
}

export async function saveAdminHubInspection(
  bookingId: string,
  input: { stage: HubInspectionStage; serial_number: string; notes: string; checks: Record<string, boolean>; issue_notes?: string | null },
  files: File[] = [],
): Promise<void> {
  const kind: RentalInspectionKind = input.stage === 'post_return' ? 'post_rental' : 'pre_rental'
  const inspectionId = await saveRentalInspection(bookingId, {
    kind,
    serial_number: input.serial_number,
    checklist: input.checks,
    condition_notes: input.notes,
    issue_notes: input.issue_notes,
  }, files)
  await finalizeRentalInspection(inspectionId)
}

export async function setAdminHubIssueHold(bookingId: string, reason: string | null): Promise<void> {
  const note = reason?.trim() || null
  await callRpc('set_booking_issue_hold', {
    p_booking_id: bookingId,
    p_on_hold: note !== null,
    p_issue_note: note,
  })
}

export const setBookingIssueHold = setAdminHubIssueHold

export async function confirmHubTransfer(bookingId: string, transferKind: HubTransferKind, conditionNote: string | null = null): Promise<void> {
  await callRpc('confirm_hub_transfer', {
    p_booking_id: bookingId,
    p_transfer_kind: transferKind,
    p_condition_note: conditionNote?.trim() || null,
  })
}

export async function transitionAdminHubCustody(bookingId: string, action: HubPhysicalAction): Promise<void> {
  const transfers: Record<HubPhysicalAction, HubTransferKind> = {
    receive_from_owner: 'owner_to_hub',
    release_to_renter: 'hub_to_renter',
    receive_from_renter: 'renter_to_hub',
    release_to_owner: 'hub_to_owner',
  }
  await confirmHubTransfer(bookingId, transfers[action])
}

export const transitionHubCustody = transitionAdminHubCustody

const HUB_REALTIME_TABLES = [
  'bookings',
  'booking_operations',
  'booking_deposits',
  'booking_inspections',
  'booking_transfers',
  'booking_operation_events',
] as const

function subscribeToHubTables(channelName: string, callback: () => void, bookingId?: string): () => void {
  const supabase = createClient()
  let channel: RealtimeChannel = supabase.channel(channelName)
  for (const table of HUB_REALTIME_TABLES) {
    const filter = bookingId && table !== 'bookings' ? `booking_id=eq.${bookingId}` : bookingId ? `id=eq.${bookingId}` : undefined
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, callback)
  }
  channel.subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export function subscribeToRentalHub(bookingId: string, callback: () => void): () => void {
  return subscribeToHubTables(`rental-hub:${bookingId}:${crypto.randomUUID()}`, callback, bookingId)
}

export function subscribeToAdminHubHandoffs(callback: () => void): () => void {
  return subscribeToHubTables(`admin-hub:${crypto.randomUUID()}`, callback)
}

// ---------- Payouts ----------

export async function fetchOwnerPayouts(ownerId: string): Promise<(Payout & { booking: BookingWithRelations })[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('payouts')
    .select(`*, booking:bookings(${BOOKING_SELECT})`)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as (Payout & { booking: BookingWithRelations })[]
}

export async function markPayoutPaid(payoutId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('payouts')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', payoutId)
  if (error) throw error
}

// ---------- Hand-offs / agreement ----------

export async function fetchBookingHandoffs(bookingId: string): Promise<BookingHandoff[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('booking_handoffs')
    .select('*')
    .eq('booking_id', bookingId)
  if (error) throw error
  return (data ?? []) as BookingHandoff[]
}

export async function saveHandoff(
  bookingId: string,
  userId: string,
  party: HandoffParty,
  stage: HandoffStage,
  checklist: Record<string, boolean>,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('booking_handoffs')
    .insert({ booking_id: bookingId, user_id: userId, party, stage, checklist })

  if (!error) return
  if (error.code !== '23505') throw error
  if (stage === 'agreement') return

  const { error: updateError } = await supabase
    .from('booking_handoffs')
    .update({ checklist })
    .eq('booking_id', bookingId)
    .eq('party', party)
    .eq('stage', stage)
  if (updateError) throw updateError
}

// ---------- Reviews ----------

export async function fetchBookingReviews(bookingId: string): Promise<Review[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('booking_id', bookingId)
  if (error) throw error
  return (data ?? []) as Review[]
}

export async function fetchListingReviews(listingId: string): Promise<ReviewWithNames[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('reviews')
    .select('*, reviewer:profiles!reviews_reviewer_id_fkey(id, full_name), listing:gear_listings(id, name)')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ReviewWithNames[]
}

export async function fetchReviewsOfUser(userId: string): Promise<ReviewWithNames[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('reviews')
    .select('*, reviewer:profiles!reviews_reviewer_id_fkey(id, full_name), listing:gear_listings(id, name)')
    .eq('reviewee_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ReviewWithNames[]
}

export async function submitReview(input: {
  booking_id: string
  listing_id: string
  reviewer_id: string
  reviewee_id: string
  rating: number
  comment: string | null
}): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('reviews').insert(input)
  if (error) throw error
}

export async function updateProfile(
  values: { full_name: string; phone: string | null; primary_rental_use?: PrimaryRentalUse | null },
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('update_own_profile', {
    p_full_name: values.full_name,
    p_phone: values.phone,
    p_primary_rental_use: values.primary_rental_use ?? null,
  })
  if (error) throw error
}

export async function switchWorkspaceRole(role: Exclude<Role, 'admin'>): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('switch_workspace_role', { p_role: role })
  if (error) throw error
}

export async function fetchRole(userId: string): Promise<Role | null> {
  const supabase = createClient()
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
  return (data?.role as Role | undefined) ?? null
}

export async function fetchMySubmissions(userId: string): Promise<VerificationSubmission[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('verification_submissions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as VerificationSubmission[]
}

export async function uploadVerificationDoc(userId: string, docType: VerificationDocType, file: File): Promise<string> {
  validateVerificationDocument(file)
  const supabase = createClient()
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const path = `${userId}/${docType}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('verification-docs').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function insertVerificationSubmission(userId: string, docType: VerificationDocType, filePath: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('verification_submissions')
    .insert({ user_id: userId, doc_type: docType, file_path: filePath })
  if (error) throw error
}

export const VERIFICATION_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
const VERIFICATION_DOCUMENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

export function validateVerificationDocument(file: File): void {
  if (!VERIFICATION_DOCUMENT_TYPES.has(file.type)) throw new Error(`${file.name} is not a JPG, PNG, WebP, or PDF file.`)
  if (!file.size) throw new Error(`${file.name} is empty.`)
  if (file.size > VERIFICATION_DOCUMENT_MAX_BYTES) throw new Error(`${file.name} is larger than 10 MB.`)
}

export async function replaceVerificationSubmission(
  userId: string,
  docType: VerificationDocType,
  file: File,
): Promise<VerificationSubmission> {
  const submissions = await fetchMySubmissions(userId)
  const latest = submissions
    .filter((row) => row.doc_type === docType)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0]
  if (!latest) {
    const path = await uploadVerificationDoc(userId, docType, file)
    try {
      const row = unwrapRpcObject(await callRpc('submit_verification_submission', {
        p_doc_type: docType,
        p_file_path: path,
      }), 'submit_verification_submission')
      return row as VerificationSubmission
    } catch (error) {
      await createClient().storage.from('verification-docs').remove([path]).catch(() => undefined)
      throw error
    }
  }

  const path = await uploadVerificationDoc(userId, docType, file)
  try {
    const row = unwrapRpcObject(await callRpc('replace_verification_submission', {
      p_submission_id: latest.id,
      p_file_path: path,
    }), 'replace_verification_submission')
    return row as VerificationSubmission
  } catch (error) {
    await createClient().storage.from('verification-docs').remove([path]).catch(() => undefined)
    throw error
  }
}

export async function fetchVerificationQueue(): Promise<VerificationSubmissionWithUser[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('verification_submissions')
    .select('*, user:profiles!verification_submissions_user_id_fkey(id, full_name, email, verification_status, is_student)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as VerificationSubmissionWithUser[]
}

export async function fetchSignedDocUrl(filePath: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from('verification-docs').createSignedUrl(filePath, 300)
  if (error) throw error
  return data.signedUrl
}

export async function reviewSubmission(
  id: string,
  status: 'approved' | 'rejected',
  reviewNote: string | null,
): Promise<VerificationSubmission> {
  return reviewVerificationSubmission(id, status, reviewNote)
}

export async function reviewVerificationSubmission(
  id: string,
  decision: 'approved' | 'rejected',
  note: string | null,
): Promise<VerificationSubmission> {
  const row = unwrapRpcObject(await callRpc('review_verification_submission', {
    p_submission_id: id,
    p_status: decision,
    p_review_note: note?.trim() || null,
  }), 'review_verification_submission')
  return row as VerificationSubmission
}

export async function revokeVerificationGroup(
  userId: string,
  group: 'identity' | 'student',
  note: string,
): Promise<void> {
  const reason = note.trim()
  if (!reason) throw new Error('Add a revocation reason.')
  await callRpc('revoke_verification_group', {
    p_user_id: userId,
    p_group: group,
    p_review_note: reason,
  })
}

export async function fetchMyPromoPasses(renterId: string): Promise<PromoPass[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('promo_passes')
    .select('*')
    .eq('renter_id', renterId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PromoPass[]
}

export async function uploadPromoPaymentProof(userId: string, file: File): Promise<string> {
  const supabase = createClient()
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : 'jpg'
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${safeExt}`
  const { error } = await supabase.storage.from('promo-payment-proofs').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function submitPromoPassPayment(reference: string, proofPath: string): Promise<PromoPass> {
  const supabase = createClient()
  const { data, error } = await supabase
    .rpc('submit_promo_pass_payment', {
      p_gcash_reference: reference.trim(),
      p_proof_path: proofPath,
    })
    .single()
  if (error) throw error
  return data as PromoPass
}

export async function fetchPromoPassQueue(): Promise<PromoPassWithRenter[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('promo_passes')
    .select('*, renter:profiles!promo_passes_renter_id_fkey(id, full_name, email, verification_status)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PromoPassWithRenter[]
}

export async function fetchSignedPromoProofUrl(proofPath: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from('promo-payment-proofs').createSignedUrl(proofPath, 300)
  if (error) throw error
  return data.signedUrl
}

export async function reviewPromoPass(
  passId: string,
  decision: 'approved' | 'rejected',
  note: string | null,
): Promise<PromoPass> {
  const supabase = createClient()
  const { data, error } = await supabase
    .rpc('review_promo_pass', {
      p_pass_id: passId,
      p_decision: decision,
      p_review_note: note,
    })
    .single()
  if (error) throw error
  return data as PromoPass
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*, gear_listings!gear_listings_owner_id_fkey(count), bookings!bookings_renter_id_fkey(count)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AdminUserRow[]
}

export async function fetchAdminListings(): Promise<ListingWithOwner[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('gear_listings')
    .select('*, owner:profiles!gear_listings_owner_id_fkey(id, full_name, email)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ListingWithOwner[]
}

export async function sendQueuedNotifications(): Promise<{ sent: number; failures?: { id: string; error: string }[] }> {
  const supabase = createClient()
  const { data, error } = await supabase.functions.invoke('send-notification', { body: {} })
  if (error) throw error
  return data as { sent: number; failures?: { id: string; error: string }[] }
}

export async function fetchAdminBookings(): Promise<BookingWithRelations[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BookingWithRelations[]
}

// ---------- Messages (per-booking chat) ----------

export async function fetchBookingMessages(bookingId: string): Promise<Message[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Message[]
}

export const MESSAGE_ATTACHMENT_LIMIT = 5
export const MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
const MESSAGE_ATTACHMENT_FILE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
}

export const MESSAGE_ATTACHMENT_TYPES = new Set(Object.values(MESSAGE_ATTACHMENT_FILE_TYPES))

function messageAttachmentType(file: File): { extension: string; type: string } | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const type = MESSAGE_ATTACHMENT_FILE_TYPES[extension]
  return type ? { extension, type } : null
}

function messageAttachmentError(file: File): string | null {
  if (!messageAttachmentType(file)) return `${file.name} is not an accepted file type.`
  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) return `${file.name} is larger than 10 MB.`
  if (!file.size) return `${file.name} is empty.`
  return null
}

export function validateMessageAttachments(files: File[]): void {
  if (files.length > MESSAGE_ATTACHMENT_LIMIT) throw new Error('Attach no more than 5 files to one message.')
  for (const file of files) {
    const error = messageAttachmentError(file)
    if (error) throw new Error(error)
  }
}

function messageAttachmentPath(bookingId: string, senderId: string, extension: string): string {
  return `${bookingId}/${senderId}/${crypto.randomUUID()}.${extension}`
}

export async function sendMessage(
  bookingId: string,
  senderId: string,
  body: string,
  files: File[] = [],
): Promise<void> {
  const messageBody = body.trim()
  if (!messageBody && !files.length) throw new Error('Write a message or attach at least one file.')
  validateMessageAttachments(files)

  const supabase = createClient()
  const attachments: MessageAttachment[] = []
  const uploadedPaths: string[] = []

  try {
    for (const file of files) {
      const attachmentType = messageAttachmentType(file)!
      const path = messageAttachmentPath(bookingId, senderId, attachmentType.extension)
      const { error } = await supabase.storage.from('message-attachments').upload(path, file, {
        cacheControl: '3600',
        contentType: attachmentType.type,
        upsert: false,
      })
      if (error) throw error
      uploadedPaths.push(path)
      attachments.push({ path, name: file.name, type: attachmentType.type, size: file.size })
    }

    const { error } = await supabase
      .from('messages')
      .insert({ booking_id: bookingId, sender_id: senderId, body: messageBody || null, attachments })
    if (error) throw error
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from('message-attachments').remove(uploadedPaths)
    throw error
  }
}

export async function fetchMessageAttachmentUrl(path: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from('message-attachments').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

// Mark the other party's messages as read (caller is the reader).
export async function markMessagesRead(bookingId: string, readerId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .neq('sender_id', readerId)
    .is('read_at', null)
  if (error) throw error
}

// All messages visible to this user, across their bookings (for thread
// summaries — grouping happens client-side alongside bookings).
export async function fetchMyMessages(): Promise<Message[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  // RLS limits rows to bookings where the caller is renter or owner.
  return (data ?? []) as Message[]
}

// ---------- Browse availability + landing stats ----------

// Listing ids whose dates are held by an active booking overlapping
// [start, end) — via the unavailable_listing_ids RPC (bookings RLS would
// hide other users' bookings from a client-side computation).
export async function fetchUnavailableListingIds(start: string, end: string): Promise<string[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('unavailable_listing_ids', {
    range_start: start,
    range_end: end,
  })
  if (error) throw error
  return ((data ?? []) as { listing_id: string }[]).map((row) => row.listing_id)
}

// Public aggregate-only social proof for the landing page.
export async function fetchPlatformStats(): Promise<PlatformStats> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('platform_stats')
  if (error) throw error
  const row = ((data ?? []) as { available_listings: number; verified_members: number; completed_bookings: number }[])[0]
  return {
    availableListings: Number(row?.available_listings ?? 0),
    verifiedMembers: Number(row?.verified_members ?? 0),
    completedBookings: Number(row?.completed_bookings ?? 0),
  }
}

// ---------- Naga service area ----------

export type ServiceAreaConfig = {
  latitude: number | null
  longitude: number | null
  radius_km: number
}

export async function fetchServiceArea(): Promise<ServiceAreaConfig> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rental_hubs')
    .select('hub_latitude, hub_longitude, service_radius_km')
    .eq('code', 'naga')
    .maybeSingle()
  if (error) throw error
  return {
    latitude: data?.hub_latitude ?? null,
    longitude: data?.hub_longitude ?? null,
    radius_km: Number(data?.service_radius_km ?? 15),
  }
}

export async function checkListingServiceArea(latitude: number, longitude: number): Promise<boolean> {
  const result = await callRpc('check_listing_in_service_area', {
    p_latitude: latitude,
    p_longitude: longitude,
  })
  return Boolean(result)
}

// ---------- Owner availability blackouts ----------

export async function fetchListingBlackouts(listingId: string): Promise<string[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('listing_blackout_dates')
    .select('blackout_date')
    .eq('listing_id', listingId)
    .order('blackout_date')
  if (error) throw error
  return (data ?? []).map((row: { blackout_date: string }) => row.blackout_date)
}

export async function saveListingBlackouts(listingId: string, dates: string[], note: string | null = null): Promise<void> {
  await callRpc('set_listing_blackouts', {
    p_listing_id: listingId,
    p_dates: dates,
    p_note: note?.trim() || null,
  })
}

// ---------- Incidents & disputes ----------

export const INCIDENT_PHOTO_BUCKET = 'incident-photos'
export const INCIDENT_PHOTO_LIMIT = 10
const INCIDENT_FILE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
export const INCIDENT_PHOTO_MAX_BYTES = 10 * 1024 * 1024

export function validateIncidentPhotos(files: File[]): void {
  if (files.length > INCIDENT_PHOTO_LIMIT) throw new Error(`Attach no more than ${INCIDENT_PHOTO_LIMIT} incident photos.`)
  for (const file of files) validatedHubFile(file, INCIDENT_FILE_TYPES, INCIDENT_PHOTO_MAX_BYTES, 'incident photo')
}

export async function uploadIncidentPhotos(bookingId: string, files: File[]): Promise<string[]> {
  if (!files.length) return []
  validateIncidentPhotos(files)
  return uploadHubPrivateFiles(INCIDENT_PHOTO_BUCKET, bookingId, files, INCIDENT_FILE_TYPES, INCIDENT_PHOTO_MAX_BYTES, 'incident photo')
}

export async function fetchIncidentPhotoUrl(path: string): Promise<string> {
  return fetchSignedPrivateFileUrl(INCIDENT_PHOTO_BUCKET, path)
}

export async function createIncident(input: NewIncidentInput, files: File[] = []): Promise<Incident> {
  if (!input.description.trim()) throw new Error('Describe what happened.')
  const photoPaths = await uploadIncidentPhotos(input.booking_id, files)
  try {
    const row = unwrapRpcObject(await callRpc('create_incident', {
      p_booking_id: input.booking_id,
      p_category: input.category,
      p_description: input.description.trim(),
      p_incident_date: input.incident_date,
      p_photo_paths: photoPaths,
    }), 'create_incident')
    return row as unknown as Incident
  } catch (error) {
    if (photoPaths.length) await removeHubPrivateFiles(INCIDENT_PHOTO_BUCKET, photoPaths).catch(() => undefined)
    throw error
  }
}

export async function fetchBookingIncidents(bookingId: string): Promise<Incident[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Incident[]
}

export async function fetchAdminIncidents(status: IncidentStatus | 'all' = 'all'): Promise<Incident[]> {
  const supabase = createClient()
  let query = supabase
    .from('incidents')
    .select('*')
    .order('created_at', { ascending: true })
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Incident[]
}

export async function updateIncidentStatus(
  incidentId: string,
  status: IncidentStatus,
  resolutionNote: string | null = null,
): Promise<void> {
  if (status === 'resolved' && !resolutionNote?.trim()) throw new Error('Add resolution notes before resolving.')
  await callRpc('update_incident_status', {
    p_incident_id: incidentId,
    p_status: status,
    p_resolution_note: resolutionNote?.trim() || null,
  })
}
