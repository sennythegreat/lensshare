'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera } from 'lucide-react'
import './dashboard.css'
import { OwnerShell } from '@/components/owner-shell'
import { fetchOwnerBookings, fetchOwnerListings } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { listingPhotos, pesos, PRIMARY_RENTAL_USE_OPTIONS, renterVerificationLabel, type BookingWithRelations, type Listing, type PrimaryRentalUse } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  pending: 'AWAITING APPROVAL',
  approved: 'AWAITING HAND-OFF',
  active: 'ACTIVE RENTAL',
  returned: 'RETURNED · INSPECTING',
  completed: 'COMPLETED',
  declined: 'DECLINED',
}

const PRIMARY_USE_COLORS = ['#07100e', '#476361', '#718887', '#9baaa7', '#bec8c5', '#d5dcd9', '#84949a', '#e5e8e5']
type PrimaryUseKey = PrimaryRentalUse | 'not_specified'

type PrimaryUseGroup = {
  key: PrimaryUseKey
  label: string
  count: number
  percentage: number
  color: string
}

function primaryUseGroups(bookings: BookingWithRelations[]): PrimaryUseGroup[] {
  const renters = new Map<string, PrimaryRentalUse | null>()
  bookings.forEach((booking) => {
    if (booking.status !== 'declined') renters.set(booking.renter_id, booking.renter?.primary_rental_use ?? null)
  })

  const counts = new Map<PrimaryUseKey, number>()
  renters.forEach((value) => {
    const key = value ?? 'not_specified'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const labels = new Map<PrimaryUseKey, string>([
    ...PRIMARY_RENTAL_USE_OPTIONS.map((option) => [option.value, option.label] as const),
    ['not_specified', 'Not specified'] as const,
  ])

  const sorted = [...counts.entries()]
    .map(([key, count]) => ({ key, label: labels.get(key) ?? key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  const exactPercentages = sorted.map((group) => (group.count / renters.size) * 100)
  const percentages = exactPercentages.map(Math.floor)
  const remainderOrder = exactPercentages
    .map((percentage, index) => ({ index, remainder: percentage - percentages[index]! }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  const pointsLeft = 100 - percentages.reduce((sum, percentage) => sum + percentage, 0)
  remainderOrder.slice(0, pointsLeft).forEach(({ index }) => { percentages[index]! += 1 })

  return sorted.map((group, index) => ({
    ...group,
    percentage: percentages[index]!,
    color: PRIMARY_USE_COLORS[index % PRIMARY_USE_COLORS.length],
  }))
}

function PrimaryRentalUseWidget({ bookings, loading, error }: { bookings: BookingWithRelations[]; loading: boolean; error: string }) {
  const groups = useMemo(() => primaryUseGroups(bookings), [bookings])
  const total = groups.reduce((sum, group) => sum + group.count, 0)
  let cursor = 0
  const gradient = groups.length
    ? `conic-gradient(${groups.map((group) => {
      const start = cursor
      cursor += (group.count / total) * 100
      return `${group.color} ${start}% ${cursor}%`
    }).join(', ')})`
    : '#e5e8e5'

  return <Widget title="Primary Rental Use">
    {loading ? <p className="demographics-state">Loading renter profile data…</p> : error ? <p className="demographics-state error">Could not load renter profile data.</p> : !total ? <div className="demographics-empty"><p>No renter data yet.</p><small>This chart appears after a renter makes a non-declined booking.</small></div> : <>
      <p className="demographics-note">Current self-reported use among your distinct renters.</p>
      <div className="demographics-chart">
        <div className="demographics-donut" style={{ background: gradient }} role="img" aria-label={`${total} distinct ${total === 1 ? 'renter' : 'renters'} by primary rental use`}><span>{total}<small>{total === 1 ? 'Renter' : 'Renters'}</small></span></div>
        <div className="demographics-legend">{groups.map((group) => <div key={group.key}><i style={{ background: group.color }} /><span>{group.label}</span><b>{group.count} · {group.percentage}%</b></div>)}</div>
      </div>
    </>}
  </Widget>
}

function thumbKind(listing: Listing | null) {
  if (!listing) return 'body'
  if (listing.category === 'Cameras') return 'camera'
  if (listing.category === 'Lenses') return 'lens'
  if (listing.category === 'Lighting') return 'light'
  return 'body'
}

function GearThumb({ kind }: { kind: string }) { return <div className={`gear-thumb thumb-${kind}`}><Camera size={34} /></div> }

function SectionHeading({ title, sub, link }: { title: string; sub: string; link: string }) { return <div className="section-heading dashboard-section-heading"><div><h2>{title}</h2><p>{sub}</p></div><Link href="/dashboard/rentals">{link}</Link></div> }
function Widget({ title, children }: { title: string; children: React.ReactNode }) { return <article className="widget"><h2>{title}</h2>{children}</article> }
function Review({ initials, name, time, text }: { initials: string; name: string; time: string; text: string }) { return <div className="review"><span>{initials}</span><div><b>{name}</b><small>{time}</small><p>“{text}”</p></div></div> }

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useProfile()
  const [bookings, setBookings] = useState<BookingWithRelations[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [bookingsError, setBookingsError] = useState('')
  const [listings, setListings] = useState<Listing[]>([])

  useEffect(() => {
    if (!user) return
    setBookingsLoading(true)
    setBookingsError('')
    fetchOwnerBookings(user.id)
      .then(setBookings)
      .catch(() => setBookingsError('Could not load bookings.'))
      .finally(() => setBookingsLoading(false))
    fetchOwnerListings(user.id).then(setListings).catch(() => {})
  }, [user])

  const activeCount = bookings.filter((b) => b.status === 'active').length
  const pendingBookingValue = bookings.filter((b) => b.status === 'pending' || b.status === 'approved').reduce((sum, b) => sum + Number(b.subtotal), 0)
  const completedGross = bookings.filter((b) => b.status === 'completed').reduce((sum, b) => sum + Number(b.subtotal), 0)
  const ownerNet = Math.round(completedGross * 0.85)
  const coopPool = completedGross - ownerNet
  const recentBookings = useMemo(() => [...bookings].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4), [bookings])

  return <OwnerShell title="Studio Dashboard" subtitle="Overview of listed gear, booking requests, and configured Naga City Hub handoffs.">
    <div className="dashboard-top-grid"><article className="hub-card"><span className="eyebrow">◉ NAGA CITY HUB WORKFLOW</span><h2>Manage your gear and rental requests.</h2><p>Review verified renter requests, confirm approved handoffs at the configured Naga City Hub, and track booking checklists and completed-rental earnings in one workspace.</p><div className="hub-actions"><button className="dark-action" onClick={() => router.push('/dashboard/rentals')}>Review bookings →</button><button onClick={() => router.push('/dashboard/listings')}>▣ View listings</button></div></article><article className="net-card"><span className="eyebrow">Owner net from completed rentals (85%)</span><strong>{pesos(ownerNet)}</strong><p>{bookings.filter((b) => b.status === 'completed').length} completed {bookings.filter((b) => b.status === 'completed').length === 1 ? 'rental' : 'rentals'} · 15% platform share</p><div className="mini-chart"><span /><span /><span /><i /></div><div className="chart-labels"><small>WK 01</small><small>WK 02</small><small>WK 03</small><small>WK 04 (CURR)</small></div></article></div>
    <div className="metric-grid">
      <article className="metric-card"><span className="eyebrow">Active rentals</span><strong>{activeCount} Active {activeCount === 1 ? 'Unit' : 'Units'}</strong><p>● From live bookings</p><div className="metric-wave" /></article>
      <article className="metric-card"><span className="eyebrow">Vault gear online</span><strong>{listings.filter((l) => l.status === 'available').length} of {listings.length} Listed</strong><p>◉ Available on the marketplace</p><div className="metric-wave short" /></article>
      <article className="metric-card"><span className="eyebrow">Pending booking value</span><strong>{pesos(pendingBookingValue)}</strong><p>Pending + approved requests · not funds held in escrow</p><div className="metric-wave" /></article>
    </div>
    <div className="dashboard-columns"><div id="rentals"><SectionHeading title="Manage Active Bookings" sub="Real-time custody state and digital checklist verifications" link="See all rentals →" /> <div className="rental-list">{recentBookings.map((booking) => <article className="rental-row" key={booking.id}>{booking.listing?.image_url ? <img className="gear-photo" src={booking.listing.image_url} alt="" /> : <GearThumb kind={thumbKind(booking.listing)} />}<div className="rental-copy"><div><span className="rental-status">{STATUS_LABEL[booking.status]}</span><small>{booking.start_date} → {booking.end_date} ({booking.days} {booking.days === 1 ? 'day' : 'days'})</small></div><h3>{booking.listing?.name || 'Removed listing'}</h3><p>Renter: {booking.renter?.full_name || 'Renter'} · {booking.shoot_description || 'No shoot description.'}</p>{booking.renter && <span className={`renter-flag ${booking.renter.verification_status}`}>{renterVerificationLabel(booking.renter)}</span>}</div><div className="rental-price"><strong>{pesos(Number(booking.subtotal))}</strong>{Number(booking.discount_amount) > 0 && <small>Owner basis · Saver Pass funded by LensShare</small>}<Link href="/dashboard/rentals">{booking.status === 'active' ? 'Checklist' : booking.status === 'approved' ? 'Confirm hand-off' : booking.status === 'pending' ? 'Review request' : booking.status === 'completed' ? '◉ Completed' : 'View'}</Link></div></article>)}{!recentBookings.length && <div className="owner-empty"><h3>No bookings yet</h3><p>When renters request your gear, the requests appear here instantly.</p></div>}</div></div><div className="side-widgets"><PrimaryRentalUseWidget bookings={bookings} loading={bookingsLoading} error={bookingsError} /><Widget title="Booking Handoff Notes"><Review initials="01" name="Use the configured hub" time="Approved rentals" text="Complete handoff and return at the configured Naga City Hub; availability areas are not private meetup points." /><Review initials="02" name="Record the checklist" time="At handoff and return" text="Inspect the gear together and save the booking checklist so both parties share the same custody record." /></Widget></div></div>
    <div className="vault-section" id="vault"><SectionHeading title="My Gear Vault & Public Listings" sub="Active equipment in the LensShare local marketplace" link={`${listings.length} Kits Online · ⋯`} /><div className="vault-grid">{listings.map((listing) => <article className="vault-card" key={listing.id}><div className="vault-image"><span>{listing.status === 'available' ? 'AVAILABLE TODAY' : 'PAUSED'}</span>{listingPhotos(listing)[0] ? <img className="gear-photo" src={listingPhotos(listing)[0]} alt={listing.name} /> : <GearThumb kind={thumbKind(listing)} />}</div><small>{listing.meta || `${listing.brand} · ${listing.category}`}</small><h3>{listing.name}</h3><p>⌖ {listing.pickup_address?.trim() ? `Available in ${listing.pickup_address.trim()}` : 'Availability area not added'}</p><div className="vault-price"><strong>{pesos(Number(listing.daily_rate))}<small>/day</small></strong><Link href="/dashboard/listings">Edit</Link></div></article>)}</div></div>
    <section className="settlement" id="settlement"><div className="section-heading"><div><span className="eyebrow">Earnings summary</span><h2>Completed-Rental Accounting</h2></div><span className="auto-pill">PAYMENT PROVIDER: NOT CONNECTED</span></div><div className="settlement-grid"><div><span>Estimated owner net (85%)</span><strong>{pesos(ownerNet)}</strong><p>Computed from completed rental subtotals; this is not an automated payout balance.</p></div><div><span>Platform share (15%)</span><strong className="muted-price">{pesos(coopPool)}</strong><p>Computed from completed rentals for statement purposes.</p></div><div><span>Statement status</span><p>Payment provider not connected yet — no automatic bank payout or escrow release is performed here.</p><Link href="/dashboard/finance">View detailed statement →</Link></div></div></section>
  </OwnerShell>
}
