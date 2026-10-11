'use client'

import { createClient } from '@/lib/supabase/client'
import type {
  Booking,
  BookingStatus,
  BookingWithRelations,
  Listing,
  ListingStatus,
  ListingWithOwner,
  Role,
} from '@/lib/types'

const BOOKING_SELECT = '*, listing:gear_listings(*), renter:profiles!bookings_renter_id_fkey(id, full_name), owner:profiles!bookings_owner_id_fkey(id, full_name)'

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
}

export async function insertListing(ownerId: string, values: NewListing): Promise<Listing> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('gear_listings')
    .insert({ ...values, owner_id: ownerId })
    .select('*')
    .single()
  if (error) throw error
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

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
  if (error) throw error
}

export async function updateProfile(
  id: string,
  values: Partial<Pick<import('@/lib/types').Profile, 'full_name' | 'phone' | 'role'>>,
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
