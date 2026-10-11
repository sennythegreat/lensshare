export type Role = 'owner' | 'renter'

export type Profile = {
  id: string
  full_name: string
  phone: string | null
  role: Role
  is_student: boolean
  verification_status: 'unverified' | 'pending' | 'verified'
  created_at: string
  updated_at: string
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
  image_url: string | null
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
  total: number
  shoot_description: string | null
  status: BookingStatus
  created_at: string
  updated_at: string
}

export type ListingWithOwner = Listing & {
  owner: Pick<Profile, 'id' | 'full_name'> | null
}

export type BookingWithRelations = Booking & {
  listing: Listing | null
  renter: Pick<Profile, 'id' | 'full_name'> | null
  owner: Pick<Profile, 'id' | 'full_name'> | null
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'LS'
  return parts.slice(0, 2).map((part) => part[0]!.toUpperCase()).join('')
}

export function pesos(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function rentalDays(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(1, Math.round(ms / 86_400_000))
}
