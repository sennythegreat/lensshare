'use client'

import { createClient } from '@/lib/supabase/client'
import type {
  AdminUserRow,
  Booking,
  BookingHandoff,
  BookingStatus,
  BookingWithRelations,
  HandoffParty,
  HandoffStage,
  Listing,
  ListingStatus,
  ListingWithOwner,
  Message,
  Payout,
  PlatformStats,
  Review,
  ReviewWithNames,
  Role,
  VerificationDocType,
  VerificationSubmission,
  VerificationSubmissionWithUser,
} from '@/lib/types'

const BOOKING_SELECT = '*, listing:gear_listings(*), renter:profiles!bookings_renter_id_fkey(id, full_name, verification_status, is_student, phone), owner:profiles!bookings_owner_id_fkey(id, full_name)'

export async function fetchListings(): Promise<ListingWithOwner[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('gear_listings')
    .select('*, owner:profiles!gear_listings_owner_id_fkey(id, full_name)')
    .eq('status', 'available')
    .order('rating', { ascending: false })
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
  pickup_address?: string | null
  pickup_latitude?: number | null
  pickup_longitude?: number | null
}

function listingErrorMessage(error: { code?: string; message?: string }): string {
  if ((error.code === 'PGRST204' || error.code === '42703') && /pickup_(address|latitude|longitude)/.test(error.message ?? '')) {
    return 'Pickup addresses are not set up yet. Run supabase/listing-locations.sql in the Supabase SQL Editor, then try again.'
  }
  return error.message || 'Saving the listing failed.'
}

export async function insertListing(ownerId: string, values: NewListing): Promise<Listing> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('gear_listings')
    .insert({ ...values, owner_id: ownerId })
    .select('*')
    .single()
  if (error) throw new Error(listingErrorMessage(error))
  return data as Listing
}

export async function updateListing(id: string, ownerId: string, values: NewListing): Promise<Listing> {
  const fields = ['name', 'brand', 'category', 'daily_rate', 'meta', 'specs', 'included', 'description', 'image_url', 'pickup_address', 'pickup_latitude', 'pickup_longitude'] as const
  const updates = Object.fromEntries(fields.filter((field) => values[field] !== undefined).map((field) => [field, values[field]]))
  const supabase = createClient()
  const { data, error } = await supabase
    .from('gear_listings')
    .update(updates)
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select('*')
    .single()
  if (error) throw new Error(listingErrorMessage(error))
  return data as Listing
}

export async function setListingStatus(id: string, status: ListingStatus): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('gear_listings').update({ status }).eq('id', id)
  if (error) throw error
}

export async function uploadGearPhoto(userId: string, file: File): Promise<string> {
  const supabase = createClient()
  const path = `${userId}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
  const { error } = await supabase.storage.from('gear-photos').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('gear-photos').getPublicUrl(path)
  return data.publicUrl
}

export async function fetchOwnerBookings(ownerId: string): Promise<BookingWithRelations[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('owner_id', ownerId)
    .order('start_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as BookingWithRelations[]
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

export async function createBooking(input: {
  listing_id: string
  renter_id: string
  owner_id: string
  start_date: string
  end_date: string
  days: number
  total: number
  shoot_description: string | null
}): Promise<Booking> {
  const supabase = createClient()
  const { data, error } = await supabase.from('bookings').insert(input).select('*').single()
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
  if (/row-level security|policy/i.test(message)) {
    return 'Booking blocked: your account must be a verified renter before you can request a rental.'
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

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
  if (error) throw error
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
    .upsert(
      { booking_id: bookingId, user_id: userId, party, stage, checklist },
      { onConflict: 'booking_id,party,stage' },
    )
  if (error) throw error
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
  id: string,
  values: Partial<Pick<import('@/lib/types').Profile, 'full_name' | 'phone' | 'role' | 'verification_status' | 'is_student'>>,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('profiles').update(values).eq('id', id)
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
  const supabase = createClient()
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const path = `${userId}/${docType}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('verification-docs').upload(path, file, { upsert: false })
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
  reviewedBy: string,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('verification_submissions')
    .update({ status, review_note: reviewNote, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
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

export async function sendMessage(bookingId: string, senderId: string, body: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('messages')
    .insert({ booking_id: bookingId, sender_id: senderId, body: body.trim() })
  if (error) throw error
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
