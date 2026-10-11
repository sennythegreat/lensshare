'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera } from 'lucide-react'
import './dashboard.css'
import { OwnerShell } from '@/components/owner-shell'
import { fetchOwnerBookings, fetchOwnerListings } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { pesos, type BookingWithRelations, type Listing } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  pending: 'AWAITING APPROVAL',
  approved: 'AWAITING HAND-OFF',
  active: 'ACTIVE RENTAL',
  returned: 'RETURNED · INSPECTING',
  completed: 'COMPLETED',
  declined: 'DECLINED',
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
  const [listings, setListings] = useState<Listing[]>([])

  useEffect(() => {
    if (!user) return
    fetchOwnerBookings(user.id).then(setBookings).catch(() => {})
    fetchOwnerListings(user.id).then(setListings).catch(() => {})
  }, [user])

  const activeCount = bookings.filter((b) => b.status === 'active').length
  const pendingEscrow = bookings.filter((b) => b.status === 'pending' || b.status === 'approved').reduce((sum, b) => sum + Number(b.total), 0)
  const completedGross = bookings.filter((b) => b.status === 'completed').reduce((sum, b) => sum + Number(b.total), 0)
  const ownerNet = Math.round(completedGross * 0.85)
  const coopPool = completedGross - ownerNet
  const recentBookings = useMemo(() => [...bookings].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4), [bookings])

  return <OwnerShell title="Studio Dashboard" subtitle="Overview of vault inventory, active peer escrow, and courier dispatch handoffs.">
    <div className="dashboard-top-grid"><article className="hub-card"><span className="eyebrow">◉ ₱100,000 LensCare™ reserve active</span><h2>Explore your gear vault & rental co-op hub.</h2><p>Respond to verified student creators, schedule instant hub courier dispatches via Maxim or Lalamove, and review automated 24h bank escrow payouts.</p><div className="hub-actions"><button className="dark-action" onClick={() => router.push('/dashboard/rentals')}>Review bookings →</button><button onClick={() => router.push('/dashboard/listings')}>▣ View hub guidelines</button></div></article><article className="net-card"><span className="eyebrow">Owner net from completed rentals (85%)</span><strong>{pesos(ownerNet)}</strong><p>{bookings.filter((b) => b.status === 'completed').length} completed {bookings.filter((b) => b.status === 'completed').length === 1 ? 'rental' : 'rentals'} · 15% co-op pool</p><div className="mini-chart"><span /><span /><span /><i /></div><div className="chart-labels"><small>WK 01</small><small>WK 02</small><small>WK 03</small><small>WK 04 (CURR)</small></div></article></div>
    <div className="metric-grid">
      <article className="metric-card"><span className="eyebrow">Active rentals</span><strong>{activeCount} Active {activeCount === 1 ? 'Unit' : 'Units'}</strong><p>● From live bookings</p><div className="metric-wave" /></article>
      <article className="metric-card"><span className="eyebrow">Vault gear online</span><strong>{listings.filter((l) => l.status === 'available').length} of {listings.length} Listed</strong><p>◉ Available on the marketplace</p><div className="metric-wave short" /></article>
      <article className="metric-card"><span className="eyebrow">Pending in escrow</span><strong>{pesos(pendingEscrow)}</strong><p>ϟ Pending + approved bookings</p><div className="metric-wave" /></article>
    </div>
    <div className="dashboard-columns"><div id="rentals"><SectionHeading title="Manage Active Bookings" sub="Real-time custody state and digital checklist verifications" link="See all rentals →" /> <div className="rental-list">{recentBookings.map((booking) => <article className="rental-row" key={booking.id}><GearThumb kind={thumbKind(booking.listing)} /><div className="rental-copy"><div><span className="rental-status">{STATUS_LABEL[booking.status]}</span><small>{booking.start_date} → {booking.end_date} ({booking.days} {booking.days === 1 ? 'day' : 'days'})</small></div><h3>{booking.listing?.name || 'Removed listing'}</h3><p>Renter: {booking.renter?.full_name || 'Renter'} · {booking.shoot_description || 'No shoot description.'}</p></div><div className="rental-price"><strong>{pesos(Number(booking.total))}</strong><Link href="/dashboard/rentals">{booking.status === 'active' ? 'Checklist' : booking.status === 'approved' ? 'Confirm hand-off' : booking.status === 'pending' ? 'Review request' : booking.status === 'completed' ? '◉ Paid out' : 'View'}</Link></div></article>)}{!recentBookings.length && <div className="owner-empty"><h3>No bookings yet</h3><p>When renters request your gear, the requests appear here instantly.</p></div>}</div></div><div className="side-widgets"><Widget title="Rental Demographics"><div className="donut"><span>100%<small>Verified</small></span></div><div className="legend"><span>■ Student Filmmakers <b>60%</b></span><span>■ Campus Journalists <b>25%</b></span><span>■ Freelance DPs <b>15%</b></span></div></Widget><Widget title="Recent Community Reviews"><Review initials="AM" name="Alan Marti" time="Yesterday" text="Outstanding camera kit. Sony ZV-E10 was cleanly packed, sensor spotless, battery at 100%. Great pickup at Ateneo Ave hub." /><Review initials="OL" name="Onyama Limba" time="3d ago" text="Fujifilm X-T30 II colors were amazing for our short doc. Smooth handoff via Maxim courier and digital gear checklist." /></Widget></div></div>
    <div className="vault-section" id="vault"><SectionHeading title="My Gear Vault & Public Listings" sub="Active equipment in the LensShare local marketplace" link={`${listings.length} Kits Online · ⋯`} /><div className="vault-grid">{listings.map((listing) => <article className="vault-card" key={listing.id}><div className="vault-image"><span>{listing.status === 'available' ? 'AVAILABLE TODAY' : 'PAUSED'}</span><GearThumb kind={thumbKind(listing)} /></div><small>{listing.meta || `${listing.brand} · ${listing.category}`}</small><h3>{listing.name}</h3><p>⌖ Naga City Hub</p><div className="vault-price"><strong>{pesos(Number(listing.daily_rate))}<small>/day</small></strong><Link href="/dashboard/listings">Edit</Link></div></article>)}</div></div>
    <section className="settlement" id="settlement"><div className="section-heading"><div><span className="eyebrow">Settlement protocol</span><h2>Transparent Earnings & Escrow Splits</h2></div><span className="auto-pill">Auto-Payout Trigger: ACTIVE (24H)</span></div><div className="settlement-grid"><div><span>Owner net take-home (85%)</span><strong>{pesos(ownerNet)}</strong><p>From completed rentals. No hidden deductions or platform markups.</p></div><div><span>LensCare co-op pool (15%)</span><strong className="muted-price">{pesos(coopPool)}</strong><p>Funds ₱100k gear replacement insurance & ID vetting.</p></div><div><span>Connected payout ledger</span><p>Payment provider not connected yet — earnings shown are computed from completed bookings.</p><Link href="/dashboard/finance">View detailed statement →</Link></div></div></section>
  </OwnerShell>
}
